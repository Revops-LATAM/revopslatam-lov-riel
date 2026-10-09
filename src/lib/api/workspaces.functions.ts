import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugify } from "./_shared.server";

export const listWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("workspaces")
      .select("id, name, slug, color, kind, owner_id, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ name: z.string().min(1).max(60), color: z.string().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Riel es un app privada: sólo super_admin puede crear workspaces.
    const { data: isSuper, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isSuper) throw new Error("No autorizado: sólo super admin puede crear workspaces.");

    const base = slugify(data.name);
    let slug = base;
    let attempt = 0;
    while (attempt < 5) {
      const { data: ws, error } = await supabase
        .from("workspaces")
        .insert({ name: data.name, slug, color: data.color ?? "#8b5cf6", owner_id: userId })
        .select()
        .single();
      if (!error && ws) return ws;
      if (error && !error.message.toLowerCase().includes("duplicate")) {
        throw new Error(error.message);
      }
      attempt += 1;
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }
    throw new Error("No se pudo crear el workspace");
  });

export const getWorkspaceBySlug = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ slug: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: ws, error } = await supabase
      .from("workspaces")
      .select("id, name, slug, color, kind, owner_id, timezone, allocation_strategy")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ws) throw new Error("Workspace no encontrado");
    return ws;
  });

export const updateWorkspaceTimeConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        timezone: z.string().min(1).max(64).optional(),
        allocationStrategy: z.enum(["due_date", "spread", "fit_capacity"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: { timezone?: string; allocation_strategy?: "due_date" | "spread" | "fit_capacity" } = {};
    if (data.timezone) patch.timezone = data.timezone;
    if (data.allocationStrategy) patch.allocation_strategy = data.allocationStrategy;
    const { error } = await supabase.from("workspaces").update(patch).eq("id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// `ensureDefaultWorkspace` fue removido: Riel es una app privada por invitación.
// Los nuevos usuarios reciben acceso vía workspace_invitations + accept_pending_invitations trigger.


export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const searchWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), q: z.string().max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const raw = data.q.trim();
    if (!raw) return { accounts: [], projects: [], tasks: [], projectIds: [] };
    // Allow "#abcd1234" or bare "abcd1234" prefix references and full UUIDs.
    const idish = raw.replace(/^#/, "").trim().toLowerCase();
    const isHexRef = /^[0-9a-f-]{4,36}$/.test(idish);
    const isFullUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      idish,
    );

    // Build task query. For hex prefixes we use a UUID range (works on uuid columns),
    // for full UUIDs an exact match, otherwise a title search.
    const buildTaskBase = () =>
      supabase
        .from("tasks")
        .select("id, title, project_id, status, projects!inner(workspace_id)")
        .eq("projects.workspace_id", data.workspaceId);

    // Only treat as an ID lookup when the user explicitly prefixes with "#"
    // or types a full UUID. Otherwise search by title so common words that
    // happen to be all hex (cafe, beca, beef, ...) still match.
    const explicitIdLookup = raw.startsWith("#") || isFullUuid;

    let tasksQuery;
    if (isFullUuid) {
      tasksQuery = buildTaskBase().eq("id", idish).limit(12);
    } else if (explicitIdLookup && isHexRef) {
      const prefix = idish.replace(/-/g, "").slice(0, 8);
      const padLo = prefix.padEnd(8, "0");
      const padHi = prefix.padEnd(8, "f");
      const lo = `${padLo}-0000-0000-0000-000000000000`;
      const hi = `${padHi}-ffff-ffff-ffff-ffffffffffff`;
      tasksQuery = buildTaskBase().gte("id", lo).lte("id", hi).limit(12);
    } else {
      tasksQuery = buildTaskBase()
        .not("status", "in", "(done,cancelled)")
        .ilike("title", `%${raw}%`)
        .limit(12);
    }

    const [accountsRes, projectsRes, tasksRes] = await Promise.all([
      supabase
        .from("accounts")
        .select("id, name")
        .eq("workspace_id", data.workspaceId)
        .ilike("name", `%${raw}%`)
        .limit(8),
      supabase
        .from("projects")
        .select("id, name, color")
        .eq("workspace_id", data.workspaceId)
        .ilike("name", `%${raw}%`)
        .limit(8),
      tasksQuery,
    ]);
    const accounts = accountsRes.data ?? [];
    const projects = projectsRes.data ?? [];
    const tasks = (tasksRes.data ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      project_id: t.project_id,
      status: t.status,
    }));
    return { accounts, projects, tasks, projectIds: projects.map((p) => p.id) };
  });
