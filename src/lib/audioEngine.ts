import { createReverbImpulse } from "./impulseResponse";

export const MIN_SPEED = 0.5;
export const MAX_SPEED = 1.0;

/**
 * Wraps the Web Audio graph used for both the live preview and the
 * offline render used for export. Speed is implemented as playbackRate
 * (which also lowers pitch — the classic "slowed" sound). Reverb is an
 * equal-power dry/wet crossfade through a ConvolverNode.
 */
export class AudioEngine {
  private ctx: AudioContext;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private dryGain: GainNode;
  private wetGain: GainNode;
  private convolver: ConvolverNode;
  private masterGain: GainNode;
  private analyser: AnalyserNode;
  private analyserSilencer: GainNode;
  private bassData: Uint8Array<ArrayBuffer>;
  private mediaStreamDest: MediaStreamAudioDestinationNode | null = null;

  private speed = 1;
  private reverbMix = 0;
  private playing = false;
  private startContextTime = 0;
  private startOffset = 0;
  private onEnded?: () => void;

  constructor() {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();

    this.masterGain = this.ctx.createGain();
    this.dryGain = this.ctx.createGain();
    this.wetGain = this.ctx.createGain();
    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = createReverbImpulse(this.ctx);

    this.dryGain.connect(this.masterGain);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // Analysis tap for the visualizer. AnalyserNode only receives audio if
    // it's reachable from a destination-like node, so it's routed through a
    // zero-gain node to destination — this contributes no audible signal,
    // it just keeps the node "pulled" by the graph.
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyserSilencer = this.ctx.createGain();
    this.analyserSilencer.gain.value = 0;
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.analyserSilencer);
    this.analyserSilencer.connect(this.ctx.destination);
    this.bassData = new Uint8Array(this.analyser.frequencyBinCount);

    this.applyReverbMix();
  }

  async loadFile(file: File): Promise<AudioBuffer> {
    this.stopInternal();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(arrayBuffer);
    this.buffer = buffer;
    this.startOffset = 0;
    return buffer;
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  setOnEnded(cb: () => void): void {
    this.onEnded = cb;
  }

  setSpeed(value: number): void {
    const clamped = Math.min(MAX_SPEED, Math.max(MIN_SPEED, value));
    if (this.playing) {
      // Re-baseline the offset tracking before changing rate, since the
      // original->wallclock mapping depends on the rate in effect.
      this.startOffset = this.getOriginalOffset();
      this.startContextTime = this.ctx.currentTime;
    }
    this.speed = clamped;
    if (this.source) {
      this.source.playbackRate.value = clamped;
    }
  }

  getSpeed(): number {
    return this.speed;
  }

  setReverbMix(value: number): void {
    this.reverbMix = Math.min(1, Math.max(0, value));
    this.applyReverbMix();
  }

  getReverbMix(): number {
    return this.reverbMix;
  }

  private applyReverbMix(): void {
    // Equal-power crossfade so perceived loudness stays roughly constant
    // across the whole range of the mix.
    const angle = this.reverbMix * (Math.PI / 2);
    this.dryGain.gain.value = Math.cos(angle);
    this.wetGain.gain.value = Math.sin(angle);
  }

  private createSourceNode(): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = this.speed;
    src.connect(this.dryGain);
    src.connect(this.convolver);
    return src;
  }

  async play(): Promise<void> {
    if (!this.buffer || this.playing) return;
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    const src = this.createSourceNode();
    src.onended = () => {
      if (this.source !== src) return; // superseded by a seek/pause/stop
      this.playing = false;
      this.startOffset = 0;
      this.source = null;
      this.onEnded?.();
    };
    src.start(0, this.startOffset);
    this.source = src;
    this.startContextTime = this.ctx.currentTime;
    this.playing = true;
  }

  pause(): void {
    if (!this.playing || !this.source) return;
    this.startOffset = this.getOriginalOffset();
    this.source.onended = null;
    this.source.stop();
    this.source = null;
    this.playing = false;
  }

  private stopInternal(): void {
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        // already stopped
      }
      this.source = null;
    }
    this.playing = false;
    this.startOffset = 0;
  }

  seek(originalTime: number): void {
    const wasPlaying = this.playing;
    if (this.playing) this.pause();
    this.startOffset = Math.max(0, Math.min(originalTime, this.duration));
    if (wasPlaying) this.play();
  }

  /** Current position expressed in the ORIGINAL (unslowed) track's seconds. */
  private getOriginalOffset(): number {
    if (!this.playing) return this.startOffset;
    const elapsed = this.ctx.currentTime - this.startContextTime;
    return Math.min(this.startOffset + elapsed * this.speed, this.duration);
  }

  getCurrentTime(): number {
    return this.getOriginalOffset();
  }

  getBuffer(): AudioBuffer | null {
    return this.buffer;
  }

  /** Average energy (0..1) in the low-frequency (~bass) bins, for visualizer beat-reaction. */
  getBassEnergy(): number {
    this.analyser.getByteFrequencyData(this.bassData);
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    const bassBinEnd = Math.max(1, Math.min(this.bassData.length - 1, Math.floor(200 / binHz)));
    let sum = 0;
    for (let i = 0; i <= bassBinEnd; i++) sum += this.bassData[i];
    return sum / ((bassBinEnd + 1) * 255);
  }

  /** A live MediaStream of the processed (speed + reverb) audio, for video export recording. */
  getAudioCaptureStream(): MediaStream {
    if (!this.mediaStreamDest) {
      this.mediaStreamDest = this.ctx.createMediaStreamDestination();
      this.masterGain.connect(this.mediaStreamDest);
    }
    return this.mediaStreamDest.stream;
  }

  /** Renders the current effect settings to a new AudioBuffer (used for export). */
  async renderOffline(speed: number, reverbMix: number): Promise<AudioBuffer> {
    if (!this.buffer) throw new Error("No audio loaded");
    const length = Math.ceil((this.buffer.duration / speed) * this.buffer.sampleRate);
    const offlineCtx = new OfflineAudioContext(
      this.buffer.numberOfChannels,
      length,
      this.buffer.sampleRate
    );

    const src = offlineCtx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = speed;

    const dryGain = offlineCtx.createGain();
    const wetGain = offlineCtx.createGain();
    const convolver = offlineCtx.createConvolver();
    convolver.buffer = createReverbImpulse(offlineCtx);

    const angle = reverbMix * (Math.PI / 2);
    dryGain.gain.value = Math.cos(angle);
    wetGain.gain.value = Math.sin(angle);

    src.connect(dryGain).connect(offlineCtx.destination);
    src.connect(convolver).connect(wetGain).connect(offlineCtx.destination);

    src.start(0);
    return offlineCtx.startRendering();
  }

  dispose(): void {
    this.stopInternal();
    void this.ctx.close();
  }
}
