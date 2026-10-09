import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO, formatDistanceStrict } from "date-fns";
import { es } from "date-fns/locale";
import {
  listTimeEntries,
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  startTimer,
  stopTimer,
  getActiveTimer,
  getTask,
  updateTask,
} from "@/lib/api/tasko.functions";
import { listTaskEstimates } from "@/lib/api/time.functions";
import { setTaskEstimateForUser, resetTaskEstimateSplit } from "@/lib/api/tasks.functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MemberAvatar } from "./MemberAvatar";
import { Play, Square, Plus, Trash2, Timer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentProfileQO } from "@/lib/api/auth.queries";

type Member = {
  user_id: string;
  profile: {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
};

// Parses inputs like "1h30", "1.5", "90m", "1:30" → minutes
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  // hh:mm
  const colon = s.match(/^(\d+):(\d{1,2})$/);
  if (colon) return parseInt(colon[1]) * 60 + parseInt(colon[2]);
  // 1h30, 1h 30m, 1h, 30m
  const hm = s.match(/^(?:(\d+(?:\.\d+)?)h)?\s*(?:(\d+)m)?$/);
  if (hm && (hm[1] || hm[2])) {
    return Math.round(parseFloat(hm[1] || "0") * 60 + parseInt(hm[2] || "0"));
  }
  // decimal hours: "1.5", "2"
  const n = parseFloat(s);
  if (!Number.isNaN(n)) return Math.round(n * 60);
  return null;
}

export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Smart parser (Wrike-like). Accepts: "2h", "30m", "1h30m", "1h 30", "1:30",
// "90" (treated as hours), "1.5h", "1,5h", "2 horas", "45 min", "45 minutos".
// Returns hours as decimal, or null if invalid.
export function parseDurationToHours(input: string): number | null {
  const raw = input.trim().toLowerCase().replace(",", ".");
  if (!raw) return null;
  // hh:mm
  const colon = raw.match(/^(\d+):(\d{1,2})$/);
  if (colon) return parseInt(colon[1]) + parseInt(colon[2]) / 60;
  // Bare number → hours (matches the previous default unit)
  if (/^\d+(?:\.\d+)?$/.test(raw)) return parseFloat(raw);
  // Sum of tokens: 1h 30m, 1h30min, 2 horas 15 minutos, 45m, 2h
  const tokenRe = /(\d+(?:\.\d+)?)\s*(horas?|hrs?|hs?|h|minutos?|mins?|m)/g;
  let hours = 0;
  let matched = false;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(raw)) !== null) {
    matched = true;
    // Verify only whitespace exists between the previous token and this one
    for (let i = lastIndex; i < match.index; i++) {
      if (raw[i] !== " " && raw[i] !== "\t") return null;
    }
    lastIndex = match.index + match[0].length;
    hours += match[2].startsWith("h") ? parseFloat(match[1]) : parseFloat(match[1]) / 60;
  }
  if (!matched) return null;
  // Verify only whitespace remains after the last token
  for (let i = lastIndex; i < raw.length; i++) {
    if (raw[i] !== " " && raw[i] !== "\t") return null;
  }
  return hours;
}

