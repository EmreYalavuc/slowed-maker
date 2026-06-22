/** Downsamples an AudioBuffer into per-bar peak amplitudes (0..1) for drawing a waveform. */
export function computePeaks(buffer: AudioBuffer, bars: number): number[] {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const samplesPerBar = Math.max(1, Math.floor(length / bars));
  const peaks: number[] = new Array(bars).fill(0);

  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) channelData.push(buffer.getChannelData(c));

  for (let bar = 0; bar < bars; bar++) {
    const start = bar * samplesPerBar;
    const end = Math.min(length, start + samplesPerBar);
    let peak = 0;
    for (let i = start; i < end; i++) {
      for (let c = 0; c < channels; c++) {
        const v = Math.abs(channelData[c][i]);
        if (v > peak) peak = v;
      }
    }
    peaks[bar] = peak;
  }

  const max = Math.max(...peaks, 0.0001);
  return peaks.map((p) => p / max);
}
