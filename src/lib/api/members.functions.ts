import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { workspaceRoleSchema } from "./_shared.server";

async function assertAdminMembers(supabase: any, userId: string, workspaceId: string) {
  const { data, error } = await supabase.rpc("has_permission", {
    _workspace_id: workspaceId,
    _user_id: userId,
    _perm: "admin_members",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No tienes permiso para gestionar miembros.");
}

async function assertAdminMembersByMember(supabase: any, userId: string, memberId: string) {
  const { data: row, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("id", memberId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Miembro no encontrado.");
  await assertAdminMembers(supabase, userId, row.workspace_id);
}

async function assertAdminMembersByInvitation(supabase: any, userId: string, invitationId: string) {
  const { data: row, error } = await supabase
    .from("workspace_invitations")
    .select("workspace_id")
    .eq("id", invitationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Invitación no encontrada.");
  await assertAdminMembers(supabase, userId, row.workspace_id);
}

export const listWorkspaceMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: members, error } = await supabase
      .from("workspace_members")
      .select("id, user_id, role, role_template_id, extra_permissions, created_at")
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    const ids = (members ?? []).map((m) => m.user_id);
    if (ids.length === 0) return [];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .in("id", ids);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    return (members ?? []).map((m) => ({ ...m, profile: byId.get(m.user_id) ?? null }));
  });

export const listWorkspaceInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: invites, error } = await supabase
      .from("workspace_invitations")
      .select("id, email, role, role_template_id, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return invites ?? [];
  });

export const inviteWorkspaceMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        email: z.string().email().max(200),
        role: workspaceRoleSchema.default("member"),
        roleTemplateId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdminMembers(supabase, userId, data.workspaceId);
    const email = data.email.toLowerCase();
    // Use admin to bypass profiles RLS (which hides users outside the caller's workspaces).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase.from("workspace_members").insert({
        workspace_id: data.workspaceId,
        user_id: existing.id,
        role: data.role,
        role_template_id: data.roleTemplateId ?? null,
      });
      if (error && !error.message.toLowerCase().includes("duplicate")) {
        throw new Error(error.message);
      }
      return { added: true };
    }
    // Insert invitation row first (handle_new_user requires it to exist).
    const { error: invErr } = await supabase.from("workspace_invitations").insert({
      workspace_id: data.workspaceId,
      email,
      role: data.role,
      role_template_id: data.roleTemplateId ?? null,
      invited_by: userId,
    });
    if (invErr && !invErr.message.toLowerCase().includes("duplicate")) {
      throw new Error(invErr.message);
    }
    // Materialize the auth user immediately so they're assignable before first login.
    const { error: authErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
    if (authErr && !/already.*registered|exists/i.test(authErr.message)) {
      throw new Error(authErr.message);
    }
    return { invited: true };
  });

export const materializePendingInvitations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdminMembers(supabase, userId, data.workspaceId);
    const { data: invs, error } = await supabase
      .from("workspace_invitations")
      .select("id, email, role, role_template_id")
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let created = 0;
    let linked = 0;
    const errors: string[] = [];
    for (const inv of invs ?? []) {
      const email = (inv.email as string).toLowerCase();
      // If a profile already exists, link them directly and drop the invitation.
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (prof) {
        await supabase.from("workspace_members").insert({
          workspace_id: data.workspaceId,
          user_id: prof.id,
          role: inv.role ?? "member",
          role_template_id: inv.role_template_id ?? null,
        });
        await supabase.from("workspace_invitations").delete().eq("id", inv.id);
        linked++;
        continue;
      }
      const { error: aerr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
      if (aerr) {
        if (/already.*registered|exists/i.test(aerr.message)) {
          linked++;
        } else {
          errors.push(`${email}: ${aerr.message}`);
        }
        continue;
      }
      created++;
    }
    return { created, linked, errors };
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        memberId: z.string().uuid(),
        role: workspaceRoleSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdminMembersByMember(supabase, userId, data.memberId);
    const { error } = await supabase
      .from("workspace_members")
      .update({ role: data.role })
      .eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ memberId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdminMembersByMember(supabase, userId, data.memberId);
    const { error } = await supabase.from("workspace_members").delete().eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ invitationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdminMembersByInvitation(supabase, userId, data.invitationId);
    const { error } = await supabase
      .from("workspace_invitations")
      .delete()
      .eq("id", data.invitationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
