import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function randomToken(len = 32) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const createGanttShareToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { projectId: string; expiresInDays?: number | null }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const token = randomToken(24);
    const expires_at =
      data.expiresInDays && data.expiresInDays > 0
        ? new Date(Date.now() + data.expiresInDays * 86400_000).toISOString()
        : null;
    const { data: row, error } = await supabase
      .from("project_share_tokens")
      .insert({
        project_id: data.projectId,
        token,
        scope: "gantt",
        created_by: userId,
        expires_at,
      })
      .select("id, token, expires_at, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listGanttShareTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { projectId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("project_share_tokens")
      .select("id, token, expires_at, revoked_at, created_at")
      .eq("project_id", data.projectId)
      .eq("scope", "gantt")
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const revokeGanttShareToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("project_share_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
