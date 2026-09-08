"use client";
import type { ReactNode } from "react";
import { useLocalSettings } from "../hooks/use-local-settings";

export function LocalizedDocument({ japanese, english }: { japanese: ReactNode; english: ReactNode }) {
  const { language } = useLocalSettings();
  return language === "ja" ? japanese : english;
}
