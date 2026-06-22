"use client";

import { useEffect, useRef } from "react";

type Props = {
  peaks: number[];
  progress: number; // 0..1
  onSeek: (fraction: number) => void;
};

export default function WaveformView({ peaks, progress, onSeek }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);

      const width = rect.width;
      const height = rect.height;
      ctx.clearRect(0, 0, width, height);

      if (peaks.length === 0) return;

      const gap = 2;
      const barWidth = width / peaks.length - gap;
      const playedBars = Math.floor(progress * peaks.length);
      const midY = height / 2;

      peaks.forEach((peak, i) => {
        const barHeight = Math.max(2, peak * height * 0.92);
        const x = i * (barWidth + gap);
        const played = i <= playedBars;

        if (played) {
          const grad = ctx.createLinearGradient(0, midY - barHeight / 2, 0, midY + barHeight / 2);
          grad.addColorStop(0, "#e879f9");
          grad.addColorStop(1, "#8b5cf6");
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.18)";
        }

        ctx.beginPath();
        const r = Math.min(2, barWidth / 2);
        ctx.roundRect(x, midY - barHeight / 2, Math.max(1, barWidth), barHeight, r);
        ctx.fill();
      });
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [peaks, progress]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek((e.clientX - rect.left) / rect.width);
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className="h-32 w-full cursor-pointer rounded-xl bg-white/[0.03]"
    />
  );
}
