import { UI_FEEDBACK, type UiFeedbackKind } from "../config/ui-feedback";

let sharedContext: AudioContext | null = null;

function audioContext() {
  const AudioContextClass = window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  sharedContext ??= new AudioContextClass();
  if (sharedContext.state === "suspended") void sharedContext.resume();
  return sharedContext;
}

function synthesize(kind: UiFeedbackKind, volume: number) {
  const context = audioContext();
  if (!context) return;
  const now = context.currentTime;
  const gain = context.createGain();
  const oscillator = context.createOscillator();
  const duration = kind === "confirm" ? 0.13 : kind === "volumeTick" ? 0.025 : 0.045;
  const start = kind === "confirm" ? 330 : kind === "volumeTick" ? 1680 : 760;
  const end = kind === "confirm" ? 660 : kind === "volumeTick" ? 1160 : 920;
  oscillator.type = kind === "volumeTick" ? "square" : "sine";
  oscillator.frequency.setValueAtTime(start, now);
  oscillator.frequency.exponentialRampToValueAtTime(end, now + duration);
  gain.gain.setValueAtTime(Math.max(0.0001, volume), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playConfiguredFile(kind: UiFeedbackKind, volume: number) {
  const source = UI_FEEDBACK.sounds[kind];
  if (!source) return false;
  const audio = new Audio(source);
  audio.volume = Math.min(1, volume);
  void audio.play().catch(() => synthesize(kind, volume));
  return true;
}

export function playUiFeedback(kind: UiFeedbackKind, soundEnabled: boolean, masterVolume: number, sfxVolume: number) {
  const previewMaster = kind === "volumeTick" ? Math.max(18, masterVolume) : masterVolume;
  const previewSfx = kind === "volumeTick" ? Math.max(18, sfxVolume) : sfxVolume;
  const volume = UI_FEEDBACK.gain[kind] * previewMaster / 100 * previewSfx / 100;
  if (soundEnabled && !playConfiguredFile(kind, volume)) synthesize(kind, volume);
  const vibration = UI_FEEDBACK.vibrationMs[kind];
  if ("vibrate" in navigator) navigator.vibrate(typeof vibration === "number" ? vibration : [...vibration]);
}
