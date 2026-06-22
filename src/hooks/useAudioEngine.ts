"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioEngine, MAX_SPEED, MIN_SPEED } from "@/lib/audioEngine";
import { encodeMp3 } from "@/lib/mp3Encoder";
import { computePeaks } from "@/lib/waveform";

export type EngineStatus = "idle" | "loading" | "ready" | "error";

const WAVEFORM_BARS = 240;
const DEFAULT_SPEED = 0.8;
const DEFAULT_REVERB = 0.35;

export function useAudioEngine() {
  const engineRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number | null>(null);

  const [status, setStatus] = useState<EngineStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState(DEFAULT_SPEED);
  const [reverbMix, setReverbMixState] = useState(DEFAULT_REVERB);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const getEngine = useCallback(() => {
    if (!engineRef.current) {
      const engine = new AudioEngine();
      engine.setSpeed(speed);
      engine.setReverbMix(reverbMix);
      engine.setOnEnded(() => {
        setIsPlaying(false);
        setCurrentTime(0);
      });
      engineRef.current = engine;
    }
    return engineRef.current;
    // Only ever constructed once; later speed/reverb changes go through setSpeed/setReverbMix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const tick = () => {
      const engine = engineRef.current;
      if (engine?.isPlaying) {
        setCurrentTime(engine.getCurrentTime());
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
    };
  }, []);

  const loadFile = useCallback(
    async (file: File) => {
      setStatus("loading");
      setError(null);
      try {
        const engine = getEngine();
        const buffer = await engine.loadFile(file);
        setFileName(file.name);
        setDuration(buffer.duration);
        setCurrentTime(0);
        setIsPlaying(false);
        setPeaks(computePeaks(buffer, WAVEFORM_BARS));
        setStatus("ready");
      } catch {
        setError("Bu dosya yüklenemedi. Lütfen geçerli bir MP3 dosyası seçin.");
        setStatus("error");
      }
    },
    [getEngine]
  );

  const togglePlay = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || status !== "ready") return;
    if (engine.isPlaying) {
      engine.pause();
      setIsPlaying(false);
    } else {
      await engine.play();
      setIsPlaying(true);
    }
  }, [status]);

  const seekToFraction = useCallback(
    (fraction: number) => {
      const engine = engineRef.current;
      if (!engine || duration === 0) return;
      const clamped = Math.min(1, Math.max(0, fraction));
      engine.seek(clamped * duration);
      setCurrentTime(engine.getCurrentTime());
    },
    [duration]
  );

  const setSpeed = useCallback((value: number) => {
    setSpeedState(value);
    engineRef.current?.setSpeed(value);
  }, []);

  const setReverbMix = useCallback((value: number) => {
    setReverbMixState(value);
    engineRef.current?.setReverbMix(value);
  }, []);

  const exportMp3 = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || status !== "ready") return;
    setIsExporting(true);
    setExportProgress(0);
    setError(null);
    try {
      const rendered = await engine.renderOffline(speed, reverbMix);
      const blob = await encodeMp3(rendered, 192, setExportProgress);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const base = fileName?.replace(/\.[^/.]+$/, "") || "track";
      a.href = url;
      a.download = `${base}-slowed-reverb.mp3`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Dışa aktarma başarısız oldu.");
    } finally {
      setIsExporting(false);
    }
  }, [status, speed, reverbMix, fileName]);

  return {
    status,
    error,
    fileName,
    duration,
    currentTime,
    isPlaying,
    speed,
    reverbMix,
    peaks,
    isExporting,
    exportProgress,
    loadFile,
    togglePlay,
    seekToFraction,
    setSpeed,
    setReverbMix,
    exportMp3,
    minSpeed: MIN_SPEED,
    maxSpeed: MAX_SPEED,
    // Raw engine accessor for consumers (e.g. the visualizer) that need to
    // read live playback state every animation frame without going through
    // React state.
    getEngine: () => engineRef.current,
  };
}
