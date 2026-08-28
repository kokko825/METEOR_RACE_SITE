"use client";

import { useEffect } from "react";
import { UI_FEEDBACK } from "../../config/ui-feedback";
import { playUiFeedback } from "../ui-feedback";

type UiFeedbackOptions = {
  soundEnabled: boolean;
  masterVolume: number;
  sfxVolume: number;
};

/** Delegated listeners keep feedback consistent for current and future controls. */
export function useUiFeedback(options: UiFeedbackOptions) {
  useEffect(() => {
    let lastVolumeTick = 0;
    const play = (kind: "select" | "confirm" | "volumeTick") =>
      playUiFeedback(kind, options.soundEnabled, options.masterVolume, options.sfxVolume);
    const onClick = (event: MouseEvent) => {
      const control = event.target instanceof Element
        ? event.target.closest<HTMLElement>('button,a[href],summary,[role="button"]')
        : null;
      if (!control || control.matches(':disabled,[aria-disabled="true"]') || control.closest(UI_FEEDBACK.ignoreSelector)) return;
      play(control.matches(UI_FEEDBACK.confirmSelector) ? "confirm" : "select");
    };
    const onInput = (event: Event) => {
      if (!(event.target instanceof HTMLInputElement) || event.target.type !== "range") return;
      const now = performance.now();
      if (now - lastVolumeTick < UI_FEEDBACK.volumeTickIntervalMs) return;
      lastVolumeTick = now;
      play("volumeTick");
    };
    document.addEventListener("click", onClick);
    document.addEventListener("input", onInput);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("input", onInput);
    };
  }, [options.masterVolume, options.sfxVolume, options.soundEnabled]);
}
