import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const MAGIC_TTL_MS = 30 * 60 * 1000; // 30 min
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export function generateToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export function cookieName(slug: string): string {
  const safe = slug.replace(/[^a-zA-Z0-9_-]/g, "");
  return `portal_session_${safe}`;
}

export function buildSessionCookie(slug: string, token: string, maxAgeSec: number): string {
  return [
    `${cookieName(slug)}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ].join("; ");
}

export function clearSessionCookie(slug: string): string {
  return `${cookieName(slug)}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function readSessionCookie(request: Request, slug: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  const name = cookieName(slug);
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

/**
 * Load the portal session for this request. Returns { formId, email } if the
 * session cookie is valid and the token matches an unexpired, unrevoked row
 * for this form's slug. Refreshes last_seen_at.
 */
export async function requirePortalSession(
  request: Request,
  slug: string,
): Promise<{ formId: string; email: string; role: "member" | "leader" } | null> {
  const raw = readSessionCookie(request, slug);
  if (!raw) return null;
  const hash = hashToken(raw);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: form } = await supabaseAdmin
    .from("client_ticket_forms")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!form) return null;
  const { data: row } = await supabaseAdmin
    .from("client_portal_tokens")
    .select("email, expires_at, revoked_at, form_id")
    .eq("token_hash", hash)
    .eq("kind", "session")
    .eq("form_id", form.id)
    .maybeSingle();
  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  // fire-and-forget: sliding renewal of expires_at + last_seen
  const newExpires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  void (async () => {
    const { error } = await supabaseAdmin
      .from("client_portal_tokens")
      .update({ last_seen_at: new Date().toISOString(), expires_at: newExpires })
      .eq("token_hash", hash);
    if (error) console.error("[portal] session renewal failed", error);
  })().catch((error: unknown) => {
    console.error("[portal] session renewal crashed", error);
  });
  const { data: authorized } = await supabaseAdmin
    .from("client_ticket_authorized_emails")
    .select("portal_role")
    .eq("form_id", form.id)
    .eq("email", row.email)
    .maybeSingle();
  const role =
    (authorized as { portal_role?: string } | null)?.portal_role === "leader"
      ? ("leader" as const)
      : ("member" as const);
  return { formId: form.id, email: row.email, role };
}
