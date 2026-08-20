"use client";

import { useEffect } from "react";
import { normalizeSiteConfig } from "../site-config";

/** Applies the published visual theme without requiring a code deployment. */
export function useSiteTheme() {
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/site-config", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const config = normalizeSiteConfig(data.config);
        const root = document.documentElement;
        root.style.setProperty("--ui-accent", config.themeAccent);
        root.style.setProperty("--ui-warm", config.themeWarm);
        root.style.setProperty("--space", config.themeBackground);
        root.style.setProperty("--ink", config.themeText);
        root.style.setProperty("--ui-glow", String(config.themeGlow / 100));
        root.style.setProperty("--ui-glow-size", `${Math.round(config.themeGlow * 0.28)}px`);
        root.style.setProperty("--panel-opacity", String(config.themePanelOpacity / 100));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
}
