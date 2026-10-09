import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  listBillingEntities,
  getContractSplits,
  saveContractSplits,
} from "@/lib/api/billing-entities.functions";

type Entity = { id: string; razon_social: string; rut: string | null; is_primary: boolean };

export function ContractSplitsSection({
  contractId,
  accountId,
  currency,
  cuotaAmount,
}: {
  contractId: string;
  accountId: string;
  currency: string;
  cuotaAmount: number | null;
}) {
  const qc = useQueryClient();
  const listE = useServerFn(listBillingEntities);
  const getS = useServerFn(getContractSplits);
  const save = useServerFn(saveContractSplits);
  const eq = useQuery({
    queryKey: ["billing-entities", accountId],
    queryFn: () => listE({ data: { accountId } }),
  });
  const sq = useQuery({
    queryKey: ["contract-splits", contractId],
    queryFn: () => getS({ data: { contractId } }),
  });
  const [enabled, setEnabled] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!sq.data) return;
    setEnabled(sq.data.length > 0);
    setAmounts(Object.fromEntries(sq.data.map((s) => [s.billing_entity_id, String(s.monto)])));
  }, [sq.data]);

  const entities = (eq.data ?? []) as Entity[];
  const sum = useMemo(
    () => Object.values(amounts).reduce((s, v) => s + (Number(v.replace(",", ".")) || 0), 0),
    [amounts],
  );
  const mismatch = cuotaAmount != null && enabled && Math.abs(sum - cuotaAmount) > 0.005;

  const onSave = async () => {
    setSaving(true);
    try {
      const splits = enabled
        ? entities
            .map((e) => ({
              billingEntityId: e.id,
              monto: Number((amounts[e.id] ?? "").replace(",", ".")) || 0,
            }))
            .filter((s) => s.monto > 0)
        : [];
      const r = await save({ data: { contractId, splits } });
      toast.success(
        splits.length
          ? `División guardada. ${r.splitPayments} cuota(s) pendientes divididas por razón social.`
          : "Facturación sin dividir",
      );
      qc.invalidateQueries({ queryKey: ["contract-splits", contractId] });
      qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-border rounded-md p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Dividir facturación entre razones sociales</div>
          <p className="text-xs text-muted-foreground">
            Cada cuota pendiente se emitirá como una factura por razón social, con el monto fijo
            indicado. Las cuotas ya facturadas no se modifican.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>
      {enabled && (
        <>
          {entities.length <= 1 && (
            <p className="text-xs text-muted-foreground">
              Agrega primero las razones sociales en la ficha del cliente.
            </p>
          )}
          <div className="divide-y divide-border border border-border rounded-md">
            {entities.map((e) => (
              <div key={e.id} className="flex items-center gap-3 p-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{e.razon_social}</div>
                  <div className="text-[11px] text-muted-foreground">{e.rut ?? "Sin RUT"}</div>
                </div>
                <span className="text-xs text-muted-foreground">{currency}</span>
                <Input
                  className="w-28 h-8 text-right"
                  inputMode="decimal"
                  value={amounts[e.id] ?? ""}
                  placeholder="0"
                  onChange={(ev) => setAmounts({ ...amounts, [e.id]: ev.target.value })}
                />
              </div>
            ))}
          </div>
          <div className={`text-xs ${mismatch ? "text-destructive" : "text-muted-foreground"}`}>
            Suma: {currency} {sum.toLocaleString("es-CL")}
            {cuotaAmount != null &&
              ` · Valor cuota: ${currency} ${cuotaAmount.toLocaleString("es-CL")}`}
            {mismatch && " — no cuadra; se repartirá proporcionalmente."}
          </div>
        </>
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? "Guardando…" : "Guardar división"}
        </Button>
      </div>
    </div>
  );
}
