import type { ItemKind } from "./game-rules";

/**
 * Procedurally-synthesized sound effects (no audio files), independent of
 * any UI component. Each call creates and tears down its own short-lived
 * AudioContext, matching how the rest of the game's SFX already behaves.
 */

function getAudioContextClass(): typeof AudioContext | undefined {
  return window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

/** The meteor blast/knockback boom. */
export function playBoom(soundEnabled: boolean, masterVolume: number, sfxVolume: number) {
  if (!soundEnabled) return;
  try {
    const AudioContextClass = getAudioContextClass();
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const duration = 0.72;
    const gain = context.createGain();
    const low = context.createOscillator();
    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      const decay = Math.pow(1 - i / data.length, 2.8);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
    noise.buffer = buffer;
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.setValueAtTime(720, context.currentTime);
    noiseFilter.frequency.exponentialRampToValueAtTime(90, context.currentTime + duration);
    low.type = "sine";
    low.frequency.setValueAtTime(105, context.currentTime);
    low.frequency.exponentialRampToValueAtTime(34, context.currentTime + duration);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.7 * masterVolume / 100 * sfxVolume / 100, context.currentTime + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    noise.connect(noiseFilter).connect(gain);
    low.connect(gain);
    gain.connect(context.destination);
    noise.start();
    low.start();
    noise.stop(context.currentTime + duration);
    low.stop(context.currentTime + duration);
    window.setTimeout(() => void context.close(), 900);
  } catch {
    // Some browsers block generated audio until the first user interaction.
  }
}

const ITEM_SOUND_SETTINGS: Record<ItemKind, { start: number; end: number; type: OscillatorType; second: number }> = {
  shield: { start: 72, end: 210, type: "sine", second: 108 },
  booster: { start: 95, end: 720, type: "sawtooth", second: 142 },
  holo: { start: 820, end: 260, type: "triangle", second: 1240 },
  orbit: { start: 180, end: 980, type: "sine", second: 270 },
  blast: { start: 118, end: 42, type: "sawtooth", second: 76 },
  pulse: { start: 980, end: 160, type: "square", second: 1320 },
  recall: { start: 940, end: 110, type: "triangle", second: 1410 },
  gravity: { start: 520, end: 72, type: "sine", second: 780 },
};

/** Per-item activation chime. */
export function playItemSound(kind: ItemKind, soundEnabled: boolean, masterVolume: number, sfxVolume: number) {
  if (!soundEnabled) return;
  try {
    const AudioContextClass = getAudioContextClass();
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const now = context.currentTime;
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    const second = context.createOscillator();
    const duration = kind === "shield" ? 0.58 : kind === "blast" || kind === "pulse" ? 0.48 : 0.42;
    const setting = ITEM_SOUND_SETTINGS[kind];
    oscillator.type = setting.type;
    second.type = kind === "blast" ? "sawtooth" : kind === "pulse" ? "square" : "sine";
    oscillator.frequency.setValueAtTime(setting.start, now);
    oscillator.frequency.exponentialRampToValueAtTime(setting.end, now + duration);
    second.frequency.setValueAtTime(setting.second, now);
    second.frequency.exponentialRampToValueAtTime(Math.max(55, setting.end * 1.35), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime((kind === "blast" || kind === "pulse" ? 0.18 : 0.24) * masterVolume / 100 * sfxVolume / 100, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    second.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    second.start(now);
    oscillator.stop(now + duration);
    second.stop(now + duration);
    window.setTimeout(() => void context.close(), (duration + 0.2) * 1000);
  } catch {
    // Audio may remain blocked until a user gesture on some mobile browsers.
  }
}
