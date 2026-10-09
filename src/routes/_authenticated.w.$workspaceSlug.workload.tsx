import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, addDays, differenceInCalendarDays } from "date-fns";
import { es } from "date-fns/locale";

import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { getWorkspaceBySlug, getWeeklyWorkload } from "@/lib/api/tasko.functions";
import { listProjects } from "@/lib/api/projects.functions";
import { buildWindow, ZOOMS } from "@/components/tasko/workloadWindow";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronRight as ChevronRightSmall,
  AlertTriangle,
  FileQuestion,
  Search,
  Download,
  Filter,
  X,
} from "lucide-react";
import { MemberAvatar } from "@/components/tasko/MemberAvatar";
import { formatMinutes } from "@/components/tasko/TimeTab";
import { WorkloadCellPopover } from "@/components/tasko/WorkloadCellPopover";
import { TaskDetailDrawer } from "@/components/tasko/TaskDetailDrawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  packTasks,
  ganttRowHeight,
  WorkloadGanttBar,
} from "@/components/tasko/WorkloadGanttBar";
import { RouteError } from "@/components/tasko/RouteError";

const ROLES = ["owner", "admin", "super_admin", "member", "guest"] as const;

const workloadSearchSchema = z.object({
  projects: fallback(z.array(z.string()), []).default([]),
  roles: fallback(z.array(z.enum(ROLES)), []).default([]),
  q: fallback(z.string(), "").default(""),
  excludeInternal: fallback(z.boolean(), false).default(false),
  overflow: fallback(z.boolean(), false).default(false),
  zoom: fallback(z.enum(ZOOMS), "day").default("day"),
});

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/workload")({
  ssr: false,
  head: () => ({ meta: [{ title: "Carga de trabajo · Riel" }] }),
  validateSearch: zodValidator(workloadSearchSchema),
  loader: async ({ context, params }) => {
    const { requirePermission } = await import("@/lib/permissions-loader");
    await requirePermission(context.queryClient, params.workspaceSlug, "workload_view");
    return null;
  },
  errorComponent: RouteError,
  component: WorkloadPage,
});



