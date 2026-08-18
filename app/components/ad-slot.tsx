"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SITE_CONFIG, normalizeSiteConfig, type SiteConfig } from "../site-config";

type AdPosition = "title" | "result" | "settings";

const SLOT_FIELD: Record<AdPosition, keyof SiteConfig> = {
  title: "adSlotTitle",
  result: "adSlotResult",
  settings: "adSlotSettings",
};

const SLOT_LABEL: Record<AdPosition, string> = {
  title: "AD",
  result: "AD",
  settings: "AD",
};

let cachedConfig: Promise<SiteConfig> | null = null;

function fetchSiteConfig(): Promise<SiteConfig> {
  if (!cachedConfig) {
    cachedConfig = fetch("/api/site-config", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => normalizeSiteConfig(data?.config))
      .catch(() => DEFAULT_SITE_CONFIG);
  }
  return cachedConfig;
}

/**
 * Reserved slot for a future ad network. Renders nothing until both the
 * global switch and this specific slot are enabled in the site-config admin
 * panel, so it is safe to leave mounted everywhere ahead of time.
 */
export function AdSlot({ position }: { position: AdPosition }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchSiteConfig().then((config) => {
      if (!cancelled) setVisible(Boolean(config.adsEnabled) && Boolean(config[SLOT_FIELD[position]]));
    });
    return () => {
      cancelled = true;
    };
  }, [position]);

  if (!visible) return null;

  return (
    <div className={`ad-slot ad-slot-${position}`} aria-label="広告枠" role="complementary">
      <span>{SLOT_LABEL[position]}</span>
    </div>
  );
}
