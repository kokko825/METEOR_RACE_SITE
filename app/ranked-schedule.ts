export const RANKED_WINDOWS_JST = [
  { start: 8, end: 9, label: "8:00–9:00" },
  { start: 20, end: 21, label: "20:00–21:00" },
] as const;

export function isRankedOpen(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    hour12: false,
  }).format(now));
  return RANKED_WINDOWS_JST.some(({ start, end }) => hour >= start && hour < end);
}

export const RANKED_SCHEDULE_LABEL = "毎日 8:00–9:00 / 20:00–21:00（日本時間）";
