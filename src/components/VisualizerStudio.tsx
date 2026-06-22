"use client";

import { useRef, useState } from "react";
import type { AudioEngine } from "@/lib/audioEngine";
import { formatTime } from "@/lib/format";
import {
  DISK_PRESET_LABELS,
  DISK_PRESETS,
  type DiskPresetKey,
  resolveFormatDimensions,
  MAX_DISK_SIZE,
  MIN_DISK_SIZE,
  DEFAULT_DISK_SIZE,
  type VideoFormat,
} from "@/lib/videoFormat";
import { DEFAULT_EFFECT_COLOR } from "@/lib/visualizerRenderer";
import { useVideoExport } from "@/hooks/useVideoExport";
import ImageUploader from "./ImageUploader";
import SliderControl from "./SliderControl";
import VisualizerCanvas from "./VisualizerCanvas";

type Props = {
  getEngine: () => AudioEngine | null;
  duration: number;
  isPlaying: boolean;
  togglePlay: () => Promise<void>;
  fileName: string | null;
};

const PRESET_GRID: (DiskPresetKey | null)[] = [
  "top-left",
  "top",
  "top-right",
  null,
  "center",
  null,
  "bottom-left",
  "bottom",
  "bottom-right",
];

export default function VisualizerStudio({
  getEngine,
  duration,
  isPlaying,
  togglePlay,
  fileName,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [format, setFormat] = useState<VideoFormat>("9:16");
  const [diskEnabled, setDiskEnabled] = useState(true);
  const [diskPosition, setDiskPosition] = useState(DISK_PRESETS.center);
  const [diskSize, setDiskSize] = useState(DEFAULT_DISK_SIZE);
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);
  const [innerImage, setInnerImage] = useState<HTMLImageElement | null>(null);
  const [effectColor, setEffectColor] = useState(DEFAULT_EFFECT_COLOR);

  const { phase, progress, error, notice, elapsedMs, isStalled, exportVideo, cancel } =
    useVideoExport();

  const isBusy = phase === "recording" || phase === "transcoding";
  const dims = resolveFormatDimensions(format, backgroundImage);

  const handleExport = async () => {
    const engine = getEngine();
    const canvas = canvasRef.current;
    if (!engine || !canvas) return;
    if (isPlaying) await togglePlay();
    const base = fileName?.replace(/\.[^/.]+$/, "") || "track";
    await exportVideo(canvas, engine, base);
  };

  return (
    <div className="flex flex-col gap-6 border-t border-white/10 pt-6">
      <div className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/80">Görselleştirici Ayarları</h2>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/40">
            {dims.width}×{dims.height}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-white/80">Video formatı</span>
          <div className="flex flex-wrap gap-2">
            {(["9:16", "16:9", "image"] as VideoFormat[]).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                disabled={isBusy}
                className={`flex-1 basis-[30%] rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  format === f
                    ? "border-fuchsia-400/60 bg-fuchsia-500/15 text-white"
                    : "border-white/10 bg-white/[0.02] text-white/50 hover:border-white/25"
                }`}
              >
                {f === "9:16" ? "9:16 Dikey" : f === "16:9" ? "16:9 Yatay" : "Görsel Boyutu"}
              </button>
            ))}
          </div>
          {format === "image" && !backgroundImage && (
            <p className="text-[11px] text-amber-300/80">
              Bu modu kullanmak için bir arka plan görseli yükle — yüklenene kadar 9:16 kullanılıyor.
            </p>
          )}
          {format === "image" && backgroundImage && (
            <p className="text-[11px] text-white/35">
              Video, görselin orijinal {backgroundImage.naturalWidth}×{backgroundImage.naturalHeight}{" "}
              boyutunda dışa aktarılacak.
            </p>
          )}
        </div>

        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-white/80">Döner disk görselleştirici</span>
          <button
            role="switch"
            aria-checked={diskEnabled}
            onClick={() => setDiskEnabled((v) => !v)}
            disabled={isBusy}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              diskEnabled ? "bg-fuchsia-500" : "bg-white/15"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                diskEnabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </label>

        {diskEnabled && (
          <>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-white/80">Disk konumu</span>
              <div className="grid grid-cols-3 gap-2">
                {PRESET_GRID.map((key, i) =>
                  key ? (
                    <button
                      key={key}
                      onClick={() => setDiskPosition(DISK_PRESETS[key])}
                      disabled={isBusy}
                      className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5 text-[11px] text-white/60 transition-colors hover:border-fuchsia-400/50 hover:text-white"
                    >
                      {DISK_PRESET_LABELS[key]}
                    </button>
                  ) : (
                    <div key={`empty-${i}`} />
                  )
                )}
              </div>
              <p className="text-[11px] text-white/35">
                Diski önizlemede sürükleyerek de konumlandırabilirsin.
              </p>
            </div>

            <SliderControl
              label="Disk boyutu"
              accent="violet"
              min={MIN_DISK_SIZE}
              max={MAX_DISK_SIZE}
              step={0.01}
              value={diskSize}
              displayValue={`${Math.round(diskSize * 100)}%`}
              onChange={setDiskSize}
            />

            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-white/80">Neon efekt rengi (parlama / nabız)</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-xs text-white/40">{effectColor}</span>
                <input
                  type="color"
                  value={effectColor}
                  onChange={(e) => setEffectColor(e.target.value)}
                  disabled={isBusy}
                  className="h-8 w-10 cursor-pointer rounded-md border border-white/15 bg-transparent p-0.5"
                />
              </span>
            </label>

            <ImageUploader
              label="Disk iç dairesi (etiket) görseli"
              placeholder="İç daire için görsel seç"
              onImageElementChange={setInnerImage}
            />
          </>
        )}

        <ImageUploader
          label="Arka plan (görsel / GIF)"
          onImageElementChange={setBackgroundImage}
        />
      </div>

      <VisualizerCanvas
        ref={canvasRef}
        getEngine={getEngine}
        format={format}
        backgroundImage={backgroundImage}
        innerImage={innerImage}
        diskEnabled={diskEnabled}
        diskPosition={diskPosition}
        diskSize={diskSize}
        duration={duration}
        effectColor={effectColor}
        onPositionChange={setDiskPosition}
      />

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={isBusy}
            className="relative flex-1 overflow-hidden rounded-xl border border-fuchsia-400/30 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70"
          >
            {isBusy && (
              <span
                className="absolute inset-y-0 left-0 bg-fuchsia-500/20 transition-[width]"
                style={{ width: `${progress * 100}%` }}
              />
            )}
            <span className="relative">
              {phase === "recording" &&
                `Kaydediliyor… ${Math.round(progress * 100)}% · ${formatTime(elapsedMs / 1000)}`}
              {phase === "transcoding" &&
                `MP4'e dönüştürülüyor… ${Math.round(progress * 100)}% · ${formatTime(elapsedMs / 1000)}`}
              {(phase === "idle" || phase === "done") && "MP4 video olarak indir"}
              {phase === "error" && "Tekrar dene"}
              {phase === "cancelled" && "İptal edildi — tekrar dene"}
            </span>
          </button>

          {isBusy && (
            <button
              onClick={cancel}
              className="rounded-xl border border-white/15 px-4 text-sm text-white/60 transition-colors hover:border-red-400/50 hover:text-red-300"
            >
              İptal
            </button>
          )}
        </div>

        {phase === "recording" && (
          <p className="text-center text-xs text-white/40">
            Kayıt gerçek zamanlı yapılıyor, parça çalınırken sayfadan ayrılma.
          </p>
        )}
        {phase === "transcoding" && (
          <p className="text-center text-xs text-white/40">
            {isStalled
              ? "Hâlâ çalışıyor — uzun parçalarda dönüştürme biraz sürebilir, lütfen bekleyin."
              : "İlk videoda ffmpeg modülü indiriliyor, bu biraz sürebilir."}
          </p>
        )}
        {notice && <p className="text-center text-xs text-amber-300/80">{notice}</p>}
        {error && <p className="text-center text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
