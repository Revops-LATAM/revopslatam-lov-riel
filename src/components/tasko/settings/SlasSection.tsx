import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listSlas,
  createSla,
  updateSla,
  deleteSla,
  upsertSlaTarget,
} from "@/lib/api/slas.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Unit = "minutes" | "hours" | "days";
type TicketType = "incidencia" | "requerimiento";
type Level = "normal" | "urgente_critico";

const ROWS: { tt: TicketType; lv: Level; label: string }[] = [
  { tt: "requerimiento", lv: "normal", label: "Requerimiento · Normal" },
  { tt: "requerimiento", lv: "urgente_critico", label: "Requerimiento · Urgente" },
  { tt: "incidencia", lv: "normal", label: "Incidencia · Normal" },
  { tt: "incidencia", lv: "urgente_critico", label: "Incidencia · Crítico" },
];

function minutesTo(value: number): { qty: number; unit: Unit } {
  if (value % (60 * 24) === 0) return { qty: value / (60 * 24), unit: "days" };
  if (value % 60 === 0) return { qty: value / 60, unit: "hours" };
  return { qty: value, unit: "minutes" };
}
function toMinutes(qty: number, unit: Unit): number {
  if (unit === "days") return qty * 60 * 24;
  if (unit === "hours") return qty * 60;
  return qty;
}

type SlaTarget = {
  id: string;
  ticket_type: TicketType;
  level: Level;
  target_minutes: number;
  response_target_minutes: number | null;
  business_hours: boolean;
};
type Sla = {
  id: string;
  name: string;
  is_system: boolean;
  active: boolean;
  sla_targets: SlaTarget[];
};

