import { type ReactNode, useMemo, useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTaskDependencies } from "@/lib/api/dependencies.functions";
import { differenceInCalendarDays, parseISO, addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { GitBranch } from "lucide-react";

type Task = {
  id: string;
  title: string;
  start_date: string | null;
  due_date: string | null;
  phase_id: string | null;
  task_statuses?: { color: string | null; name?: string | null } | null;
};

type Phase = { id: string; name: string; color: string | null; order_index: number };

const DAY_WIDTH = 28;
const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 40;
const LABEL_WIDTH = 260;

// Fallback palette for phases without a color set
const PHASE_PALETTE = [
  "#6224BE", "#0ea5e9", "#22c55e", "#f59e0b",
  "#ec4899", "#14b8a6", "#8b5cf6", "#ef4444",
];


type Dependency = { id: string; predecessor_task_id: string; successor_task_id: string };

export function ProjectGanttView({
  projectId,
  tasks,
  phases,
  onOpenTask,
  dependencies,
  headerRight,
}: {
  projectId: string;
  tasks: Task[];
  phases: Phase[];
  onOpenTask: (id: string) => void;
  dependencies?: Dependency[];
  headerRight?: ReactNode;
}) {
  const listDeps = useServerFn(listTaskDependencies);
  const depsQ = useQuery({
    queryKey: ["task-deps", projectId],
    queryFn: () => listDeps({ data: { projectId } }),
    enabled: dependencies === undefined,
  });

  const scheduled = useMemo(
    () => tasks.filter((t) => t.start_date && t.due_date),
    [tasks],
  );

  const range = useMemo(() => {
    if (scheduled.length === 0) {
      const today = new Date();
      return { start: today, days: 30 };
    }
    let min = parseISO(scheduled[0].start_date!);
    let max = parseISO(scheduled[0].due_date!);
    for (const t of scheduled) {
      const s = parseISO(t.start_date!);
      const e = parseISO(t.due_date!);
      if (s < min) min = s;
      if (e > max) max = e;
    }
    min = addDays(min, -2);
    max = addDays(max, 4);
    return { start: min, days: Math.max(differenceInCalendarDays(max, min), 30) };
  }, [scheduled]);

  const grouped = useMemo(() => {
    const byPhase = new Map<string | null, Task[]>();
    for (const t of scheduled) {
      const arr = byPhase.get(t.phase_id) ?? [];
      arr.push(t);
      byPhase.set(t.phase_id, arr);
    }
    const groups: { phase: Phase | null; tasks: Task[]; color: string }[] = [];
    let pi = 0;
    for (const ph of phases) {
      const list = byPhase.get(ph.id);
      if (list) {
        const color = ph.color || PHASE_PALETTE[pi % PHASE_PALETTE.length];
        groups.push({ phase: ph, tasks: list, color });
        pi += 1;
      }
    }
    const orphan = byPhase.get(null);
    if (orphan) groups.push({ phase: null, tasks: orphan, color: "#64748b" });
    return groups;
  }, [scheduled, phases]);


  // Row index per task (including phase header rows)
  const rowIndex = useMemo(() => {
    const idx = new Map<string, number>();
    let row = 0;
    for (const g of grouped) {
      row += 1; // phase header row
      for (const t of g.tasks) {
        idx.set(t.id, row);
        row += 1;
      }
    }
    return { map: idx, total: row };
  }, [grouped]);

  const dayToX = (d: Date) => differenceInCalendarDays(d, range.start) * DAY_WIDTH;

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const chartWidth = Math.max(range.days * DAY_WIDTH, containerWidth - LABEL_WIDTH);
  const chartHeight = HEADER_HEIGHT + rowIndex.total * ROW_HEIGHT;
  const today = new Date();
  const todayX = dayToX(today);

  const deps = dependencies ?? depsQ.data ?? [];
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t] as const)), [tasks]);

  if (scheduled.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
        <GitBranch className="w-8 h-8 opacity-40" />
        <span>Sin tareas con fechas para mostrar en Gantt</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-background">
      {headerRight && (
        <div className="shrink-0 flex justify-end gap-2 px-3 py-2 bg-background border-b border-border">
          {headerRight}
        </div>
      )}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-auto">
        <div style={{ width: LABEL_WIDTH + chartWidth, position: "relative" }}>
        {/* Header con fechas */}
        <div
          className="sticky top-0 z-20 bg-background border-b border-border flex"
          style={{ height: HEADER_HEIGHT }}
        >
          <div
            className="shrink-0 border-r border-border px-3 flex items-center text-xs font-semibold text-muted-foreground"
            style={{ width: LABEL_WIDTH }}
          >
            Tareas
          </div>
          <div className="relative" style={{ width: chartWidth, height: HEADER_HEIGHT }}>
            {Array.from({ length: range.days }).map((_, i) => {
              const d = addDays(range.start, i);
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              const isMonthStart = d.getDate() === 1;
              return (
                <div
                  key={i}
                  className={`absolute top-0 bottom-0 border-r ${
                    isMonthStart ? "border-border" : "border-border/30"
                  } ${isWeekend ? "bg-muted/40" : ""}`}
                  style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}
                >
                  <div className="text-[9px] text-muted-foreground text-center pt-0.5">
                    {isMonthStart ? format(d, "MMM", { locale: es }) : ""}
                  </div>
                  <div className="text-[10px] text-center tabular-nums">
                    {d.getDate()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="relative flex" style={{ minHeight: chartHeight - HEADER_HEIGHT }}>
          {/* Labels */}
          <div
            className="shrink-0 border-r border-border sticky left-0 bg-background z-10"
            style={{ width: LABEL_WIDTH }}
          >
            {grouped.map((g) => (
              <div key={g.phase?.id ?? "none"}>
                <div
                  className="h-8 px-3 flex items-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border bg-muted/30"
                  style={{ borderLeft: `3px solid ${g.color}` }}
                >
                  {g.phase?.name ?? "Sin fase"}
                </div>
                {g.tasks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onOpenTask(t.id)}
                    className="w-full h-8 px-3 flex items-center text-xs text-left hover:bg-muted/50 border-b border-border/50 truncate"
                    title={t.title}
                  >
                    <span className="truncate">{t.title}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="relative" style={{ width: chartWidth }}>
            {/* Grid rows */}
            {Array.from({ length: rowIndex.total }).map((_, i) => (
              <div
                key={i}
                className="absolute left-0 right-0 border-b border-border/50"
                style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}
              />
            ))}
            {/* Vertical day lines / weekends */}
            {Array.from({ length: range.days }).map((_, i) => {
              const d = addDays(range.start, i);
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div
                  key={i}
                  className={`absolute top-0 bottom-0 border-r border-border/20 ${
                    isWeekend ? "bg-muted/30" : ""
                  }`}
                  style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}
                />
              );
            })}
            {/* Today line */}
            {todayX >= 0 && todayX <= chartWidth && (
              <div
                className="absolute top-0 bottom-0 w-px bg-primary/60 z-10"
                style={{ left: todayX }}
              />
            )}

            {/* Bars */}
            {grouped.map((g) => (
              <div key={g.phase?.id ?? "none"}>
                {/* phase spacer row */}
                {g.tasks.map((t) => {
                  const row = rowIndex.map.get(t.id)!;
                  const s = parseISO(t.start_date!);
                  const e = parseISO(t.due_date!);
                  const x = dayToX(s);
                  const w = Math.max((differenceInCalendarDays(e, s) + 1) * DAY_WIDTH - 2, 6);
                  const color = t.task_statuses?.color || g.color;
                  return (
                    <button
                      key={t.id}
                      onClick={() => onOpenTask(t.id)}
                      className="absolute rounded text-white text-[11px] px-1.5 truncate hover:brightness-110 shadow-sm"
                      style={{
                        left: x,
                        top: row * ROW_HEIGHT + 4,
                        width: w,
                        height: ROW_HEIGHT - 8,
                        backgroundColor: color,
                      }}
                      data-task-bar={t.id}
                      title={`${t.title} · ${format(s, "dd/MM", { locale: es })} → ${format(e, "dd/MM", { locale: es })}`}
                    >
                      <span className="truncate block">{t.title}</span>
                    </button>
                  );
                })}
              </div>
            ))}

            {/* SVG dependencies */}
            <svg
              className="absolute inset-0 pointer-events-none"
              width={chartWidth}
              height={chartHeight}
              style={{ overflow: "visible" }}
            >
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--muted-foreground))" />
                </marker>
              </defs>
              {deps.map((d) => {
                const pred = taskById.get(d.predecessor_task_id);
                const succ = taskById.get(d.successor_task_id);
                if (!pred || !succ) return null;
                const predRow = rowIndex.map.get(pred.id);
                const succRow = rowIndex.map.get(succ.id);
                if (predRow == null || succRow == null) return null;
                if (!pred.due_date || !succ.start_date) return null;
                const x1 = dayToX(parseISO(pred.due_date)) + DAY_WIDTH - 2;
                const y1 = predRow * ROW_HEIGHT + ROW_HEIGHT / 2;
                const x2 = dayToX(parseISO(succ.start_date));
                const y2 = succRow * ROW_HEIGHT + ROW_HEIGHT / 2;
                const midX = x1 + Math.max(10, (x2 - x1) / 2);
                const path = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
                return (
                  <path
                    key={d.id}
                    d={path}
                    fill="none"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={1.2}
                    strokeDasharray="3 3"
                    markerEnd="url(#arrow)"
                  />
                );
              })}
            </svg>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
