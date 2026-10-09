import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/report/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = params.token;
        if (!token || token.length < 8) return new Response("Invalid token", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: tokenRow, error: tErr } = await supabaseAdmin
          .from("project_share_tokens")
          .select("project_id, expires_at, revoked_at, scope, config")
          .eq("token", token)
          .maybeSingle();
        if (tErr) return new Response(tErr.message, { status: 500 });
        if (!tokenRow || tokenRow.scope !== "report") {
          return new Response("Not found", { status: 404 });
        }
        if (tokenRow.revoked_at) return new Response("Revoked", { status: 410 });
        if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
          return new Response("Expired", { status: 410 });
        }

        const projectId = tokenRow.project_id;
        const cfg = (tokenRow.config ?? {}) as {
          sprintIds?: string[];
          includeBacklog?: boolean;
        };
        const wanted = Array.isArray(cfg.sprintIds) ? cfg.sprintIds : [];
        const includeBacklog = cfg.includeBacklog === true;

        const { data: project, error: pErr } = await supabaseAdmin
          .from("projects")
          .select("id, name, client_name, hours_per_sprint, contract_id")
          .eq("id", projectId)
          .maybeSingle();
        if (pErr) return new Response(pErr.message, { status: 500 });
        if (!project) return new Response("Not found", { status: 404 });

        // Nombre de cliente: projects.client_name, o el de la cuenta del contrato.
        let clientName = project.client_name ?? null;
        if (!clientName && project.contract_id) {
          const { data: ctr } = await supabaseAdmin
            .from("contracts")
            .select("accounts:account_id ( name )")
            .eq("id", project.contract_id)
            .maybeSingle();
          const acc = ctr?.accounts as { name?: string } | null | undefined;
          clientName = acc?.name ?? null;
        }
        const projectOut = {
          id: project.id,
          name: project.name,
          client_name: clientName,
          hours_per_sprint: project.hours_per_sprint,
        };


        let sprintQ = supabaseAdmin
          .from("sprints")
          .select("id, sprint_number, start_date, end_date, status, contracted_hours")
          .eq("project_id", projectId)
          .order("sprint_number", { ascending: true });
        if (wanted.length > 0) sprintQ = sprintQ.in("id", wanted);
        const { data: sprints, error: sErr } = await sprintQ;
        if (sErr) return new Response(sErr.message, { status: 500 });

        const sprintIds = (sprints ?? []).map((s) => s.id);

        type TaskRow = {
          id: string;
          title: string;
          sprint_id: string | null;
          total_effort_hours: number | null;
          task_statuses: { name?: string; color?: string | null } | null;
        };
        const select =
          "id, title, sprint_id, total_effort_hours, task_statuses:status_id ( name, color )";

        let tasks: TaskRow[] = [];
        if (sprintIds.length > 0) {
          const { data, error: taskErr } = await supabaseAdmin
            .from("tasks")
            .select(select)
            .in("sprint_id", sprintIds);
          if (taskErr) return new Response(taskErr.message, { status: 500 });
          tasks = (data ?? []) as unknown as TaskRow[];
        }

        let backlogTasks: TaskRow[] = [];
        if (includeBacklog) {
          const { data, error: bErr } = await supabaseAdmin
            .from("tasks")
            .select(select)
            .eq("project_id", projectId)
            .is("sprint_id", null)
            .is("parent_task_id", null);
          if (bErr) return new Response(bErr.message, { status: 500 });
          backlogTasks = (data ?? []) as unknown as TaskRow[];
        }

        if (sprintIds.length === 0 && backlogTasks.length === 0) {
          return Response.json(
            { project: projectOut, sprints: [], backlog: includeBacklog ? [] : null },
            { headers: { "Cache-Control": "no-store, max-age=0" } },
          );
        }


        const taskIds = [...tasks, ...backlogTasks].map((t) => t.id);
        const actualByTask = new Map<string, number>();
        for (let i = 0; i < taskIds.length; i += 150) {
          const slice = taskIds.slice(i, i + 150);
          if (slice.length === 0) break;
          const { data: entries, error: eErr } = await supabaseAdmin
            .from("time_entries")
            .select("task_id, duration_minutes")
            .in("task_id", slice);
          if (eErr) return new Response(eErr.message, { status: 500 });
          for (const e of entries ?? []) {
            if (!e.task_id) continue;
            actualByTask.set(
              e.task_id,
              (actualByTask.get(e.task_id) ?? 0) + (e.duration_minutes ?? 0) / 60,
            );
          }
        }

        const round = (n: number) => Math.round(n * 10) / 10;

        const mapTask = (t: (typeof tasks)[number]) => {
          const st = t.task_statuses as { name?: string; color?: string | null } | null;
          return {
            id: t.id,
            title: t.title,
            status: st?.name ?? null,
            statusColor: st?.color ?? null,
            estimated: round(t.total_effort_hours ?? 0),
            actual: round(actualByTask.get(t.id) ?? 0),
          };
        };

        const payload = (sprints ?? []).map((s) => {
          const list = tasks
            .filter((t) => t.sprint_id === s.id)
            .map(mapTask)
            .sort((a, b) => a.title.localeCompare(b.title));
          return {
            id: s.id,
            number: s.sprint_number,
            startDate: s.start_date,
            endDate: s.end_date,
            status: s.status,
            contractedHours:
              s.contracted_hours ?? project.hours_per_sprint ?? null,
            estimated: round(list.reduce((a, t) => a + t.estimated, 0)),
            actual: round(list.reduce((a, t) => a + t.actual, 0)),
            tasks: list,
          };
        });

        const backlog = includeBacklog
          ? backlogTasks.map(mapTask).sort((a, b) => a.title.localeCompare(b.title))
          : null;

        return Response.json(
          { project: projectOut, sprints: payload, backlog },
          { headers: { "Cache-Control": "no-store, max-age=0" } },
        );
      },
    },
  },
});
