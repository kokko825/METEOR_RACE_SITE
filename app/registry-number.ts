/**
 * Public-facing AEQRIS company registration number.
 *
 * The private player UUID remains the durable database/room identity. Only its
 * deterministic hash is exposed so a player can quote a short, stable number
 * without revealing the internal identifier.
 */
export function formatRegistryNumber(compactId: string) {
  const normalized = compactId.replace(/[^a-f0-9]/gi, "").toUpperCase().slice(0, 10).padEnd(10, "0");
  return `AEQ-${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8, 10)}`;
}

export async function registryNumberFor(identityKey: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`meteor-race:${identityKey}`));
  const compactId = Array.from(new Uint8Array(digest).slice(0, 5), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return formatRegistryNumber(compactId);
}
