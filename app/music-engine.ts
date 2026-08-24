/**
 * MusicManager: event-driven interactive music engine implementing the
 * METEOR RACE music spec — title theme / 5-stem tension-based battle BGM /
 * goal → fanfare → waiting BGM / per-player battle track choice.
 *
 * Game Logic -> MusicManager.dispatch(event) -> Web Audio API -> (real files
 * if configured, otherwise procedural placeholders built the same way as
 * the existing SFX in page.tsx, so the whole flow is demoable today).
 *
 * NOT implemented here (out of scope for audio): the on-screen slow-motion
 * visual effect described in the spec's goal sequence — that is an
 * animation task, not a music one.
 */

export type MusicEvent =
  | { type: "GAME_START" }
  | { type: "TENSION_CHANGED"; level: 0 | 1 | 2 | 3 | 4 }
  | { type: "ITEM_GET"; kind: string }
  | { type: "GOAL" }
  | { type: "NEW_GAME" };

export type BattleTrackId = "meteor" | "orbit" | "zero_gravity" | "cosmic_error";
export type BattleTrackChoice = BattleTrackId | "random";

export const BATTLE_TRACK_LABELS: Record<BattleTrackId, string> = {
  meteor: "METEOR",
  orbit: "ORBIT",
  zero_gravity: "ZERO GRAVITY",
  cosmic_error: "COSMIC ERROR",
};

const STEM_NAMES = ["base", "pulse", "rhythm", "tension", "final"] as const;
type StemName = (typeof STEM_NAMES)[number];

/** Which stems are audible at each TENSION_CHANGED level (spec section 7). */
const LEVEL_STEMS: Record<number, StemName[]> = {
  0: ["base"],
  1: ["base", "pulse"],
  2: ["base", "pulse", "rhythm"],
  3: ["base", "pulse", "rhythm", "tension"],
  4: ["base", "pulse", "rhythm", "tension", "final"],
};

export type MusicAssetConfig = {
  /** Root URL for a track's stems, e.g. "/assets/audio/music/battle/meteor-theme/". Empty = procedural fallback. */
  battleTrackBaseUrls: Partial<Record<BattleTrackId, string>>;
  titleUrl: string;
  fanfareUrl: string;
  waitingUrl: string;
  gameStartSeUrl: string;
  bpm: number;
  beatsPerBar: number;
  crossfadeMs: number;
};

export const DEFAULT_MUSIC_ASSETS: MusicAssetConfig = {
  battleTrackBaseUrls: {},
  titleUrl: "",
  fanfareUrl: "",
  waitingUrl: "",
  gameStartSeUrl: "",
  bpm: 120,
  beatsPerBar: 4,
  crossfadeMs: 400,
};

type Scene = "idle" | "title" | "battle" | "waiting";

type LoopHandle = { stop: () => void };

/** Starts a looping AudioBufferSourceNode; returns a stop handle. */
function startBufferLoop(context: AudioContext, buffer: AudioBuffer, destination: AudioNode): LoopHandle {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(destination);
  source.start();
  return { stop: () => { try { source.stop(); } catch { /* already stopped */ } } };
}

async function loadBuffer(context: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await context.decodeAudioData(await response.arrayBuffer());
  } catch {
    return null;
  }
}

async function loadStemBuffer(context: AudioContext, baseUrl: string, stem: StemName): Promise<AudioBuffer | null> {
  const root = baseUrl.replace(/\/?$/, "/");
  for (const extension of ["ogg", "mp3", "wav"]) {
    const buffer = await loadBuffer(context, `${root}${stem}.${extension}`);
    if (buffer) return buffer;
  }
  return null;
}

