import { useState, useMemo } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { accountsQO, workspacePaymentsQO } from "@/lib/api/tasko.queries";
import { createInvoice } from "@/lib/api/dte.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/tasko-utils";

type Line = {
  _uid?: string;
  descripcion: string;
  cantidad: number;
  monto_unitario: number;
  monto: number;
  contract_payment_id?: string | null;
};

const newLine = (): Line => ({
  _uid:
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `l-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  descripcion: "",
  cantidad: 1,
  monto_unitario: 0,
  monto: 0,
});

export function CreateInvoiceDialog({
  open,
  onOpenChange,
  workspaceId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  onCreated: () => void;
}) {
  const { data: accounts } = useSuspenseQuery(accountsQO(workspaceId));
  const { data: payments } = useSuspenseQuery(
    workspacePaymentsQO(workspaceId, { status: "scheduled" }),
  );

  const qc = useQueryClient();
  const create = useServerFn(createInvoice);

  const [tab, setTab] = useState<"manual" | "payments">("payments");
  const [accountId, setAccountId] = useState<string>("");
  const [contractId, setContractId] = useState<string>("");
  const [tipoDte, setTipoDte] = useState<33 | 34>(33);
  const [fecha, setFecha] = useState<string>(new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" }));
  const [descripcion, setDescripcion] = useState<string>("");
  const [currency, setCurrency] = useState<string>("CLP");
  const [notas, setNotas] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Manual lines
  const [lines, setLines] = useState<Line[]>([newLine()]);

  // Payment-mode selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Filter payments by account when chosen
  const filteredPayments = useMemo(() => {
    if (!accountId) return payments;
    return payments.filter((p) =>
      p.account_name && accounts.find((a) => a.id === accountId)?.name === p.account_name
        ? true
        : false,
    );
  }, [payments, accountId, accounts]);

  const selectedPayments = useMemo(
    () => payments.filter((p) => selected.has(p.id)),
    [payments, selected],
  );

  const totalManual = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.monto) || 0), 0),
    [lines],
  );
  const totalPagos = useMemo(
    () => selectedPayments.reduce((s, p) => s + Number(p.amount ?? 0), 0),
    [selectedPayments],
  );

  const neto = tab === "manual" ? totalManual : totalPagos;
  const iva = tipoDte === 33 ? Math.round(neto * 0.19) : 0;
  const total = neto + iva;

  const reset = () => {
    setTab("payments");
    setAccountId("");
    setContractId("");
    setTipoDte(33);
    setFecha(new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" }));
    setDescripcion("");
    setCurrency("CLP");
    setNotas("");
    setLines([newLine()]);
    setSelected(new Set());
  };

  const submit = async () => {
    // Build line payload
    let payload: Line[] = [];
    let resolvedContractId = contractId || null;
    let resolvedAccountId = accountId || null;
    let inferredCurrency = currency;

    if (tab === "payments") {
      if (selectedPayments.length === 0) {
        toast.error("Selecciona al menos un pago");
        return;
      }
      // Force same contract
      const contractIds = new Set(selectedPayments.map((p) => p.contract_id));
      if (contractIds.size > 1) {
        toast.error("Los pagos seleccionados deben ser del mismo contrato");
        return;
      }
      resolvedContractId = [...contractIds][0];
      inferredCurrency = selectedPayments[0].currency;
      // Find account by matching name
      const acctName = selectedPayments[0].account_name;
      const acct = accounts.find((a) => a.name === acctName);
      resolvedAccountId = acct?.id ?? resolvedAccountId;
      payload = selectedPayments.map((p) => ({
        descripcion:
          p.period_label
            ? `${p.contract_name ?? "Servicio"} — ${p.period_label}`
            : `${p.contract_name ?? "Servicio"} (${p.kind})`,
        cantidad: 1,
        monto_unitario: Number(p.amount ?? 0),
        monto: Number(p.amount ?? 0),
        contract_payment_id: p.id,
      }));
    } else {
      if (lines.length === 0 || lines.some((l) => !l.descripcion.trim())) {
        toast.error("Completa todas las líneas");
        return;
      }
      payload = lines.map((l) => ({
        descripcion: l.descripcion,
        cantidad: Number(l.cantidad) || 1,
        monto_unitario: Number(l.monto_unitario) || 0,
        monto: Number(l.monto) || 0,
      }));
    }

    setSaving(true);
    try {
      await create({
        data: {
          workspaceId,
          accountId: resolvedAccountId,
          contractId: resolvedContractId,
          tipo_dte: tipoDte,
          descripcion: descripcion || null,
          fecha_emision: fecha,
          currency: inferredCurrency,
          notas: notas || null,
          lines: payload,
        },
      });
      toast.success("Factura creada");
      qc.invalidateQueries({ queryKey: ["invoices", workspaceId] });
      onCreated();
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nueva factura</DialogTitle>
          <DialogDescription>
            Crea una factura desde pagos programados o agrega líneas manualmente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Tipo DTE</Label>
            <Select value={String(tipoDte)} onValueChange={(v) => setTipoDte(Number(v) as 33 | 34)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="33">33 · Factura afecta</SelectItem>
                <SelectItem value="34">34 · Factura exenta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Fecha emisión</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Moneda</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CLP">CLP</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="UF">UF</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-3">
            <Label className="text-xs">Descripción</Label>
            <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "manual" | "payments")} className="mt-2">
          <TabsList>
            <TabsTrigger value="payments">Desde pagos programados</TabsTrigger>
            <TabsTrigger value="manual">Líneas manuales</TabsTrigger>
          </TabsList>

          <TabsContent value="payments" className="space-y-2">
            <div>
              <Label className="text-xs">Cliente (filtro)</Label>
              <Select value={accountId || "all"} onValueChange={(v) => setAccountId(v === "all" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los clientes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los clientes</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="max-h-72 overflow-auto border border-border rounded-md">
              {filteredPayments.length === 0 && (
                <p className="text-xs text-muted-foreground p-3">
                  No hay pagos programados.
                </p>
              )}
              {filteredPayments.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-0 hover:bg-accent/50 cursor-pointer"
                >
                  <Checkbox
                    checked={selected.has(p.id)}
                    onCheckedChange={(c) => {
                      setSelected((s) => {
                        const n = new Set(s);
                        if (c) n.add(p.id);
                        else n.delete(p.id);
                        return n;
                      });
                    }}
                  />
                  <div className="flex-1 grid grid-cols-4 gap-2 text-xs">
                    <span>{p.due_date}</span>
                    <span className="truncate">{p.contract_name}</span>
                    <span className="truncate text-muted-foreground">{p.period_label ?? p.kind}</span>
                    <span className="text-right">
                      {formatMoney(Number(p.amount ?? 0), p.currency)}
                    </span>
                  </div>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {selected.size} pagos seleccionados · Total neto {formatMoney(totalPagos, currency)}
            </p>

          </TabsContent>

          <TabsContent value="manual" className="space-y-2">
            <div>
              <Label className="text-xs">Cliente</Label>
              <Select value={accountId || "none"} onValueChange={(v) => setAccountId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona cliente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin cliente</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={l._uid ?? `line-${i}`} className="grid grid-cols-12 gap-2 items-end">

                  <div className="col-span-6">
                    <Label className="text-xs">Descripción</Label>
                    <Input
                      value={l.descripcion}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLines((ls) => ls.map((x, ix) => (ix === i ? { ...x, descripcion: v } : x)));
                      }}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Cant.</Label>
                    <Input
                      type="number"
                      value={l.cantidad}
                      onChange={(e) => {
                        const cantidad = Number(e.target.value);
                        setLines((ls) =>
                          ls.map((x, ix) =>
                            ix === i
                              ? { ...x, cantidad, monto: cantidad * x.monto_unitario }
                              : x,
                          ),
                        );
                      }}
                    />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs">P. unitario</Label>
                    <Input
                      type="number"
                      value={l.monto_unitario}
                      onChange={(e) => {
                        const pu = Number(e.target.value);
                        setLines((ls) =>
                          ls.map((x, ix) =>
                            ix === i
                              ? { ...x, monto_unitario: pu, monto: pu * x.cantidad }
                              : x,
                          ),
                        );
                      }}
                    />
                  </div>
                  <div className="col-span-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setLines((ls) => ls.filter((_, ix) => ix !== i))}
                      disabled={lines.length === 1}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setLines((ls) => [...ls, newLine()])
                }
              >
                <Plus className="size-3 mr-1" /> Línea
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <div className="border-t border-border pt-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Neto</span>
            <span>{formatMoney(neto, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">IVA (19%)</span>
            <span>{formatMoney(iva, currency)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span>{formatMoney(total, currency)}</span>
          </div>

        </div>

        <div>
          <Label className="text-xs">Notas</Label>
          <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Creando…" : "Crear factura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
