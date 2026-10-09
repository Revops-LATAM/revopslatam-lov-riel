import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        full_name: z.string().min(1).max(120).optional(),
        avatar_url: z.string().url().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: { full_name?: string; avatar_url?: string | null } = {};
    if (data.full_name !== undefined) patch.full_name = data.full_name;
    if (data.avatar_url !== undefined) patch.avatar_url = data.avatar_url;
    const { data: row, error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", userId)
      .select("id, email, full_name, avatar_url, preferences")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export type UserPreferences = {
  theme?: "light" | "dark" | "system";
  language?: string;
  notifications?: {
    email_mentions?: boolean;
    email_assignments?: boolean;
    email_ticket_updates?: boolean;
  };
};

export const getMyPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserPreferences> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("preferences")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data?.preferences ?? {}) as UserPreferences;
  });

export const updateMyPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        theme: z.enum(["light", "dark", "system"]).optional(),
        language: z.string().min(2).max(8).optional(),
        notifications: z
          .object({
            email_mentions: z.boolean().optional(),
            email_assignments: z.boolean().optional(),
            email_ticket_updates: z.boolean().optional(),
          })
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<UserPreferences> => {
    const { supabase, userId } = context;
    const { data: current } = await supabase
      .from("profiles")
      .select("preferences")
      .eq("id", userId)
      .maybeSingle();
    const merged: UserPreferences = {
      ...((current?.preferences as UserPreferences | null) ?? {}),
      ...data,
    };
    const { error } = await supabase
      .from("profiles")
      .update({ preferences: merged })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return merged;
  });

export const amISuperAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin",
    });
    if (error) throw new Error(error.message);
    return { isSuperAdmin: Boolean(data) };
  });

/**
 * Acceso al módulo de Reportes: restringido a super_admin y al gerente de
 * operaciones (victor@revopslatam.com). Los operadores no acceden.
 */
export const canViewReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    const email = String((claims as { email?: string } | null)?.email ?? "").toLowerCase();
    if (email === "victor@revopslatam.com") return { allowed: true };
    const { data, error } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin",
    });
    if (error) throw new Error(error.message);
    return { allowed: Boolean(data) };
  });
