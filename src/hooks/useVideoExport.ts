"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioEngine } from "@/lib/audioEngine";
import { terminateFFmpeg, transcodeToMp4 } from "@/lib/ffmpegTranscode";
import { recordCanvasAndAudio } from "@/lib/videoRecorder";

export type VideoExportPhase =
  | "idle"
  | "recording"
  | "transcoding"
  | "done"
  | "error"
  | "cancelled";

const STALL_WARNING_MS = 12_000;
// Observed worst case (no hardware/h264 MediaRecorder support, single-threaded
// software libx264 in ffmpeg.wasm): roughly 25x real-time. We size the hard
// timeout with extra headroom above that so genuinely slow — but progressing —
// exports aren't killed early, while still guaranteeing exports can't hang forever.
const SLOW_PATH_TIME_MULTIPLIER = 25;
const TRANSCODE_TIMEOUT_MULTIPLIER = 40;
const MIN_TRANSCODE_TIMEOUT_MS = 3 * 60 * 1000;
const MAX_TRANSCODE_TIMEOUT_MS = 25 * 60 * 1000;

export function useVideoExport() {
  const [phase, setPhase] = useState<VideoExportPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isStalled, setIsStalled] = useState(false);

  const cancelRef = useRef(false);
  const startedAtRef = useRef(0);
  const lastProgressAtRef = useRef(0);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const log = useCallback((msg: string) => {
    const elapsed = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    console.info(`[export +${elapsed}ms] ${msg}`);
  }, []);

  const stopElapsedTimer = useCallback(() => {
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
  }, []);

  useEffect(() => stopElapsedTimer, [stopElapsedTimer]);

  const startElapsedTimer = useCallback(() => {
    stopElapsedTimer();
    elapsedIntervalRef.current = setInterval(() => {
      const now = Date.now();
      setElapsedMs(now - startedAtRef.current);
      setIsStalled(now - lastProgressAtRef.current > STALL_WARNING_MS);
    }, 500);
  }, [stopElapsedTimer]);

  const exportVideo = useCallback(
    async (canvas: HTMLCanvasElement, engine: AudioEngine, fileNameBase: string) => {
      setError(null);
      setNotice(null);
      cancelRef.current = false;
      startedAtRef.current = Date.now();
      lastProgressAtRef.current = Date.now();
      setElapsedMs(0);
      setIsStalled(false);
      startElapsedTimer();

      try {
        if (engine.isPlaying) engine.pause();
        engine.seek(0);

        const duration = engine.duration;
        if (duration <= 0) throw new Error("Önce bir parça yükleyin.");

        log(`starting export, track duration=${duration.toFixed(2)}s, speed=${engine.getSpeed()}`);
        setPhase("recording");
        setProgress(0);

        const audioStream = engine.getAudioCaptureStream();
        await engine.play();
        log("playback started for recording");

        const maxDurationMs = (duration / engine.getSpeed()) * 1000 * 1.5 + 10_000;

        const { blob: recordedBlob, mimeType, tier } = await recordCanvasAndAudio({
          canvas,
          audioStream,
          maxDurationMs,
          onLog: log,
          shouldStop: () => {
            const stop =
              cancelRef.current || !engine.isPlaying || engine.getCurrentTime() >= duration - 0.05;
            const frac = Math.min(1, engine.getCurrentTime() / duration);
            setProgress(frac);
            lastProgressAtRef.current = Date.now();
            return stop;
          },
        });

        if (engine.isPlaying) engine.pause();

        if (cancelRef.current) {
          log("cancelled after recording, skipping transcode");
          setPhase("cancelled");
          return;
        }

        if (tier === "mp4-direct") {
          log(`recording already produced a direct MP4 (mimeType="${mimeType}") — skipping ffmpeg entirely`);
          setProgress(1);
          downloadBlob(recordedBlob, `${fileNameBase}-slowed-reverb-visualizer.mp4`);
          setPhase("done");
          return;
        }

        log(`recorded ${tier} (mimeType="${mimeType}"), handing off to ffmpeg`);
        setPhase("transcoding");
        setProgress(0);
        lastProgressAtRef.current = Date.now();

        const realtimeSeconds = duration / engine.getSpeed();
        if (tier === "software-webm") {
          const estimatedMinutes = Math.max(
            1,
            Math.ceil((realtimeSeconds * SLOW_PATH_TIME_MULTIPLIER) / 60)
          );
          const noticeMsg = `Bu tarayıcı donanım hızlandırmalı video kaydı sunmuyor, bu yüzden dönüştürme yazılımsal olarak yapılıyor. Tahmini süre: ~${estimatedMinutes} dakika.`;
          log(`slow path detected: estimated ~${estimatedMinutes}min`);
          setNotice(noticeMsg);
        }

        const timeoutMs = Math.min(
          MAX_TRANSCODE_TIMEOUT_MS,
          Math.max(MIN_TRANSCODE_TIMEOUT_MS, realtimeSeconds * 1000 * TRANSCODE_TIMEOUT_MULTIPLIER)
        );

        const mp4Blob = await transcodeToMp4(recordedBlob, {
          videoIsH264: tier === "h264-webm",
          timeoutMs,
          onLog: log,
          onProgress: (fraction) => {
            setProgress(fraction);
            lastProgressAtRef.current = Date.now();
          },
        });

        if (cancelRef.current) {
          log("cancelled after transcode completed, discarding result");
          setPhase("cancelled");
          return;
        }

        downloadBlob(mp4Blob, `${fileNameBase}-slowed-reverb-visualizer.mp4`);
        log("download triggered, export complete");
        setPhase("done");
        setProgress(1);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Video dışa aktarma başarısız oldu.";
        log(`ERROR: ${message}`);
        setPhase(cancelRef.current ? "cancelled" : "error");
        setError(message);
      } finally {
        stopElapsedTimer();
      }
    },
    [log, startElapsedTimer, stopElapsedTimer]
  );

  const cancel = useCallback(() => {
    cancelRef.current = true;
    log("cancel requested by user");
    // Recording stops itself (shouldStop polls cancelRef). If we're mid-transcode,
    // there's no clean mid-exec abort in ffmpeg.wasm, so kill the worker outright.
    if (phase === "transcoding") {
      terminateFFmpeg();
    }
  }, [log, phase]);

  return { phase, progress, error, notice, elapsedMs, isStalled, exportVideo, cancel };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
