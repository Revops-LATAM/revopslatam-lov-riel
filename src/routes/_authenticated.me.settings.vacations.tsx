import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Trash2, Plus, CalendarDays } from "lucide-react";

import { workspacesQO } from "@/lib/api/tasko.queries";
import { listMyTimeOff, addMyTimeOffRange, deleteMyTimeOff } from "@/lib/api/time.functions";
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

export const Route = createFileRoute("/_authenticated/me/settings/vacations")({
  head: () => ({ meta: [{ title: "Días libres · Riel" }] }),
  component: MyVacations,
});

type Portion = "full" | "am" | "pm";
type TimeOffRow = {
  id: string;
  workspace_id: string;
  date: string;
  name: string;
  portion: Portion;
};

const PORTION_LABEL: Record<Portion, string> = {
  full: "Día completo",
  am: "Media mañana",
  pm: "Media tarde",
};

function MyVacations() {
  const qc = useQueryClient();
  const workspaces = useQuery(workspacesQO());
  const opsWs = workspaces.data?.find((w) => w.kind === "operations") ?? workspaces.data?.[0];

  const listFn = useServerFn(listMyTimeOff);
  const addFn = useServerFn(addMyTimeOffRange);
  const delFn = useServerFn(deleteMyTimeOff);

  const timeOffQuery = useQuery({
    queryKey: ["my-time-off"],
    queryFn: () => listFn() as Promise<TimeOffRow[]>,
  });

  const today = new Date().toISOString().slice(0, 10);
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [name, setName] = useState("Vacaciones");
  const [portion, setPortion] = useState<Portion>("full");

  const effectiveWs = workspaceId || opsWs?.id || "";
  const isHalfDay = portion !== "full";

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveWs) throw new Error("Selecciona un workspace");
      return addFn({
        data: {
          workspaceId: effectiveWs,
          startDate,
          endDate: isHalfDay ? startDate : endDate,
          name: name.trim() || "Vacaciones",
          portion,
        },
      });
    },
    onSuccess: (res) => {
      const conflicts = (res as { conflicts?: string[] }).conflicts ?? [];
      if (res.inserted > 0) {
        toast.success(`Se marcaron ${res.inserted} ${isHalfDay ? "medio(s) día(s)" : "día(s)"}.`);
      }
      if (conflicts.length > 0) {
        toast.error(conflicts[0]);
      } else if (res.inserted === 0) {
        toast.info("Ese día ya estaba registrado.");
      }
      qc.invalidateQueries({ queryKey: ["my-time-off"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMutation = useMutation({
    mutationFn: async (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Día libre eliminado");
      qc.invalidateQueries({ queryKey: ["my-time-off"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const byWorkspace = useMemo(() => {
    const map = new Map<string, TimeOffRow[]>();
    for (const r of timeOffQuery.data ?? []) {
      const arr = map.get(r.workspace_id) ?? [];
      arr.push(r);
      map.set(r.workspace_id, arr);
    }
    return map;
  }, [timeOffQuery.data]);

  const wsName = (id: string) => workspaces.data?.find((w) => w.id === id)?.name ?? "Workspace";

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h2 className="text-sm font-semibold">Días libres y vacaciones</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Marca los días en que no estarás disponible. El sistema no permitirá agendarte tareas en
          fines de semana, feriados del workspace ni en los días que marques aquí.
        </p>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-3 bg-card">
        <div className="text-xs font-medium flex items-center gap-2">
          <Plus className="w-3.5 h-3.5" /> Agregar día libre o rango de vacaciones
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {workspaces.data && workspaces.data.length > 1 && (
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Workspace</Label>
              <Select value={effectiveWs} onValueChange={(v) => setWorkspaceId(v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecciona workspace" />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.data.map((w) => (
                    <SelectItem key={w.id} value={w.id} className="text-xs">
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Desde</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (endDate < e.target.value) setEndDate(e.target.value);
              }}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hasta</Label>
            <Input
              type="date"
              value={isHalfDay ? startDate : endDate}
              min={startDate}
              disabled={isHalfDay}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Motivo</Label>
            <Select value={name} onValueChange={setName}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Vacaciones" className="text-xs">
                  Vacaciones
                </SelectItem>
                <SelectItem value="Día Libre" className="text-xs">
                  Día Libre
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Duración</Label>
            <Select value={portion} onValueChange={(v) => setPortion(v as Portion)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full" className="text-xs">
                  Día completo
                </SelectItem>
                <SelectItem value="am" className="text-xs">
                  Media mañana (AM)
                </SelectItem>
                <SelectItem value="pm" className="text-xs">
                  Media tarde (PM)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!effectiveWs || addMutation.isPending}
            onClick={() => addMutation.mutate()}
          >
            {addMutation.isPending ? "Guardando…" : "Agregar"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Para un solo día, deja la misma fecha en "Desde" y "Hasta". Los medios días solo aplican a
          un día. Los medios días no bloquean el agendamiento de tareas; solo el día completo lo
          hace.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-xs font-medium flex items-center gap-2">
          <CalendarDays className="w-3.5 h-3.5" /> Mis días libres
        </div>
        {timeOffQuery.isLoading ? (
          <div className="text-xs text-muted-foreground">Cargando…</div>
        ) : (timeOffQuery.data ?? []).length === 0 ? (
          <div className="text-xs text-muted-foreground italic">
            No tienes días libres registrados.
          </div>
        ) : (
          <div className="space-y-4">
            {[...byWorkspace.entries()].map(([wsId, rows]) => (
              <div key={wsId} className="rounded-lg border border-border">
                <div className="px-3 py-2 border-b border-border text-[11px] font-medium text-muted-foreground bg-muted/30">
                  {wsName(wsId)} · {rows.length} día(s)
                </div>
                <ul className="divide-y divide-border">
                  {rows.map((r) => (
                    <li
                      key={r.id}
                      className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="tabular-nums font-medium">
                          {format(parseISO(r.date), "EEE d MMM yyyy", { locale: es })}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {PORTION_LABEL[r.portion ?? "full"]}
                        </span>
                        {r.name && r.name !== "Vacaciones" && (
                          <span className="text-muted-foreground truncate">{r.name}</span>
                        )}
                      </div>

                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-7 h-7 text-destructive hover:text-destructive"
                        aria-label={`Eliminar ${r.date}`}
                        disabled={delMutation.isPending}
                        onClick={() => delMutation.mutate(r.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
