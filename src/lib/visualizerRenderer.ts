import { lighten, rgba } from "./color";

export const DEFAULT_EFFECT_COLOR = "#e879f9";

export type VisualizerFrame = {
  width: number;
  height: number;
  backgroundImage: CanvasImageSource | null;
  innerImage: CanvasImageSource | null;
  diskEnabled: boolean;
  /** Disk center, normalized 0..1 relative to width/height. */
  diskPosition: { x: number; y: number };
  /** Disk radius as a fraction of width. */
  diskSize: number;
  rotation: number; // radians
  bassEnergy: number; // 0..1
  progress: number; // 0..1
  /** Hex color driving the glow halo, progress ring, disc rim and pulse — everything else is unaffected. */
  effectColor: string;
};

/**
 * "Contain, never upscale" fit (like CSS object-fit: scale-down): the image
 * keeps its natural aspect ratio and is never stretched or cropped. It's
 * shrunk only if it's larger than the target box, and centered within it.
 */
function fitContain(
  iw: number,
  ih: number,
  maxW: number,
  maxH: number
): { drawW: number; drawH: number; dx: number; dy: number } {
  const scale = Math.min(1, maxW / iw, maxH / ih) || 1;
  const drawW = iw * scale;
  const drawH = ih * scale;
  return { drawW, drawH, dx: (maxW - drawW) / 2, dy: (maxH - drawH) / 2 };
}

function drawBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const grad = ctx.createRadialGradient(
    width / 2,
    height * 0.35,
    0,
    width / 2,
    height * 0.35,
    Math.max(width, height) * 0.9
  );
  grad.addColorStop(0, "#2e1065");
  grad.addColorStop(1, "#05020f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  backgroundImage: CanvasImageSource | null
) {
  // Always paint the gradient backdrop first so any letterboxed margins
  // around a non-matching-aspect-ratio image look intentional, not blank.
  drawBackdrop(ctx, width, height);

  if (backgroundImage) {
    const iw = (backgroundImage as HTMLImageElement).naturalWidth ?? width;
    const ih = (backgroundImage as HTMLImageElement).naturalHeight ?? height;
    const { drawW, drawH, dx, dy } = fitContain(iw, ih, width, height);
    ctx.drawImage(backgroundImage, dx, dy, drawW, drawH);

    ctx.fillStyle = "rgba(5, 2, 15, 0.4)";
    ctx.fillRect(dx, dy, drawW, drawH);
  }

  const vignette = ctx.createLinearGradient(0, height * 0.55, 0, height);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.65)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function drawGlow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  bassEnergy: number,
  effectColor: string
) {
  const glowRadius = radius * (1.6 + bassEnergy * 0.5);
  const grad = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, glowRadius);
  grad.addColorStop(0, rgba(effectColor, 0.35 + bassEnergy * 0.25));
  grad.addColorStop(0.5, rgba(effectColor, 0.18));
  grad.addColorStop(1, rgba(effectColor, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
  ctx.fill();
}

function drawProgressRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  progress: number,
  effectColor: string
) {
  ctx.save();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  const start = -Math.PI / 2;
  const grad = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
  grad.addColorStop(0, effectColor);
  grad.addColorStop(1, lighten(effectColor, 0.35));
  ctx.strokeStyle = grad;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, start + progress * Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawVinylDisc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  rotation: number,
  bassEnergy: number,
  innerImage: CanvasImageSource | null,
  effectColor: string
) {
  const pulse = 1 + bassEnergy * 0.06;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pulse, pulse);
  ctx.rotate(rotation);

  const discGrad = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius);
  discGrad.addColorStop(0, "#1a1023");
  discGrad.addColorStop(0.85, "#0c0712");
  discGrad.addColorStop(1, "#050208");
  ctx.fillStyle = discGrad;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = rgba(effectColor, 0.55);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, radius - 3, 0, Math.PI * 2);
  ctx.stroke();

  // Grooves
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let r = radius * 0.3; r < radius * 0.92; r += radius * 0.07) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Spokes, vinyl/drum-wheel feel
  ctx.strokeStyle = rgba(effectColor, 0.35);
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * radius * 0.32, Math.sin(a) * radius * 0.32);
    ctx.lineTo(Math.cos(a) * radius * 0.9, Math.sin(a) * radius * 0.9);
    ctx.stroke();
  }

  // Label / inner circle
  const labelRadius = radius * 0.3;
  if (innerImage) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, labelRadius, 0, Math.PI * 2);
    ctx.clip();
    const iw = (innerImage as HTMLImageElement).naturalWidth || labelRadius * 2;
    const ih = (innerImage as HTMLImageElement).naturalHeight || labelRadius * 2;
    const labelBox = labelRadius * 2;
    const { drawW, drawH } = fitContain(iw, ih, labelBox, labelBox);
    ctx.drawImage(innerImage, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  } else {
    const labelGrad = ctx.createLinearGradient(-labelRadius, -labelRadius, labelRadius, labelRadius);
    labelGrad.addColorStop(0, effectColor);
    labelGrad.addColorStop(1, lighten(effectColor, 0.25));
    ctx.fillStyle = labelGrad;
    ctx.beginPath();
    ctx.arc(0, 0, labelRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#05020f";
    ctx.beginPath();
    ctx.arc(0, 0, labelRadius * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function renderVisualizerFrame(ctx: CanvasRenderingContext2D, frame: VisualizerFrame): void {
  const { width, height, effectColor } = frame;
  drawBackground(ctx, width, height, frame.backgroundImage);

  if (!frame.diskEnabled) return;

  const cx = width * frame.diskPosition.x;
  const cy = height * frame.diskPosition.y;
  const radius = width * frame.diskSize;

  drawGlow(ctx, cx, cy, radius, frame.bassEnergy, effectColor);
  drawProgressRing(ctx, cx, cy, radius * 1.12, frame.progress, effectColor);
  drawVinylDisc(ctx, cx, cy, radius, frame.rotation, frame.bassEnergy, frame.innerImage, effectColor);
}
