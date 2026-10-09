import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { wsBySlugQO, commissionsQO, membersQO } from "@/lib/api/tasko.queries";
import {
  markCommissionPaid,
  updateCommissionStatus,
  splitCommission,
} from "@/lib/api/commissions.functions";
import { RouteError } from "@/components/tasko/RouteError";
import { formatMoney } from "@/lib/tasko-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type Estado = "all" | "pendiente" | "aprobada" | "pagada" | "cancelada";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/finance/commissions")({
  ssr: false,
  loader: async ({ context, params }) => {
    const ws = await context.queryClient.ensureQueryData(wsBySlugQO(params.workspaceSlug));
    await context.queryClient.ensureQueryData(commissionsQO(ws.id));
    await context.queryClient.ensureQueryData(membersQO(ws.id));
    return null;
  },
  errorComponent: RouteError,
  component: CommissionsPage,
});

function CommissionsPage() {
  const { workspaceSlug } = Route.useParams();
  const { data: ws } = useSuspenseQuery(wsBySlugQO(workspaceSlug));
  const [filter, setFilter] = useState<Estado>("all");
  const { data: rows } = useSuspenseQuery(
    commissionsQO(ws.id, filter === "all" ? undefined : { estado: filter }),
  );
  const { data: members } = useSuspenseQuery(membersQO(ws.id));
  const qc = useQueryClient();

  const markPaid = useServerFn(markCommissionPaid);
  const updateStatus = useServerFn(updateCommissionStatus);

  const [splitFor, setSplitFor] = useState<null | (typeof rows)[number]>(null);

  const fmt = (n: number, cur: string) => formatMoney(n, cur);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["commissions", ws.id] });

  const handlePaid = async (id: string) => {
    try {
      await markPaid({ data: { commissionId: id } });
      toast.success("Comisión marcada como pagada");
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await updateStatus({ data: { commissionId: id, estado: "aprobada" } });
      toast.success("Aprobada");
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await updateStatus({ data: { commissionId: id, estado: "cancelada" } });
      toast.success("Cancelada");
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  const estadoCls = (e: string) =>
    e === "pagada"
      ? "bg-emerald-500/10 text-emerald-600"
      : e === "aprobada"
        ? "bg-blue-500/10 text-blue-600"
        : e === "cancelada"
          ? "bg-muted text-muted-foreground"
          : "bg-amber-500/10 text-amber-600";

  const totals = rows.reduce<Record<string, { pendiente: number; pagada: number }>>((acc, r) => {
    acc[r.currency] ??= { pendiente: 0, pagada: 0 };
    if (r.estado === "pagada") acc[r.currency].pagada += r.amount;
    else if (r.estado === "pendiente" || r.estado === "aprobada")
      acc[r.currency].pendiente += r.amount;
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {Object.entries(totals).map(([cur, t]) => (
          <div key={cur} className="border border-border rounded-md p-4">
            <div className="text-xs text-muted-foreground mb-2">{cur}</div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Pendiente</span>
              <span className="font-medium text-amber-600">{fmt(t.pendiente, cur)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Pagada</span>
              <span className="font-medium text-emerald-600">{fmt(t.pagada, cur)}</span>
            </div>
          </div>
        ))}
        {Object.keys(totals).length === 0 && (
          <div className="md:col-span-3 text-xs text-muted-foreground">
            Aún no hay comisiones generadas. Se crean automáticamente cuando un pago se marca como
            pagado y el contrato tiene vendedor asignado.
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-xs">Estado</Label>
        <Select value={filter} onValueChange={(v) => setFilter(v as Estado)}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="pendiente">Pendientes</SelectItem>
            <SelectItem value="aprobada">Aprobadas</SelectItem>
            <SelectItem value="pagada">Pagadas</SelectItem>
            <SelectItem value="cancelada">Canceladas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Contrato</th>
              <th className="text-left px-3 py-2 font-medium">Vendedor</th>
              <th className="text-right px-3 py-2 font-medium">%</th>
              <th className="text-right px-3 py-2 font-medium">Base</th>
              <th className="text-right px-3 py-2 font-medium">Monto</th>
              <th className="text-left px-3 py-2 font-medium">Estado</th>
              <th className="text-left px-3 py-2 font-medium">Generada</th>
              <th className="text-right px-3 py-2 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted-foreground py-12 text-sm">
                  No hay comisiones para este filtro.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">
                    {r.contract_name}
                    {r.comision_padre_id && (
                      <span className="ml-1 text-[10px] text-muted-foreground">(división)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.vendedor_name}</td>
                  <td className="px-3 py-2 text-right">{r.porcentaje}%</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {fmt(r.base_amount, r.currency)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(r.amount, r.currency)}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded ${estadoCls(r.estado)}`}>
                      {r.estado}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{r.fecha_generacion}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex gap-1 justify-end">
                      {r.estado === "pendiente" && (
                        <Button size="sm" variant="outline" onClick={() => handleApprove(r.id)}>
                          Aprobar
                        </Button>
                      )}
                      {(r.estado === "pendiente" || r.estado === "aprobada") && (
                        <>
                          <Button size="sm" variant="default" onClick={() => handlePaid(r.id)}>
                            Marcar pagada
                          </Button>
                          {!r.comision_padre_id && (
                            <Button size="sm" variant="ghost" onClick={() => setSplitFor(r)}>
                              Dividir
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => handleCancel(r.id)}>
                            Cancelar
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {splitFor && (
        <SplitDialog
          commission={splitFor}
          members={members.map((m) => ({
            user_id: m.user_id,
            full_name: m.profile?.full_name ?? null,
            email: m.profile?.email ?? null,
          }))}
          onClose={() => setSplitFor(null)}
          onDone={() => {
            setSplitFor(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function SplitDialog({
  commission,
  members,
  onClose,
  onDone,
}: {
  commission: { id: string; vendedor_id: string };
  members: Array<{ user_id: string; full_name: string | null; email: string | null }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const split = useServerFn(splitCommission);
  const [splits, setSplits] = useState([
    { vendedorId: commission.vendedor_id, porcentaje: 50 },
    { vendedorId: "", porcentaje: 50 },
  ]);
  const [saving, setSaving] = useState(false);

  const total = splits.reduce((s, x) => s + (Number(x.porcentaje) || 0), 0);

  const updateSplit = (i: number, patch: Partial<(typeof splits)[number]>) =>
    setSplits((s) => s.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const handle = async () => {
    if (Math.abs(total - 100) > 0.01) {
      toast.error("Los porcentajes deben sumar 100");
      return;
    }
    if (splits.some((s) => !s.vendedorId)) {
      toast.error("Selecciona vendedor en cada fila");
      return;
    }
    setSaving(true);
    try {
      await split({ data: { commissionId: commission.id, splits } });
      toast.success("Comisión dividida");
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
          <DialogTitle>Dividir comisión</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            La comisión original se cancela y se generan nuevas divisiones por vendedor.
          </p>
          {splits.map((s, i) => (
            <div key={i} className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs">Vendedor</Label>
                <Select
                  value={s.vendedorId}
                  onValueChange={(v) => updateSplit(i, { vendedorId: v })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.full_name ?? m.email ?? m.user_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-24">
                <Label className="text-xs">%</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={s.porcentaje}
                  onChange={(e) => updateSplit(i, { porcentaje: Number(e.target.value) })}
                />
              </div>
              {splits.length > 2 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSplits((arr) => arr.filter((_, idx) => idx !== i))}
                >
                  ×
                </Button>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between text-xs">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSplits((s) => [...s, { vendedorId: "", porcentaje: 0 }])}
            >
              + Agregar vendedor
            </Button>
            <span className={total === 100 ? "text-emerald-600" : "text-amber-600"}>
              Total: {total}%
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handle} disabled={saving}>
            {saving ? "Dividiendo…" : "Dividir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
