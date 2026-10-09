import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

/** Supabase client scoped to the MCP caller: RLS applies as that user. */
export function sbForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function notAuthed() {
  return { content: [{ type: "text" as const, text: "Not authenticated" }], isError: true };
}

export function ok(payload: unknown, structured?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    structuredContent: structured ?? (payload as Record<string, unknown>),
  };
}

export function fail(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function chunk<T>(arr: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

/** Timezone del workspace (fallback: primer workspace accesible, luego UTC). */
export async function workspaceTz(sb: Sb, workspaceId?: string | null): Promise<string> {
  const q = sb.from("workspaces").select("timezone").limit(1);
  const { data } = workspaceId ? await q.eq("id", workspaceId) : await q;
  const row = Array.isArray(data) ? data[0] : null;
  const tz = (row as { timezone?: string | null } | null)?.timezone;
  return tz || "UTC";
}
