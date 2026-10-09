import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DeletedTaskRow = {
  id: string;
  task_id: string;
  title: string;
  project_id: string | null;
  project_name: string | null;
  deleted_at: string;
  deleted_by: string | null;
  deleted_by_name: string | null;
  restored_at: string | null;
  assignee_names: string[];
};

/**
 * Papelera: tareas eliminadas en los últimos N días del espacio de trabajo.
 * El acceso real lo controla la RLS de `deleted_tasks` (owner/admin del
 * workspace o super admin) — si el usuario no califica, recibe lista vacía.
 */
export const listDeletedTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        days: z.number().int().min(1).max(90).default(30),
        q: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<DeletedTaskRow[]> => {
    const { supabase } = context;
    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from("deleted_tasks")
      .select(
        "id, task_id, title, project_id, project_name, deleted_at, deleted_by, restored_at, assignee_ids",
      )
      .eq("workspace_id", data.workspaceId)
      .gte("deleted_at", since)
      .order("deleted_at", { ascending: false })
      .limit(500);

    if (data.q && data.q.trim()) {
      query = query.ilike("title", `%${data.q.trim()}%`);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{
      id: string;
      task_id: string;
      title: string;
      project_id: string | null;
      project_name: string | null;
      deleted_at: string;
      deleted_by: string | null;
      restored_at: string | null;
      assignee_ids: string[] | null;
    }>;
    if (list.length === 0) return [];

    const userIds = Array.from(
      new Set(
        list.flatMap((r) => [r.deleted_by, ...(r.assignee_ids ?? [])].filter(Boolean) as string[]),
      ),
    );
    const nameById = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      for (const p of (profiles ?? []) as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
      }>) {
        nameById.set(p.id, p.full_name || p.email || "—");
      }
    }

    return list.map((r) => ({
      id: r.id,
      task_id: r.task_id,
      title: r.title,
      project_id: r.project_id,
      project_name: r.project_name,
      deleted_at: r.deleted_at,
      deleted_by: r.deleted_by,
      deleted_by_name: r.deleted_by ? (nameById.get(r.deleted_by) ?? null) : null,
      restored_at: r.restored_at,
      assignee_names: (r.assignee_ids ?? []).map((id) => nameById.get(id) ?? "—"),
    }));
  });

export const restoreDeletedTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: taskId, error } = await supabase.rpc("restore_deleted_task", { p_id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true, taskId: taskId as unknown as string };
  });
