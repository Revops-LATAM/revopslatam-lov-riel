import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildWindow, ZOOMS, type Zoom } from "./workloadWindow";
import {
  packTasks,
  ganttRowHeight,
  WorkloadGanttBar,
  STATUS_LEGEND,
  type ColorMode,
} from "./WorkloadGanttBar";

import { MemberAvatar } from "./MemberAvatar";
import { TaskDetailDrawer } from "./TaskDetailDrawer";
import { getTeamTimeInRange } from "@/lib/api/workload.functions";

type Props = { workspaceId: string };

const fmt = (m: number) => `${(m / 60).toFixed(m % 60 === 0 ? 0 : 1)}h`;

export function MyTeamView({ workspaceId }: Props) {
  const fetchTeam = useServerFn(getTeamTimeInRange);
  const [anchor, setAnchor] = useState(() => new Date());
  const [zoom, setZoom] = useState<Zoom>("day");
  const [sel, setSel] = useState<{ id: string; ws: string } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const colorMode: ColorMode = "status";
  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const win = useMemo(() => buildWindow(anchor, zoom), [anchor, zoom]);
  const rangeStart = format(win.start, "yyyy-MM-dd");
  const rangeEnd = format(win.end, "yyyy-MM-dd");

  const teamQ = useQuery({
    queryKey: ["team-time-range", workspaceId, rangeStart, rangeEnd],
    queryFn: () => fetchTeam({ data: { workspaceId, rangeStart, rangeEnd } }),
    staleTime: 30 * 1000,
  });

  const navStep = zoom === "day" ? 7 : zoom === "week" ? 28 : 56;
  const todayPct = useMemo(() => {
    const diff = differenceInCalendarDays(new Date(), win.start);
    if (diff < 0 || diff >= win.totalDays) return null;
    return ((diff + 0.5) / win.totalDays) * 100;
  }, [win.start, win.totalDays]);

  const NAME_COL = 240;
  const gridTemplate = `${NAME_COL}px repeat(${win.columns.length}, minmax(0, 1fr))`;
  const STRIP_H = 40;

  const members = teamQ.data?.members ?? [];

  return (
    <div className="flex flex-col border-t border-border">
      <header className="h-12 border-b border-border px-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Users className="w-4 h-4" /> Mi equipo
        </h2>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            className="w-7 h-7"
            onClick={() => setAnchor(addDays(anchor, -navStep))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums min-w-[200px] text-center">
            {format(win.start, "dd/MM", { locale: es })} –{" "}
            {format(win.end, "dd/MM/yyyy", { locale: es })}
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
        </div>
      </header>

      <div className="p-6 space-y-4">
        <div className="border border-border rounded-md overflow-hidden bg-card">
          {/* Header row */}
          <div
            className="grid bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground border-b border-border"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="px-3 py-2 border-r border-border">Miembro / Tareas</div>
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

          {/* Member rows */}
          {teamQ.isLoading ? (
            <div className="p-6 text-center text-xs text-muted-foreground italic">
              Cargando equipo…
            </div>
          ) : members.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground italic">
              Sin miembros en el espacio.
            </div>
          ) : (
            members.map((m) => {
              const { positioned, lanesUsed, overflowCount } = packTasks(
                m.tasks.map((t) => ({
                  id: t.id,
                  title: t.title,
                  color: t.project?.color ?? t.color,
                  area: t.area,
                  start_date: t.start_date,
                  due_date: t.due_date,
                  status: t.status,
                  task_statuses: t.task_statuses ?? null,
                  totalMin: t.totalMin,
                })),
                rangeStart,
                rangeEnd,
              );
              const isCollapsed = collapsed.has(m.user_id);
              const rowH = isCollapsed
                ? STRIP_H + 8
                : STRIP_H + Math.max(ganttRowHeight(lanesUsed), 44);
              const delta = m.loggedMin - m.estimateMin;
              const deltaCls =
                delta > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : delta < 0
                    ? "text-destructive"
                    : "text-muted-foreground/70";
              return (
                <div
                  key={m.user_id}
                  className="grid border-b border-border last:border-b-0"
                  style={{ gridTemplateColumns: gridTemplate }}
                >
                  <div className="px-3 py-2 border-r border-border flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => toggleCollapse(m.user_id)}
                      className="mt-0.5 w-4 h-4 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground shrink-0"
                      aria-label={isCollapsed ? "Expandir" : "Colapsar"}
                      aria-expanded={!isCollapsed}
                    >
                      {isCollapsed ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronUp className="w-3 h-3" />
                      )}
                    </button>
                    <MemberAvatar
                      profile={{ id: m.user_id, full_name: m.name, avatar_url: m.avatar_url }}
                      size={24}
                      shape="circle"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">{m.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {m.tasks.length} tarea{m.tasks.length === 1 ? "" : "s"}
                        {overflowCount > 0 && !isCollapsed && (
                          <span className="ml-1 text-status-in-progress">+{overflowCount} más</span>
                        )}
                      </div>
                      {!isCollapsed && (m.estimateMin > 0 || m.loggedMin > 0) && (
                        <div className="mt-1 space-y-0.5 text-[10px] tabular-nums">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-foreground font-semibold">
                              {fmt(m.loggedMin)}
                            </span>
                            {m.estimateMin > 0 && (
                              <>
                                <span className="text-muted-foreground/60">
                                  / est {fmt(m.estimateMin)}
                                </span>
                                <span className={cn("font-semibold", deltaCls)}>
                                  ({delta >= 0 ? "+" : ""}
                                  {fmt(Math.abs(delta))})
                                </span>
                              </>
                            )}
                          </div>
                          {(m.loggedClientMin > 0 || m.loggedInternalMin > 0) && (
                            <div className="flex items-center gap-1.5 text-[9px]">
                              {m.loggedClientMin > 0 && (
                                <span className="text-emerald-700 dark:text-emerald-400">
                                  Cliente {fmt(m.loggedClientMin)}
                                </span>
                              )}
                              {m.loggedInternalMin > 0 && (
                                <span className="text-blue-700 dark:text-blue-400">
                                  Interno {fmt(m.loggedInternalMin)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="relative" style={{ gridColumn: `2 / -1`, height: rowH }}>
                    {/* Weekend / today background */}
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
                    {/* Daily hour cells strip — always visible */}
                    <div
                      className="absolute inset-x-0 top-0 grid"
                      style={{
                        gridTemplateColumns: `repeat(${win.columns.length}, minmax(0, 1fr))`,
                        height: STRIP_H,
                      }}
                    >
                      {win.columns.map((c) => {
                        const workdays = c.days.filter((d) => {
                          const dow = new Date(d + "T00:00:00Z").getUTCDay();
                          return dow !== 0 && dow !== 6;
                        }).length;
                        const isWeekendCol = workdays === 0;
                        let colMin = 0;
                        let planMin = 0;
                        for (const d of c.days) {
                          const v = m.loggedByDay[d];
                          if (v) colMin += v.total;
                          planMin += m.estimateByDay?.[d] ?? 0;
                        }
                        const capacityMin = workdays * 7 * 60;
                        const over = capacityMin > 0 && colMin > capacityMin;
                        const planOver = capacityMin > 0 && planMin > capacityMin;
                        const showLogged = !isWeekendCol && colMin > 0;
                        const showPlan = !isWeekendCol && planMin > 0;
                        const delta = colMin - planMin;
                        const hasBoth = showLogged && showPlan;
                        return (
                          <div
                            key={c.key}
                            className="flex flex-col items-stretch justify-center gap-0.5 px-1 py-1"
                          >
                            {showLogged && (
                              <div
                                className={cn(
                                  "w-full min-h-0 rounded-sm flex items-center justify-center font-semibold tabular-nums leading-none",
                                  hasBoth ? "h-[18px] text-[10px]" : "h-full text-xs",
                                  over
                                    ? "bg-rose-200/70 dark:bg-rose-500/25 text-rose-700 dark:text-rose-200"
                                    : "bg-sky-200/70 dark:bg-sky-500/25 text-sky-800 dark:text-sky-100",
                                )}
                                title={`Registrado ${fmt(colMin)}${planMin > 0 ? ` / plan ${fmt(planMin)} (${delta >= 0 ? "+" : ""}${fmt(delta)})` : ""}${capacityMin ? ` / cap ${fmt(capacityMin)}` : ""}`}
                              >
                                {fmt(colMin)}
                              </div>
                            )}
                            {showPlan && (
                              <div
                                className={cn(
                                  "w-full min-h-0 rounded-sm border border-dashed flex items-center justify-center font-medium tabular-nums leading-none",
                                  hasBoth ? "h-[16px] text-[9px]" : "h-full text-xs",
                                  planOver
                                    ? "border-rose-400/70 text-rose-600 dark:text-rose-300"
                                    : "border-border text-muted-foreground",
                                )}
                                title={`Planificado ${fmt(planMin)}${capacityMin ? ` / cap ${fmt(capacityMin)}` : ""}`}
                              >
                                {hasBoth ? `est ${fmt(planMin)}` : fmt(planMin)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* Gantt bars area — expanded only */}
                    {!isCollapsed && (
                      <div className="absolute inset-x-0" style={{ top: STRIP_H, bottom: 0 }}>
                        {positioned.map((t) => (
                          <WorkloadGanttBar
                            key={t.id}
                            task={t}
                            colorMode={colorMode}
                            onClick={(id) => setSel({ id, ws: workspaceId })}
                          />
                        ))}
                      </div>
                    )}
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
      </div>

      {sel && (
        <TaskDetailDrawer taskId={sel.id} workspaceId={sel.ws} onClose={() => setSel(null)} />
      )}
    </div>
  );
}