/** Procedural placeholder for one battle stem, themed per spec section 6. */
function startProceduralStem(context: AudioContext, destination: AudioNode, stem: StemName, bpm: number): LoopHandle {
  const beat = 60 / bpm;
  const nodes: Array<{ stop: () => void }> = [];
  const voice = context.createGain();
  voice.gain.value = 1;
  voice.connect(destination);

  if (stem === "base") {
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 520;
    filter.connect(voice);
    for (const [freq, detune] of [[73, 0], [110, 4], [146, -3]] as const) {
      const osc = context.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const gain = context.createGain();
      gain.gain.value = 0.16;
      osc.connect(gain).connect(filter);
      osc.start();
      nodes.push({ stop: () => osc.stop() });
    }
  } else if (stem === "pulse") {
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 220;
    const gain = context.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(voice);
    osc.start();
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const now = context.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + beat * 0.4);
    };
    const timer = window.setInterval(tick, beat * 1000);
    tick();
    nodes.push({ stop: () => { cancelled = true; window.clearInterval(timer); osc.stop(); } });
  } else if (stem === "rhythm") {
    const bass = context.createOscillator();
    bass.type = "triangle";
    bass.frequency.value = 55;
    const bassGain = context.createGain();
    bassGain.gain.value = 0;
    bass.connect(bassGain).connect(voice);
    bass.start();
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const now = context.currentTime;
      bassGain.gain.cancelScheduledValues(now);
      bassGain.gain.setValueAtTime(0.001, now);
      bassGain.gain.exponentialRampToValueAtTime(0.28, now + 0.015);
      bassGain.gain.exponentialRampToValueAtTime(0.001, now + beat * 0.9);
    };
    const timer = window.setInterval(tick, beat * 1000 * 2);
    tick();
    nodes.push({ stop: () => { cancelled = true; window.clearInterval(timer); bass.stop(); } });
  } else if (stem === "tension") {
    for (const [freq, detune] of [[311, 0], [330, 0]] as const) {
      const osc = context.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const gain = context.createGain();
      gain.gain.value = 0.05;
      osc.connect(gain).connect(voice);
      osc.start();
      nodes.push({ stop: () => osc.stop() });
    }
  } else {
    const osc = context.createOscillator();
    osc.type = "square";
    const gain = context.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(voice);
    osc.start();
    const sequence = [660, 784, 880, 990];
    let step = 0;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const now = context.currentTime;
      osc.frequency.setValueAtTime(sequence[step % sequence.length], now);
      step += 1;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.14, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + beat * 0.22);
    };
    const timer = window.setInterval(tick, beat * 1000 * 0.25);
    tick();
    nodes.push({ stop: () => { cancelled = true; window.clearInterval(timer); osc.stop(); } });
  }

  return { stop: () => { for (const node of nodes) node.stop(); voice.disconnect(); } };
}

function playProceduralGameStartSe(context: AudioContext, destination: AudioNode) {
  const now = context.currentTime;
  const gain = context.createGain();
  gain.connect(destination);
  const low = context.createOscillator();
  low.type = "sine";
  low.frequency.setValueAtTime(60, now);
  low.connect(gain);
  low.start(now);
  low.stop(now + 0.35);
  const sweep = context.createOscillator();
  sweep.type = "sawtooth";
  sweep.frequency.setValueAtTime(200, now + 0.1);
  sweep.frequency.exponentialRampToValueAtTime(1400, now + 0.55);
  const sweepGain = context.createGain();
  sweepGain.gain.setValueAtTime(0.0001, now + 0.1);
  sweepGain.gain.exponentialRampToValueAtTime(0.2, now + 0.5);
  sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
  sweep.connect(sweepGain).connect(destination);
  sweep.start(now + 0.1);
  sweep.stop(now + 0.7);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.3, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
}

/** Rich procedural theme used (in different arrangements) for title, fanfare, and waiting BGM. */
function startProceduralTheme(context: AudioContext, destination: AudioNode, arrangement: "title" | "waiting"): LoopHandle {
  const voice = context.createGain();
  voice.gain.value = arrangement === "title" ? 1 : 0.55;
  voice.connect(destination);
  const chord = arrangement === "title" ? [174, 220, 261, 349] : [174, 220, 261];
  const nodes: OscillatorNode[] = [];
  for (const freq of chord) {
    const osc = context.createOscillator();
    osc.type = arrangement === "title" ? "sawtooth" : "sine";
    osc.frequency.value = freq;
    const gain = context.createGain();
    gain.gain.value = arrangement === "title" ? 0.09 : 0.14;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = arrangement === "title" ? 2200 : 900;
    osc.connect(gain).connect(filter).connect(voice);
    osc.start();
    nodes.push(osc);
  }
  return { stop: () => { for (const osc of nodes) osc.stop(); voice.disconnect(); } };
}

function playProceduralFanfare(context: AudioContext, destination: AudioNode) {
  const now = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.45, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 6.5);
  gain.connect(destination);
  const notes: Array<[number, number, number]> = [
    [349, 0, 0.9], [440, 0.15, 0.9], [523, 0.3, 1.4],
    [523, 1.9, 0.5], [587, 2.4, 0.5], [659, 2.9, 2.2],
  ];
  for (const [freq, delay, duration] of notes) {
    const osc = context.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(now + delay);
    osc.stop(now + delay + duration);
  }
}

export class MusicManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private started = false;
  private scene: Scene = "idle";
  private enabled = true;
  private masterVolume = 100;
  private bgmVolume = 0;
  private assets: MusicAssetConfig = DEFAULT_MUSIC_ASSETS;
  private battleTrack: BattleTrackChoice = "random";

  private themeLoop: LoopHandle | null = null;
  private themeBuffer: AudioBuffer | null = null;
  private waitingBuffer: AudioBuffer | null = null;
  private stemLoops = new Map<StemName, { gain: GainNode; loop: LoopHandle }>();
  private stemBuffers: Partial<Record<StemName, AudioBuffer>> = {};
  private battleSceneStart = 0;
  private currentLevel: 0 | 1 | 2 | 3 | 4 = 0;
  private resolvedTrack: BattleTrackId = "meteor";

  start() {
    if (this.started) return;
    const AudioContextClass = window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    this.started = true;
    this.context = new AudioContextClass();
    this.master = this.context.createGain();
    this.master.gain.value = this.effectiveVolume();
    this.master.connect(this.context.destination);
    void this.enterTitle();
  }

  private effectiveVolume() {
    return this.enabled ? (this.masterVolume / 100) * (this.bgmVolume / 100) : 0;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.master?.gain.linearRampToValueAtTime(this.effectiveVolume(), (this.context?.currentTime ?? 0) + 0.15);
  }

  setVolume(masterVolume: number, bgmVolume: number) {
    this.masterVolume = masterVolume;
    this.bgmVolume = bgmVolume;
    this.master?.gain.linearRampToValueAtTime(this.effectiveVolume(), (this.context?.currentTime ?? 0) + 0.15);
  }

  configure(assets: Partial<MusicAssetConfig>) {
    this.assets = { ...this.assets, ...assets };
  }

  /** Player's battle-track preference, stored client-side only (spec: BGM choice is local per player, never synced). */
  setBattleTrack(choice: BattleTrackChoice) {
    this.battleTrack = choice;
  }

  private barDuration() {
    return (60 / this.assets.bpm) * this.assets.beatsPerBar;
  }

  private nextBarTime(): number {
    if (!this.context) return 0;
    const bar = this.barDuration();
    const elapsed = this.context.currentTime - this.battleSceneStart;
    return this.battleSceneStart + Math.ceil(Math.max(0, elapsed) / bar) * bar;
  }

  private async enterTitle() {
    if (!this.context || !this.master) return;
    this.scene = "title";
    if (!this.themeBuffer && this.assets.titleUrl) this.themeBuffer = await loadBuffer(this.context, this.assets.titleUrl);
    if (this.scene !== "title" || !this.context || !this.master) return;
    this.themeLoop?.stop();
    this.themeLoop = this.themeBuffer
      ? startBufferLoop(this.context, this.themeBuffer, this.master)
      : startProceduralTheme(this.context, this.master, "title");
  }

  private stopStems() {
    for (const { loop } of this.stemLoops.values()) loop.stop();
    this.stemLoops.clear();
  }

  private async enterBattle() {
    if (!this.context || !this.master) return;
    this.scene = "battle";
    this.currentLevel = 0;
    this.battleSceneStart = this.context.currentTime;
    this.resolvedTrack = this.battleTrack === "random"
      ? (["meteor", "orbit", "zero_gravity", "cosmic_error"] as BattleTrackId[])[Math.floor(Math.random() * 4)]
      : this.battleTrack;
    const baseUrl = this.assets.battleTrackBaseUrls[this.resolvedTrack];
    this.stopStems();
    for (const stem of STEM_NAMES) {
      const gain = this.context.createGain();
      gain.gain.value = stem === "base" ? 1 : 0;
      gain.connect(this.master);
      const buffer = baseUrl ? await loadStemBuffer(this.context, baseUrl, stem) : null;
      if (buffer) this.stemBuffers[stem] = buffer;
      if (this.scene !== "battle" || !this.context) return;
      const loop = buffer
        ? startBufferLoop(this.context, buffer, gain)
        : startProceduralStem(this.context, gain, stem, this.assets.bpm);
      this.stemLoops.set(stem, { gain, loop });
    }
  }

  private async enterWaiting() {
    if (!this.context || !this.master) return;
    this.scene = "waiting";
    if (!this.waitingBuffer && this.assets.waitingUrl) this.waitingBuffer = await loadBuffer(this.context, this.assets.waitingUrl);
    if (this.scene !== "waiting" || !this.context || !this.master) return;
    this.themeLoop?.stop();
    this.themeLoop = this.waitingBuffer
      ? startBufferLoop(this.context, this.waitingBuffer, this.master)
      : startProceduralTheme(this.context, this.master, "waiting");
  }

  dispatch(event: MusicEvent) {
    if (!this.context || !this.master) return;
    const context = this.context;
    const master = this.master;
    switch (event.type) {
      case "GAME_START": {
        this.themeLoop?.stop();
        this.themeLoop = null;
        if (this.assets.gameStartSeUrl) {
          void loadBuffer(context, this.assets.gameStartSeUrl).then((buffer) => {
            if (!buffer) { playProceduralGameStartSe(context, master); return; }
            const source = context.createBufferSource();
            source.buffer = buffer;
            source.connect(master);
            source.start();
          });
        } else {
          playProceduralGameStartSe(context, master);
        }
        window.setTimeout(() => void this.enterBattle(), 500);
        break;
      }
      case "TENSION_CHANGED": {
        if (this.scene !== "battle" || event.level === this.currentLevel) return;
        this.currentLevel = event.level;
        const active = new Set(LEVEL_STEMS[event.level]);
        const targetTime = this.nextBarTime();
        const fade = this.assets.crossfadeMs / 1000;
        for (const [stem, { gain }] of this.stemLoops) {
          const target = active.has(stem) ? 1 : 0;
          gain.gain.cancelScheduledValues(context.currentTime);
          gain.gain.setValueAtTime(gain.gain.value, Math.max(context.currentTime, targetTime - fade));
          gain.gain.linearRampToValueAtTime(target, targetTime);
        }
        break;
      }
      case "ITEM_GET": {
        // Short musical sting layered on top of the battle BGM; does not interrupt the loops.
        const now = context.currentTime;
        const gain = context.createGain();
        gain.connect(master);
        const profile: Record<string, { freqs: number[]; type: OscillatorType }> = {
          shield: { freqs: [880, 1108], type: "sine" },
          booster: { freqs: [220, 440, 660], type: "square" },
          holo: { freqs: [660, 990], type: "triangle" },
          orbit: { freqs: [520, 780], type: "sine" },
          blast: { freqs: [110, 220], type: "sawtooth" },
          pulse: { freqs: [1200, 900], type: "square" },
          recall: { freqs: [440, 660, 880], type: "triangle" },
          gravity: { freqs: [260, 130], type: "sine" },
        };
        const { freqs, type } = profile[event.kind] ?? { freqs: [440], type: "sine" as OscillatorType };
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
        freqs.forEach((freq, index) => {
          const osc = context.createOscillator();
          osc.type = type;
          osc.frequency.value = freq;
          osc.connect(gain);
          osc.start(now + index * 0.06);
          osc.stop(now + 0.5);
        });
        break;
      }
      case "GOAL": {
        const now = context.currentTime;
        for (const { gain } of this.stemLoops.values()) {
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(gain.gain.value, now);
          gain.gain.linearRampToValueAtTime(0, now + 1);
        }
        this.scene = "idle";
        window.setTimeout(() => {
          this.stopStems();
          if (this.assets.fanfareUrl) {
            void loadBuffer(context, this.assets.fanfareUrl).then((buffer) => {
              if (buffer) {
                const source = context.createBufferSource();
                source.buffer = buffer;
                source.connect(master);
                source.start();
                window.setTimeout(() => void this.enterWaiting(), buffer.duration * 1000);
              } else {
                playProceduralFanfare(context, master);
                window.setTimeout(() => void this.enterWaiting(), 6500);
              }
            });
          } else {
            playProceduralFanfare(context, master);
            window.setTimeout(() => void this.enterWaiting(), 6500);
          }
        }, 1400); // 1s fadeout + brief silence
        break;
      }
      case "NEW_GAME": {
        this.themeLoop?.stop();
        this.themeLoop = null;
        this.dispatch({ type: "GAME_START" });
        break;
      }
    }
  }
}

let singleton: MusicManager | null = null;

export function getMusicManager(): MusicManager {
  if (!singleton) singleton = new MusicManager();
  return singleton;
}
