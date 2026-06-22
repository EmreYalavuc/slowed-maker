import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// Pinned so the loaded core is always compatible with the installed @ffmpeg/ffmpeg version.
const CORE_VERSION = "0.12.10";
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(onLog?: (message: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      onLog?.("loading ffmpeg-core (first export downloads ~25-30MB, then cached)...");
      const ffmpeg = new FFmpeg();
      ffmpeg.on("log", ({ message }) => onLog?.(`[ffmpeg] ${message}`));
      const coreURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript");
      const wasmURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm");
      await ffmpeg.load({ coreURL, wasmURL });
      onLog?.("ffmpeg-core loaded");
      ffmpegInstance = ffmpeg;
      return ffmpeg;
    })();
  }
  return ffmpegLoadPromise;
}

/** Forcibly kills the ffmpeg worker (used for cancel) so the next export starts from a clean slate. */
export function terminateFFmpeg(): void {
  ffmpegInstance?.terminate();
  ffmpegInstance = null;
  ffmpegLoadPromise = null;
}

export type TranscodeProgress = (fraction: number) => void;

export type TranscodeOptions = {
  /** true when the input video track is already H.264 (e.g. recorded as webm;codecs=h264) — enables a near-instant stream copy instead of a full re-encode. */
  videoIsH264: boolean;
  onProgress?: TranscodeProgress;
  onLog?: (message: string) => void;
  /** Hard cap so a stuck encode fails loudly instead of hanging forever. */
  timeoutMs?: number;
};

/** Transcodes/remuxes a recorded WebM clip into a real MP4 file, entirely client-side. */
export async function transcodeToMp4(webmBlob: Blob, options: TranscodeOptions): Promise<Blob> {
  const { videoIsH264, onProgress, onLog, timeoutMs = 8 * 60 * 1000 } = options;
  const log = (msg: string) => onLog?.(msg);

  log("getFFmpeg()...");
  const ffmpeg = await getFFmpeg(onLog);

  const progressHandler = ({ progress }: { progress: number }) => {
    if (Number.isFinite(progress)) {
      const clamped = Math.min(1, Math.max(0, progress));
      log(`progress event: ${(clamped * 100).toFixed(1)}%`);
      onProgress?.(clamped);
    }
  };
  ffmpeg.on("progress", progressHandler);

  const args = videoIsH264
    ? [
        "-i", "input.webm",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        "output.mp4",
      ]
    : [
        "-i", "input.webm",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "26",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        "output.mp4",
      ];

  try {
    log(`writeFile input.webm (${webmBlob.size} bytes)...`);
    await ffmpeg.writeFile("input.webm", await fetchFile(webmBlob));

    log(`exec: ffmpeg ${args.join(" ")} (timeout=${timeoutMs}ms, videoIsH264=${videoIsH264})`);
    const startedAt = Date.now();
    const code = await ffmpeg.exec(args, timeoutMs);
    log(`exec finished code=${code} after ${Date.now() - startedAt}ms`);

    if (code !== 0) {
      throw new Error(`ffmpeg exited with code ${code} (muhtemelen zaman aşımı veya hata)`);
    }

    log("readFile output.mp4...");
    const data = await ffmpeg.readFile("output.mp4");
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    if (bytes.length === 0) {
      throw new Error("ffmpeg boş bir dosya üretti.");
    }
    onProgress?.(1);
    log(`done, output size=${bytes.length} bytes`);
    // ffmpeg.wasm's FS never backs files with a SharedArrayBuffer; TS's generic
    // typed-array types just can't express that narrowing here.
    return new Blob([bytes as BlobPart], { type: "video/mp4" });
  } finally {
    ffmpeg.off("progress", progressHandler);
    await ffmpeg.deleteFile("input.webm").catch(() => {});
    await ffmpeg.deleteFile("output.mp4").catch(() => {});
  }
}
