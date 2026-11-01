"use client";
import { useEffect, useState } from "react";
import type { SiteLanguage } from "../hooks/use-local-settings";
import { UI_BEHAVIOR } from "../../config/ui-behavior";

export function CopyButton({ value, language, label }: { value: string; language: SiteLanguage; label?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setTimeout(() => setStatus("idle"), UI_BEHAVIOR.copyFeedbackMs);
    return () => window.clearTimeout(timer);
  }, [status]);
  const copy = async () => {
    try { if (!navigator.clipboard) throw new Error("Clipboard unavailable"); await navigator.clipboard.writeText(value); setStatus("copied"); }
    catch { setStatus("failed"); }
  };
  const message = status === "copied" ? (language === "ja" ? "コピーしました" : "COPIED") : status === "failed" ? (language === "ja" ? "コピーできませんでした" : "COPY FAILED") : (label ?? (language === "ja" ? "コピー" : "COPY"));
  return <button className="copy-button" type="button" onClick={() => void copy()} aria-label={label ?? (language === "ja" ? "登録番号をコピー" : "Copy registry number")}><span role="status">{message}</span></button>;
}
