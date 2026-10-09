import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, addDays, startOfWeek, differenceInCalendarDays } from "date-fns";
import { es } from "date-fns/locale";
import { getMyWeeklyTime, getMyTasksInRange } from "@/lib/api/workload.functions";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download, CalendarDays, GanttChartSquare } from "lucide-react";
import { formatMinutes } from "./TimeTab";
import { TimeEntryRow, type EditableEntry } from "./TimeEntryRow";
import { buildWindow, ZOOMS, type Zoom } from "./workloadWindow";
import {
  packTasks,
  ganttRowHeight,
  WorkloadGanttBar,
  STATUS_LEGEND,
  type ColorMode,
} from "./WorkloadGanttBar";
import { TaskDetailDrawer } from "./TaskDetailDrawer";
import { cn } from "@/lib/utils";

type Props = {
  /** When omitted, view aggregates across all workspaces. */
  workspaceId?: string;
  /** Extra keys to invalidate on entry mutations (e.g. workload). */
  extraInvalidateKeys?: Array<readonly unknown[]>;
};

export function MyTimeView({ workspaceId, extraInvalidateKeys = [] }: Props) {
  const fetchMy = useServerFn(getMyWeeklyTime);
  const fetchTasks = useServerFn(getMyTasksInRange);

  const [anchor, setAnchor] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<"timeline" | "day">("timeline");
  const [zoom, setZoom] = useState<Zoom>("day");
  const colorMode: ColorMode = "status";
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskWs, setSelectedTaskWs] = useState<string | null>(null);

  const weekStart = useMemo(() => startOfWeek(anchor, { weekStartsOn: 1 }), [anchor]);
  const weekStartStr = format(weekStart, "yyyy-MM-dd");

  const win = useMemo(() => buildWindow(anchor, zoom), [anchor, zoom]);
  const rangeStartStr = format(win.start, "yyyy-MM-dd");
  const rangeEndStr = format(win.end, "yyyy-MM-dd");

  const wsKey = workspaceId ?? "__all__";
  const myQ = useQuery({
    queryKey: ["my-time", wsKey, weekStartStr],
    queryFn: () => fetchMy({ data: { workspaceId, weekStart: weekStartStr } }),
    staleTime: 30 * 1000,
  });

  const tasksQ = useQuery({
    queryKey: ["my-tasks-range", wsKey, rangeStartStr, rangeEndStr],
    queryFn: () =>
      fetchTasks({
        data: { workspaceId, rangeStart: rangeStartStr, rangeEnd: rangeEndStr },
      }),
    enabled: viewMode === "timeline",
    staleTime: 30 * 1000,
  });

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const navStep = viewMode === "timeline" ? (zoom === "day" ? 7 : zoom === "week" ? 28 : 56) : 7;

  const todayPct = useMemo(() => {
    const diff = differenceInCalendarDays(new Date(), win.start);
    if (diff < 0 || diff >= win.totalDays) return null;
    return ((diff + 0.5) / win.totalDays) * 100;
  }, [win.start, win.totalDays]);

  type Entry = NonNullable<typeof myQ.data>["entries"][number];

  const entriesByDay = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const d of days) m.set(format(d, "yyyy-MM-dd"), []);
    for (const e of myQ.data?.entries ?? []) {
      const k = e.day ?? e.started_at.slice(0, 10);
      const arr = m.get(k);
      if (arr) arr.push(e);
    }
    return m;
  }, [myQ.data, days]);

  const totalsByDay = useMemo(() => {
    const m = new Map<string, { total: number; billable: number }>();
    for (const d of days) m.set(format(d, "yyyy-MM-dd"), { total: 0, billable: 0 });
    for (const e of myQ.data?.entries ?? []) {
      const k = e.day ?? e.started_at.slice(0, 10);
      const cur = m.get(k);
      if (!cur) continue;
      const dur = e.duration_minutes ?? 0;
      cur.total += dur;
      if (e.is_billable) cur.billable += dur;
    }
    return m;
  }, [myQ.data, days]);

  // Project/task grouping views removed — only timeline + day remain.

  const weekTotal = Array.from(totalsByDay.values()).reduce(
    (acc, x) => ({ total: acc.total + x.total, billable: acc.billable + x.billable }),
    { total: 0, billable: 0 },
  );

  const estimateMinutesByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of days) m.set(format(d, "yyyy-MM-dd"), 0);
    for (const it of myQ.data?.estimateItems ?? []) {
      const cur = m.get(it.day);
      if (cur !== undefined) m.set(it.day, cur + it.minutes);
    }
    return m;
  }, [myQ.data, days]);

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const weekDayKeys = days.map((d) => format(d, "yyyy-MM-dd"));
  const resolvedSelectedDay = useMemo(() => {
    if (selectedDayKey && weekDayKeys.includes(selectedDayKey)) return selectedDayKey;
    if (weekDayKeys.includes(todayKey)) return todayKey;
    // first weekday with activity, else monday
    const firstWithData = weekDayKeys.find(
      (k) => (totalsByDay.get(k)?.total ?? 0) > 0 || (estimateMinutesByDay.get(k) ?? 0) > 0,
    );
    return firstWithData ?? weekDayKeys[0];
  }, [selectedDayKey, weekDayKeys, todayKey, totalsByDay, estimateMinutesByDay]);

  const DAILY_CAPACITY_MIN = 8 * 60;

  const showWorkspaceCol = !workspaceId;
  const exportCsv = () => {
    const header = showWorkspaceCol
      ? ["Fecha", "Espacio", "Proyecto", "Tarea", "Duracion (min)", "Facturable", "Nota"]
      : ["Fecha", "Proyecto", "Tarea", "Duracion (min)", "Facturable", "Nota"];
    const rows: string[][] = [header];
    for (const e of myQ.data?.entries ?? []) {
      const base = [
        format(new Date(e.started_at), "yyyy-MM-dd HH:mm"),
        ...(showWorkspaceCol ? [e.project?.workspace_name ?? ""] : []),
        e.project?.name ?? "",
        e.task?.title ?? "",
        String(e.duration_minutes ?? 0),
        e.is_billable ? "sí" : "no",
        (e.note ?? "").replace(/[\n;]/g, " "),
      ];
      rows.push(base);
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `mi-tiempo-${weekStartStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const invalidateKeys: Array<readonly unknown[]> = [
    ["my-time", wsKey, weekStartStr] as const,
    ...extraInvalidateKeys,
  ];

  const renderRow = (e: Entry) => (
    <TimeEntryRow
      key={e.id}
      entry={e as EditableEntry}
      workspaceSlug={e.project?.workspace_slug ?? ""}
      invalidateKeys={invalidateKeys}
    />
  );

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center justify-between">
        <h1 className="text-sm font-semibold">Mi tiempo</h1>
        <div className="flex items-center gap-2">
          {myQ.data?.tz && myQ.data.tz !== "UTC" && (
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-2">
              TZ {myQ.data.tz}
            </span>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="w-7 h-7"
            onClick={() => setAnchor(addDays(anchor, -navStep))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums min-w-[200px] text-center">
            {viewMode === "timeline" ? (
              <>
                {format(win.start, "dd/MM", { locale: es })} –{" "}
                {format(win.end, "dd/MM/yyyy", { locale: es })}
              </>
            ) : (
              <>
                {format(weekStart, "dd/MM", { locale: es })} –{" "}
                {format(addDays(weekStart, 6), "dd/MM/yyyy", { locale: es })}
              </>
            )}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="w-7 h-7"
            onClick={() => setAnchor(addDays(anchor, navStep))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          {/* botón Hoy eliminado */}
          {viewMode === "timeline" && (
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              {ZOOMS.map((z, i) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setZoom(z)}
                  className={cn(
                    "px-2 h-7 text-xs capitalize",
                    i > 0 && "border-l border-border",
                    zoom === z
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/50",
                  )}
                  aria-pressed={zoom === z}
                >
                  {z === "day" ? "Día" : z === "week" ? "Semana" : "Mes"}
                </button>
              ))}
            </div>
          )}
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode("timeline")}
              className={`px-2 h-7 text-xs inline-flex items-center gap-1 ${
                viewMode === "timeline"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50"
              }`}
              aria-pressed={viewMode === "timeline"}
            >
              <GanttChartSquare className="w-3 h-3" /> Timeline
            </button>
            <button
              type="button"
              onClick={() => setViewMode("day")}
              className={`px-2 h-7 text-xs inline-flex items-center gap-1 border-l border-border ${
                viewMode === "day"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50"
              }`}
              aria-pressed={viewMode === "day"}
            >
              <CalendarDays className="w-3 h-3" /> Día
            </button>
          </div>
          <Button size="sm" variant="outline" onClick={exportCsv} className="h-7 text-xs gap-1">
            <Download className="w-3 h-3" /> CSV
          </Button>
        </div>
      </header>

      {viewMode === "timeline" ? (
        <TimelineBody
          win={win}
          tasks={tasksQ.data?.tasks ?? []}
          totalsByDay={totalsByDay}
          estimateMinutesByDay={estimateMinutesByDay}
          entries={myQ.data?.entries ?? []}
          isLoading={tasksQ.isLoading}
          todayPct={todayPct}
          colorMode={colorMode}
          onTaskClick={(id, wsId) => {
            setSelectedTaskId(id);
            setSelectedTaskWs(wsId);
          }}
        />
      ) : (
        <div className="flex-1 overflow-auto p-6 space-y-6">
          <div className="grid grid-cols-7 gap-3">
            {days.map((d) => {
              const k = format(d, "yyyy-MM-dd");
              const realMin = totalsByDay.get(k)?.total ?? 0;
              const estMin = estimateMinutesByDay.get(k) ?? 0;
              const dow = d.getDay();
              const isWeekend = dow === 0 || dow === 6;
              const isToday = todayKey === k;
              const isSelected = resolvedSelectedDay === k;
              const isPast = k < todayKey;
              const isFuture = k > todayKey;

              const capacityPct = Math.min(100, (realMin / DAILY_CAPACITY_MIN) * 100);

              let badge: { label: string; cls: string } | null = null;
              if (isToday) {
                badge = {
                  label: `${Math.round((realMin / DAILY_CAPACITY_MIN) * 100)}%`,
                  cls: "bg-primary/15 text-primary",
                };
              } else if (isPast && !isWeekend && estMin > 0) {
                const pct = Math.round((realMin / estMin) * 100);
                const cls =
                  pct >= 90
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : pct >= 60
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                      : "bg-destructive/15 text-destructive";
                badge = { label: `${pct}%`, cls };
              }

              const containerCls = isSelected
                ? "border-2 border-primary bg-primary/5 shadow-sm"
                : isWeekend || isFuture
                  ? "border border-border opacity-60 hover:opacity-100 hover:bg-muted/40"
                  : "border border-border bg-muted/30 hover:bg-muted/60";

              return (
                <button
                  type="button"
                  key={k}
                  onClick={() => setSelectedDayKey(k)}
                  className={`text-left p-3 rounded-xl flex flex-col gap-2 transition-colors ${containerCls}`}
                  aria-pressed={isSelected}
                >
                  <div className="flex justify-between items-start">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider ${
                        isSelected ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {format(d, "EEE d", { locale: es })}
                    </span>
                    {badge && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badge.cls}`}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span
                      className={`text-lg font-bold tabular-nums ${
                        realMin > 0 ? "text-foreground" : "text-muted-foreground/60"
                      }`}
                    >
                      {realMin > 0 ? formatMinutes(realMin) : isWeekend ? "—" : "0h"}
                    </span>
                    <div className="w-full h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-[width] duration-500 ease-out"
                        style={{ width: `${capacityPct}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-[10px] font-medium text-muted-foreground tabular-nums">
                    <span>Est: {estMin > 0 ? formatMinutes(estMin) : "—"}</span>
                    <span>Real: {realMin > 0 ? formatMinutes(realMin) : "—"}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {(() => {
            const est = myQ.data?.estimateByArea ?? { billable: 0, nonBillable: 0, total: 0 };
            const logged = myQ.data?.loggedByArea ?? { billable: 0, nonBillable: 0, total: 0 };
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                    Estimado (semana)
                  </div>
                  <div className="flex items-baseline gap-4 flex-wrap">
                    <span className="text-2xl font-bold tabular-nums text-foreground">
                      {formatMinutes(est.total)}
                    </span>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                        Clientes:{" "}
                        <span className="text-foreground font-semibold">
                          {formatMinutes(est.billable)}
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                        Interno:{" "}
                        <span className="text-foreground font-semibold">
                          {formatMinutes(est.nonBillable)}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                    Registrado (semana)
                  </div>
                  <div className="flex items-baseline gap-4 flex-wrap">
                    <span className="text-2xl font-bold tabular-nums text-foreground">
                      {formatMinutes(logged.total)}
                    </span>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-primary" />
                        Clientes:{" "}
                        <span className="text-foreground font-semibold">
                          {formatMinutes(logged.billable)}
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-primary/40" />
                        Interno:{" "}
                        <span className="text-foreground font-semibold">
                          {formatMinutes(logged.nonBillable)}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="space-y-4">
            {viewMode === "day" &&
              (() => {
                const k = resolvedSelectedDay;
                const d = days.find((x) => format(x, "yyyy-MM-dd") === k) ?? days[0];
                const list = entriesByDay.get(k) ?? [];
                const ests = (myQ.data?.estimateItems ?? []).filter((i) => i.day === k);
                const realMin = totalsByDay.get(k)?.total ?? 0;
                const dow = d.getDay();
                const isWeekend = dow === 0 || dow === 6;
                const available = Math.max(0, DAILY_CAPACITY_MIN - realMin);
                return (
                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Detalle: {format(d, "EEEE d 'de' MMMM", { locale: es })}
                      </h2>
                      {!isWeekend && (
                        <span className="text-xs font-medium text-muted-foreground">
                          Capacidad disponible:{" "}
                          <span className="text-foreground font-semibold">
                            {formatMinutes(available)}
                          </span>
                        </span>
                      )}
                    </div>
                    {ests.length > 0 && (
                      <div className="space-y-1 mb-2">
                        {ests.map((it) => (
                          <div
                            key={`est-${it.taskId}-${it.day}`}
                            className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-dashed border-border bg-muted/30"
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ background: it.projectColor ?? "#8b5cf6" }}
                            />
                            <span className="flex-1 truncate">
                              {it.projectId && it.workspaceSlug ? (
                                <Link
                                  to="/w/$workspaceSlug/projects/$projectId"
                                  params={{
                                    workspaceSlug: it.workspaceSlug,
                                    projectId: it.projectId,
                                  }}
                                  search={{ task: it.taskId }}
                                  className="text-foreground font-medium hover:underline"
                                >
                                  {it.title}
                                </Link>
                              ) : (
                                <span className="text-foreground font-medium">{it.title}</span>
                              )}
                              <span className="text-muted-foreground/70">
                                {" "}
                                · {it.projectName}
                                {showWorkspaceCol && it.workspaceName
                                  ? ` · ${it.workspaceName}`
                                  : ""}
                              </span>
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
                                it.isBillable
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                  : "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                              }`}
                            >
                              {it.isBillable ? "Cliente" : "Interno"}
                            </span>
                            <span className="tabular-nums text-muted-foreground">
                              est. {formatMinutes(it.minutes)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {list.length > 0 ? (
                      <div className="space-y-1">{list.map(renderRow)}</div>
                    ) : ests.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic px-3 py-4 rounded-lg border border-dashed border-border bg-muted/20">
                        Sin registros para este día.
                      </p>
                    ) : null}
                  </section>
                );
              })()}
            {/* Project/task grouping modes removed. */}
            {(myQ.data?.entries ?? []).length === 0 &&
              (myQ.data?.estimateItems ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground italic">
                  Sin registros de tiempo esta semana.{" "}
                  <Link to="/my-tasks" className="underline">
                    Ir a mis tareas
                  </Link>
                  .
                </p>
              )}
          </div>
        </div>
      )}

      {selectedTaskId && selectedTaskWs && (
        <TaskDetailDrawer
          taskId={selectedTaskId}
          workspaceId={selectedTaskWs}
          onClose={() => {
            setSelectedTaskId(null);
            setSelectedTaskWs(null);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Timeline body — mirrors the Workload gantt visualization
// ============================================================
type TimelineProps = {
  win: ReturnType<typeof buildWindow>;
  tasks: Array<{
    id: string;
    title: string;
    color: string | null;
    area: "operations" | "marketing" | "finance" | "internal" | null;
    start_date: string | null;
    due_date: string | null;
    status: string;
    task_statuses?:
      | {
          id?: string | null;
          key?: string | null;
          name?: string | null;
          category?: string | null;
          color?: string | null;
        }
      | Array<{
          id?: string | null;
          key?: string | null;
          name?: string | null;
          category?: string | null;
          color?: string | null;
        }>
      | null;
    totalMin: number;
    project: {
      id: string;
      name: string;
      color: string | null;
      workspace_id: string;
      workspace_name: string;
      workspace_slug: string;
    } | null;
  }>;
  totalsByDay: Map<string, { total: number; billable: number }>;
  estimateMinutesByDay: Map<string, number>;
  entries: Array<{
    day?: string | null;
    started_at: string;
    duration_minutes?: number | null;
    is_billable?: boolean | null;
    project?: { id?: string | null } | null;
  }>;
  isLoading: boolean;
  todayPct: number | null;
  onTaskClick: (taskId: string, workspaceId: string) => void;
  colorMode: ColorMode;
};

function TimelineBody({
  win,
  tasks,
  totalsByDay,
  estimateMinutesByDay,
  entries,
  isLoading,
  todayPct,
  onTaskClick,
  colorMode,
}: TimelineProps) {
  const NAME_COL = 240;
  const gridTemplate = `${NAME_COL}px repeat(${win.columns.length}, minmax(0, 1fr))`;

  // Logged split (client vs internal) per ISO day
  const splitByDay = useMemo(() => {
    const m = new Map<string, { client: number; internal: number }>();
    for (const e of entries) {
      const k = e.day ?? e.started_at.slice(0, 10);
      const cur = m.get(k) ?? { client: 0, internal: 0 };
      const dur = e.duration_minutes ?? 0;
      if (e.is_billable) cur.client += dur;
      else cur.internal += dur;
      m.set(k, cur);
    }
    return m;
  }, [entries]);

  // Per-project logged totals within the window
  const loggedByProject = useMemo(() => {
    const m = new Map<string, { total: number; client: number; internal: number }>();
    const startK = format(win.start, "yyyy-MM-dd");
    const endK = format(win.end, "yyyy-MM-dd");
    for (const e of entries) {
      const k = e.day ?? e.started_at.slice(0, 10);
      if (k < startK || k > endK) continue;
      const pid = e.project?.id ?? "__none__";
      const cur = m.get(pid) ?? { total: 0, client: 0, internal: 0 };
      const dur = e.duration_minutes ?? 0;
      cur.total += dur;
      if (e.is_billable) cur.client += dur;
      else cur.internal += dur;
      m.set(pid, cur);
    }
    return m;
  }, [entries, win.start, win.end]);

  // Group tasks by project
  const groups = useMemo(() => {
    const m = new Map<
      string,
      {
        projectId: string;
        projectName: string;
        projectColor: string | null;
        workspaceId: string;
        workspaceName: string;
        tasks: typeof tasks;
      }
    >();
    for (const t of tasks) {
      const p = t.project;
      const key = p?.id ?? "__none__";
      let g = m.get(key);
      if (!g) {
        g = {
          projectId: p?.id ?? "",
          projectName: p?.name ?? "Sin proyecto",
          projectColor: p?.color ?? "#8b5cf6",
          workspaceId: p?.workspace_id ?? "",
          workspaceName: p?.workspace_name ?? "",
          tasks: [],
        };
        m.set(key, g);
      }
      g.tasks.push(t);
    }
    return Array.from(m.values()).sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [tasks]);

  return (
    <div className="flex-1 overflow-auto p-6 space-y-4">
      <div className="border border-border rounded-md overflow-hidden bg-card">
        {/* Header row */}
        <div
          className="grid bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground border-b border-border"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div className="px-3 py-2 border-r border-border">Proyecto / Tareas</div>
          {win.columns.map((c) => (
            <div
              key={c.key}
              className={cn(
                "px-2 py-2 text-center border-r border-border last:border-r-0",
                c.isToday && "text-destructive font-semibold",
              )}
            >
              <div>{c.label}</div>
              <div className="font-mono text-[10px] mt-0.5 normal-case tracking-normal text-muted-foreground/70">
                {c.sublabel}
              </div>
            </div>
          ))}
        </div>

        {/* Logged hours row (compact strip under header) */}
        <div
          className="grid border-b border-border bg-muted/10"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div className="px-3 py-2 border-r border-border text-[10px] uppercase tracking-wider text-muted-foreground">
            <div>Horas registradas</div>
            <div className="mt-1 flex items-center gap-2 normal-case tracking-normal text-[9px] font-normal text-muted-foreground/70">
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Cliente
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Interno
              </span>
            </div>
          </div>
          {win.columns.map((c) => {
            let logged = 0;
            let est = 0;
            let client = 0;
            let internal = 0;
            for (const d of c.days) {
              logged += totalsByDay.get(d)?.total ?? 0;
              est += estimateMinutesByDay.get(d) ?? 0;
              const s = splitByDay.get(d);
              if (s) {
                client += s.client;
                internal += s.internal;
              }
            }
            const hasAny = logged > 0 || est > 0;
            const delta = logged - est;
            const deltaCls =
              delta > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : delta < 0
                  ? "text-destructive"
                  : "text-muted-foreground/70";
            const fmt = (m: number) => `${(m / 60).toFixed(m % 60 === 0 ? 0 : 1)}h`;
            return (
              <div
                key={c.key}
                className={cn(
                  "border-r border-border last:border-r-0 px-2 py-2 text-center",
                  c.isToday && "bg-destructive/[0.03]",
                )}
              >
                {hasAny ? (
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold tabular-nums text-foreground">
                      {fmt(logged)}
                    </div>
                    {(client > 0 || internal > 0) && (
                      <div className="text-[9px] tabular-nums flex items-center justify-center gap-1">
                        {client > 0 && (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            {fmt(client)}
                          </span>
                        )}
                        {client > 0 && internal > 0 && (
                          <span className="text-muted-foreground/40">·</span>
                        )}
                        {internal > 0 && (
                          <span className="text-blue-700 dark:text-blue-400">{fmt(internal)}</span>
                        )}
                      </div>
                    )}
                    {est > 0 && (
                      <div className="text-[9px] tabular-nums text-muted-foreground/70">
                        est {fmt(est)}{" "}
                        <span className={cn("font-semibold", deltaCls)}>
                          {delta >= 0 ? "+" : ""}
                          {fmt(Math.abs(delta)).replace("h", "")}h
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-[10px] text-muted-foreground/40">—</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Project rows with gantt bars */}
        {isLoading ? (
          <div className="p-6 text-center text-xs text-muted-foreground italic">
            Cargando tareas…
          </div>
        ) : groups.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground italic">
            Sin tareas asignadas en esta ventana.
          </div>
        ) : (
          groups.map((g) => {
            const { positioned, lanesUsed, overflowCount } = packTasks(
              g.tasks.map((t) => ({
                id: t.id,
                title: t.title,
                color: g.projectColor,
                area: t.area,
                start_date: t.start_date,
                due_date: t.due_date,
                status: t.status,
                task_statuses: t.task_statuses ?? null,
                totalMin: t.totalMin,
              })),
              format(win.start, "yyyy-MM-dd"),
              format(win.end, "yyyy-MM-dd"),
            );
            const rowH = Math.max(ganttRowHeight(lanesUsed), 44);
            return (
              <div
                key={g.projectId || g.projectName}
                className="grid border-b border-border last:border-b-0 relative"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <div className="px-3 py-2 border-r border-border flex items-start gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                    style={{ background: g.projectColor ?? "#8b5cf6" }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{g.projectName}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {g.tasks.length} tarea{g.tasks.length === 1 ? "" : "s"}
                      {overflowCount > 0 && (
                        <span className="ml-1 text-status-in-progress">+{overflowCount} más</span>
                      )}
                    </div>
                    {(() => {
                      const estMin = g.tasks.reduce((s, t) => s + (t.totalMin ?? 0), 0);
                      const logged = loggedByProject.get(g.projectId || "__none__") ?? {
                        total: 0,
                        client: 0,
                        internal: 0,
                      };
                      if (estMin === 0 && logged.total === 0) return null;
                      const delta = logged.total - estMin;
                      const deltaCls =
                        delta > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : delta < 0
                            ? "text-destructive"
                            : "text-muted-foreground/70";
                      const fmt = (m: number) => `${(m / 60).toFixed(m % 60 === 0 ? 0 : 1)}h`;
                      return (
                        <div className="mt-1 space-y-0.5 text-[10px] tabular-nums">
                          <div className="flex items-center gap-1.5">
                            <span className="text-foreground font-semibold">
                              {fmt(logged.total)}
                            </span>
                            {estMin > 0 && (
                              <>
                                <span className="text-muted-foreground/60">
                                  / est {fmt(estMin)}
                                </span>
                                <span className={cn("font-semibold", deltaCls)}>
                                  ({delta >= 0 ? "+" : ""}
                                  {fmt(Math.abs(delta))})
                                </span>
                              </>
                            )}
                          </div>
                          {(logged.client > 0 || logged.internal > 0) && (
                            <div className="flex items-center gap-1.5 text-[9px]">
                              {logged.client > 0 && (
                                <span className="text-emerald-700 dark:text-emerald-400">
                                  Cliente {fmt(logged.client)}
                                </span>
                              )}
                              {logged.internal > 0 && (
                                <span className="text-blue-700 dark:text-blue-400">
                                  Interno {fmt(logged.internal)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className="relative" style={{ gridColumn: `2 / -1`, height: rowH }}>
                  {/* Column separators + weekend/today tint */}
                  <div
                    className="absolute inset-0 grid pointer-events-none"
                    style={{
                      gridTemplateColumns: `repeat(${win.columns.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {win.columns.map((c) => {
                      const isWeekendCol = c.days.every((d) => {
                        const dow = new Date(d + "T00:00:00Z").getUTCDay();
                        return dow === 0 || dow === 6;
                      });
                      return (
                        <div
                          key={c.key}
                          className={cn(
                            "border-r border-border/50 last:border-r-0",
                            isWeekendCol && "bg-muted/20",
                            c.isToday && "bg-destructive/[0.03]",
                          )}
                        />
                      );
                    })}
                  </div>
                  {positioned.map((t) => (
                    <WorkloadGanttBar
                      key={t.id}
                      task={t}
                      colorMode={colorMode}
                      onClick={(id) => onTaskClick(id, g.workspaceId)}
                    />
                  ))}

                  {todayPct !== null && (
                    <div
                      className="pointer-events-none absolute top-0 bottom-0 w-px bg-destructive/80"
                      style={{ left: `${todayPct}%` }}
                    />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="text-[10px] uppercase tracking-wider">Estado:</span>
        {STATUS_LEGEND.map((s) => (
          <span key={s.category} className="inline-flex items-center gap-1.5">
            <span className="w-3 h-1.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}

        <span className="inline-flex items-center gap-1.5">
          <span className="w-px h-3 bg-destructive" /> Hoy
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-1.5 bg-muted/40 rounded-sm" /> Fin de semana
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Cliente (facturable)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500" /> Interno
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">+</span> sobre
          estimado · <span className="text-destructive font-semibold">−</span> bajo estimado
        </span>
        <span className="inline-flex items-center gap-1.5">
          Click barra → abre detalle de tarea
        </span>
      </div>
    </div>
  );
}
