// Verificación de firmas de webhooks de Resend (formato Svix).
// Firma = base64(HMAC-SHA256(secreto, `${svix-id}.${svix-timestamp}.${cuerpo}`)).

const TOLERANCE_SECONDS = 5 * 60;

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifySvixSignature(args: {
  secret: string; // "whsec_<base64>"
  id: string | null;
  timestamp: string | null;
  signatureHeader: string | null; // "v1,<sig> v1,<sig2>"
  body: string;
  nowSeconds?: number;
}): Promise<boolean> {
  const { secret, id, timestamp, signatureHeader, body } = args;
  if (!id || !timestamp || !signatureHeader) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(secret.startsWith("whsec_") ? secret.slice(6) : secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = bytesToBase64(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)),
    ),
  );
  return signatureHeader
    .split(" ")
    .map((p) => p.split(",")[1] ?? "")
    .some((sig) => timingSafeEqual(sig, expected));
}
