import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** List users that have explicit access to an account, plus the account's mode. */
export const getAccountAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ accountId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: acc, error: accErr } = await supabase
      .from("accounts")
      .select("id, name, workspace_id, access_mode")
      .eq("id", data.accountId)
      .maybeSingle();
    if (accErr) throw new Error(accErr.message);
    if (!acc) throw new Error("Cliente no encontrado");

    const { data: grants, error: gErr } = await supabase
      .from("account_access")
      .select("user_id, granted_at, granted_by")
      .eq("account_id", data.accountId);
    if (gErr) throw new Error(gErr.message);

    const userIds = Array.from(new Set((grants ?? []).map((g) => g.user_id)));
    let profiles: {
      id: string;
      full_name: string | null;
      email: string | null;
      avatar_url: string | null;
    }[] = [];
    if (userIds.length) {
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", userIds);
      if (pErr) throw new Error(pErr.message);
      profiles = profs ?? [];
    }
    const byId = new Map(profiles.map((p) => [p.id, p]));

    return {
      account: {
        id: acc.id,
        name: acc.name,
        workspace_id: acc.workspace_id,
        access_mode: (acc as { access_mode?: string }).access_mode ?? "open",
      },
      members: (grants ?? []).map((g) => ({
        user_id: g.user_id,
        granted_at: g.granted_at,
        granted_by: g.granted_by,
        profile: byId.get(g.user_id) ?? null,
      })),
    };
  });

export const setAccountAccessMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        accountId: z.string().uuid(),
        mode: z.enum(["open", "restricted"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("accounts")
      .update({ access_mode: data.mode } as never)
      .eq("id", data.accountId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const grantAccountAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        accountId: z.string().uuid(),
        userIds: z.array(z.string().uuid()).min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rows = data.userIds.map((uid) => ({
      account_id: data.accountId,
      user_id: uid,
      granted_by: userId,
    }));
    const { error } = await supabase
      .from("account_access")
      .upsert(rows, { onConflict: "account_id,user_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { ok: true, added: data.userIds.length };
  });

export const revokeAccountAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        accountId: z.string().uuid(),
        userId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("account_access")
      .delete()
      .eq("account_id", data.accountId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
