const BLOCKED_PATTERNS = [
  // Explicit sexual language and sexual harassment.
  /(?:ちんぽ|ちんこ|まんこ|せっくす|セックス|おなに|オナニ|ぱいずり|パイズリ|ふぇら|フェラ|くんに|クンニ)/u,
  /(?:fuck|fucking|sex|porn|hentai|dick|cock|pussy|cunt)/iu,
  // Clear discriminatory slurs. Keep this list narrow to avoid blocking ordinary conversation.
  /(?:にがー|ニガー|ちょん|チョン|土人|どじん|ガイジ|かたわ|ホモ野郎|おかま野郎)/u,
  /(?:nigger|nigga|chink|gook|faggot|tranny|retard(?:ed)?)/iu,
  // Direct abuse, threats and commands encouraging self-harm.
  /(?:(?:死|し|シ|4)ね|消えろ|失せろ|くたばれ|殺す|ころす|コロス|56す|ぶっ殺|自殺しろ)/u,
  /(?:馬鹿|ばか|バカ|阿呆|あほ|アホ|クズ|くず|カス|かす|雑魚|ざこ|ザコ|無能|役立たず|黙れ|だまれ)/u,
  /(?:きもい|キモい|きしょい|キショい|うざい|ウザい|頭悪|脳なし|脳無し)/u,
  /(?:killyourself|killurself|kys|go(?:and)?die|youshoulddie|idiot|moron|scum|loser|shutup|stfu)/iu,
  /🖕/u,
] as const;

function moderationForm(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u0000-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u00bf\s_ーｰ・･]+/gu, "");
}

export function containsBlockedChatLanguage(value: string) {
  const normalized = moderationForm(value);
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(normalized));
}
