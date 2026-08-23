import { UI_COPY, type UiCopyKey } from "../config/ui-copy";
import type { SiteLanguage } from "./hooks/use-local-settings";

export const uiText = (language: SiteLanguage, key: UiCopyKey) => UI_COPY[key][language];

export function uiFormat(
  language: SiteLanguage,
  key: UiCopyKey,
  values: Record<string, string | number>,
) {
  return uiText(language, key).replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}
