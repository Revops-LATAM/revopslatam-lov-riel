import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * getProjectBundle
 *
 * Single RPC that returns everything the project detail route needs for
 * first paint. Consolidates 6 individual server functions into one
 * network round-trip. Query shapes mirror the source functions exactly
 * so the loader can hydrate each `queryOptions` cache with `setQueryData`
 * and components keep using the same `useSuspenseQuery` calls.
 */
export const getProjectBundle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        workspaceId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { projectId, workspaceId } = data;

    const [projectRes, tasksRes, membersRes, phasesRes, taskTypesRes, taskStatusesRes] =
      await Promise.all([
        supabase
          .from("projects")
          .select(
            "id, name, description, color, icon, workspace_id, archived, contract_id, first_sprint_start_date, lead_id, delivery_type, margen_objetivo_pct, fecha_inicio_delivery, fecha_entrega_objetivo, state, asana_project_gid, contract:contract_id(type, sprint_cadence, hours_per_sprint, start_date, end_date)",
          )
          .eq("id", projectId)
          .maybeSingle(),
        supabase
          .from("tasks")
          .select(
            "id, title, description, status, priority, assignee_id, due_date, start_date, position, created_at, completed_at, parent_task_id, sprint_id, contract_id, phase_id, total_effort_hours, task_type_id, status_id, sla_target_response_at, sla_target_resolution_at, request_type, severity, task_statuses(id, key, name, category, color), assignees:task_assignees(user_id)",
          )
          .eq("project_id", projectId)
          .order("position", { ascending: true })
          .order("created_at", { ascending: false }),
        supabase
          .from("workspace_members")
          .select("id, user_id, role, role_template_id, extra_permissions, created_at")
          .eq("workspace_id", workspaceId),
        supabase
          .from("phases")
          .select("*")
          .eq("project_id", projectId)
          .order("order_index", { ascending: true }),
        supabase
          .from("task_types")
          .select("id, workspace_id, key, name, icon, color, is_system, sort_order")
          .eq("workspace_id", workspaceId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("task_statuses")
          .select(
            "id, workspace_id, task_type_id, key, name, color, category, is_system, is_default, sort_order",
          )
          .eq("workspace_id", workspaceId)
          .order("sort_order", { ascending: true }),
      ]);

    if (projectRes.error) throw new Error(projectRes.error.message);
    if (!projectRes.data) throw new Error("Proyecto no encontrado");
    if (tasksRes.error) throw new Error(tasksRes.error.message);
    if (membersRes.error) throw new Error(membersRes.error.message);
    if (phasesRes.error) throw new Error(phasesRes.error.message);
    if (taskTypesRes.error) throw new Error(taskTypesRes.error.message);
    if (taskStatusesRes.error) throw new Error(taskStatusesRes.error.message);

    // Merge profiles into members (same shape as listWorkspaceMembers).
    const memberRows = membersRes.data ?? [];
    let members: Array<
      (typeof memberRows)[number] & {
        profile: {
          id: string;
          full_name: string | null;
          email: string | null;
          avatar_url: string | null;
        } | null;
      }
    > = [];
    if (memberRows.length > 0) {
      const ids = memberRows.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", ids);
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      members = memberRows.map((m) => ({ ...m, profile: byId.get(m.user_id) ?? null }));
    }

    return {
      project: projectRes.data,
      tasks: tasksRes.data ?? [],
      members,
      phases: phasesRes.data ?? [],
      taskTypes: taskTypesRes.data ?? [],
      taskStatuses: taskStatusesRes.data ?? [],
    };
  });
