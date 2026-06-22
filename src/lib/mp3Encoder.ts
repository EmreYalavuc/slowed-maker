import { Mp3Encoder } from "@breezystack/lamejs";

const BLOCK_SIZE = 1152;

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

export type EncodeProgress = (fraction: number) => void;

/** Encodes an AudioBuffer to an MP3 Blob using a pure-JS encoder (runs entirely client-side). */
export async function encodeMp3(
  buffer: AudioBuffer,
  kbps = 192,
  onProgress?: EncodeProgress
): Promise<Blob> {
  const channels = Math.min(buffer.numberOfChannels, 2) as 1 | 2;
  const encoder = new Mp3Encoder(channels, buffer.sampleRate, kbps);

  const left = floatTo16BitPCM(buffer.getChannelData(0));
  const right = channels === 2 ? floatTo16BitPCM(buffer.getChannelData(1)) : null;

  const chunks: Uint8Array[] = [];
  const total = left.length;

  for (let i = 0; i < total; i += BLOCK_SIZE) {
    const leftChunk = left.subarray(i, i + BLOCK_SIZE);
    const mp3buf = right
      ? encoder.encodeBuffer(leftChunk, right.subarray(i, i + BLOCK_SIZE))
      : encoder.encodeBuffer(leftChunk);
    if (mp3buf.length > 0) chunks.push(new Uint8Array(mp3buf));

    if (onProgress && i % (BLOCK_SIZE * 200) === 0) {
      onProgress(Math.min(1, i / total));
      // Yield to the event loop so the UI can repaint during long encodes.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const end = encoder.flush();
  if (end.length > 0) chunks.push(new Uint8Array(end));
  onProgress?.(1);

  // lamejs always backs its output with a plain ArrayBuffer, never SharedArrayBuffer,
  // but TS's generic typed-array types can't express that narrowing here.
  return new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
}
