import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Calendar, Inbox } from "lucide-react";
import { PRIORITY_OPTIONS, PRIORITY_ICON } from "@/lib/tasko-constants";
import { getTaskStatus, type TaskStatusCategory } from "@/lib/tasko/status";
import { EmptyState } from "./EmptyState";

const PRIORITY_LABEL = Object.fromEntries(PRIORITY_OPTIONS.map((p) => [p.value, p.label]));

type JoinedStatus = {
  id?: string | null;
  key?: string | null;
  name?: string | null;
  category?: TaskStatusCategory | null;
  color?: string | null;
};

type Task = {
  id: string;
  title: string;
  status?: string | null;
  status_id?: string | null;
  task_statuses?: JoinedStatus | JoinedStatus[] | null;
  priority: keyof typeof PRIORITY_ICON;
  due_date: string | null;
  project_id: string;
  project?: { name?: string | null; color?: string | null } | null;
  workspace?: { slug?: string | null; name?: string | null; color?: string | null } | null;
};

type Props = {
  tasks: Task[];
  /** When provided (workspace-scoped page), used as the link slug. */
  workspaceSlug?: string;
  /** Show workspace name next to the project (global view). */
  showWorkspace?: boolean;
};

const GROUP_LABEL: Record<string, string> = {
  overdue: "Atrasadas",
  today: "Hoy",
  upcoming: "Próximas",
  no_date: "Sin fecha",
};

export function MyTasksList({ tasks, workspaceSlug, showWorkspace }: Props) {
  const groups = useMemo(() => {
    const g: Record<string, Task[]> = { overdue: [], today: [], upcoming: [], no_date: [] };
    const today = new Date().toISOString().slice(0, 10);
    for (const t of tasks) {
      if (!t.due_date) g.no_date.push(t);
      else if (t.due_date < today) g.overdue.push(t);
      else if (t.due_date === today) g.today.push(t);
      else g.upcoming.push(t);
    }
    return g;
  }, [tasks]);

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No tienes tareas asignadas"
        description="Cuando alguien te asigne una tarea, aparecerá aquí organizada por fecha."
      />
    );
  }

  return (
    <div className="space-y-6">
      {(Object.keys(groups) as Array<keyof typeof groups>).map((k) => {
        if (groups[k].length === 0) return null;
        return (
          <section key={k}>
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              {GROUP_LABEL[k]} ({groups[k].length})
            </h2>
            <div className="border border-border rounded-md divide-y divide-border">
              {groups[k].map((t) => {
                const slug = workspaceSlug ?? t.workspace?.slug ?? undefined;
                if (!slug) return null;
                const dot = t.workspace?.color ?? t.project?.color ?? "#8b5cf6";
                const st = getTaskStatus(t);
                return (
                  <Link
                    key={t.id}
                    to="/w/$workspaceSlug/projects/$projectId"
                    params={{ workspaceSlug: slug, projectId: t.project_id }}
                    search={{ task: t.id }}
                    preload="intent"
                    className="flex items-center gap-3 p-3 hover:bg-accent/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                  >
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: dot }}
                      aria-hidden="true"
                    />
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: st.color ?? "#94a3b8" }}
                      aria-hidden="true"
                      title={st.name}
                    />
                    <span className="text-sm flex-1 truncate">{t.title}</span>
                    <span className="text-[11px] text-muted-foreground hidden md:inline">
                      {showWorkspace && t.workspace?.name
                        ? `${t.workspace.name} · ${t.project?.name ?? ""}`
                        : t.project?.name}
                    </span>
                    {t.priority !== "none" && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        {PRIORITY_ICON[t.priority]}
                        {PRIORITY_LABEL[t.priority]}
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground hidden lg:inline">
                      {st.name}
                    </span>
                    {t.due_date && (
                      <span
                        className={`text-[11px] inline-flex items-center gap-1 ${
                          k === "overdue" ? "text-destructive" : "text-muted-foreground"
                        }`}
                      >
                        <Calendar className="w-3 h-3" aria-hidden="true" />
                        {t.due_date}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
