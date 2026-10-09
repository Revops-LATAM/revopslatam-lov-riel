import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  getWorkspaceBySlug,
  listWorkspaceMembers,
  listCapacities,
  upsertCapacity,
  listHolidays,
  upsertHoliday,
  deleteHoliday,
} from "@/lib/api/tasko.functions";
import { updateWorkspaceTimeConfig } from "@/lib/api/workspaces.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MemberAvatar } from "@/components/tasko/MemberAvatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

const TIMEZONES = [
  "UTC",
  "America/Argentina/Buenos_Aires",
  "America/Sao_Paulo",
  "America/Santiago",
  "America/Bogota",
  "America/Mexico_City",
  "America/Lima",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/Madrid",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Dubai",
  "Australia/Sydney",
];

const STRATEGIES: Array<{
  value: "fit_capacity" | "spread" | "due_date";
  label: string;
  desc: string;
}> = [
  {
    value: "fit_capacity",
    label: "Ajustar a capacidad",
    desc: "Reparte respetando huecos libres por día.",
  },
  {
    value: "spread",
    label: "Distribuir parejo",
    desc: "Divide en partes iguales entre los días del rango.",
  },
  {
    value: "due_date",
    label: "Todo al vencimiento",
    desc: "Carga el estimado completo el día de due_date.",
  },
];

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/time-settings")({
  ssr: false,
  head: () => ({ meta: [{ title: "Ajustes de tiempo · Riel" }] }),
  loader: async ({ context, params }) => {
    const { requirePermission } = await import("@/lib/permissions-loader");
    await requirePermission(context.queryClient, params.workspaceSlug, "admin_capacity");
    return null;
  },
  component: TimeSettingsPage,
});

function TimeSettingsPage() {
  const { workspaceSlug } = Route.useParams();
  const qc = useQueryClient();
  const fetchWs = useServerFn(getWorkspaceBySlug);
  const fetchMembers = useServerFn(listWorkspaceMembers);
  const fetchCaps = useServerFn(listCapacities);
  const fetchHols = useServerFn(listHolidays);
  const upsertCapFn = useServerFn(upsertCapacity);
  const upsertHolFn = useServerFn(upsertHoliday);
  const deleteHolFn = useServerFn(deleteHoliday);
  const updateWsFn = useServerFn(updateWorkspaceTimeConfig);

  const wsQ = useQuery({
    queryKey: ["ws", workspaceSlug],
    queryFn: () => fetchWs({ data: { slug: workspaceSlug } }),
  });
  const wsId = wsQ.data?.id;
  const membersQ = useQuery({
    queryKey: ["members", wsId],
    queryFn: () => fetchMembers({ data: { workspaceId: wsId! } }),
    enabled: !!wsId,
  });
  const capsQ = useQuery({
    queryKey: ["caps", wsId],
    queryFn: () => fetchCaps({ data: { workspaceId: wsId! } }),
    enabled: !!wsId,
  });
  const holsQ = useQuery({
    queryKey: ["hols", wsId],
    queryFn: () => fetchHols({ data: { workspaceId: wsId! } }),
    enabled: !!wsId,
  });

  const capByUser = useMemo(() => {
    const m = new Map<
      string,
      { daily_hours: number; hourly_rate: number | null; currency: string; max_timer_hours: number }
    >();
    for (const c of capsQ.data ?? []) {
      m.set(c.user_id, {
        daily_hours: Number(c.daily_hours),
        hourly_rate: c.hourly_rate !== null ? Number(c.hourly_rate) : null,
        currency: c.currency ?? "USD",
        max_timer_hours: c.max_timer_hours ? Number(c.max_timer_hours) : 12,
      });
    }
    return m;
  }, [capsQ.data]);

  const saveCap = useMutation({
    mutationFn: (v: {
      userId: string;
      dailyHours: number;
      hourlyRate: number | null;
      currency: string;
      maxTimerHours: number;
    }) =>
      upsertCapFn({
        data: {
          workspaceId: wsId!,
          userId: v.userId,
          dailyHours: v.dailyHours,
          hourlyRate: v.hourlyRate,
          currency: v.currency,
          maxTimerHours: v.maxTimerHours,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["caps", wsId] });
      toast.success("Capacidad guardada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveWs = useMutation({
    mutationFn: (v: {
      timezone?: string;
      allocationStrategy?: "fit_capacity" | "spread" | "due_date";
    }) => updateWsFn({ data: { workspaceId: wsId!, ...v } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ws", workspaceSlug] });
      qc.invalidateQueries({ queryKey: ["workload"] });
      toast.success("Espacio actualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [tz, setTz] = useState<string>("UTC");
  const [strategy, setStrategy] = useState<"fit_capacity" | "spread" | "due_date">("fit_capacity");
  useEffect(() => {
    if (wsQ.data) {
      setTz(wsQ.data.timezone ?? "UTC");
      setStrategy(
        (wsQ.data.allocation_strategy as "fit_capacity" | "spread" | "due_date" | null) ??
          "fit_capacity",
      );
    }
  }, [wsQ.data]);

  const addHol = useMutation({
    mutationFn: (v: { date: string; name: string }) =>
      upsertHolFn({
        data: { workspaceId: wsId!, date: v.date, name: v.name, affects: "all" },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hols", wsId] });
      toast.success("Feriado agregado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delHol = useMutation({
    mutationFn: (id: string) => deleteHolFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hols", wsId] }),
  });

  const [newHolDate, setNewHolDate] = useState("");
  const [newHolName, setNewHolName] = useState("");

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center">
        <h1 className="text-sm font-semibold">Ajustes de tiempo</h1>
      </header>
      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-4xl">
        {/* Workspace time config */}
        <section className="border border-border rounded-md p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Configuración del espacio</h2>
            <p className="text-xs text-muted-foreground">
              Zona horaria y estrategia para repartir estimados en la carga semanal.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs mb-1 block">Zona horaria</Label>
              <Select
                value={tz}
                onValueChange={(v) => {
                  setTz(v);
                  saveWs.mutate({ timezone: v });
                }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {TIMEZONES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Define cómo se agrupan las entradas por día y la frontera de la semana.
              </p>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Distribución de estimados</Label>
              <Select
                value={strategy}
                onValueChange={(v) => {
                  const s = v as "fit_capacity" | "spread" | "due_date";
                  setStrategy(s);
                  saveWs.mutate({ allocationStrategy: s });
                }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STRATEGIES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                {STRATEGIES.find((s) => s.value === strategy)?.desc}
              </p>
            </div>
          </div>
        </section>

        {/* Capacities */}
        <section className="border border-border rounded-md p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Capacidad y tarifas por miembro</h2>
            <p className="text-xs text-muted-foreground">
              Horas laborables, tarifa por hora y tope diario del timer (auto-stop).
            </p>
          </div>
          <div className="space-y-2">
            {(membersQ.data ?? []).map((m) => {
              const cap = capByUser.get(m.user_id);
              return (
                <CapacityRow
                  key={m.user_id}
                  profile={m.profile}
                  initial={
                    cap ?? {
                      daily_hours: 8,
                      hourly_rate: null,
                      currency: "USD",
                      max_timer_hours: 12,
                    }
                  }
                  onSave={(v) => saveCap.mutate({ userId: m.user_id, ...v })}
                />
              );
            })}
            {(membersQ.data ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground italic">Sin miembros.</p>
            )}
          </div>
        </section>

        {/* Holidays */}
        <section className="border border-border rounded-md p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Feriados del espacio</h2>
            <p className="text-xs text-muted-foreground">
              Días que no cuentan como capacidad para todo el equipo.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs">Fecha</Label>
              <Input
                type="date"
                value={newHolDate}
                onChange={(e) => setNewHolDate(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="flex-[2]">
              <Label className="text-xs">Nombre</Label>
              <Input
                value={newHolName}
                onChange={(e) => setNewHolName(e.target.value)}
                placeholder="Ej: Año nuevo"
                className="h-8 text-sm"
              />
            </div>
            <Button
              size="sm"
              onClick={() => {
                if (!newHolDate || !newHolName.trim()) return;
                addHol.mutate({ date: newHolDate, name: newHolName.trim() });
                setNewHolDate("");
                setNewHolName("");
              }}
              className="h-8"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Agregar
            </Button>
          </div>
          <div className="space-y-1">
            {(holsQ.data ?? []).map((h) => (
              <div
                key={h.id}
                className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted/30 group"
              >
                <div className="text-sm tabular-nums w-32">
                  {format(new Date(h.date + "T00:00:00"), "EEE d MMM yyyy", { locale: es })}
                </div>
                <div className="text-sm flex-1">{h.name}</div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {h.affects === "all" ? "todos" : "personal"}
                </span>
                <button
                  onClick={() => delHol.mutate(h.id)}
                  className="text-muted-foreground/60 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Eliminar"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {(holsQ.data ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground italic">Sin feriados configurados.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function CapacityRow({
  profile,
  initial,
  onSave,
}: {
  profile: {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
  initial: {
    daily_hours: number;
    hourly_rate: number | null;
    currency: string;
    max_timer_hours: number;
  };
  onSave: (v: {
    dailyHours: number;
    hourlyRate: number | null;
    currency: string;
    maxTimerHours: number;
  }) => void;
}) {
  const [daily, setDaily] = useState(String(initial.daily_hours));
  const [rate, setRate] = useState(initial.hourly_rate !== null ? String(initial.hourly_rate) : "");
  const [currency, setCurrency] = useState(initial.currency);
  const [maxTimer, setMaxTimer] = useState(String(initial.max_timer_hours));

  const dirty =
    Number(daily) !== initial.daily_hours ||
    (rate === "" ? initial.hourly_rate !== null : Number(rate) !== initial.hourly_rate) ||
    currency !== initial.currency ||
    Number(maxTimer) !== initial.max_timer_hours;

  return (
    <div className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted/30 flex-wrap">
      <MemberAvatar profile={profile} size={24} />
      <div className="flex-1 min-w-[120px]">
        <div className="text-sm truncate">{profile?.full_name ?? profile?.email ?? "—"}</div>
      </div>
      <div className="flex items-center gap-1" title="Horas laborables por día">
        <Input
          type="number"
          min={0}
          max={24}
          step={0.5}
          value={daily}
          onChange={(e) => setDaily(e.target.value)}
          className="h-7 w-16 text-right text-sm tabular-nums"
        />
        <span className="text-xs text-muted-foreground">h/día</span>
      </div>
      <div className="flex items-center gap-1" title="Tarifa por hora">
        <Input
          type="number"
          min={0}
          step={0.5}
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="—"
          className="h-7 w-20 text-right text-sm tabular-nums"
        />
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger className="h-7 w-20 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="USD">USD</SelectItem>
            <SelectItem value="EUR">EUR</SelectItem>
            <SelectItem value="ARS">ARS</SelectItem>
            <SelectItem value="MXN">MXN</SelectItem>
            <SelectItem value="CLP">CLP</SelectItem>
            <SelectItem value="COP">COP</SelectItem>
            <SelectItem value="BRL">BRL</SelectItem>
            <SelectItem value="GBP">GBP</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">/h</span>
      </div>
      <div className="flex items-center gap-1" title="Auto-stop del timer">
        <Input
          type="number"
          min={1}
          max={24}
          step={1}
          value={maxTimer}
          onChange={(e) => setMaxTimer(e.target.value)}
          className="h-7 w-14 text-right text-sm tabular-nums"
        />
        <span className="text-xs text-muted-foreground">tope</span>
      </div>
      <Button
        size="sm"
        variant={dirty ? "default" : "ghost"}
        disabled={!dirty}
        className="h-7 text-xs"
        onClick={() =>
          onSave({
            dailyHours: Number(daily) || 0,
            hourlyRate: rate === "" ? null : Number(rate),
            currency,
            maxTimerHours: Math.min(24, Math.max(1, Number(maxTimer) || 12)),
          })
        }
      >
        Guardar
      </Button>
    </div>
  );
}
