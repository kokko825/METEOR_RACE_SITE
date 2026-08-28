"use client";

import { useCallback, useEffect, useRef } from "react";
import { UI_FEEDBACK } from "../../config/ui-feedback";
import { playUiFeedback } from "../ui-feedback";

type UiFeedbackOptions = {
  soundEnabled: boolean;
  masterVolume: number;
  sfxVolume: number;
};

/** Delegated listeners keep feedback consistent for current and future controls. */
export function useUiFeedback(options: UiFeedbackOptions) {
  const lastVolumeTickRef = useRef(0);
  const playVolumeTick = useCallback(() => {
    const now = performance.now();
    if (now - lastVolumeTickRef.current < UI_FEEDBACK.volumeTickIntervalMs) return;
    lastVolumeTickRef.current = now;
    playUiFeedback("volumeTick", options.soundEnabled, options.masterVolume, options.sfxVolume);
  }, [options.masterVolume, options.sfxVolume, options.soundEnabled]);

  useEffect(() => {
    const play = (kind: "select" | "confirm" | "volumeTick") =>
      playUiFeedback(kind, options.soundEnabled, options.masterVolume, options.sfxVolume);
    const onClick = (event: MouseEvent) => {
      const control = event.target instanceof Element
        ? event.target.closest<HTMLElement>('button,a[href],summary,[role="button"]')
        : null;
      if (!control || control.matches(':disabled,[aria-disabled="true"]') || control.closest(UI_FEEDBACK.ignoreSelector)) return;
      play(control.matches(UI_FEEDBACK.confirmSelector) ? "confirm" : "select");
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
    };
  }, [options.masterVolume, options.sfxVolume, options.soundEnabled]);

  return { playVolumeTick };
}
