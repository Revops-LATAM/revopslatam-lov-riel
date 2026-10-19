import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type SB = SupabaseClient<Database>;

async function assertSuperAdmin(supabase: SB, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "super_admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: requires super_admin role");
}

export type AdminUserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string | null;
  workspace_count: number;
  is_super_admin: boolean;
  is_admin: boolean;
};

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    await assertSuperAdmin(context.supabase as SB, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [profilesRes, membersRes, rolesRes] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, email, full_name, avatar_url, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("workspace_members").select("user_id"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);
    if (profilesRes.error) throw new Error(profilesRes.error.message);

    const wsCount = new Map<string, number>();
    for (const m of membersRes.data ?? []) {
      wsCount.set(m.user_id, (wsCount.get(m.user_id) ?? 0) + 1);
    }
    const rolesByUser = new Map<string, Set<string>>();
    for (const r of rolesRes.data ?? []) {
      const set = rolesByUser.get(r.user_id) ?? new Set<string>();
      set.add(r.role as string);
      rolesByUser.set(r.user_id, set);
    }

    return (profilesRes.data ?? []).map((p) => ({
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      avatar_url: p.avatar_url,
      created_at: p.created_at,
      workspace_count: wsCount.get(p.id) ?? 0,
      is_super_admin: rolesByUser.get(p.id)?.has("super_admin") ?? false,
      is_admin: rolesByUser.get(p.id)?.has("admin") ?? false,
    }));
  });

export type AdminWorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  color: string | null;
  owner_id: string | null;
  owner_email: string | null;
  owner_name: string | null;
  member_count: number;
  created_at: string | null;
};

export const listAllWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminWorkspaceRow[]> => {
    await assertSuperAdmin(context.supabase as SB, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [wsRes, membersRes, profilesRes] = await Promise.all([
      supabaseAdmin
        .from("workspaces")
        .select("id, name, slug, kind, color, owner_id, created_at")
        .order("created_at", { ascending: true }),
      supabaseAdmin.from("workspace_members").select("workspace_id"),
      supabaseAdmin.from("profiles").select("id, email, full_name"),
    ]);
    if (wsRes.error) throw new Error(wsRes.error.message);

    const counts = new Map<string, number>();
    for (const m of membersRes.data ?? []) {
      counts.set(m.workspace_id, (counts.get(m.workspace_id) ?? 0) + 1);
    }
    const profById = new Map((profilesRes.data ?? []).map((p) => [p.id, p] as const));

    return (wsRes.data ?? []).map((w) => {
      const owner = w.owner_id ? profById.get(w.owner_id) : null;
      return {
        id: w.id,
        name: w.name,
        slug: w.slug,
        kind: String(w.kind),
        color: w.color,
        owner_id: w.owner_id,
        owner_email: owner?.email ?? null,
        owner_name: owner?.full_name ?? null,
        member_count: counts.get(w.id) ?? 0,
        created_at: w.created_at,
      };
    });
  });

export const grantAppRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["admin", "super_admin"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase as SB, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revokeAppRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["admin", "super_admin"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase as SB, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.role === "super_admin") {
      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "super_admin");
      if ((count ?? 0) <= 1) {
        throw new Error("No se puede quitar el último super admin");
      }
    }
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", data.role);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const renameWorkspaceAsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        name: z.string().min(1).max(60),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase as SB, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("workspaces")
      .update({ name: data.name })
      .eq("id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type SystemConfig = {
  secret_names: string[];
  currency_rates: Array<{
    currency: string;
    base_currency: string;
    rate_to_base: number;
    rate_date: string | null;
  }>;
  recent_email_logs: Array<{
    recipient_email: string;
    template_name: string | null;
    status: string;
    created_at: string | null;
  }>;
};

export const getSystemConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SystemConfig> => {
    await assertSuperAdmin(context.supabase as SB, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [ratesRes, logsRes] = await Promise.all([
      supabaseAdmin
        .from("currency_rates")
        .select("currency, base_currency, rate_to_base, rate_date")
        .order("rate_date", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("email_send_log")
        .select("recipient_email, template_name, status, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    // Sólo reportamos el estado (presente/ausente) de un allowlist de secretos
    // conocidos por la app. NUNCA enumeramos process.env completo: eso podría
    // filtrar nombres de variables internas del runtime o de otras integraciones.
    const EXPECTED_SECRETS = [
      "SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "RESEND_API_KEY",
      "RESEND_WEBHOOK_SECRET",
      "EMAIL_FROM_DOMAIN",
      "LOVABLE_API_KEY",
      "OPENFACTURA_API_KEY",
      "OPENFACTURA_BASE_URL",
      "GOOGLE_CALENDAR_CLIENT_ID",
      "GOOGLE_CALENDAR_CLIENT_SECRET",
      "ASANA_CLIENT_ID",
      "ASANA_CLIENT_SECRET",
      "CRON_SECRET",
    ] as const;
    const secretNames = EXPECTED_SECRETS.filter((k) => !!process.env[k]).sort();

    return {
      secret_names: secretNames,
      currency_rates: (ratesRes.data ?? []).map((r) => ({
        currency: r.currency as string,
        base_currency: r.base_currency as string,
        rate_to_base: Number(r.rate_to_base),
        rate_date: (r.rate_date as string | null) ?? null,
      })),
      recent_email_logs: (logsRes.data ?? []).map((l) => ({
        recipient_email: l.recipient_email as string,
        template_name: (l.template_name as string | null) ?? null,
        status: l.status as string,
        created_at: (l.created_at as string | null) ?? null,
      })),
    };
  });
