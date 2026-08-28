"use client";

type VolumeRangeProps = { label: string; shortLabel?: string; value: number; step?: number; onChange: (value: number) => void; onTick: () => void; className?: string };

export function VolumeRange({ label, shortLabel, value, step = 1, onChange, onTick, className }: VolumeRangeProps) {
  return <label className={className}><span>{shortLabel ?? label}</span><input aria-label={label} type="range" min="0" max="100" step={step} value={value} onInput={onTick} onChange={(event) => onChange(Number(event.target.value))} /><output>{value}</output></label>;
}

type SoundMixerProps = { enabled: boolean; masterVolume: number; bgmVolume: number; sfxVolume: number; masterLabel: string; sfxLabel: string; muteLabel: string; unmuteLabel: string; setMasterVolume: (value: number) => void; setBgmVolume: (value: number) => void; setSfxVolume: (value: number) => void; onTick: () => void; onToggle: () => void };

export function SoundMixer(props: SoundMixerProps) {
  return <div className="hud-volume"><button type="button" aria-label={props.enabled ? props.muteLabel : props.unmuteLabel} onClick={props.onToggle}>{props.enabled ? "◖))" : "◖×"}</button><div className="hud-mixer"><VolumeRange label={props.masterLabel} shortLabel="ALL" step={10} value={props.masterVolume} onChange={props.setMasterVolume} onTick={props.onTick} /><VolumeRange label="BGM" shortLabel="BGM" step={10} value={props.bgmVolume} onChange={props.setBgmVolume} onTick={props.onTick} /><VolumeRange label={props.sfxLabel} shortLabel="SFX" step={10} value={props.sfxVolume} onChange={props.setSfxVolume} onTick={props.onTick} /></div></div>;
}
