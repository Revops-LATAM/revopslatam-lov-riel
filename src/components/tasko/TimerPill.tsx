import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { listMyTasks } from "@/lib/api/tasks.functions";
import { Button } from "@/components/ui/button";
import { Square, Timer, Repeat2, Loader2, Pause, Play, GripVertical } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useActiveTimer } from "@/hooks/use-active-timer";
import { cn } from "@/lib/utils";

const PAUSED_KEY = "tasko:paused-task";
const POS_KEY = "tasko:timer-pill-pos";

type Pos = { x: number; y: number };

function DraggablePill({ children, className }: { children: ReactNode; className?: string }) {
  const [pos, setPos] = useState<Pos | null>(null);
  const dragState = useRef<{ dx: number; dy: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) setPos(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const clamp = (x: number, y: number): Pos => {
    const el = ref.current;
    const w = el?.offsetWidth ?? 200;
    const h = el?.offsetHeight ?? 40;
    const maxX = Math.max(0, window.innerWidth - w - 4);
    const maxY = Math.max(0, window.innerHeight - h - 4);
    return { x: Math.min(Math.max(4, x), maxX), y: Math.min(Math.max(4, y), maxY) };
  };

  const onMove = useCallback((e: PointerEvent) => {
    if (!dragState.current) return;
    const { dx, dy } = dragState.current;
    setPos((prev) => {
      const next = { x: e.clientX - dx, y: e.clientY - dy };
      const clamped = (() => {
        const el = ref.current;
        const w = el?.offsetWidth ?? 200;
        const h = el?.offsetHeight ?? 40;
        return {
          x: Math.min(Math.max(4, next.x), Math.max(0, window.innerWidth - w - 4)),
          y: Math.min(Math.max(4, next.y), Math.max(0, window.innerHeight - h - 4)),
        };
      })();
      return clamped;
    });
  }, []);

  const onUp = useCallback(() => {
    dragState.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    setPos((p) => {
      if (p) {
        try {
          localStorage.setItem(POS_KEY, JSON.stringify(p));
        } catch {
          /* ignore */
        }
      }
      return p;
    });
  }, [onMove]);

  const onHandleDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Initialize fixed pos at current rect if not already floating
    if (!pos) setPos(clamp(rect.left, rect.top));
    dragState.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const style: React.CSSProperties = pos
    ? { position: "fixed", left: pos.x, top: pos.y, zIndex: 60 }
    : {};

  return (
    <div ref={ref} style={style} className={cn("select-none", className)}>
      <div className="flex items-center">
        <button
          type="button"
          onPointerDown={onHandleDown}
          className="cursor-grab active:cursor-grabbing p-1 -mr-1 text-muted-foreground hover:text-foreground touch-none"
          aria-label="Arrastrar"
          title="Arrastrar para mover"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        {children}
      </div>
    </div>
  );
}

function fmt(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type PausedRef = { taskId: string; title: string; projectId?: string };

export function TimerPill({
  workspaceSlug,
  workspaceId,
}: {
  workspaceSlug: string;
  workspaceId: string;
}) {
  const { entry, elapsedSecs, stop, start, switchTask, isMutating } = useActiveTimer();
  const [switchOpen, setSwitchOpen] = useState(false);
  const [paused, setPaused] = useState<PausedRef | null>(null);

  // Load paused ref from localStorage (client only)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PAUSED_KEY);
      if (raw) setPaused(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  // Clear paused once a timer is running again
  useEffect(() => {
    if (entry && paused && entry.task_id === paused.taskId) {
      localStorage.removeItem(PAUSED_KEY);
      setPaused(null);
    }
  }, [entry, paused]);

  const handlePause = () => {
    if (!entry || !entry.task_id) {
      stop();
      return;
    }
    const ref: PausedRef = {
      taskId: entry.task_id,
      title: entry.task?.title ?? "Tarea",
      projectId: entry.task?.project_id,
    };
    try {
      localStorage.setItem(PAUSED_KEY, JSON.stringify(ref));
    } catch {
      /* ignore */
    }
    setPaused(ref);
    stop();
  };

  const handleResume = () => {
    if (!paused) return;
    start(paused.taskId);
  };

  const handleDiscardPaused = () => {
    localStorage.removeItem(PAUSED_KEY);
    setPaused(null);
  };

  // Show paused pill when no active timer
  if (!entry) {
    if (!paused) return null;
    return (
      <DraggablePill>
        <div className="flex items-center gap-1 rounded-full border border-border bg-muted/40 pl-2 pr-1 py-1 shadow-sm backdrop-blur">
          <Pause className="w-3.5 h-3.5 text-muted-foreground" />
          {paused.projectId ? (
            <Link
              to="/w/$workspaceSlug/projects/$projectId"
              params={{ workspaceSlug, projectId: paused.projectId }}
              search={{ task: paused.taskId }}
              className="text-xs font-medium hover:underline max-w-[180px] truncate text-muted-foreground"
              title={paused.title}
            >
              {paused.title}
            </Link>
          ) : (
            <span className="text-xs font-medium max-w-[180px] truncate text-muted-foreground">
              {paused.title}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider ml-1">
            pausada
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="w-6 h-6 rounded-full"
            onClick={handleResume}
            disabled={isMutating}
            aria-label="Reanudar"
            title="Reanudar"
          >
            <Play className="w-3 h-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="w-6 h-6 rounded-full"
            onClick={handleDiscardPaused}
            aria-label="Descartar"
            title="Descartar"
          >
            <Square className="w-3 h-3" />
          </Button>
        </div>
      </DraggablePill>
    );
  }

  const projectId = entry.task?.project_id;
  const title = entry.task?.title ?? "Tarea";

  return (
    <DraggablePill>
      <div className="flex items-center gap-1 rounded-full border border-status-in-progress/40 bg-status-in-progress/10 pl-2 pr-1 py-1 shadow-sm backdrop-blur">
        {projectId ? (
          <Link
            to="/w/$workspaceSlug/projects/$projectId"
            params={{ workspaceSlug, projectId }}
            search={{ task: entry.task_id ?? undefined }}
            className="flex items-center gap-1 hover:opacity-80 transition-opacity"
            title={`Ir a: ${title}`}
          >
            <Timer className="w-3.5 h-3.5 text-status-in-progress animate-pulse" />
            <span className="text-xs font-medium max-w-[180px] truncate hover:underline">
              {title}
            </span>
            <span className="text-xs tabular-nums font-semibold text-status-in-progress ml-1">
              {fmt(elapsedSecs)}
            </span>
          </Link>
        ) : (
          <>
            <Timer className="w-3.5 h-3.5 text-status-in-progress animate-pulse" />
            <span className="text-xs font-medium max-w-[180px] truncate">{title}</span>
            <span className="text-xs tabular-nums font-semibold text-status-in-progress ml-1">
              {fmt(elapsedSecs)}
            </span>
          </>
        )}

        <Popover open={switchOpen} onOpenChange={setSwitchOpen}>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="w-6 h-6 rounded-full"
              aria-label="Cambiar tarea"
              title="Cambiar tarea"
            >
              <Repeat2 className="w-3 h-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="end">
            <SwitchList
              workspaceId={workspaceId}
              currentTaskId={entry.task_id ?? ""}
              onPick={(taskId) => {
                setSwitchOpen(false);
                switchTask(taskId);
              }}
            />
          </PopoverContent>
        </Popover>

        <Button
          size="icon"
          variant="ghost"
          className="w-6 h-6 rounded-full"
          onClick={handlePause}
          disabled={isMutating}
          aria-label="Pausar"
          title="Pausar (reanudar luego)"
        >
          <Pause className="w-3 h-3" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className="w-6 h-6 rounded-full"
          onClick={() => stop()}
          disabled={isMutating}
          aria-label="Detener timer"
          title="Detener"
        >
          <Square className="w-3 h-3" />
        </Button>
      </div>
    </DraggablePill>
  );
}

function SwitchList({
  workspaceId,
  currentTaskId,
  onPick,
}: {
  workspaceId: string;
  currentTaskId: string;
  onPick: (taskId: string) => void;
}) {
  const fetchFn = useServerFn(listMyTasks);
  const q = useQuery({
    queryKey: ["my-tasks", workspaceId],
    queryFn: () => fetchFn({ data: { workspaceId } }),
    staleTime: 30_000,
  });

  if (q.isLoading) {
    return (
      <div className="p-4 text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-3 h-3 animate-spin" /> Cargando...
      </div>
    );
  }
  const tasks = (q.data ?? []).filter((t) => t.id !== currentTaskId);

  return (
    <div className="max-h-80 overflow-y-auto">
      <div className="px-3 py-2 border-b text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Cambiar a otra tarea
      </div>
      {tasks.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground italic">
          No tienes otras tareas asignadas.
        </p>
      ) : (
        <ul className="py-1">
          {tasks.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onPick(t.id)}
                className="w-full text-left flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-xs"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: t.project?.color ?? "#8b5cf6" }}
                />
                <span className="flex-1 truncate">{t.title}</span>
                <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                  {t.project?.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
