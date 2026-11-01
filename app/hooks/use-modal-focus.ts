"use client";
import { useEffect, type Dispatch, type SetStateAction } from "react";

/** Share keyboard containment and restore the exact background state on close. */
export function useModalFocus(open: boolean, selector: string, setOpen: Dispatch<SetStateAction<boolean>>) {
  useEffect(() => {
    if (!open) return;
    const overlay = document.querySelector<HTMLElement>(selector);
    if (!overlay) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = Array.from(overlay.parentElement?.children ?? [])
      .filter((node): node is HTMLElement => node instanceof HTMLElement && node !== overlay)
      .map(node => ({ node, inert: node.getAttribute("inert"), hidden: node.getAttribute("aria-hidden") }));
    background.forEach(({node}) => { node.setAttribute("inert", ""); node.setAttribute("aria-hidden", "true"); });
    const controls = () => Array.from(overlay.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')).filter(node => node.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => (overlay.querySelector<HTMLElement>(".icon-close") ?? controls()[0])?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      if (event.key !== "Tab") return;
      const items = controls(), first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (!overlay.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      background.forEach(({node,inert,hidden}) => {
        if (inert === null) node.removeAttribute("inert"); else node.setAttribute("inert", inert);
        if (hidden === null) node.removeAttribute("aria-hidden"); else node.setAttribute("aria-hidden", hidden);
      });
      if (previous?.isConnected) previous.focus({preventScroll:true});
    };
  }, [open, selector, setOpen]);
}
