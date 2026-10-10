/** Shared room identifier rules; normalize only when submitting, never during IME input. */
export const ROOM_CODE_MAX_LENGTH = 12;
export function normalizeRoomCode(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFKC").trim().toUpperCase() : "";
}
export function validRoomCode(code: string): boolean {
  const length = Array.from(code).length;
  return length >= 2 && length <= ROOM_CODE_MAX_LENGTH && /^[A-Z0-9\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]+$/u.test(code);
}
