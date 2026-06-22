"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  label: string;
  placeholder?: string;
  onImageElementChange: (img: HTMLImageElement | null) => void;
};

export default function ImageUploader({
  label,
  placeholder = "Görsel veya GIF seç",
  onImageElementChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const drawSourceRef = useRef<HTMLImageElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const cleanupUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  useEffect(() => cleanupUrl, [cleanupUrl]);

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file || !file.type.startsWith("image/")) return;
      cleanupUrl();
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      setPreviewUrl(url);
      setFileName(file.name);
    },
    [cleanupUrl]
  );

  const handleRemove = useCallback(() => {
    cleanupUrl();
    setPreviewUrl(null);
    setFileName(null);
    onImageElementChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [cleanupUrl, onImageElementChange]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-white/80">{label}</span>
        {fileName && (
          <button
            onClick={handleRemove}
            className="text-xs text-white/40 transition-colors hover:text-white/70"
          >
            Kaldır
          </button>
        )}
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-3 text-xs text-white/60 transition-colors hover:border-fuchsia-400/50 hover:bg-white/[0.04]">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
        )}
        <span className="truncate">{fileName ? fileName : placeholder}</span>
      </label>

      {previewUrl && (
        // Kept mounted off-screen (not display:none / visibility:hidden) so
        // animated GIFs keep decoding frames for the canvas to read from.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={drawSourceRef}
          src={previewUrl}
          alt=""
          style={{
            position: "fixed",
            left: "-9999px",
            top: "-9999px",
            width: "1px",
            height: "1px",
            opacity: 0.01,
          }}
          onLoad={() => onImageElementChange(drawSourceRef.current)}
        />
      )}
    </div>
  );
}
