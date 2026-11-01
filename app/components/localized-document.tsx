"use client";
import type { ReactNode } from "react";
import { useSiteLanguage } from "../hooks/use-local-settings";

export function LocalizedDocument({ japanese, english }: { japanese: ReactNode; english: ReactNode }) {
  const language = useSiteLanguage();
  return language === "ja" ? japanese : english;
}
