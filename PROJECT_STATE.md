# PROJECT_STATE.md

Snapshot of the **Slowed + Reverb Maker** project for picking work back up in a future session.

## How to start the dev server

```bash
cd C:\Users\Pc\Desktop\slowed-maker
npm install      # only needed if node_modules is missing/stale
npm run dev       # http://localhost:3000
```

Other scripts: `npm run build` (production build), `npm run start` (serve a build), `npm run lint` (ESLint).

No environment variables or `.env` are required — everything runs client-side, no backend/API.

If a stale dev server is occupying port 3000 (Windows/Git Bash):
```bash
netstat -ano | grep ":3000" | grep LISTENING   # find the PID
taskkill //PID <pid> //F                        # kill it
```

## Key features implemented

- **MP3 upload** (drag-and-drop or file picker), decoded client-side via Web Audio API.
- **Speed control** (50–100%) — implemented as `playbackRate`, which also lowers pitch (the classic "slowed" sound).
- **Reverb control** (0–100%) — equal-power dry/wet crossfade through a `ConvolverNode` with a synthetic (algorithmically generated) impulse response, no external IR audio files.
- **Waveform preview** with click-to-seek and a live playhead.
- **Real-time preview** of speed + reverb while playing.
- **MP3 export** — fully client-side render via `OfflineAudioContext` + `@breezystack/lamejs` (a maintained fork of `lamejs`; the original `lamejs` npm package is broken under any real module bundler/Node — it references the `MPEGMode` global without importing it).
- **TikTok-style video visualizer + MP4 export**:
  - Rotating "vinyl" disk synced to playback speed/state, with a bass-reactive pulse/glow (via an `AnalyserNode` tap) and a progress ring.
  - Background image/GIF upload (animated GIFs are kept alive via an off-screen, non-`display:none` `<img>` so the browser keeps decoding frames).
  - Separate image upload for just the disk's inner label circle.
  - Configurable neon effect color (single color picker driving glow/ring/rim/pulse only — not the rest of the UI theme).
  - Disk is draggable on the canvas, with 7 position presets (center/top/bottom/4 corners), and a size slider (5%–42% of canvas width).
  - Three export formats: **9:16** (1080×1920), **16:9** (1920×1080), and **"Görsel Boyutu"** (Image Size) — canvas/export dimensions exactly match the uploaded background image's native resolution, no forced aspect ratio.
  - MP4 export via a tiered `MediaRecorder` strategy + `ffmpeg.wasm` fallback (see below) — with cancel button, elapsed-time display, stall detection, and a proactive time estimate when the slow path is used.

## Architecture overview

Everything is client-side; there is no server/API route. The app is two largely independent pipelines sharing one `AudioEngine`:

```
src/lib/audioEngine.ts        <- single Web Audio graph, used by BOTH pipelines
  ├─ src/hooks/useAudioEngine.ts   <- React state wrapper (play/pause/seek/speed/reverb/MP3 export)
  │    └─ src/app/page.tsx         <- main UI: Dropzone, WaveformView, PlayerBar, sliders, MP3 export button
  └─ src/components/VisualizerStudio.tsx  <- visualizer settings panel + canvas + MP4 export button
       ├─ src/components/VisualizerCanvas.tsx  <- the actual <canvas>, owns its own rAF loop
       ├─ src/lib/visualizerRenderer.ts        <- pure canvas-drawing functions (no React)
       ├─ src/components/ImageUploader.tsx     <- generic image/GIF upload (used for bg + inner image)
       └─ src/hooks/useVideoExport.ts          <- orchestrates record -> (maybe) transcode -> download
            ├─ src/lib/videoRecorder.ts        <- MediaRecorder wrapper, tiered codec selection
            └─ src/lib/ffmpegTranscode.ts      <- ffmpeg.wasm wrapper (webm -> mp4)
```