function WorkloadPage() {
  const { workspaceSlug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const setSearch = (patch: Partial<z.infer<typeof workloadSearchSchema>>) =>
    navigate({
      to: ".",
      search: (prev: z.infer<typeof workloadSearchSchema>) => ({ ...prev, ...patch }),
      replace: true,
    });

  const fetchWs = useServerFn(getWorkspaceBySlug);
  const fetchWl = useServerFn(getWeeklyWorkload);
  const fetchProjects = useServerFn(listProjects);

  const wsQ = useQuery({
    queryKey: ["ws", workspaceSlug],
    queryFn: () => fetchWs({ data: { slug: workspaceSlug } }),
  });
  const projectsQ = useQuery({
    queryKey: ["projects", wsQ.data?.id],
    queryFn: () => fetchProjects({ data: { workspaceId: wsQ.data!.id } }),
    enabled: !!wsQ.data?.id,
  });

  const [anchor, setAnchor] = useState(() => new Date());
  const win = useMemo(() => buildWindow(anchor, search.zoom), [anchor, search.zoom]);
  const rangeStartStr = format(win.start, "yyyy-MM-dd");
  const rangeEndStr = format(win.end, "yyyy-MM-dd");

  const wlQ = useQuery({
    queryKey: [
      "workload",
      wsQ.data?.id,
      rangeStartStr,
      rangeEndStr,
      search.projects.join(","),
      search.excludeInternal,
    ],
    queryFn: () =>
      fetchWl({
        data: {
          workspaceId: wsQ.data!.id,
          weekStart: rangeStartStr, // backward compat field
          rangeStart: rangeStartStr,
          rangeEnd: rangeEndStr,
          projectIds: search.projects.length ? search.projects : undefined,
          excludeInternal: search.excludeInternal || undefined,
        },
      }),
    enabled: !!wsQ.data?.id,
  });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (uid: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });

  const [selectedTask, setSelectedTask] = useState<string | null>(null);

  const visibleMembers = useMemo(() => {
    return (wlQ.data?.members ?? []).filter((m) => {
      const name = (m.profile?.full_name ?? m.profile?.email ?? "").toLowerCase();
      if (search.q && !name.includes(search.q.toLowerCase())) return false;
      if (search.roles.length > 0 && !search.roles.includes(m.role as (typeof ROLES)[number]))
        return false;
      if (search.overflow) {
        const ov = win.columns.reduce(
          (acc, c) =>
            acc + c.days.reduce((a, d) => a + (m.days[d]?.overflowMin ?? 0), 0),
          0,
        );
        if (ov === 0) return false;
      }
      return true;
    });
  }, [wlQ.data, win.columns, search]);

  // Today vertical-line offset relative to columns container (in %)
  const todayPct = useMemo(() => {
    const todayDiff = differenceInCalendarDays(new Date(), win.start);
    if (todayDiff < 0 || todayDiff >= win.totalDays) return null;
    return ((todayDiff + 0.5) / win.totalDays) * 100;
  }, [win.start, win.totalDays]);

  const navStep = search.zoom === "day" ? 7 : search.zoom === "week" ? 28 : 56;

  const exportCsv = () => {
    const rows: string[][] = [];
    rows.push([
      "Miembro",
      "Email",
      "Rol",
      ...win.columns.flatMap((c) => [
        `${c.key} cap (min)`,
        `${c.key} asignado (min)`,
        `${c.key} logueado (min)`,
        `${c.key} overflow (min)`,
      ]),
      "Total asignado (min)",
      "Total capacidad (min)",
      "Total overflow (min)",
      "Sin planificar (count)",
      "Sin planificar (min)",
    ]);
    for (const m of visibleMembers) {
      const flat: string[] = [];
      let tAlloc = 0,
        tCap = 0,
        tOv = 0;
      for (const c of win.columns) {
        let cap = 0,
          al = 0,
          lg = 0,
          ov = 0;
        for (const d of c.days) {
          const cell = m.days[d];
          cap += cell?.capacityMin ?? 0;
          al += cell?.allocatedMin ?? 0;
          lg += cell?.loggedMin ?? 0;
          ov += cell?.overflowMin ?? 0;
        }
        flat.push(String(cap), String(Math.round(al)), String(lg), String(Math.round(ov)));
        tAlloc += al;
        tCap += cap;
        tOv += ov;
      }
      rows.push([
        m.profile?.full_name ?? "",
        m.profile?.email ?? "",
        m.role,
        ...flat,
        String(Math.round(tAlloc)),
        String(tCap),
        String(Math.round(tOv)),
        String(m.unplanned?.count ?? 0),
        String(Math.round(m.unplanned?.estimateMin ?? 0)),
      ]);
    }
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `workload-${rangeStartStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeFilterCount =
    (search.projects.length ? 1 : 0) +
    (search.roles.length ? 1 : 0) +
    (search.excludeInternal ? 1 : 0) +
    (search.overflow ? 1 : 0);

  const NAME_COL = 240;
  const gridTemplate = `${NAME_COL}px repeat(${win.columns.length}, minmax(0, 1fr))`;

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center justify-between">
        <h1 className="text-sm font-semibold">Carga de trabajo</h1>
        <div className="flex items-center gap-2">
          {wlQ.data?.tz && wlQ.data.tz !== "UTC" && (
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-2">
              TZ {wlQ.data.tz} · {wlQ.data.strategy}
            </span>
          )}

          {/* Zoom toggle */}
          <div className="inline-flex rounded-md border border-border bg-background p-0.5 mr-1">
            {ZOOMS.map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setSearch({ zoom: z })}
                className={cn(
                  "px-2 h-6 text-[11px] rounded-sm capitalize transition-colors",
                  search.zoom === z
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {z === "day" ? "Días" : z === "week" ? "Semanas" : "Mes"}
              </button>
            ))}
          </div>

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
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAnchor(new Date())}
            className="h-7 text-xs"
          >
            Hoy
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv} className="h-7 text-xs gap-1">
            <Download className="w-3 h-3" /> CSV
          </Button>
        </div>
      </header>

      <div className="px-6 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search.q}
            onChange={(e) => setSearch({ q: e.target.value })}
            placeholder="Filtrar miembro..."
            className="h-7 text-xs pl-7 w-56"
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
              <Filter className="w-3 h-3" />
              Proyectos
              {search.projects.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-4 rounded-full bg-primary text-primary-foreground text-[10px] px-1">
                  {search.projects.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <div className="max-h-72 overflow-y-auto p-2 space-y-1">
              {(projectsQ.data ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground italic p-2">Sin proyectos.</p>
              )}
              {(projectsQ.data ?? []).map((p) => {
                const checked = search.projects.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-xs"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) =>
                        setSearch({
                          projects: v
                            ? [...search.projects, p.id]
                            : search.projects.filter((id: string) => id !== p.id),
                        })
                      }
                    />
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: p.color ?? "#8b5cf6" }}
                    />
                    <span className="truncate flex-1">{p.name}</span>
                  </label>
                );
              })}
            </div>
            {search.projects.length > 0 && (
              <div className="border-t p-1">
                <button
                  type="button"
                  onClick={() => setSearch({ projects: [] })}
                  className="w-full text-xs text-muted-foreground hover:bg-accent rounded px-2 py-1 text-left"
                >
                  Limpiar selección
                </button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
              <Filter className="w-3 h-3" />
              Rol
              {search.roles.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-4 rounded-full bg-primary text-primary-foreground text-[10px] px-1">
                  {search.roles.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            <div className="space-y-1">
              {ROLES.map((r) => {
                const checked = search.roles.includes(r);
                return (
                  <label
                    key={r}
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-xs capitalize"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) =>
                        setSearch({
                          roles: v
                            ? [...search.roles, r]
                            : search.roles.filter((x: string) => x !== r),
                        })
                      }
                    />
                    {r}
                  </label>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <Checkbox
            checked={search.excludeInternal}
            onCheckedChange={(v) => setSearch({ excludeInternal: !!v })}
          />
          Excluir Interno y Marketing
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <Checkbox
            checked={search.overflow}
            onCheckedChange={(v) => setSearch({ overflow: !!v })}
          />
          Sólo sobreasignados
        </label>

        {activeFilterCount > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1 text-muted-foreground"
            onClick={() =>
              setSearch({ projects: [], roles: [], excludeInternal: false, overflow: false, q: "" })
            }
          >
            <X className="w-3 h-3" /> Limpiar
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="border border-border rounded-md overflow-hidden bg-card">
          {/* Header row */}
          <div
            className="grid bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground border-b border-border"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="px-3 py-2 border-r border-border">Miembro</div>
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

          {/* Members */}
          {visibleMembers.map((m) => {
            const isExpanded = expanded.has(m.user_id);
            const capDaily = m.capacity?.daily_hours ?? 8;
            const { positioned, lanesUsed, overflowCount } = packTasks(
              (m.tasks ?? []) as Parameters<typeof packTasks>[0],
              rangeStartStr,
              rangeEndStr,
            );
            const rowH = isExpanded ? ganttRowHeight(lanesUsed) : 0;
            const totalAlloc = win.columns.reduce(
              (acc, c) =>
                acc + c.days.reduce((a, d) => a + (m.days[d]?.allocatedMin ?? 0), 0),
              0,
            );
            const totalCap = win.columns.reduce(
              (acc, c) => acc + c.days.reduce((a, d) => a + (m.days[d]?.capacityMin ?? 0), 0),
              0,
            );

            return (
              <Fragment key={m.user_id}>
                {/* Summary row */}
                <div
                  className="grid border-b border-border hover:bg-accent/20 transition-colors relative"
                  style={{ gridTemplateColumns: gridTemplate }}
                >
                  <div className="px-3 py-2 border-r border-border flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleExpand(m.user_id)}
                      className="w-4 h-4 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
                      title={isExpanded ? "Colapsar" : "Expandir tareas"}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRightSmall className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <MemberAvatar profile={m.profile} size={26} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">
                        {m.profile?.full_name ?? m.profile?.email ?? "—"}
                      </div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">
                        {capDaily}h/día
                        {totalAlloc > 0 && (
                          <>
                            {" · "}
                            {Math.round((totalAlloc / 60) * 10) / 10}h /{" "}
                            {Math.round(totalCap / 60)}h
                          </>
                        )}
                        {m.unplanned && m.unplanned.count > 0 && (
                          <span
                            className="ml-1 inline-flex items-center gap-0.5 text-status-in-progress"
                            title={`${m.unplanned.count} sin planificar`}
                          >
                            · <FileQuestion className="w-2.5 h-2.5" />
                            {m.unplanned.count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {win.columns.map((c) => {
                    let cap = 0,
                      alloc = 0,
                      logged = 0,
                      overflow = 0,
                      isHoliday = true;
                    for (const d of c.days) {
                      const cell = m.days[d];
                      cap += cell?.capacityMin ?? 0;
                      alloc += cell?.allocatedMin ?? 0;
                      logged += cell?.loggedMin ?? 0;
                      overflow += cell?.overflowMin ?? 0;
                      if (!cell?.isHoliday) isHoliday = false;
                    }
                    const pct = cap > 0 ? (alloc / cap) * 100 : alloc > 0 ? 999 : 0;
                    const isOver = overflow > 0 || pct > 100;
                    const noCap = cap === 0 && alloc === 0;

                    return (
                      <div
                        key={c.key}
                        className={cn(
                          "border-r border-border last:border-r-0 relative",
                          c.isToday && "bg-destructive/[0.03]",
                        )}
                      >
                        <WorkloadCellPopover
                          workspaceId={wsQ.data!.id}
                          workspaceSlug={workspaceSlug}
                          userId={m.user_id}
                          day={c.days[0]}
                          enabled={alloc > 0 || logged > 0 || overflow > 0}
                        >
                          <button
                            type="button"
                            disabled={!(alloc > 0 || logged > 0 || overflow > 0)}
                            className={cn(
                              "w-full h-full text-center px-1 py-3 transition-colors block",
                              "disabled:cursor-default",
                              !noCap && !isHoliday && isOver && "bg-destructive/15",
                              !noCap && !isHoliday && !isOver && alloc > 0 && "bg-status-done/15",
                              !noCap && !isHoliday && alloc === 0 && "bg-muted/10",
                            )}
                          >
                            {noCap || isHoliday ? (
                              <span className="text-[10px] text-muted-foreground/50 italic">
                                {isHoliday ? "feriado" : "—"}
                              </span>
                            ) : alloc === 0 && logged === 0 ? (
                              <span className="text-[10px] text-muted-foreground/40">—</span>
                            ) : (
                              <div className="space-y-0.5">
                                <div
                                  className={cn(
                                    "text-xs font-semibold tabular-nums",
                                    isOver
                                      ? "text-destructive"
                                      : "text-foreground",
                                  )}
                                >
                                  {(alloc / 60).toFixed(alloc % 60 === 0 ? 0 : 2)}h
                                </div>
                                {cap > 0 && (
                                  <div className="text-[9px] text-muted-foreground/70 tabular-nums">
                                    / {Math.round(cap / 60)}h
                                  </div>
                                )}
                                {overflow > 0 && (
                                  <div className="text-[9px] text-destructive inline-flex items-center gap-0.5">
                                    <AlertTriangle className="w-2.5 h-2.5" />+
                                    {formatMinutes(overflow)}
                                  </div>
                                )}
                                {logged > 0 && (
                                  <div className="text-[9px] text-muted-foreground tabular-nums">
                                    ⏱ {formatMinutes(logged)}
                                  </div>
                                )}
                              </div>
                            )}
                          </button>
                        </WorkloadCellPopover>
                      </div>
                    );
                  })}
                  {/* Today line overlay (rendered only over column area) */}
                  {todayPct !== null && (
                    <div
                      className="pointer-events-none absolute top-0 bottom-0 right-0"
                      style={{ left: `${NAME_COL}px` }}
                    >
                      <div
                        className="absolute top-0 bottom-0 w-px bg-destructive/80"
                        style={{ left: `${todayPct}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Expanded Gantt row */}
                {isExpanded && (
                  <div
                    className="grid border-b border-border bg-muted/10"
                    style={{ gridTemplateColumns: gridTemplate }}
                  >
                    <div className="px-3 py-2 border-r border-border text-[10px] text-muted-foreground">
                      {positioned.length} tarea{positioned.length === 1 ? "" : "s"}
                      {overflowCount > 0 && (
                        <span className="ml-1 text-status-in-progress">+{overflowCount} más</span>
                      )}
                    </div>
                    <div
                      className="relative"
                      style={{
                        gridColumn: `2 / -1`,
                        height: Math.max(rowH, 32),
                      }}
                    >
                      {/* Column separators inside gantt area */}
                      <div
                        className="absolute inset-0 grid pointer-events-none"
                        style={{
                          gridTemplateColumns: `repeat(${win.columns.length}, minmax(0, 1fr))`,
                        }}
                      >
                        {win.columns.map((c) => (
                          <div
                            key={c.key}
                            className="border-r border-border/50 last:border-r-0"
                          />
                        ))}
                      </div>
                      {positioned.length === 0 ? (
                        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground italic">
                          Sin tareas asignadas en esta ventana
                        </div>
                      ) : (
                        positioned.map((t) => (
                          <WorkloadGanttBar
                            key={t.id}
                            task={t}
                            onClick={(id) => setSelectedTask(id)}
                          />
                        ))
                      )}
                      {/* Today line within gantt */}
                      {todayPct !== null && (
                        <div
                          className="pointer-events-none absolute top-0 bottom-0 w-px bg-destructive/80"
                          style={{ left: `${todayPct}%` }}
                        />
                      )}
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })}

          {visibleMembers.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground italic">
              Sin miembros para mostrar.
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-1.5 bg-status-done/40 rounded-sm" /> Dentro de capacidad
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-1.5 bg-destructive/40 rounded-sm" /> Sobreasignado
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-px h-3 bg-destructive" /> Hoy
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FileQuestion className="w-3 h-3 text-status-in-progress" /> Sin planificar
          </span>
          <span className="inline-flex items-center gap-1.5">
            Click chevron → tareas como barras estilo Gantt
          </span>
        </div>
      </div>

      {wsQ.data && (
        <TaskDetailDrawer
          taskId={selectedTask}
          workspaceId={wsQ.data.id}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
}
