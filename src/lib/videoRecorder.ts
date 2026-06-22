export type RecordingTier = "mp4-direct" | "h264-webm" | "software-webm";

export type MimeChoice = {
  mimeType: string;
  tier: RecordingTier;
};

// Ordered by export speed: a direct MP4 needs no further processing at all,
// h264-in-webm only needs a near-instant container remux, and the
// vp9/vp8 fallbacks require a full (slow) software re-encode to H.264 later.
const CANDIDATES: MimeChoice[] = [
  { mimeType: "video/mp4;codecs=avc1,mp4a.40.2", tier: "mp4-direct" },
  { mimeType: "video/mp4", tier: "mp4-direct" },
  { mimeType: "video/webm;codecs=h264,opus", tier: "h264-webm" },
  { mimeType: "video/webm;codecs=avc1,opus", tier: "h264-webm" },
  { mimeType: "video/webm;codecs=vp9,opus", tier: "software-webm" },
  { mimeType: "video/webm;codecs=vp8,opus", tier: "software-webm" },
  { mimeType: "video/webm", tier: "software-webm" },
];

export function pickBestMimeChoice(): MimeChoice | null {
  if (typeof MediaRecorder === "undefined") return null;
  return CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c.mimeType)) ?? null;
}

export type RecordCanvasAndAudioOptions = {
  canvas: HTMLCanvasElement;
  audioStream: MediaStream;
  fps?: number;
  /** Polled every frame; recording stops as soon as this returns true. */
  shouldStop: () => boolean;
  /** Hard safety net — recording is force-stopped after this many ms regardless of shouldStop. */
  maxDurationMs?: number;
  onLog?: (message: string) => void;
};

export type RecordResult = {
  blob: Blob;
  mimeType: string;
  tier: RecordingTier;
};

/** Records a canvas (via captureStream) combined with a live audio stream. */
export function recordCanvasAndAudio({
  canvas,
  audioStream,
  fps = 30,
  shouldStop,
  maxDurationMs = 10 * 60 * 1000,
  onLog,
}: RecordCanvasAndAudioOptions): Promise<RecordResult> {
  const log = (msg: string) => onLog?.(msg);

  return new Promise((resolve, reject) => {
    const choice = pickBestMimeChoice();
    if (!choice) {
      reject(new Error("Bu tarayıcı video kaydını (MediaRecorder) desteklemiyor."));
      return;
    }
    log(`recording with mimeType="${choice.mimeType}" tier=${choice.tier}`);

    const canvasStream = canvas.captureStream(fps);
    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioStream.getAudioTracks(),
    ]);

    const recorder = new MediaRecorder(combined, {
      mimeType: choice.mimeType,
      videoBitsPerSecond: 6_000_000,
    });
    const chunks: BlobPart[] = [];
    let settled = false;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      canvasStream.getTracks().forEach((t) => t.stop());
      if (safetyTimer) clearTimeout(safetyTimer);
    };

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onerror = (e) => {
      if (settled) return;
      settled = true;
      cleanup();
      log(`MediaRecorder error: ${String(e)}`);
      reject(new Error("Video kaydı sırasında bir hata oluştu."));
    };
    recorder.onstop = () => {
      if (settled) return;
      settled = true;
      cleanup();
      const blob = new Blob(chunks, { type: choice.mimeType });
      log(`recording finished, blob size=${blob.size} bytes`);
      resolve({ blob, mimeType: choice.mimeType, tier: choice.tier });
    };

    recorder.start();
    log("MediaRecorder started");

    safetyTimer = setTimeout(() => {
      if (recorder.state === "recording") {
        log(`safety timeout (${maxDurationMs}ms) reached, force-stopping recorder`);
        recorder.stop();
      }
    }, maxDurationMs);

    const poll = () => {
      if (recorder.state !== "recording") return;
      if (shouldStop()) {
        recorder.stop();
        return;
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });
}
