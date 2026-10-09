import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { wsBySlugQO, renewalsQO } from "@/lib/api/tasko.queries";
import { cancelContract, skipRenewal, renewContract } from "@/lib/api/renewals.functions";
import { RouteError } from "@/components/tasko/RouteError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { differenceInDays } from "date-fns";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/finance/renewals")({
  ssr: false,
  loader: async ({ context, params }) => {
    const ws = await context.queryClient.ensureQueryData(wsBySlugQO(params.workspaceSlug));
    await context.queryClient.ensureQueryData(renewalsQO(ws.id));
    return null;
  },
  errorComponent: RouteError,
  component: RenewalsPage,
});

type Mode = null | { kind: "renew" | "cancel"; contractId: string; contractName: string; endDate: string | null };

function RenewalsPage() {
  const { workspaceSlug } = Route.useParams();
  const { data: ws } = useSuspenseQuery(wsBySlugQO(workspaceSlug));
  const { data: rows } = useSuspenseQuery(renewalsQO(ws.id));
  const qc = useQueryClient();

  const skip = useServerFn(skipRenewal);
  const [mode, setMode] = useState<Mode>(null);

  const today = new Date().toISOString().slice(0, 10);

  const urgency = (avisoDate: string | null, endDate: string | null) => {
    if (!endDate) return { label: "Sin término", cls: "bg-muted text-muted-foreground" };
    const days = differenceInDays(new Date(endDate), new Date(today));
    if (days < 0) return { label: `Vencido hace ${-days}d`, cls: "bg-rose-500/10 text-rose-600" };
    if (days <= 15) return { label: `${days}d`, cls: "bg-rose-500/10 text-rose-600" };
    if (days <= 45) return { label: `${days}d`, cls: "bg-amber-500/10 text-amber-600" };
    return { label: `${days}d`, cls: "bg-emerald-500/10 text-emerald-600" };
  };

  const handleSkip = async (contractId: string) => {
    try {
      await skip({ data: { contractId } });
      toast.success("Marcado como no renovable");
      qc.invalidateQueries({ queryKey: ["renewals", ws.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <div className="p-6 space-y-3">
      <div>
        <p className="text-xs text-muted-foreground">
          Contratos activos cuya fecha de aviso de renovación ya llegó. Renueva, cancela, o márcalos
          como no renovables.
        </p>
      </div>

      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Contrato</th>
              <th className="text-left px-3 py-2 font-medium">Cliente</th>
              <th className="text-left px-3 py-2 font-medium">Tipo</th>
              <th className="text-left px-3 py-2 font-medium">Inicio</th>
              <th className="text-left px-3 py-2 font-medium">Término</th>
              <th className="text-left px-3 py-2 font-medium">Urgencia</th>
              <th className="text-right px-3 py-2 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-muted-foreground py-12 text-sm">
                  No hay contratos por renovar.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const u = urgency(r.fecha_aviso_renovacion, r.end_date);
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.account_name ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.type}</td>
                    <td className="px-3 py-2 text-xs">{r.start_date}</td>
                    <td className="px-3 py-2 text-xs">{r.end_date ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[11px] px-2 py-0.5 rounded ${u.cls}`}>{u.label}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() =>
                            setMode({
                              kind: "renew",
                              contractId: r.id,
                              contractName: r.name,
                              endDate: r.end_date,
                            })
                          }
                        >
                          Renovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setMode({
                              kind: "cancel",
                              contractId: r.id,
                              contractName: r.name,
                              endDate: r.end_date,
                            })
                          }
                        >
                          Cancelar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleSkip(r.id)}>
                          No renovar
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {mode?.kind === "renew" && (
        <RenewDialog
          mode={mode}
          onClose={() => setMode(null)}
          onDone={() => {
            setMode(null);
            qc.invalidateQueries({ queryKey: ["renewals", ws.id] });
            qc.invalidateQueries({ queryKey: ["contracts", ws.id] });
          }}
        />
      )}

      {mode?.kind === "cancel" && (
        <CancelDialog
          mode={mode}
          onClose={() => setMode(null)}
          onDone={() => {
            setMode(null);
            qc.invalidateQueries({ queryKey: ["renewals", ws.id] });
            qc.invalidateQueries({ queryKey: ["contracts", ws.id] });
          }}
        />
      )}
    </div>
  );
}

function RenewDialog({ mode, onClose, onDone }: { mode: Exclude<Mode, null>; onClose: () => void; onDone: () => void }) {
  const renew = useServerFn(renewContract);
  const defaultStart = mode.endDate
    ? new Date(new Date(mode.endDate).getTime() + 86400000).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  const handle = async () => {
    setSaving(true);
    try {
      await renew({
        data: {
          contractId: mode.contractId,
          newStartDate: start,
          newEndDate: end || undefined,
          cloneLines: true,
          cloneFinancials: true,
          notasComerciales: notas || undefined,
        },
      });
      toast.success("Contrato renovado en estado Proyectado");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Renovar {mode.contractName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Se clonarán líneas y financials. El nuevo contrato queda en Proyectado para revisión.
          </p>
          <div>
            <Label className="text-xs">Nueva fecha inicio</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Nueva fecha término (opcional)</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Notas comerciales</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handle} disabled={saving || !start}>
            {saving ? "Renovando…" : "Renovar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ mode, onClose, onDone }: { mode: Exclude<Mode, null>; onClose: () => void; onDone: () => void }) {
  const cancel = useServerFn(cancelContract);
  const [motivo, setMotivo] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const handle = async () => {
    if (!motivo.trim()) {
      toast.error("Indica el motivo");
      return;
    }
    setSaving(true);
    try {
      await cancel({ data: { contractId: mode.contractId, motivo, fechaCancelacion: fecha } });
      toast.success("Contrato cancelado");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar {mode.contractName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Los pagos programados futuros también quedarán cancelados.
          </p>
          <div>
            <Label className="text-xs">Fecha de cancelación</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Motivo *</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cerrar
          </Button>
          <Button variant="destructive" onClick={handle} disabled={saving}>
            {saving ? "Cancelando…" : "Confirmar cancelación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
