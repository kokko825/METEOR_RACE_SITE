import { BLOCKED_CHAT_PATTERNS } from "../config/community-safety";

function moderationForm(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u0000-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u00bf\s_ーｰ・･]+/gu, "");
}

export function containsBlockedChatLanguage(value: string) {
  const normalized = moderationForm(value);
  return BLOCKED_CHAT_PATTERNS.some((pattern) => pattern.test(normalized));
}