export function SlasSection({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listSlas);
  const createFn = useServerFn(createSla);
  const updateFn = useServerFn(updateSla);
  const deleteFn = useServerFn(deleteSla);
  const upsertFn = useServerFn(upsertSlaTarget);

  const slas = useQuery({
    queryKey: ["slas", workspaceId],
    queryFn: () => listFn({ data: { workspaceId } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["slas", workspaceId] });

  const createMut = useMutation({
    mutationFn: (name: string) => createFn({ data: { workspaceId, name } }),
    onSuccess: () => {
      invalidate();
      toast.success("SLA creado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateMut = useMutation({
    mutationFn: (vars: { slaId: string; name?: string; active?: boolean }) =>
      updateFn({ data: vars }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (slaId: string) => deleteFn({ data: { slaId } }),
    onSuccess: () => {
      invalidate();
      toast.success("SLA eliminado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const upsertMut = useMutation({
    mutationFn: (vars: {
      slaId: string;
      ticketType: TicketType;
      level: Level;
      targetMinutes: number;
      responseTargetMinutes: number | null;
      businessHours: boolean;
    }) => upsertFn({ data: vars }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const [newName, setNewName] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="border border-border rounded-md p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">SLAs de tickets</h2>
          <p className="text-xs text-muted-foreground">
            Tiempos objetivo de respuesta y resolución según tipo y prioridad.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nuevo SLA"
            className="h-8 w-40"
          />
          <Button
            size="sm"
            onClick={() => {
              if (!newName.trim()) return;
              createMut.mutate(newName.trim());
              setNewName("");
            }}
            disabled={createMut.isPending}
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Crear
          </Button>
        </div>
      </div>

      <div className="divide-y divide-border border border-border rounded-md">
        {(slas.data as Sla[] | undefined)?.map((sla) => {
          const open = openId === sla.id;
          return (
            <div key={sla.id} className="p-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : sla.id)}
                  className="p-0.5"
                  aria-label={open ? "Cerrar" : "Abrir"}
                >
                  {open ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
                <Input
                  defaultValue={sla.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== sla.name) updateMut.mutate({ slaId: sla.id, name: v });
                  }}
                  className="h-8 max-w-xs"
                />
                {sla.is_system && (
                  <Badge variant="secondary" className="text-[10px]">
                    Sistema
                  </Badge>
                )}
                <div className="ml-auto flex items-center gap-3">
                  <label className="text-xs flex items-center gap-1.5">
                    <Switch
                      checked={sla.active}
                      onCheckedChange={(v) =>
                        updateMut.mutate({ slaId: sla.id, active: v })
                      }
                    />
                    Activo
                  </label>
                  {!sla.is_system && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`¿Eliminar SLA "${sla.name}"?`))
                          deleteMut.mutate(sla.id);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {open && (
                <div className="mt-3 pl-6 space-y-2">
                  <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 text-[11px] font-medium text-muted-foreground px-1">
                    <span>Tipo / nivel</span>
                    <span>Respuesta</span>
                    <span>Resolución</span>
                    <span>Unidad</span>
                    <span>Hábil</span>
                    <span />
                  </div>
                  {ROWS.map((row) => {
                    const t = sla.sla_targets.find(
                      (x) => x.ticket_type === row.tt && x.level === row.lv,
                    );
                    const init = t ? minutesTo(t.target_minutes) : { qty: 8, unit: "hours" as Unit };
                    const respInit = t?.response_target_minutes
                      ? minutesTo(t.response_target_minutes)
                      : { qty: Math.max(1, Math.round(init.qty / 4)), unit: init.unit };
                    return (
                      <TargetRow
                        key={`${sla.id}-${row.tt}-${row.lv}`}
                        label={row.label}
                        initRespQty={respInit.qty}
                        initQty={init.qty}
                        initUnit={init.unit}
                        initBh={t?.business_hours ?? false}
                        onSave={(respQty, qty, unit, bh) =>
                          upsertMut.mutate({
                            slaId: sla.id,
                            ticketType: row.tt,
                            level: row.lv,
                            targetMinutes: toMinutes(qty, unit),
                            responseTargetMinutes: toMinutes(respQty, unit),
                            businessHours: bh,
                          })
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {!slas.isLoading && (slas.data?.length ?? 0) === 0 && (
          <div className="p-4 text-sm text-muted-foreground">
            Aún no hay SLAs. Crea uno arriba.
          </div>
        )}
      </div>
    </section>
  );
}

function TargetRow({
  label,
  initRespQty,
  initQty,
  initUnit,
  initBh,
  onSave,
}: {
  label: string;
  initRespQty: number;
  initQty: number;
  initUnit: Unit;
  initBh: boolean;
  onSave: (respQty: number, qty: number, unit: Unit, bh: boolean) => void;
}) {
  const [respQty, setRespQty] = useState(initRespQty);
  const [qty, setQty] = useState(initQty);
  const [unit, setUnit] = useState<Unit>(initUnit);
  const [bh, setBh] = useState(initBh);
  const dirty =
    respQty !== initRespQty || qty !== initQty || unit !== initUnit || bh !== initBh;

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-2 px-1">
      <span className="text-xs">{label}</span>
      <Input
        type="number"
        min={1}
        value={respQty}
        onChange={(e) => setRespQty(Number(e.target.value) || 0)}
        onBlur={() => dirty && respQty > 0 && qty > 0 && onSave(respQty, qty, unit, bh)}
        className="h-8 w-20"
        title="Tiempo de primera respuesta"
      />
      <Input
        type="number"
        min={1}
        value={qty}
        onChange={(e) => setQty(Number(e.target.value) || 0)}
        onBlur={() => dirty && respQty > 0 && qty > 0 && onSave(respQty, qty, unit, bh)}
        className="h-8 w-20"
        title="Tiempo de resolución"
      />
      <Select
        value={unit}
        onValueChange={(v) => {
          const nu = v as Unit;
          setUnit(nu);
          if (qty > 0 && respQty > 0) onSave(respQty, qty, nu, bh);
        }}
      >
        <SelectTrigger className="h-8 w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="minutes">minutos</SelectItem>
          <SelectItem value="hours">horas</SelectItem>
          <SelectItem value="days">días</SelectItem>
        </SelectContent>
      </Select>
      <label className="flex items-center gap-1.5 text-xs">
        <Switch
          checked={bh}
          onCheckedChange={(v) => {
            setBh(v);
            if (qty > 0 && respQty > 0) onSave(respQty, qty, unit, v);
          }}
        />
      </label>
      <span />
    </div>
  );
}
