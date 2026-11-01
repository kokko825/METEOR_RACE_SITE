/** Preferences must never prevent playing when browser storage is unavailable. */
const volatileValues = new Map<string, string>();
export function readLocal(key: string): string | null {
  if (typeof window === "undefined") return null;
  if (volatileValues.has(key)) return volatileValues.get(key)!;
  try { return window.localStorage.getItem(key); }
  catch { return volatileValues.get(key) ?? null; }
}
export function writeLocal(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try { if (window.localStorage.getItem(key) !== value) window.localStorage.setItem(key, value); volatileValues.delete(key); }
  catch { volatileValues.set(key, value); }
}
export function parseStoredNumber(raw: string | null, fallback: number, min = 0, max = 100): number {
  if (raw === null || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}
