/**
 * オンラインコミュニティの運営設定です。
 * 変更後は `npm run check` を実行してください。
 */
export const COMMUNITY_SAFETY = {
  nicknameMaxLength: 16,
  chatMaxLength: 80,
  contactMaxLength: 1200,
  chatPostLimit: 8,
  chatPostWindowSeconds: 20,
  chatRetentionDays: 30,
  contactRetentionDays: 180,
  quickChatMessages: ["よろしく！", "ナイス！", "しまった！", "考え中…", "もう一戦！", "GG！"],
} as const;

/** 明確な性的表現、差別語、脅迫、暴言だけを対象にします。 */
export const BLOCKED_CHAT_PATTERNS = [
  /(?:ちんぽ|ちんこ|まんこ|せっくす|セックス|おなに|オナニ|ぱいずり|パイズリ|ふぇら|フェラ|くんに|クンニ)/u,
  /(?:fuck|fucking|sex|porn|hentai|dick|cock|pussy|cunt)/iu,
  /(?:にがー|ニガー|ちょん|チョン|土人|どじん|ガイジ|かたわ|ホモ野郎|おかま野郎)/u,
  /(?:nigger|nigga|chink|gook|faggot|tranny|retard(?:ed)?)/iu,
  /(?:(?:死|し|シ|4)ね|消えろ|失せろ|くたばれ|殺す|ころす|コロス|56す|ぶっ殺|自殺しろ)/u,
  /(?:馬鹿|ばか|バカ|阿呆|あほ|アホ|クズ|くず|カス|かす|雑魚|ざこ|ザコ|無能|役立たず|黙れ|だまれ)/u,
  /(?:きもい|キモい|きしょい|キショい|うざい|ウザい|頭悪|脳なし|脳無し)/u,
  /(?:killyourself|killurself|kys|go(?:and)?die|youshoulddie|idiot|moron|scum|loser|shutup|stfu)/iu,
  /🖕/u,
] as const;
