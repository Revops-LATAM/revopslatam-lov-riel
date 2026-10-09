import { cn } from "@/lib/utils";
import { isCompleted, getTaskStatus, type TaskStatusCategory } from "@/lib/tasko/status";

export type ColorMode = "project" | "status";

const STATUS_COLOR: Record<TaskStatusCategory, string> = {
  abierta: "#94a3b8",
  en_progreso: "#3b82f6",
  bloqueada: "#f59e0b",
  completada: "#22c55e",
  cancelada: "#71717a",
};

const STATUS_LABEL: Record<TaskStatusCategory, string> = {
  abierta: "Abierta",
  en_progreso: "En progreso",
  bloqueada: "Bloqueada",
  completada: "Completada",
  cancelada: "Cancelada",
};

export const STATUS_LEGEND: { category: TaskStatusCategory; color: string; label: string }[] =
  (Object.keys(STATUS_COLOR) as TaskStatusCategory[]).map((c) => ({
    category: c,
    color: STATUS_COLOR[c],
    label: STATUS_LABEL[c],
  }));


export type GanttTask = {
  id: string;
  title: string;
  color: string | null;
  area?: "operations" | "marketing" | "finance" | "internal" | null;
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
};

export type PositionedTask = GanttTask & {
  leftPct: number;
  widthPct: number;
  lane: number;
};

const LANE_HEIGHT = 24; // px
const LANE_GAP = 4;
const MAX_LANES = 32;

function diffDays(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.round((db - da) / 86_400_000);
}

/**
 * Pack tasks into horizontal lanes (first-fit). Clips to window.
 * Returns positioned tasks + lane count used.
 */
export function packTasks(
  tasks: GanttTask[],
  windowStart: string,
  windowEnd: string,
): { positioned: PositionedTask[]; lanesUsed: number; overflowCount: number } {
  const totalDays = diffDays(windowStart, windowEnd) + 1;
  const items = tasks
    .map((t) => {
      const start = t.start_date ?? t.due_date;
      const end = t.due_date ?? t.start_date;
      if (!start || !end) return null;
      const effStart = start < windowStart ? windowStart : start;
      const effEnd = end > windowEnd ? windowEnd : end;
      if (effStart > effEnd) return null;
      const startIdx = diffDays(windowStart, effStart);
      const endIdx = diffDays(windowStart, effEnd);
      const spanDays = endIdx - startIdx + 1;
      return {
        task: t,
        startIdx,
        endIdx,
        leftPct: (startIdx / totalDays) * 100,
        widthPct: (spanDays / totalDays) * 100,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => a.startIdx - b.startIdx || b.endIdx - a.endIdx);

  // First-fit packing
  const laneEnds: number[] = []; // last endIdx per lane
  const positioned: PositionedTask[] = [];
  let overflowCount = 0;
  for (const it of items) {
    let lane = laneEnds.findIndex((endIdx) => endIdx < it.startIdx);
    if (lane === -1) {
      if (laneEnds.length >= MAX_LANES) {
        overflowCount += 1;
        continue;
      }
      lane = laneEnds.length;
      laneEnds.push(it.endIdx);
    } else {
      laneEnds[lane] = it.endIdx;
    }
    positioned.push({ ...it.task, leftPct: it.leftPct, widthPct: it.widthPct, lane });
  }
  return { positioned, lanesUsed: laneEnds.length, overflowCount };
}

export function ganttRowHeight(lanesUsed: number): number {
  if (lanesUsed === 0) return 0;
  return lanesUsed * (LANE_HEIGHT + LANE_GAP) + LANE_GAP;
}

export function WorkloadGanttBar({
  task,
  onClick,
  colorMode = "project",
}: {
  task: PositionedTask;
  onClick?: (taskId: string) => void;
  colorMode?: ColorMode;
}) {
  const isInternal = task.area === "internal";
  const statusTask = task as Parameters<typeof getTaskStatus>[0];
  const isDone = isCompleted(statusTask);
  const statusCategory = getTaskStatus(statusTask).category;
  const projectColor = isInternal ? "#0ea5e9" : (task.color ?? "hsl(var(--primary))");
  const color = colorMode === "status" ? STATUS_COLOR[statusCategory] : projectColor;
  const useStripes = colorMode === "project" && isInternal;
  return (
    <button
      type="button"
      onClick={() => onClick?.(task.id)}
      className={cn(
        "absolute rounded-md text-[11px] font-medium truncate px-2 text-left transition-all flex items-center gap-1",
        "hover:ring-2 hover:ring-foreground/20 hover:z-10",
        isDone && colorMode === "project" && "opacity-60 line-through",
        colorMode === "status" && statusCategory === "cancelada" && "line-through opacity-70",
        useStripes && "border border-white/30",
      )}
      style={{
        left: `${task.leftPct}%`,
        width: `calc(${task.widthPct}% - 2px)`,
        top: task.lane * (LANE_HEIGHT + LANE_GAP) + LANE_GAP,
        height: LANE_HEIGHT,
        background: useStripes
          ? `repeating-linear-gradient(45deg, #0ea5e9 0 6px, #0284c7 6px 12px)`
          : color,
        color: pickReadableColor(color),
      }}
      title={`${isInternal ? "[Interno] " : ""}${task.title} · ${STATUS_LABEL[statusCategory]} · ${(task.totalMin / 60).toFixed(1)}h`}
    >
      {task.widthPct > 4 ? task.title : ""}
    </button>
  );
}

// Heuristic: dark text on light backgrounds, white on dark.
function pickReadableColor(bg: string): string {
  // Accept hex like #rrggbb
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return "hsl(var(--foreground))";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // Perceptual luminance
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1a1a1a" : "#ffffff";
}