// Format decimal hours back into a Wrike-style compact string.
export function formatDuration(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0h";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function TimeTab({ taskId, members }: { taskId: string; members: Member[] }) {
  const { data: currentProfile } = useQuery(currentProfileQO());
  const currentUserId = currentProfile?.id ?? null;

  const qc = useQueryClient();

  const fetchEntries = useServerFn(listTimeEntries);
  const fetchActive = useServerFn(getActiveTimer);
  const fetchTask = useServerFn(getTask);
  const fetchEstimates = useServerFn(listTaskEstimates);
  const setEstimateFn = useServerFn(setTaskEstimateForUser);
  const resetEstimatesFn = useServerFn(resetTaskEstimateSplit);
  const createEntryFn = useServerFn(createTimeEntry);
  const updateEntryFn = useServerFn(updateTimeEntry);
  const deleteEntryFn = useServerFn(deleteTimeEntry);
  const startTimerFn = useServerFn(startTimer);
  const stopTimerFn = useServerFn(stopTimer);
  const updateTaskFn = useServerFn(updateTask);

  const entriesQ = useQuery({
    queryKey: ["entries", taskId],
    queryFn: () => fetchEntries({ data: { taskId } }),
  });
  const activeQ = useQuery({
    queryKey: ["active-timer"],
    queryFn: () => fetchActive(),
    refetchInterval: 15000,
  });
  const taskQ = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => fetchTask({ data: { taskId } }),
  });
  const estimatesQ = useQuery({
    queryKey: ["taskEstimates", taskId],
    queryFn: () => fetchEstimates({ data: { taskId } }),
  });

  // Realtime: refrescar al cambiar entries de esta tarea
  useEffect(() => {
    const ch = supabase
      .channel(`time-task-${taskId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "time_entries", filter: `task_id=eq.${taskId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["entries", taskId] });
          qc.invalidateQueries({ queryKey: ["active-timer"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [taskId, qc]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["entries", taskId] });
    qc.invalidateQueries({ queryKey: ["active-timer"] });
    qc.invalidateQueries({ queryKey: ["activity", taskId] });
    qc.invalidateQueries({ queryKey: ["task", taskId] });
    qc.invalidateQueries({ queryKey: ["taskEstimates", taskId] });
    qc.invalidateQueries({ queryKey: ["workload"] });
  };

  const updateTaskMut = useMutation({
    mutationFn: (vars: {
      effortMode?: "basic" | "flexible" | "fixed_daily" | "due_date";
      totalEffortHours?: number | null;
    }) => updateTaskFn({ data: { taskId, ...vars } }),
    onSuccess: invalidateAll,
    onError: (e: Error) => toast.error(e.message),
  });
  const startMut = useMutation({
    mutationFn: () => startTimerFn({ data: { taskId } }),
    onSuccess: () => {
      invalidateAll();
      toast.success("Timer iniciado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const stopMut = useMutation({
    mutationFn: () => stopTimerFn(),
    onSuccess: () => {
      invalidateAll();
      toast.success("Timer detenido");
    },
  });
  const createEntryMut = useMutation({
    mutationFn: (vars: {
      startedAt: string;
      endedAt: string;
      note?: string;
      isBillable: boolean;
    }) => createEntryFn({ data: { taskId, ...vars } }),
    onSuccess: () => {
      invalidateAll();
      toast.success("Tiempo agregado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateEntryMut = useMutation({
    mutationFn: (vars: {
      id: string;
      startedAt?: string;
      endedAt?: string;
      note?: string | null;
      isBillable?: boolean;
    }) => updateEntryFn({ data: vars }),
    onSuccess: invalidateAll,
  });
  const deleteEntryMut = useMutation({
    mutationFn: (id: string) => deleteEntryFn({ data: { id } }),
    onSuccess: invalidateAll,
  });

  const entries = entriesQ.data ?? [];

  const totalEstimateMin = useMemo(() => {
    const h = taskQ.data?.total_effort_hours;
    return h != null ? Math.round(Number(h) * 60) : 0;
  }, [taskQ.data?.total_effort_hours]);

  const totalActualMin = useMemo(
    () => entries.reduce((acc, e) => acc + (e.duration_minutes ?? 0), 0),
    [entries],
  );

  const variancePct =
    totalEstimateMin > 0
      ? Math.round(((totalActualMin - totalEstimateMin) / totalEstimateMin) * 100)
      : null;

  const activeTimer = activeQ.data;
  const activeIsThisTask = activeTimer && activeTimer.task_id === taskId;

  // tick para el cronómetro vivo
  const [, force] = useState(0);

  useEffect(() => {
    if (!activeIsThisTask) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [activeIsThisTask]);

  const liveMinutes = activeIsThisTask
    ? Math.floor((Date.now() - new Date(activeTimer.started_at).getTime()) / 60000)
    : 0;
  const liveSecondsRem = activeIsThisTask
    ? Math.floor((Date.now() - new Date(activeTimer.started_at).getTime()) / 1000) % 60
    : 0;

  const displayedActualMin = totalActualMin + liveMinutes;

  return (
    <div className="space-y-5">
      {/* Resumen estimado vs real */}
      <div className="border border-border rounded-lg p-3 bg-card/50">
        <div className="flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Estimado
              </div>
              <div className="font-semibold tabular-nums">{formatMinutes(totalEstimateMin)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Real
              </div>
              <div className="font-semibold tabular-nums">
                {formatMinutes(displayedActualMin)}
                {activeIsThisTask && (
                  <span className="ml-1 text-status-in-progress text-xs">
                    +{String(liveSecondsRem).padStart(2, "0")}s
                  </span>
                )}
              </div>
            </div>
            {variancePct !== null && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Variación
                </div>
                <div
                  className={`font-semibold tabular-nums ${
                    variancePct > 10
                      ? "text-destructive"
                      : variancePct < -10
                        ? "text-status-done"
                        : "text-foreground"
                  }`}
                >
                  {variancePct > 0 ? "+" : ""}
                  {variancePct}%
                </div>
              </div>
            )}
          </div>

          {activeIsThisTask ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => stopMut.mutate()}
              disabled={stopMut.isPending}
            >
              <Square className="w-3.5 h-3.5 mr-1" />
              Detener
            </Button>
          ) : (
            <Button
              size="sm"
              variant="default"
              onClick={() => startMut.mutate()}
              disabled={startMut.isPending}
            >
              <Play className="w-3.5 h-3.5 mr-1" />
              Iniciar timer
            </Button>
          )}
        </div>

        {totalEstimateMin > 0 && (
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                displayedActualMin > totalEstimateMin ? "bg-destructive" : "bg-primary"
              }`}
              style={{
                width: `${Math.min(100, (displayedActualMin / totalEstimateMin) * 100)}%`,
              }}
            />
          </div>
        )}
      </div>

      {/* Estimado de la tarea (fuente única de verdad) */}
      {(() => {
        const task = taskQ.data;
        const mode = (task?.effort_mode ?? "flexible") as
          | "basic"
          | "flexible"
          | "fixed_daily"
          | "due_date";
        const totalHours =
          task?.total_effort_hours != null ? Number(task.total_effort_hours) : null;
        const displayValue = totalHours == null ? "" : formatDuration(totalHours);
        const estimates = estimatesQ.data ?? [];
        const assigneeCount = estimates.filter((e) => e.user_id).length;
        const hasManual = estimates.some((e) => (e as { manual?: boolean }).manual === true);
        return (
          <div className="border border-border rounded-lg p-3 bg-card/30 space-y-3">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Tiempo estimado (total)
                </Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="text"
                    inputMode="text"
                    defaultValue={displayValue}
                    key={String(displayValue)}
                    placeholder="ej: 1h 30m, 2:15, 90m, 1.5h"
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      if (raw === "") {
                        updateTaskMut.mutate({ totalEffortHours: null });
                        return;
                      }
                      const hours = parseDurationToHours(raw);
                      if (hours == null || hours < 0) {
                        // reset to previous value on invalid input
                        e.target.value = displayValue;
                        return;
                      }
                      updateTaskMut.mutate({ totalEffortHours: Math.round(hours * 10000) / 10000 });
                      e.target.value = formatDuration(hours);
                    }}
                    className="h-8 w-40 text-sm tabular-nums"
                    aria-label="Tiempo estimado"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {assigneeCount > 0
                    ? `Repartido entre ${assigneeCount} asignado${assigneeCount === 1 ? "" : "s"}${hasManual ? " (con ajustes manuales)" : " en partes iguales"}.`
                    : "Asigna a alguien para distribuir las horas en su carga."}
                </p>
              </div>

              <div className="min-w-[160px]">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Modo de esfuerzo
                </Label>
                <Select
                  value={mode}
                  onValueChange={(v) => updateTaskMut.mutate({ effortMode: v as typeof mode })}
                >
                  <SelectTrigger className="h-8 mt-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flexible">Flexible (repartido en el rango)</SelectItem>
                    <SelectItem value="basic">Básico (repartido entre asignados)</SelectItem>
                    <SelectItem value="fixed_daily">Fijo diario</SelectItem>
                    <SelectItem value="due_date">Concentrado en fecha límite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tabla por asignado */}
            {estimates.length > 0 && (
              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Horas por asignado
                  </Label>
                  {hasManual && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[11px]"
                      onClick={async () => {
                        try {
                          await resetEstimatesFn({ data: { taskId } });
                          invalidateAll();
                          toast.success("Horas redistribuidas en partes iguales");
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      Redistribuir
                    </Button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {estimates.map((est) => {
                    const m = members.find((x) => x.user_id === est.user_id);
                    const isManual = (est as { manual?: boolean }).manual === true;
                    const hoursVal = Number(est.hours ?? 0);
                    return (
                      <div key={est.id} className="flex items-center gap-2">
                        <MemberAvatar profile={m?.profile ?? null} size={22} />
                        <span className="text-xs flex-1 truncate">
                          {m?.profile?.full_name ?? m?.profile?.email ?? "Miembro"}
                        </span>
                        <Input
                          type="number"
                          step="0.25"
                          min="0"
                          defaultValue={hoursVal}
                          key={`est-${est.id}-${hoursVal}`}
                          onBlur={async (e) => {
                            const v = e.target.value.trim();
                            const n = parseFloat(v);
                            if (v === "" || Number.isNaN(n) || n < 0) return;
                            if (Math.abs(n - hoursVal) < 0.001) return;
                            try {
                              await setEstimateFn({
                                data: { taskId, userId: est.user_id!, hours: n },
                              });
                              invalidateAll();
                            } catch (err) {
                              toast.error((err as Error).message);
                            }
                          }}
                          className="h-7 w-20 text-xs tabular-nums"
                          aria-label={`Horas para ${m?.profile?.full_name ?? "miembro"}`}
                        />
                        <span className="text-[10px] text-muted-foreground w-8">
                          {isManual ? "manual" : "auto"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Registros */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Registros de tiempo
          </h3>
          <ManualEntryPopover onAdd={(v) => createEntryMut.mutate(v)} />
        </div>
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            Aún no hay registros. Inicia el timer o agrega tiempo manual.
          </p>
        ) : (
          <div className="space-y-1">
            {entries.map((e) => {
              const m = members.find((x) => x.user_id === e.user_id);
              const isOwn = e.user_id === currentUserId;
              const running = e.ended_at === null;
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/40 group"
                >
                  <MemberAvatar profile={m?.profile ?? null} size={20} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm flex items-center gap-2">
                      <span className="tabular-nums font-medium">
                        {running ? (
                          <span className="inline-flex items-center gap-1 text-status-in-progress">
                            <Timer className="w-3 h-3 animate-pulse" />
                            corriendo
                          </span>
                        ) : (
                          formatMinutes(e.duration_minutes ?? 0)
                        )}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {format(parseISO(e.started_at), "dd/MM HH:mm", { locale: es })}
                        {e.ended_at && ` – ${format(parseISO(e.ended_at), "HH:mm")}`}
                      </span>
                      {!e.is_billable && (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          interno
                        </span>
                      )}
                      {e.source === "timer" && (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          ⏱
                        </span>
                      )}
                    </div>
                    {e.note && (
                      <div className="text-xs text-muted-foreground truncate">{e.note}</div>
                    )}
                  </div>
                  {isOwn && !running && (
                    <>
                      <EditEntryPopover
                        entry={e}
                        onSave={(patch) => updateEntryMut.mutate({ id: e.id, ...patch })}
                      />
                      <button
                        onClick={() => deleteEntryMut.mutate(e.id)}
                        className="text-muted-foreground/60 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Eliminar registro"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {entries.length > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            Total: {formatMinutes(totalActualMin)} ·{" "}
            {formatDistanceStrict(0, totalActualMin * 60000, { locale: es })}
          </div>
        )}
      </div>
    </div>
  );
}

function ManualEntryPopover({
  onAdd,
}: {
  onAdd: (v: { startedAt: string; endedAt: string; note?: string; isBillable: boolean }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  const [billable, setBillable] = useState(true);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
          <Plus className="w-3 h-3" />
          Tiempo manual
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Fecha</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Duración</Label>
              <Input
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="1h 30m"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Nota (opcional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="text-sm resize-none"
              placeholder="¿En qué trabajaste?"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Facturable</Label>
            <Switch checked={billable} onCheckedChange={setBillable} />
          </div>
          <Button
            size="sm"
            className="w-full"
            disabled={!duration || !date}
            onClick={() => {
              const mins = parseDuration(duration);
              if (!mins || mins <= 0) {
                toast.error("Duración inválida. Probá 1h, 90m, 1:30, 1.5");
                return;
              }
              // Anclamos al mediodía local del día seleccionado
              const start = new Date(`${date}T12:00:00`);
              const end = new Date(start.getTime() + mins * 60000);
              onAdd({
                startedAt: start.toISOString(),
                endedAt: end.toISOString(),
                note: note || undefined,
                isBillable: billable,
              });
              setOpen(false);
              setDuration("");
              setNote("");
            }}
          >
            Agregar tiempo
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function EditEntryPopover({
  entry,
  onSave,
}: {
  entry: {
    id: string;
    started_at: string;
    ended_at: string | null;
    duration_minutes: number | null;
    note: string | null;
    is_billable: boolean;
  };
  onSave: (v: {
    startedAt?: string;
    endedAt?: string;
    note?: string | null;
    isBillable?: boolean;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState(formatMinutes(entry.duration_minutes ?? 0));
  const [note, setNote] = useState(entry.note ?? "");
  const [billable, setBillable] = useState(entry.is_billable);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="text-muted-foreground/60 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity text-xs px-1"
          aria-label="Editar"
        >
          Editar
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Duración</Label>
            <Input
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Nota</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="text-sm resize-none"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Facturable</Label>
            <Switch checked={billable} onCheckedChange={setBillable} />
          </div>
          <Button
            size="sm"
            className="w-full"
            onClick={() => {
              const mins = parseDuration(duration);
              if (!mins || mins <= 0) {
                toast.error("Duración inválida");
                return;
              }
              const start = parseISO(entry.started_at);
              const end = new Date(start.getTime() + mins * 60000);
              onSave({
                endedAt: end.toISOString(),
                note: note || null,
                isBillable: billable,
              });
              setOpen(false);
            }}
          >
            Guardar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