**`AudioEngine` (`src/lib/audioEngine.ts`)** is the single source of truth for audio. Graph:
`source -> [dryGain | convolver -> wetGain] -> masterGain -> destination`, plus two passive taps off `masterGain`:
- `masterGain -> analyser -> silentGain(0) -> destination` (the silent-gain trick is required because an `AnalyserNode` only receives data if it's reachable from a destination-like node — connecting it straight to `destination` would double the audible volume).
- `masterGain -> MediaStreamAudioDestinationNode` (used to get a live audio `MediaStream` for video recording).

`renderOffline()` (MP3 export) and the live graph are intentionally separate — MP3 export never touches the analyser/media-stream taps.

**Visualizer rendering** is a pure function `renderVisualizerFrame(ctx, frame)` in `visualizerRenderer.ts` with no React/DOM dependency. `VisualizerCanvas.tsx` drives it from its own `requestAnimationFrame` loop, reading live engine state (`isPlaying`, `getSpeed()`, `getBassEnergy()`, `getCurrentTime()`) directly via a `getEngine()` accessor rather than through React state, for per-frame responsiveness. Disk position/size/background/inner-image/effect-color are all passed as refs synced from props, so the loop never has stale closures.

Image fitting (background image, inner disk image) uses a "contain, never-upscale" rule (`fitContain` in `visualizerRenderer.ts`, equivalent to CSS `object-fit: scale-down`): images keep their native size if they fit, are only scaled *down* (never up) if larger than the target area, and are centered — never stretched or cropped.

**Video format / canvas dimensions** (`src/lib/videoFormat.ts`): `resolveFormatDimensions(format, backgroundImage)` returns `{width, height}`. For `"9:16"`/`"16:9"` these are fixed; for `"image"` mode they come from the uploaded background image's `naturalWidth/naturalHeight` (falls back to 9:16 until an image is uploaded). The `<canvas>` element's `width`/`height` attributes are set directly from this, so the canvas *is* the export resolution — no separate render target.

## FFmpeg / WebM setup (and why it exists)

MP4 export needs to combine canvas + audio into a video file, in-browser. The pipeline (`useVideoExport.ts`):

1. **Record**: `recordCanvasAndAudio()` (`videoRecorder.ts`) combines `canvas.captureStream(30)` with the engine's audio `MediaStream` into one `MediaStream`, fed to `MediaRecorder`. It picks the **fastest available codec tier** via `MediaRecorder.isTypeSupported`, in priority order:
   - `"mp4-direct"` — `video/mp4` directly (Safari, some modern Chrome builds). **No ffmpeg involved at all** if this is available — the recorded blob *is* the final file.
   - `"h264-webm"` — `video/webm;codecs=h264,opus`. Common on Chrome/Edge (native/hardware H.264 encoder). ffmpeg only needs a **stream copy** (`-c:v copy`), i.e. a near-instant remux — no re-encode.
   - `"software-webm"` — `video/webm;codecs=vp9/vp8`. Fallback when no H.264 MediaRecorder output exists. Requires a **full software re-encode** to H.264 via ffmpeg, which is slow (see below).
2. **Transcode** (`ffmpegTranscode.ts`, only reached for the `h264-webm`/`software-webm` tiers): lazy-loads `@ffmpeg/ffmpeg` (npm package, installed) with its core/wasm fetched at runtime from a **pinned CDN version** (`@ffmpeg/core@0.12.10` via unpkg, converted to blob URLs with `toBlobURL` for CORS safety) — the core is *not* bundled locally (~25–30MB, would bloat the app; official quick-start pattern). First export in a session pays this download; cached in-memory afterward (until the tab reloads or `terminateFFmpeg()` is called).
   - `videoIsH264: true` → `-c:v copy -c:a aac` (fast remux + cheap audio transcode).
   - `videoIsH264: false` → `-c:v libx264 -preset ultrafast -crf 26 -c:a aac` (full software encode).
   - Uses the **single-threaded** ffmpeg core (no COOP/COEP headers needed, no `SharedArrayBuffer`/multi-threading) — deliberately, to avoid the complexity/risk of cross-origin-isolation headers. This means the `software-webm` fallback is genuinely slow (~25x real-time observed in testing), but it now completes deterministically instead of appearing to hang (see timeout below) — see "Export pipeline" section.
3. **Download**: triggers a `<a download>` click on the resulting blob.

**Why `@breezystack/lamejs` and not `lamejs`**: the plain `lamejs` npm package's internal modules reference some globals (e.g. `MPEGMode`) without importing them — works only in the old hand-concatenated browser bundle, not under any real CommonJS/ESM bundler (confirmed broken under both Node `require` and would be broken in Webpack/Turbopack the same way). The `@breezystack/lamejs` fork fixes this and ships its own type declarations.

## Export pipeline reliability (why it no longer hangs)

This was a real bug, root-caused and fixed:
- The slow `software-webm` ffmpeg path is ~25–40x slower than real-time on this single-threaded setup. A multi-minute song could take an hour+ — which *looked* like a hang.
- Fix: prefer H.264 MediaRecorder output (instant or near-instant ffmpeg step) whenever the browser supports it — verified most real browsers do.
- For the genuine fallback case: `ffmpeg.exec()` is called with an explicit **timeout** (`timeoutMs`, scaled with track duration: `realtimeSeconds * 1000 * 40`, clamped to `[3min, 25min]`) so a stuck encode fails loudly instead of hanging forever.
- A proactive UI **notice** estimates expected time (`realtimeSeconds * 25 / 60` minutes) as soon as the slow tier is detected, before the user has to wonder.
- **Stall detection**: if no progress event arrives for `12s` (`STALL_WARNING_MS`), the UI shows "still working" instead of looking frozen.
- A working **Cancel** button: during recording it just flips a ref the `shouldStop` poll checks; during transcoding there's no clean mid-`exec` abort in ffmpeg.wasm, so it calls `terminateFFmpeg()` (kills the worker outright, resets the singleton so the next export reloads cleanly).
- Every stage logs to the console with elapsed-time prefixes (`[export +123ms] ...`, `[ffmpeg] ...`) for debugging a real freeze report.

All of the above was verified end-to-end with a real headless-browser test harness (now removed — it was temporary, not part of the shipped app): upload → sliders → drag/position/size/color controls → both image uploads → fast-path export → forced-slow-path export (confirmed it completes, not hangs) → cancel mid-transcode.

## Notes for next session

- No git commits have been made yet in this repo (per project convention, only commit when explicitly asked).
- `npm install -D playwright` was used several times for verification and always uninstalled afterward — if you see it in `package.json`, it wasn't cleaned up; safe to `npm uninstall playwright`.
- Vercel deploy: this is a stock Next.js App Router project (`next build`/`next start`), should deploy to Vercel with zero special config — no env vars, no server routes, no edge-runtime requirements. The only runtime dependency on the internet (besides the app itself) is the ffmpeg core CDN fetch (unpkg) on first MP4 export.
