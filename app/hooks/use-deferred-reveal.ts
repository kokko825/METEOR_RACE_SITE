"use client";

import { useEffect, useState } from "react";

type DeferredRevealOptions = {
  active: boolean;
  blocked: boolean;
  identity: string;
  delayMs: number;
};

/**
 * Keeps a state-driven overlay behind any visual transition that leads to it.
 * Reusable for match results, future cut-ins, and other post-animation panels.
 */
export function useDeferredReveal({ active, blocked, identity, delayMs }: DeferredRevealOptions) {
  const [revealedIdentity, setRevealedIdentity] = useState("");

  useEffect(() => {
    if (!active || blocked) {
      // Reset between matches, including an identical winner/turn count in a rematch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRevealedIdentity("");
      return;
    }
    const timer = window.setTimeout(() => setRevealedIdentity(identity), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, blocked, identity, delayMs]);

  return active && !blocked && revealedIdentity === identity;
}
