import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const currencyEnum = z.enum(["USD", "CLP", "UF"]);

export const listMemberCostRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("member_cost_rates")
      .select("id, workspace_id, user_id, costo_hora, currency, effective_from, created_at, updated_at")
      .eq("workspace_id", data.workspaceId)
      .order("effective_from", { ascending: false });
    if (error) throw new Error(error.message);
    const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    let profilesById = new Map<string, { id: string; full_name: string | null; email: string | null; avatar_url: string | null }>();
    if (userIds.length > 0) {
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", userIds);
      profilesById = new Map((profiles ?? []).map((p) => [p.id, p]));
    }
    return (rows ?? []).map((r) => ({ ...r, profiles: profilesById.get(r.user_id) ?? null }));
  });

export const upsertMemberCostRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        userId: z.string().uuid(),
        costoHora: z.number().min(0),
        currency: currencyEnum.default("CLP"),
        effectiveFrom: z.string(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("member_cost_rates").upsert(
      {
        workspace_id: data.workspaceId,
        user_id: data.userId,
        costo_hora: data.costoHora,
        currency: data.currency,
        effective_from: data.effectiveFrom,
      },
      { onConflict: "workspace_id,user_id,effective_from" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMemberCostRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ rateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("member_cost_rates")
      .delete()
      .eq("id", data.rateId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getCurrentMemberCostRate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: row, error } = await context.supabase
      .from("member_cost_rates")
      .select("id, costo_hora, currency, effective_from")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", data.userId)
      .lte("effective_from", today)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });
