import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { createTaskRecurrence } from "@/lib/api/tasks.functions";

type Frequency = "daily" | "weekly" | "monthly";
type EndMode = "count" | "until";

const WEEKDAYS: Array<{ label: string; value: number }> = [
  { label: "L", value: 1 },
  { label: "M", value: 2 },
  { label: "X", value: 3 },
  { label: "J", value: 4 },
  { label: "V", value: 5 },
  { label: "S", value: 6 },
  { label: "D", value: 0 },
];

export function RecurrenceDialog({
  open,
  taskId,
  anchorDate,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  taskId: string | null;
  anchorDate: string | null;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}) {
  const qc = useQueryClient();
  const runFn = useServerFn(createTaskRecurrence);

  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [interval, setIntervalN] = useState(1);
  const [weekdays, setWeekdays] = useState<number[]>(() => {
    if (!anchorDate) return [1];
    const d = new Date(`${anchorDate}T00:00:00Z`).getUTCDay();
    return [d];
  });
  const [endMode, setEndMode] = useState<EndMode>("count");
  const [count, setCount] = useState(5);
  const [until, setUntil] = useState<string>("");

  const preview = useMemo(() => {
    if (endMode === "count") return `Se crearán ${Math.max(0, count - 1)} tareas adicionales.`;
    if (until) return `Se crearán tareas hasta el ${until}.`;
    return "Selecciona una fecha final.";
  }, [endMode, count, until]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error("Sin tarea");
      return runFn({
        data: {
          sourceTaskId: taskId,
          frequency,
          interval,
          weekdays: frequency === "weekly" ? weekdays : undefined,
          endMode,
          count: endMode === "count" ? count : undefined,
          until: endMode === "until" ? until : undefined,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(`Se crearon ${res.created} tareas recurrentes`);
      qc.invalidateQueries();
      onOpenChange(false);
      onCreated?.();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "No se pudo crear la recurrencia");
    },
  });

  const toggleDow = (d: number) =>
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const canSubmit =
    !!taskId &&
    interval >= 1 &&
    (endMode === "count" ? count >= 2 : !!until && (!anchorDate || until > anchorDate)) &&
    (frequency !== "weekly" || weekdays.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Repetir tarea</DialogTitle>
          <DialogDescription>
            Se crearán copias de esta tarea con las mismas propiedades y fechas ajustadas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Frecuencia</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diaria</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cada</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={52}
                  value={interval}
                  onChange={(e) => setIntervalN(Math.max(1, Number(e.target.value) || 1))}
                  className="h-8 text-xs w-20"
                />
                <span className="text-xs text-muted-foreground">
                  {frequency === "daily"
                    ? "día(s)"
                    : frequency === "weekly"
                      ? "semana(s)"
                      : "mes(es)"}
                </span>
              </div>
            </div>
          </div>

          {frequency === "weekly" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Días de la semana</Label>
              <div className="flex gap-1">
                {WEEKDAYS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDow(d.value)}
                    className={`w-8 h-8 rounded-md text-xs font-medium border transition-colors ${
                      weekdays.includes(d.value)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">Termina</Label>
            <RadioGroup
              value={endMode}
              onValueChange={(v) => setEndMode(v as EndMode)}
              className="space-y-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="count" id="rc-count" />
                <Label htmlFor="rc-count" className="text-xs font-normal flex items-center gap-2">
                  Después de
                  <Input
                    type="number"
                    min={2}
                    max={100}
                    value={count}
                    onChange={(e) =>
                      setCount(Math.max(2, Math.min(100, Number(e.target.value) || 2)))
                    }
                    onFocus={() => setEndMode("count")}
                    className="h-7 text-xs w-16"
                  />
                  ocurrencias (incluye la actual)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="until" id="rc-until" />
                <Label htmlFor="rc-until" className="text-xs font-normal flex items-center gap-2">
                  En la fecha
                  <Input
                    type="date"
                    value={until}
                    onChange={(e) => setUntil(e.target.value)}
                    onFocus={() => setEndMode("until")}
                    className="h-7 text-xs w-40"
                  />
                </Label>
              </div>
            </RadioGroup>
          </div>

          <p className="text-[11px] text-muted-foreground">{preview}</p>
          {!anchorDate && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              La tarea no tiene fecha; se usará hoy como referencia.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mut.mutate()} disabled={!canSubmit || mut.isPending}>
            {mut.isPending ? "Creando..." : "Crear serie"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
