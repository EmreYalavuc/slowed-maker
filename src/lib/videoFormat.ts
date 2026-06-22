export type FixedVideoFormat = "9:16" | "16:9";
export type VideoFormat = FixedVideoFormat | "image";

export const FORMAT_DIMENSIONS: Record<FixedVideoFormat, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
};

/**
 * Resolves the actual canvas/export dimensions for a format. "image" mode
 * has no fixed aspect ratio — the canvas matches the uploaded background
 * image's exact native resolution, so it's rendered without any scaling. If
 * no background image has been uploaded yet, it falls back to 9:16 until one is.
 */
export function resolveFormatDimensions(
  format: VideoFormat,
  backgroundImage: HTMLImageElement | null
): { width: number; height: number } {
  if (format === "image") {
    if (backgroundImage?.naturalWidth && backgroundImage?.naturalHeight) {
      return { width: backgroundImage.naturalWidth, height: backgroundImage.naturalHeight };
    }
    return FORMAT_DIMENSIONS["9:16"];
  }
  return FORMAT_DIMENSIONS[format];
}

export type DiskPresetKey =
  | "center"
  | "top"
  | "bottom"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export const DISK_PRESETS: Record<DiskPresetKey, { x: number; y: number }> = {
  center: { x: 0.5, y: 0.42 },
  top: { x: 0.5, y: 0.2 },
  bottom: { x: 0.5, y: 0.78 },
  "top-left": { x: 0.26, y: 0.22 },
  "top-right": { x: 0.74, y: 0.22 },
  "bottom-left": { x: 0.26, y: 0.78 },
  "bottom-right": { x: 0.74, y: 0.78 },
};

export const DISK_PRESET_LABELS: Record<DiskPresetKey, string> = {
  center: "Merkez",
  top: "Üst",
  bottom: "Alt",
  "top-left": "Üst Sol",
  "top-right": "Üst Sağ",
  "bottom-left": "Alt Sol",
  "bottom-right": "Alt Sağ",
};

export const MIN_DISK_SIZE = 0.05;
export const MAX_DISK_SIZE = 0.42;
export const DEFAULT_DISK_SIZE = 0.32;
