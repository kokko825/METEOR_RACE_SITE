"use client";

import type { SiteLanguage } from "../hooks/use-local-settings";
import { uiText } from "../i18n";

type VolumeRangeProps = {
  label: string;
  shortLabel?: string;
  value: number;
  onChange: (value: number) => void;
  onTick: () => void;
  className?: string;
};

export function VolumeRange({
  label,
  shortLabel,
  value,
  onChange,
  onTick,
  className,
}: VolumeRangeProps) {
  return (
    <label className={className}>
      <span>{shortLabel ?? label}</span>
      <input
        aria-label={label}
        type="range"
        min="0"
        max="100"
        step={1}
        value={value}
        onInput={onTick}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>{value}</output>
    </label>
  );
}

export type VolumeControlsProps = {
  language: SiteLanguage;
  musicEnabled: boolean;
  masterVolume: number;
  bgmVolume: number;
  sfxVolume: number;
  setMasterVolume: (value: number) => void;
  setBgmVolume: (value: number) => void;
  setSfxVolume: (value: number) => void;
  onTick: () => void;
};

/** One channel list for Settings and the persistent toolbar. */
export function VolumeControls(
  props: VolumeControlsProps & { compact?: boolean },
) {
  const channels = [
    {
      id: "ALL",
      label: uiText(props.language, "masterVolume"),
      value: props.masterVolume,
      change: props.setMasterVolume,
      visible: true,
    },
    {
      id: "BGM",
      label: "BGM",
      value: props.bgmVolume,
      change: props.setBgmVolume,
      visible: props.musicEnabled,
    },
    {
      id: "SFX",
      label: uiText(props.language, "soundEffects"),
      value: props.sfxVolume,
      change: props.setSfxVolume,
      visible: true,
    },
  ];
  return channels
    .filter((channel) => channel.visible)
    .map((channel) => (
      <VolumeRange
        key={channel.id}
        label={channel.label}
        shortLabel={props.compact ? channel.id : undefined}
        className={props.compact ? undefined : "drawer-volume"}
        value={channel.value}
        onChange={channel.change}
        onTick={props.onTick}
      />
    ));
}

export function SoundMixer(
  props: VolumeControlsProps & { enabled: boolean; onToggle: () => void },
) {
  const label =
    props.language === "ja"
      ? props.enabled
        ? "消音する"
        : "音を出す"
      : props.enabled
        ? "Mute audio"
        : "Enable audio";
  return (
    <div className="hud-volume">
      <button type="button" aria-label={label} onClick={props.onToggle}>
        {props.enabled ? "◖))" : "◖×"}
      </button>
      <div className="hud-mixer">
        <VolumeControls {...props} compact />
      </div>
    </div>
  );
}
