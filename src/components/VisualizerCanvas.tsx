"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { AudioEngine } from "@/lib/audioEngine";
import { resolveFormatDimensions, type VideoFormat } from "@/lib/videoFormat";
import { renderVisualizerFrame } from "@/lib/visualizerRenderer";

const BASE_ANGULAR_VELOCITY = 0.7; // radians/sec at 100% speed
const POSITION_MARGIN = 0.06;

type Position = { x: number; y: number };

type Props = {
  getEngine: () => AudioEngine | null;
  format: VideoFormat;
  backgroundImage: HTMLImageElement | null;
  innerImage: HTMLImageElement | null;
  diskEnabled: boolean;
  diskPosition: Position;
  diskSize: number;
  duration: number;
  effectColor: string;
  onPositionChange: (pos: Position) => void;
};

const VisualizerCanvas = forwardRef<HTMLCanvasElement, Props>(function VisualizerCanvas(
  {
    getEngine,
    format,
    backgroundImage,
    innerImage,
    diskEnabled,
    diskPosition,
    diskSize,
    duration,
    effectColor,
    onPositionChange,
  },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backgroundRef = useRef<HTMLImageElement | null>(backgroundImage);
  const innerImageRef = useRef<HTMLImageElement | null>(innerImage);
  const diskEnabledRef = useRef(diskEnabled);
  const diskPositionRef = useRef(diskPosition);
  const diskSizeRef = useRef(diskSize);
  const durationRef = useRef(duration);
  const effectColorRef = useRef(effectColor);
  const rotationRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const draggingRef = useRef(false);

  const { width, height } = resolveFormatDimensions(format, backgroundImage);

  useImperativeHandle(ref, () => canvasRef.current as HTMLCanvasElement);

  useEffect(() => {
    backgroundRef.current = backgroundImage;
  }, [backgroundImage]);
  useEffect(() => {
    innerImageRef.current = innerImage;
  }, [innerImage]);
  useEffect(() => {
    diskEnabledRef.current = diskEnabled;
  }, [diskEnabled]);
  useEffect(() => {
    if (!draggingRef.current) diskPositionRef.current = diskPosition;
  }, [diskPosition]);
  useEffect(() => {
    diskSizeRef.current = diskSize;
  }, [diskSize]);
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);
  useEffect(() => {
    effectColorRef.current = effectColor;
  }, [effectColor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let raf = 0;
    const tick = (ts: number) => {
      const engine = getEngine();
      const last = lastTsRef.current ?? ts;
      const dt = Math.min(0.1, (ts - last) / 1000);
      lastTsRef.current = ts;

      if (engine?.isPlaying && diskEnabledRef.current) {
        rotationRef.current += dt * BASE_ANGULAR_VELOCITY * engine.getSpeed();
      }

      const bassEnergy = engine?.getBassEnergy() ?? 0;
      const progress =
        engine && durationRef.current > 0 ? engine.getCurrentTime() / durationRef.current : 0;

      renderVisualizerFrame(ctx, {
        width,
        height,
        backgroundImage: backgroundRef.current,
        innerImage: innerImageRef.current,
        diskEnabled: diskEnabledRef.current,
        diskPosition: diskPositionRef.current,
        diskSize: diskSizeRef.current,
        rotation: rotationRef.current,
        bassEnergy,
        progress,
        effectColor: effectColorRef.current,
      });

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getEngine, width, height]);

  const toCanvasFraction = (e: React.PointerEvent<HTMLCanvasElement>): Position => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0.5, y: 0.5 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!diskEnabledRef.current) return;
    const point = toCanvasFraction(e);
    const center = diskPositionRef.current;
    const dx = (point.x - center.x) * width;
    const dy = (point.y - center.y) * height;
    const radius = width * diskSizeRef.current;
    // Guarantee a comfortable grab area even when the disk has been shrunk
    // down close to its minimum — a literal radius-only hitbox gets too tiny to drag.
    const hitRadius = radius + Math.max(radius * 0.15, width * 0.06);
    if (Math.hypot(dx, dy) <= hitRadius) {
      draggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return;
    const point = toCanvasFraction(e);
    const next = {
      x: Math.min(1 - POSITION_MARGIN, Math.max(POSITION_MARGIN, point.x)),
      y: Math.min(1 - POSITION_MARGIN, Math.max(POSITION_MARGIN, point.y)),
    };
    diskPositionRef.current = next;
    onPositionChange(next);
  };

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{ aspectRatio: `${width} / ${height}` }}
      className={`w-full max-w-[280px] self-center rounded-2xl border border-white/10 bg-black shadow-2xl shadow-fuchsia-500/10 ${
        diskEnabled ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    />
  );
});

export default VisualizerCanvas;
