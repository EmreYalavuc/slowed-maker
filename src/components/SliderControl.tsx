"use client";

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  accent?: "fuchsia" | "violet";
  onChange: (value: number) => void;
};

export default function SliderControl({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  accent = "fuchsia",
  onChange,
}: Props) {
  const fraction = (value - min) / (max - min);
  const color = accent === "fuchsia" ? "#e879f9" : "#8b5cf6";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-white/80">{label}</span>
        <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-xs text-white/70">
          {displayValue}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range-slider h-2 w-full cursor-pointer appearance-none rounded-full"
        style={{
          background: `linear-gradient(to right, ${color} ${fraction * 100}%, rgba(255,255,255,0.12) ${
            fraction * 100
          }%)`,
        }}
      />
    </div>
  );
}
