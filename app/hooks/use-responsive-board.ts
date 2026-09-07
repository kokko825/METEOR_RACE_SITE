"use client";

import { useEffect, type RefObject } from "react";
import { UI_LAYOUT } from "../../config/ui-layout";

/**
 * Keeps the square board inside the space that is actually available.
 * Unlike viewport subtraction formulas, this also follows text zoom,
 * translated labels and action controls whose height changes by phase.
 */
export function useResponsiveBoard(
  arenaRef: RefObject<HTMLElement | null>,
  actionRef: RefObject<HTMLElement | null>,
  verticalFill: number,
) {
  useEffect(() => {
    const arena = arenaRef.current;
    const action = actionRef.current;
    if (!arena || !action || typeof ResizeObserver === "undefined") return;

    const update = () => {
      if (window.innerWidth < UI_LAYOUT.desktopBreakpointPx) {
        arena.style.removeProperty("--board-available-size");
        return;
      }

      const actionHeight = Math.max(
        UI_LAYOUT.battleActionReservePx,
        action.childElementCount > 0 ? action.getBoundingClientRect().height : 0,
      );
      const availableHeight = arena.clientHeight - actionHeight - (actionHeight > 0 ? UI_LAYOUT.actionPanelGapPx : 0);
      const size = Math.floor(Math.min(
        UI_LAYOUT.boardMaximumPx,
        arena.clientWidth,
        arena.clientHeight * verticalFill,
        availableHeight,
      ));
      if (size < UI_LAYOUT.boardMinimumMeasurePx) {
        arena.style.removeProperty("--board-available-size");
        return;
      }
      arena.style.setProperty("--board-available-size", `${size}px`);
    };

    let frame = 0;
    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(arena);
    observer.observe(action);
    window.addEventListener("resize", scheduleUpdate);
    scheduleUpdate();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleUpdate);
      arena.style.removeProperty("--board-available-size");
    };
  }, [actionRef, arenaRef, verticalFill]);
}
