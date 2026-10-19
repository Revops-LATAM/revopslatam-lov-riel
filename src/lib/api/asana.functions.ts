import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ASANA_API = "https://app.asana.com/api/1.0";

function pat() {
  const t = process.env.ASANA_PAT;
  if (!t) throw new Error("ASANA_PAT no configurado");
  return t;
}

async function asanaGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${ASANA_API}${path}`, {
    headers: { Authorization: `Bearer ${pat()}` },
  });
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (!res.ok) {
    const msg = json.errors?.[0]?.message ?? `Asana ${res.status}`;
    throw new Error(`Asana: ${msg}`);
  }
  return json.data as T;
}

export const listAsanaWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return await asanaGet<{ gid: string; name: string }[]>("/workspaces?opt_fields=name");
  });

export const listAsanaProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ workspaceGid: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const rows = await asanaGet<{ gid: string; name: string; archived?: boolean }[]>(
      `/projects?workspace=${encodeURIComponent(data.workspaceGid)}&archived=false&limit=100&opt_fields=name,archived`,
    );
    return rows.filter((p) => !p.archived);
  });

export const syncAsanaProjectTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ projectId: z.string().uuid(), force: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { syncProjectFromAsana } = await import("./asana.server");
    return await syncProjectFromAsana(context.supabase, data.projectId, {
      createdBy: context.userId,
      force: data.force ?? false,
    });
  });

// ---------- Discovery endpoints for config UI ----------
export const listAsanaSections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ projectGid: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    return await asanaGet<{ gid: string; name: string }[]>(
      `/projects/${encodeURIComponent(data.projectGid)}/sections?opt_fields=gid,name`,
    );
  });

export const listAsanaCustomFields = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ projectGid: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    type CF = {
      gid: string;
      name: string;
      type: string;
      enum_options?: { gid: string; name: string }[];
    };
    const rows = await asanaGet<{ custom_field: CF }[]>(
      `/projects/${encodeURIComponent(data.projectGid)}/custom_field_settings?opt_fields=custom_field.gid,custom_field.name,custom_field.type,custom_field.enum_options.gid,custom_field.enum_options.name`,
    );
    return rows.map((r) => r.custom_field).filter((f) => f.type === "enum");
  });

export const listAsanaProjectUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ workspaceGid: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    return await asanaGet<{ gid: string; name: string; email?: string }[]>(
      `/workspaces/${encodeURIComponent(data.workspaceGid)}/users?opt_fields=gid,name,email&limit=100`,
    );
  });

// ---------- Config CRUD ----------
export const getAsanaProjectConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: project } = await context.supabase
      .from("projects")
      .select("workspace_id, asana_project_gid")
      .eq("id", data.projectId)
      .maybeSingle();
    const p = project as { workspace_id: string; asana_project_gid: string | null } | null;
    if (!p) throw new Error("Proyecto no encontrado");

    const { data: cfg } = await context.supabase
      .from("asana_project_sync_config")
      .select("*")
      .eq("project_id", data.projectId)
      .maybeSingle();

    const { data: statusMap } = await context.supabase
      .from("asana_status_map")
      .select("status_id, asana_value, asana_value_label, kind")
      .eq("workspace_id", p.workspace_id)
      .eq("asana_project_gid", p.asana_project_gid ?? "");

    const { data: userMap } = await context.supabase
      .from("asana_user_map")
      .select("user_id, asana_user_gid, asana_user_name, asana_user_email")
      .eq("workspace_id", p.workspace_id);

    const { data: webhook } = await context.supabase
      .from("asana_webhook_subscriptions")
      .select("id, active, asana_webhook_gid, last_event_at")
      .eq("project_id", data.projectId)
      .maybeSingle();

    return {
      project: p,
      config: cfg,
      statusMap: statusMap ?? [],
      userMap: userMap ?? [],
      webhook,
    };
  });

export const saveAsanaProjectConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        statusMode: z.enum(["completed_only", "sections", "custom_field"]),
        asanaStatusFieldGid: z.string().nullable().optional(),
        pushEnabled: z.boolean().optional(),
        pullEnabled: z.boolean().optional(),
        commentsEnabled: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: project } = await context.supabase
      .from("projects")
      .select("workspace_id")
      .eq("id", data.projectId)
      .maybeSingle();
    const p = project as { workspace_id: string } | null;
    if (!p) throw new Error("Proyecto no encontrado");

    const { error } = await context.supabase.from("asana_project_sync_config").upsert(
      {
        project_id: data.projectId,
        workspace_id: p.workspace_id,
        status_mode: data.statusMode,
        asana_status_field_gid: data.asanaStatusFieldGid ?? null,
        push_enabled: data.pushEnabled ?? true,
        pull_enabled: data.pullEnabled ?? true,
        comments_enabled: data.commentsEnabled ?? true,
      } as never,
      { onConflict: "project_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveAsanaStatusMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        mappings: z.array(
          z.object({
            statusId: z.string().uuid(),
            asanaValue: z.string().min(1),
            asanaLabel: z.string().optional(),
            kind: z.enum(["section", "custom_field_enum", "completed_only"]),
          }),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: project } = await context.supabase
      .from("projects")
      .select("workspace_id, asana_project_gid")
      .eq("id", data.projectId)
      .maybeSingle();
    const p = project as { workspace_id: string; asana_project_gid: string | null } | null;
    if (!p?.asana_project_gid) throw new Error("Proyecto sin Asana vinculado");

    // Replace all mappings
    await context.supabase
      .from("asana_status_map")
      .delete()
      .eq("workspace_id", p.workspace_id)
      .eq("asana_project_gid", p.asana_project_gid);

    if (data.mappings.length > 0) {
      // Dedupe by asana_value (unique constraint); last mapping wins
      const byValue = new Map<string, (typeof data.mappings)[number]>();
      for (const m of data.mappings) byValue.set(m.asanaValue, m);
      const rows = Array.from(byValue.values()).map((m) => ({
        workspace_id: p.workspace_id,
        asana_project_gid: p.asana_project_gid!,
        asana_value: m.asanaValue,
        asana_value_label: m.asanaLabel ?? null,
        status_id: m.statusId,
        kind: m.kind,
      }));
      const { error } = await context.supabase.from("asana_status_map").insert(rows as never);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const saveAsanaUserMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        mappings: z.array(
          z.object({
            userId: z.string().uuid(),
            asanaUserGid: z.string().min(1),
            asanaUserName: z.string().optional(),
            asanaUserEmail: z.string().optional(),
          }),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    for (const m of data.mappings) {
      await context.supabase.from("asana_user_map").upsert(
        {
          workspace_id: data.workspaceId,
          user_id: m.userId,
          asana_user_gid: m.asanaUserGid,
          asana_user_name: m.asanaUserName ?? null,
          asana_user_email: m.asanaUserEmail ?? null,
        } as never,
        { onConflict: "workspace_id,user_id" },
      );
    }
    return { ok: true };
  });

// ---------- Webhook lifecycle ----------
export const subscribeAsanaWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: project } = await context.supabase
      .from("projects")
      .select("workspace_id, asana_project_gid")
      .eq("id", data.projectId)
      .maybeSingle();
    const p = project as { workspace_id: string; asana_project_gid: string | null } | null;
    if (!p?.asana_project_gid) throw new Error("Proyecto sin Asana vinculado");

    const baseUrl = process.env.PUBLIC_BASE_URL ?? process.env.PUBLIC_APP_URL;
    if (!baseUrl) throw new Error("Configura PUBLIC_APP_URL para registrar el webhook de Asana");
    const target = `${baseUrl}/api/public/webhooks/asana?project=${data.projectId}`;

    // Create webhook (Asana responds with handshake X-Hook-Secret in initial POST)
    const res = await fetch(`${ASANA_API}/webhooks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pat()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: { resource: p.asana_project_gid, target },
      }),
    });
    const json = (await res.json()) as { data?: { gid: string }; errors?: { message: string }[] };
    if (!res.ok) {
      throw new Error(`Asana webhook: ${json.errors?.[0]?.message ?? res.status}`);
    }

    // Row already created during handshake with secret. Update with returned gid.
    await context.supabase
      .from("asana_webhook_subscriptions")
      .update({ asana_webhook_gid: json.data?.gid, active: true } as never)
      .eq("project_id", data.projectId);

    return { ok: true, gid: json.data?.gid };
  });

export const unsubscribeAsanaWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("asana_webhook_subscriptions")
      .select("asana_webhook_gid")
      .eq("project_id", data.projectId)
      .maybeSingle();
    const gid = (row as { asana_webhook_gid?: string } | null)?.asana_webhook_gid;
    if (gid) {
      await fetch(`${ASANA_API}/webhooks/${gid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${pat()}` },
      });
    }
    await context.supabase
      .from("asana_webhook_subscriptions")
      .delete()
      .eq("project_id", data.projectId);
    return { ok: true };
  });
