import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const ALL_PERMISSIONS = [
  "ops_view",
  "ops_manage",
  "workload_view",
  "reports_view",
  "finance_view",
  "finance_manage",
  "marketing_view",
  "marketing_manage",
  "internal_view",
  "internal_manage",
  "admin_members",
  "admin_roles",
  "admin_settings",
  "admin_capacity",
] as const;

export type WorkspacePermission = (typeof ALL_PERMISSIONS)[number];

const permissionSchema = z.enum(ALL_PERMISSIONS);

async function assertCallerHasPerm(
  context: { supabase: any; userId: string },
  workspaceId: string,
  perm: WorkspacePermission,
) {
  const { data, error } = await context.supabase.rpc("has_permission", {
    _workspace_id: workspaceId,
    _user_id: context.userId,
    _perm: perm,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No tienes permiso para esta acción.");
}

// Permisos que otorgan control sensible (roles, settings, finanzas): asignarlos
// a un miembro debe requerir admin_roles, no solo admin_members — de lo
// contrario un manager de miembros podría auto-escalarse.
const SENSITIVE_PERMISSIONS: readonly WorkspacePermission[] = [
  "admin_roles",
  "admin_settings",
  "admin_members",
  "admin_capacity",
  "finance_manage",
  "finance_view",
] as const;

function containsSensitive(perms: readonly WorkspacePermission[] | null | undefined) {
  if (!perms || perms.length === 0) return false;
  const set = new Set(perms);
  return SENSITIVE_PERMISSIONS.some((p) => set.has(p));
}

export const listMyPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: perms, error } = await supabase.rpc("list_my_permissions", {
      _workspace_id: data.workspaceId,
    });
    if (error) throw new Error(error.message);
    return (perms ?? []) as WorkspacePermission[];
  });

export const listRoleTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("role_templates")
      .select("id, name, description, permissions, is_system, created_at, updated_at")
      .eq("workspace_id", data.workspaceId)
      .order("is_system", { ascending: false })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createRoleTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        name: z.string().min(1).max(80),
        description: z.string().max(300).optional(),
        permissions: z.array(permissionSchema).max(ALL_PERMISSIONS.length),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCallerHasPerm(context, data.workspaceId, "admin_roles");
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("role_templates")
      .insert({
        workspace_id: data.workspaceId,
        name: data.name,
        description: data.description ?? null,
        permissions: data.permissions,
        is_system: false,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateRoleTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        templateId: z.string().uuid(),
        workspaceId: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        description: z.string().max(300).nullable().optional(),
        permissions: z.array(permissionSchema).max(ALL_PERMISSIONS.length).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCallerHasPerm(context, data.workspaceId, "admin_roles");
    const { supabase } = context;
    const patch: {
      name?: string;
      description?: string | null;
      permissions?: WorkspacePermission[];
    } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.permissions !== undefined) patch.permissions = data.permissions;
    const { error } = await supabase
      .from("role_templates")
      .update(patch)
      .eq("id", data.templateId)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteRoleTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ templateId: z.string().uuid(), workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCallerHasPerm(context, data.workspaceId, "admin_roles");
    const { supabase } = context;
    // Refuse to delete system templates
    const { data: row, error: getErr } = await supabase
      .from("role_templates")
      .select("is_system")
      .eq("id", data.templateId)
      .single();
    if (getErr) throw new Error(getErr.message);
    if (row?.is_system) throw new Error("No se pueden eliminar plantillas del sistema.");
    const { error } = await supabase
      .from("role_templates")
      .delete()
      .eq("id", data.templateId)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignRoleTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        memberId: z.string().uuid(),
        templateId: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCallerHasPerm(context, data.workspaceId, "admin_members");
    const { supabase } = context;

    // Si el template asignado contiene permisos sensibles (admin_*, finance_*),
    // exigir también admin_roles: evita que un manager de miembros escale
    // privilegios asignándose un template de admin.
    if (data.templateId) {
      const { data: tpl, error: tplErr } = await supabase
        .from("role_templates")
        .select("permissions")
        .eq("id", data.templateId)
        .eq("workspace_id", data.workspaceId)
        .maybeSingle();
      if (tplErr) throw new Error(tplErr.message);
      if (!tpl) throw new Error("Plantilla de rol no encontrada.");
      if (containsSensitive((tpl.permissions ?? []) as WorkspacePermission[])) {
        await assertCallerHasPerm(context, data.workspaceId, "admin_roles");
      }
    }

    const { error } = await supabase
      .from("workspace_members")
      .update({ role_template_id: data.templateId })
      .eq("id", data.memberId)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setMemberExtraPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        memberId: z.string().uuid(),
        extras: z.array(permissionSchema).max(ALL_PERMISSIONS.length),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCallerHasPerm(context, data.workspaceId, "admin_members");
    // Otorgar extras sensibles requiere admin_roles: previene auto-escalación
    // desde un rol "gestor de miembros".
    if (containsSensitive(data.extras)) {
      await assertCallerHasPerm(context, data.workspaceId, "admin_roles");
    }
    const { supabase } = context;
    const { error } = await supabase
      .from("workspace_members")
      .update({ extra_permissions: data.extras })
      .eq("id", data.memberId)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMembersWithRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("workspace_members")
      .select("id, user_id, role, role_template_id, extra_permissions")
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r) => r.user_id);
    if (ids.length === 0) return [];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url")
      .in("id", ids);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    return (rows ?? []).map((r) => ({
      ...r,
      profile: byId.get(r.user_id) ?? null,
    }));
  });
