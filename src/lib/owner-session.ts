const OWNER_SESSION_TTL_SECONDS = 12 * 60 * 60;
export const OWNER_SESSION_COOKIE = "sahahly-owner-session";

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;

  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

async function getSigningKey(): Promise<CryptoKey | null> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret || secret.length < 32) return null;

  return globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createOwnerSessionToken(
  userId: string,
  requestedTtlSeconds = OWNER_SESSION_TTL_SECONDS
): Promise<string | null> {
  const key = await getSigningKey();
  if (!key || !userId) return null;

  const safeTtlSeconds = Number.isFinite(requestedTtlSeconds)
    ? Math.min(OWNER_SESSION_TTL_SECONDS, Math.max(300, Math.floor(requestedTtlSeconds)))
    : OWNER_SESSION_TTL_SECONDS;
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = encodeBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        sub: userId,
        iat: issuedAt,
        exp: issuedAt + safeTtlSeconds,
        ttl: safeTtlSeconds,
      })
    )
  );
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );

  return `${payload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function refreshOwnerSessionToken(
  token: string | undefined,
  userId: string
): Promise<string | null> {
  if (!token || token.length > 1024 || !userId) return null;

  const [payload, encodedSignature, extraPart] = token.split(".");
  if (!payload || !encodedSignature || extraPart) return null;

  const signature = decodeBase64Url(encodedSignature);
  const key = await getSigningKey();
  if (!signature || !key) return null;

  const isSignatureValid = await globalThis.crypto.subtle.verify(
    "HMAC",
    key,
    toArrayBuffer(signature),
    new TextEncoder().encode(payload)
  );
  if (!isSignatureValid) return null;

  const payloadBytes = decodeBase64Url(payload);
  if (!payloadBytes) return null;

  try {
    const claims = JSON.parse(new TextDecoder().decode(payloadBytes)) as {
      sub?: unknown;
      iat?: unknown;
      exp?: unknown;
      ttl?: unknown;
    };
    const currentTime = Math.floor(Date.now() / 1000);
    const validClaims = claims.sub === userId
      && typeof claims.iat === "number"
      && Number.isInteger(claims.iat)
      && typeof claims.exp === "number"
      && Number.isInteger(claims.exp)
      && typeof claims.ttl === "number"
      && Number.isInteger(claims.ttl)
      && claims.ttl >= 300
      && claims.ttl <= OWNER_SESSION_TTL_SECONDS
      && claims.iat <= currentTime
      && claims.exp === claims.iat + claims.ttl
      && claims.exp > currentTime;

    if (!validClaims || typeof claims.ttl !== "number") return null;
    return createOwnerSessionToken(userId, claims.ttl);
  } catch {
    return null;
  }
}
