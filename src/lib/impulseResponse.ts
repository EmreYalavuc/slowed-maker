/**
 * Generates a synthetic reverb impulse response (decaying filtered noise)
 * so the app has no dependency on external IR audio files.
 */
export function createReverbImpulse(
  context: BaseAudioContext,
  duration = 3.2,
  decay = 2.6
): AudioBuffer {
  const sampleRate = context.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * duration));
  const impulse = context.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const envelope = Math.pow(1 - i / length, decay);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
  }
  return impulse;
}
