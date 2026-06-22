"use client";

import Dropzone from "@/components/Dropzone";
import PlayerBar from "@/components/PlayerBar";
import SliderControl from "@/components/SliderControl";
import VisualizerStudio from "@/components/VisualizerStudio";
import WaveformView from "@/components/WaveformView";
import { useAudioEngine } from "@/hooks/useAudioEngine";

export default function Home() {
  const engine = useAudioEngine();
  const isReady = engine.status === "ready";
  const progress = engine.duration > 0 ? engine.currentTime / engine.duration : 0;

  return (
    <div className="min-h-screen px-4 py-10 sm:py-16">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Slowed{" "}
            <span className="bg-gradient-to-r from-fuchsia-400 to-violet-500 bg-clip-text text-transparent">
              + Reverb
            </span>{" "}
            Maker
          </h1>
          <p className="mt-2 text-sm text-white/50">
            MP3 yükle, hızı ve reverb&apos;i ayarla, anında dinle, MP3 veya görselleştiricili
            video olarak indir.
          </p>
        </header>

        <main className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/[0.02] p-6 shadow-2xl shadow-black/40 backdrop-blur sm:p-8">
          <Dropzone onFileSelected={engine.loadFile} disabled={engine.status === "loading"} />

          {engine.status === "loading" && (
            <p className="text-center text-sm text-white/50">Yükleniyor…</p>
          )}

          {engine.error && (
            <p className="text-center text-sm text-red-400">{engine.error}</p>
          )}

          {isReady && (
            <>
              <p className="truncate text-center text-sm text-white/60">{engine.fileName}</p>

              <WaveformView
                peaks={engine.peaks}
                progress={progress}
                onSeek={engine.seekToFraction}
              />

              <PlayerBar
                isPlaying={engine.isPlaying}
                currentTime={engine.currentTime}
                duration={engine.duration}
                onToggle={engine.togglePlay}
              />

              <div className="flex flex-col gap-5 border-t border-white/10 pt-6">
                <SliderControl
                  label="Hız"
                  accent="fuchsia"
                  min={engine.minSpeed}
                  max={engine.maxSpeed}
                  step={0.01}
                  value={engine.speed}
                  displayValue={`${Math.round(engine.speed * 100)}%`}
                  onChange={engine.setSpeed}
                />
                <SliderControl
                  label="Reverb"
                  accent="violet"
                  min={0}
                  max={1}
                  step={0.01}
                  value={engine.reverbMix}
                  displayValue={`${Math.round(engine.reverbMix * 100)}%`}
                  onChange={engine.setReverbMix}
                />
              </div>

              <button
                onClick={engine.exportMp3}
                disabled={engine.isExporting}
                className="relative mt-2 overflow-hidden rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-fuchsia-500/20 transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70"
              >
                {engine.isExporting ? (
                  <>
                    <span
                      className="absolute inset-y-0 left-0 bg-white/20"
                      style={{ width: `${engine.exportProgress * 100}%` }}
                    />
                    <span className="relative">
                      MP3 olarak dışa aktarılıyor… {Math.round(engine.exportProgress * 100)}%
                    </span>
                  </>
                ) : (
                  "MP3 olarak indir"
                )}
              </button>

              <VisualizerStudio
                getEngine={engine.getEngine}
                duration={engine.duration}
                isPlaying={engine.isPlaying}
                togglePlay={engine.togglePlay}
                fileName={engine.fileName}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
