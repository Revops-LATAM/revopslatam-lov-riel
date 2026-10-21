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

// Una sola definición de columnas para la cabecera y las filas (en móvil se apilan).
const ROW_GRID =
  "grid items-center gap-x-4 gap-y-1 md:grid-cols-[minmax(0,1fr)_14rem_6.5rem_8.5rem_7.5rem]";

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
      <div
        className={`${ROW_GRID} hidden md:grid px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`}
        aria-hidden="true"
      >
        <span>Tarea</span>
        <span>Proyecto</span>
        <span>Prioridad</span>
        <span>Estado</span>
        <span>Vence</span>
      </div>
      {(Object.keys(groups) as Array<keyof typeof groups>).map((k) => {
        if (groups[k].length === 0) return null;
        return (
          <section key={k}>
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              <span className={k === "overdue" ? "text-destructive" : undefined}>
                {GROUP_LABEL[k]}
              </span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal">
                {groups[k].length}
              </span>
            </h2>
            <div className="border border-border bg-card rounded-lg divide-y divide-border overflow-hidden">
              {groups[k].map((t) => {
                const slug = workspaceSlug ?? t.workspace?.slug ?? undefined;
                if (!slug) return null;
                const dot = t.workspace?.color ?? t.project?.color ?? "#8b5cf6";
                const st = getTaskStatus(t);
                const project =
                  showWorkspace && t.workspace?.name
                    ? `${t.workspace.name} · ${t.project?.name ?? ""}`
                    : t.project?.name;
                return (
                  <Link
                    key={t.id}
                    to="/w/$workspaceSlug/projects/$projectId"
                    params={{ workspaceSlug: slug, projectId: t.project_id }}
                    search={{ task: t.id }}
                    preload="intent"
                    className={`${ROW_GRID} px-3 py-2.5 hover:bg-accent/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: dot }}
                        aria-hidden="true"
                      />
                      <span className="text-sm font-medium truncate">{t.title}</span>
                    </div>
                    <span className="text-xs text-muted-foreground truncate pl-[18px] md:pl-0">
                      {project}
                    </span>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-[18px] md:contents">
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        {t.priority !== "none" ? (
                          <>
                            {PRIORITY_ICON[t.priority]}
                            {PRIORITY_LABEL[t.priority]}
                          </>
                        ) : (
                          <span className="hidden md:inline">—</span>
                        )}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: st.color ?? "#94a3b8" }}
                          aria-hidden="true"
                        />
                        <span className="truncate">{st.name}</span>
                      </span>
                      {t.due_date ? (
                        <span
                          className={`text-xs inline-flex items-center gap-1 tabular-nums ${
                            k === "overdue"
                              ? "text-destructive font-medium"
                              : "text-muted-foreground"
                          }`}
                        >
                          <Calendar className="w-3 h-3" aria-hidden="true" />
                          {t.due_date}
                        </span>
                      ) : (
                        <span className="hidden md:inline text-xs text-muted-foreground">—</span>
                      )}
                    </div>
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
