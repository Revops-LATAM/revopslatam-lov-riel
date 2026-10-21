import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Calendar, ChevronDown, Inbox, Search } from "lucide-react";
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

type GroupKey = "overdue" | "today" | "upcoming" | "no_date";
const GROUP_KEYS: GroupKey[] = ["overdue", "today", "upcoming", "no_date"];

export function MyTasksList({ tasks, workspaceSlug, showWorkspace }: Props) {
  const [filter, setFilter] = useState<"all" | GroupKey>("all");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    const g: Record<GroupKey, Task[]> = { overdue: [], today: [], upcoming: [], no_date: [] };
    const today = new Date().toISOString().slice(0, 10);
    const q = query.trim().toLowerCase();
    for (const t of tasks) {
      if (
        q &&
        !`${t.title} ${t.project?.name ?? ""} ${t.workspace?.name ?? ""}`.toLowerCase().includes(q)
      )
        continue;
      if (!t.due_date) g.no_date.push(t);
      else if (t.due_date < today) g.overdue.push(t);
      else if (t.due_date === today) g.today.push(t);
      else g.upcoming.push(t);
    }
    return g;
  }, [tasks, query]);

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No tienes tareas asignadas"
        description="Cuando alguien te asigne una tarea, aparecerá aquí organizada por fecha."
      />
    );
  }

  const total = GROUP_KEYS.reduce((n, k) => n + groups[k].length, 0);
  const visible = GROUP_KEYS.filter((k) => (filter === "all" || filter === k) && groups[k].length);
  const filters: Array<{ key: "all" | GroupKey; label: string; count: number }> = [
    { key: "all", label: "Todas", count: total },
    ...GROUP_KEYS.filter((k) => groups[k].length > 0 || filter === k).map((k) => ({
      key: k,
      label: GROUP_LABEL[k],
      count: groups[k].length,
    })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Filtrar tareas"
          className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5"
        >
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                filter === f.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
              <span
                className={`tabular-nums text-[11px] ${
                  f.key === "overdue" && f.count > 0 ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {f.count}
              </span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar tarea o proyecto…"
            className="h-9 w-full rounded-md border border-input bg-card pl-8 pr-3 text-sm shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground hover:border-border-strong focus:border-primary/60 focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div
          className={`${ROW_GRID} hidden md:grid px-4 py-2.5 bg-muted/50 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}
          aria-hidden="true"
        >
          <span>Tarea</span>
          <span>Proyecto</span>
          <span>Prioridad</span>
          <span>Estado</span>
          <span>Vence</span>
        </div>
        {visible.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No hay tareas que coincidan con la búsqueda.
          </div>
        )}
        {visible.map((k) => {
          const isCollapsed = collapsed[k];
          return (
            <section key={k} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [k]: !c[k] }))}
                aria-expanded={!isCollapsed}
                className="flex w-full items-center gap-2 px-4 py-2 text-left bg-muted/30 border-b border-border hover:bg-muted/50 transition-colors"
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                    isCollapsed ? "-rotate-90" : ""
                  }`}
                  aria-hidden="true"
                />
                <span
                  className={`text-xs font-semibold uppercase tracking-wider ${
                    k === "overdue" ? "text-destructive" : "text-foreground"
                  }`}
                >
                  {GROUP_LABEL[k]}
                </span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                  {groups[k].length}
                </span>
              </button>
              {!isCollapsed && (
                <div className="divide-y divide-border">
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
                        className={`${ROW_GRID} px-4 py-3 hover:bg-accent/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
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
                            <span className="hidden md:inline text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
