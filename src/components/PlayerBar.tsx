"use client";

import { formatTime } from "@/lib/format";

type Props = {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onToggle: () => void;
};

export default function PlayerBar({ isPlaying, currentTime, duration, onToggle }: Props) {
  return (
    <div className="flex items-center gap-4">
      <button
        onClick={onToggle}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-600 text-lg text-white shadow-lg shadow-fuchsia-500/20 transition-transform hover:scale-105 active:scale-95"
        aria-label={isPlaying ? "Duraklat" : "Oynat"}
      >
        {isPlaying ? "❙❙" : "▶"}
      </button>
      <div className="font-mono text-sm text-white/60">
        {formatTime(currentTime)} / {formatTime(duration)}
      </div>
    </div>
  );
}
