"use client";

import { useCallback, useRef, useState } from "react";

type Props = {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
};

export default function Dropzone({ onFileSelected, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (!file.type.includes("audio") && !file.name.toLowerCase().endsWith(".mp3")) return;
      onFileSelected(file);
    },
    [onFileSelected]
  );

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (!disabled) handleFiles(e.dataTransfer.files);
      }}
      className={`group relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-8 py-16 text-center transition-all ${
        isDragging
          ? "border-fuchsia-400 bg-fuchsia-500/10"
          : "border-white/15 bg-white/[0.02] hover:border-fuchsia-400/50 hover:bg-white/[0.04]"
      } ${disabled ? "pointer-events-none opacity-50" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/mpeg,audio/mp3,.mp3"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-600 text-2xl shadow-lg shadow-fuchsia-500/20 transition-transform group-hover:scale-105">
        ↑
      </div>
      <p className="text-sm font-medium text-white/90">
        MP3 dosyanı sürükle bırak veya{" "}
        <span className="text-fuchsia-400 underline underline-offset-2">seç</span>
      </p>
      <p className="text-xs text-white/40">Sadece .mp3 desteklenir</p>
    </div>
  );
}
