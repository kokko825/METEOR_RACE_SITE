"use client";

import { useEffect, useState } from "react";
import { type SiteConfig } from "../site-config";
import { loadSiteConfig } from "../site-config-client";

type AdPosition = "title" | "result" | "settings";

const SLOT_FIELD: Record<AdPosition, keyof SiteConfig> = {
  title: "adSlotTitle",
  result: "adSlotResult",
  settings: "adSlotSettings",
};

/**
 * Reserved slot for a future ad network. Renders nothing until both the
 * global switch and this specific slot are enabled in site-presentation config
 * panel, so it is safe to leave mounted everywhere ahead of time.
 */
export function AdSlot({ position }: { position: AdPosition }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadSiteConfig().then((config) => {
      if (!cancelled) setVisible(Boolean(config.adsEnabled) && Boolean(config[SLOT_FIELD[position]]));
    });
    return () => {
      cancelled = true;
    };
  }, [position]);

  if (!visible) return null;

  return (
    <div className={`ad-slot ad-slot-${position}`} aria-label="Advertisement" role="complementary">
      <span>AD</span>
    </div>
  );
}
