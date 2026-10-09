import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  wsBySlugQO,
  workspacePaymentsQO,
  latestUfRateQO,
  invoicesQO,
  dteConfigQO,
} from "@/lib/api/tasko.queries";
import { updatePaymentStatus } from "@/lib/api/tasko.functions";
import {
  createInvoiceFromPayment,
  generatePendingInvoices,
  markInvoicePaid,
  cancelInvoice,
  emitDte,
} from "@/lib/api/dte.functions";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FileText, Sparkles, FilePlus2, Info, RefreshCw, Plus, Mail, ExternalLink, Eye, CheckCircle2, XCircle, Link2, AlertTriangle } from "lucide-react";
import { RouteError } from "@/components/tasko/RouteError";
import { toast } from "sonner";
import { DataGrid, type ColumnDef } from "@/components/datagrid/DataGrid";
import { formatMoney } from "@/lib/tasko-utils";
import { refreshUfRates } from "@/lib/api/finance.functions";
import { CreateInvoiceDialog } from "@/components/tasko/finance/CreateInvoiceDialog";
import { SendInvoiceEmailDialog } from "@/components/tasko/finance/SendInvoiceEmailDialog";
import { ReconcileDteDialog } from "@/components/tasko/finance/ReconcileDteDialog";
import { EmitDteDialog } from "@/components/tasko/finance/EmitDteDialog";
import { PdfViewerModal } from "@/components/tasko/finance/PdfViewerModal";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type StatusFilter = "all" | "ready" | "scheduled" | "invoiced" | "overdue" | "draft" | "paid" | "cancelled";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/finance/payments")({
  ssr: false,
  loader: async ({ context, params }) => {
    const ws = await context.queryClient.ensureQueryData(wsBySlugQO(params.workspaceSlug));
    // Single round-trip: consolidates payments + invoices + dteConfig + ufRate.
    // Mirrors the getProjectBundle pattern used by /projects/$id.
    const paymentsKey = workspacePaymentsQO(ws.id).queryKey;
    const invoicesKey = invoicesQO(ws.id).queryKey;
    const dteKey = dteConfigQO(ws.id).queryKey;
    const ufKey = latestUfRateQO(ws.id).queryKey;
    const hasAll =
      context.queryClient.getQueryData(paymentsKey) !== undefined &&
      context.queryClient.getQueryData(invoicesKey) !== undefined &&
      context.queryClient.getQueryData(dteKey) !== undefined;
    if (!hasAll) {
      try {
        const { getFinancePaymentsBundle } = await import(
          "@/lib/api/finance-bundle.functions"
        );
        const bundle = await getFinancePaymentsBundle({ data: { workspaceId: ws.id } });
        context.queryClient.setQueryData(paymentsKey, bundle.payments);
        context.queryClient.setQueryData(invoicesKey, bundle.invoices);
        context.queryClient.setQueryData(dteKey, bundle.dteConfig);
        if (bundle.ufRate !== null) {
          context.queryClient.setQueryData(ufKey, bundle.ufRate);
        }
      } catch (err) {
        // Transient session gaps (attacher throws NO_SESSION during token refresh)
        // shouldn't blank the page — let per-query useSuspenseQuery fetch on mount;
        // the _authenticated gate will redirect if the session is truly gone.
        if (!(err instanceof Error) || err.message !== "NO_SESSION") throw err;
      }
    }

    return null;
  },
  errorComponent: RouteError,
  component: PaymentsPage,
});

type Payment = {
  id: string;
  contract_id: string;
  contract_name: string | null;
  account_name: string | null;
  kind: string;
  period_label: string | null;
  amount: number | string | null;
  currency: string;
  due_date: string | null;
  paid_at: string | null;
  status: string;
  ready_to_invoice?: boolean | null;
  // Joined fields
  description?: string | null;
  fecha_emision?: string | null;
  emitido_at?: string | null;
  monto_clp?: number | string | null;
  uf_usada?: number | null;
  uf_fecha?: string | null;
  es_uf_estimada?: boolean | null;
  folio_sii?: string | null;
  invoice_id?: string | null;
  invoice_estado?: string | null;
  pdf_url?: string | null;
  has_pdf?: boolean | null;
  // Source discriminator: "payment" = cuota del contrato; "invoice" = factura sin cuota (puntual / borrador)
  source?: "payment" | "invoice";
};

const STATUS_TONE: Record<string, string> = {
  paid: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  overdue: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  invoiced: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  scheduled: "bg-primary/15 text-primary border-primary/30",
  draft: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

const STATUS_LABEL: Record<string, string> = {
  paid: "Pagado",
  overdue: "Vencido",
  cancelled: "Cancelado",
  invoiced: "Facturado",
  scheduled: "Por facturar",
  draft: "Por emitir",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_TONE[status] ?? STATUS_TONE.scheduled;
  const label = STATUS_LABEL[status] ?? status;
  return (
    <span className={`text-[10px] uppercase rounded px-1.5 py-0.5 border ${cls}`}>
      {label}
    </span>
  );
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  try {
    // For date-only strings (YYYY-MM-DD), construct as local date to avoid UTC shift
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
    return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return s;
  }
}

function PaymentsPage() {
  const { workspaceSlug } = Route.useParams();
  const navigate = useNavigate();
  const { data: ws } = useSuspenseQuery(wsBySlugQO(workspaceSlug));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [createInvoiceOpen, setCreateInvoiceOpen] = useState(false);
  const [actionPayment, setActionPayment] = useState<Payment | null>(null);
  const [emailInvoiceId, setEmailInvoiceId] = useState<string | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; title: string; invoiceId: string } | null>(null);
  const [emitDialogInvoiceId, setEmitDialogInvoiceId] = useState<string | null>(null);
  const todayKey = new Date().toISOString().slice(0, 7); // YYYY-MM
  const [monthFilter, setMonthFilter] = useState<string | null>(todayKey); // YYYY-MM, null = todo
  // 'planned' = agrupa por mes de la cuota planificada (due_date / period_month).
  // 'emission' = agrupa por mes de emisión real de la factura (fecha_emision).
  // Las cuotas pendientes sin fecha de emisión caen igual en el mes planificado.
  const [groupBy, setGroupBy] = useState<"planned" | "emission">("planned");
  // Fetch all payments + all invoices. Both se mergean para que esta vista
  // cubra todo el ciclo de facturación (cuotas del contrato + facturas puntuales o borradores).
  const { data: rawPayments } = useSuspenseQuery(workspacePaymentsQO(ws.id));
  const { data: invoices } = useSuspenseQuery(invoicesQO(ws.id));
  const { data: dteCfg } = useSuspenseQuery(dteConfigQO(ws.id));
  const { data: ufRate } = useQuery(latestUfRateQO(ws.id));
  const ufValor = ufRate?.valor ?? null;

  // Invoice-only rows: facturas que NO están ligadas a un contract_payment (puntuales, borradores manuales).
  const paymentInvoiceIds = useMemo(
    () => new Set((rawPayments as Payment[]).map((p) => p.invoice_id).filter(Boolean) as string[]),
    [rawPayments],
  );
  const invoiceOnlyRows = useMemo<Payment[]>(() => {
    type Inv = {
      id: string;
      account_id: string | null;
      contract_id: string | null;
      descripcion: string | null;
      fecha_emision: string | null;
      currency: string;
      monto_neto: number | string | null;
      monto_total: number | string | null;
      monto_clp: number | string | null;
      estado: string;
      folio_sii: string | null;
      pdf_url: string | null;
      pagada_at: string | null;
      account_name: string | null;
      contract_name: string | null;
    };
    const statusMap: Record<string, string> = {
      draft: "draft",
      scheduled: "scheduled",
      emitted: "invoiced",
      paid: "paid",
      cancelled: "cancelled",
    };
    return ((invoices ?? []) as unknown as Inv[])
      .filter((inv) => !paymentInvoiceIds.has(inv.id))
      .map((inv) => ({
        id: `inv:${inv.id}`,
        contract_id: inv.contract_id ?? "",
        contract_name: inv.contract_name,
        account_name: inv.account_name,
        kind: "factura",
        period_label: null,
        amount: Number(inv.monto_neto ?? inv.monto_total ?? 0),
        currency: inv.currency,
        due_date: inv.fecha_emision,
        paid_at: inv.pagada_at,
        status: statusMap[inv.estado] ?? inv.estado,
        ready_to_invoice: false,
        description: inv.descripcion,
        fecha_emision: inv.fecha_emision,
        emitido_at: inv.estado === "emitted" || inv.estado === "paid" ? inv.fecha_emision : null,
        monto_clp: inv.monto_clp,
        folio_sii: inv.folio_sii,
        invoice_id: inv.id,
        invoice_estado: inv.estado,
        pdf_url: inv.pdf_url,
        has_pdf: !!inv.pdf_url,
        source: "invoice" as const,
      }));
  }, [invoices, paymentInvoiceIds]);

  // Monto real emitido por factura. Si el DTE tiene monto_clp (neto en pesos
  // al momento de emitir), ese es el valor contable definitivo y se usa tal cual
  // en CLP: evita re-convertir montos UF con la UF de hoy y evita explotar el
  // total cuando una factura quedó marcada en "UF" con el monto ya en pesos.
  const invById = useMemo(() => {
    const m = new Map<string, { amount: number; currency: string }>();
    for (const inv of (invoices ?? []) as unknown as Array<{
      id: string;
      currency: string;
      monto_neto: number | string | null;
      monto_total: number | string | null;
      monto_clp: number | string | null;
    }>) {
      const clp = inv.monto_clp == null ? null : Number(inv.monto_clp);
      if (clp != null && Number.isFinite(clp) && clp > 0) {
        m.set(inv.id, { amount: clp, currency: "CLP" });
        continue;
      }
      m.set(inv.id, {
        amount: Number(inv.monto_neto ?? inv.monto_total ?? 0),
        currency: inv.currency || "CLP",
      });
    }
    return m;
  }, [invoices]);


  // Universo completo: cuotas marcadas como payment + facturas independientes.
  // Se descartan cuotas pagadas/canceladas para enfocarse en facturación,
  // pero las facturas-only siempre se muestran (incluso paid/cancelled, ya son hechos contables).
  const all = useMemo<Payment[]>(() => {
    const fromPayments = (rawPayments as Payment[])
      .filter((p) => p.status !== "cancelled")
      .map((p) => ({
        ...p,
        // Los borradores internos (invoice.estado='draft') no se muestran como
        // un estado distinto: el usuario ve "Por facturar" hasta que la factura
        // se emite realmente en el SII. El borrador es sólo un pre-registro
        // reutilizable para idempotencia.
        source: "payment" as const,
      }));
    return [...fromPayments, ...invoiceOnlyRows];
  }, [rawPayments, invoiceOnlyRows]);


  const monthKey = (p: Payment) => {
    // En modo "emisión" solo usamos fecha_emision cuando el DTE está realmente
    // emitido/pagado. Los borradores traen una fecha tentativa que no debe
    // mover la cuota de mes; esos caen al mes planificado (due_date).
    const emitted =
      p.invoice_estado === "emitted" || p.invoice_estado === "paid" || !!p.emitido_at;
    const src =
      groupBy === "emission" && emitted ? p.fecha_emision ?? p.due_date : p.due_date;
    return src ? src.slice(0, 7) : "sin-fecha";
  };

  const isReady = (p: Payment) =>
    !!p.ready_to_invoice && p.status !== "invoiced";

  // Monthly summary (across all payments, regardless of grid filters)
  type MonthBucket = {
    key: string;
    label: string;
    porFacturar: Record<string, number>; // currency -> sum
    facturado: Record<string, number>;
    counts: { porFacturar: number; facturado: number };
  };
  const monthly = useMemo<MonthBucket[]>(() => {
    const map = new Map<string, MonthBucket>();
    for (const p of all) {
      const k = monthKey(p);
      let b = map.get(k);
      if (!b) {
        const label =
          k === "sin-fecha"
            ? "Sin fecha"
            : new Date(k + "-15").toLocaleDateString("es", { month: "long", year: "numeric" });
        b = {
          key: k,
          label: label.charAt(0).toUpperCase() + label.slice(1),
          porFacturar: {},
          facturado: {},
          counts: { porFacturar: 0, facturado: 0 },
        };
        map.set(k, b);
      }
      // Para lo ya facturado se usa el monto REAL de la factura emitida
      // (neto, en su moneda de emisión), no el monto planificado de la cuota:
      // las cuotas en UF y los ajustes de monto al emitir hacían que el
      // resumen no cuadrara con el sistema de facturación.
      const real =
        (p.status === "invoiced" || p.status === "paid") && p.invoice_id
          ? invById.get(p.invoice_id)
          : undefined;
      const rawAmt = real ? real.amount : Number(p.amount ?? 0);
      const rawCur = real ? real.currency : p.currency || "CLP";
      // Guarda de cordura: un monto "UF" de 6 cifras o más es en realidad un
      // monto en pesos mal etiquetado. Convertirlo con la UF lo inflaría a miles
      // de millones y rompería el resumen.
      const misTagged = rawCur === "UF" && rawAmt >= 100000;
      const amt = rawAmt;
      const cur = misTagged ? "CLP" : rawCur;

      if (p.status === "invoiced" || p.status === "paid") {
        b.facturado[cur] = (b.facturado[cur] ?? 0) + amt;
        b.counts.facturado += 1;
      } else if (p.status === "scheduled" || p.status === "overdue" || p.status === "draft") {
        b.porFacturar[cur] = (b.porFacturar[cur] ?? 0) + amt;
        b.counts.porFacturar += 1;
      }
    }
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [all, groupBy, invById]);


  // Apply grid filters
  const payments = all.filter((p) => {
    if (monthFilter && monthKey(p) !== monthFilter) return false;
    if (statusFilter === "all") return true;
    if (statusFilter === "ready") return isReady(p);
    return p.status === statusFilter;
  });
  const readyCount = all.filter(isReady).length;
  const qc = useQueryClient();
  const updateFn = useServerFn(updatePaymentStatus);
  const invoiceFn = useServerFn(createInvoiceFromPayment);
  const bulkFn = useServerFn(generatePendingInvoices);
  const payFn = useServerFn(markInvoicePaid);
  const cancelFn = useServerFn(cancelInvoice);
  void emitDte; // reserved: emission is triggered from EmitDteDialog
  const [reconcileFor, setReconcileFor] = useState<string | null>(null);

  const invalidatePayments = () => {
    qc.invalidateQueries({ queryKey: ["ws-payments", ws.id] });
    qc.invalidateQueries({ queryKey: ["finance-dashboard", ws.id] });
    qc.invalidateQueries({ queryKey: ["invoices", ws.id] });
  };

  // Optimistic patch helper: apply a partial update to a row in the cached
  // ws-payments list without triggering a server refetch. Returns a rollback
  // function that restores the previous snapshot on error.
  const optimisticPatchPayment = (
    predicate: (p: Payment) => boolean,
    patch: Partial<Payment>,
  ) => {
    const key = ["ws-payments", ws.id];
    const prev = qc.getQueryData<Payment[]>(key);
    if (prev) {
      qc.setQueryData<Payment[]>(
        key,
        prev.map((p) => (predicate(p) ? { ...p, ...patch } : p)),
      );
    }
    return () => {
      if (prev) qc.setQueryData(key, prev);
    };
  };

  const m = useMutation({
    mutationFn: updateFn,
    onMutate: (args: { data: { paymentId: string; status: "scheduled" | "invoiced" | "paid" | "overdue" | "cancelled"; paidAt?: string } }) => {
      const vars = args.data;
      const patch: Partial<Payment> = { status: vars.status };
      if (vars.status === "paid") patch.paid_at = vars.paidAt ?? new Date().toISOString().slice(0, 10);
      const rollback = optimisticPatchPayment((p) => p.id === vars.paymentId, patch);
      return { rollback };
    },
    onError: (e: Error, _vars, ctx) => {
      ctx?.rollback?.();
      toast.error(e.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-dashboard", ws.id] });
      toast.success("Pago actualizado");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["ws-payments", ws.id] });
    },
  });


  const dteActive = !!dteCfg?.activo;

  const invoiceM = useMutation({
    mutationFn: async (paymentId: string) => {
      const { invoiceId } = await invoiceFn({ data: { paymentId } });
      return { invoiceId };
    },
    onSuccess: (r) => {
      invalidatePayments();
      if (dteActive) {
        // Open the emit dialog for the user to review/edit before sending to SII.
        setEmitDialogInvoiceId(r.invoiceId);
      } else {
        toast.success("Factura marcada como Por emitir", {
          description: "Activa DTE en Ajustes para emitir al SII.",
        });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const emitM = useMutation({
    // Placeholder to preserve the API surface; actual emission now happens inside EmitDteDialog.
    mutationFn: async (invoiceId: string) => {
      setEmitDialogInvoiceId(invoiceId);
      return { ok: true };
    },
    onError: (e: Error) => toast.error(e.message),
  });




  const bulkM = useMutation({
    mutationFn: () => bulkFn({ data: { workspaceId: ws.id } }),
    onSuccess: (r) => {
      invalidatePayments();
      toast.success(`Facturas creadas: ${r.created} de ${r.total}`);
      if (r.errors.length > 0) {
        toast.warning(`${r.errors.length} pagos no se pudieron facturar`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const payM = useMutation({
    mutationFn: (invoiceId: string) => payFn({ data: { invoiceId } }),
    onMutate: (invoiceId: string) => {
      const today = new Date().toISOString().slice(0, 10);
      const rollback = optimisticPatchPayment(
        (p) => p.invoice_id === invoiceId,
        { status: "paid", paid_at: today, invoice_estado: "paid" },
      );
      return { rollback };
    },
    onError: (e: Error, _vars, ctx) => {
      ctx?.rollback?.();
      toast.error(e.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-dashboard", ws.id] });
      qc.invalidateQueries({ queryKey: ["invoices", ws.id] });
      toast.success("Factura marcada como pagada");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["ws-payments", ws.id] });
    },
  });

  const cancelM = useMutation({
    mutationFn: (vars: { invoiceId: string; motivo: string }) =>
      cancelFn({ data: vars }),
    onMutate: (vars) => {
      const rollback = optimisticPatchPayment(
        (p) => p.invoice_id === vars.invoiceId,
        { status: "cancelled", invoice_estado: "cancelled" },
      );
      return { rollback };
    },
    onError: (e: Error, _vars, ctx) => {
      ctx?.rollback?.();
      toast.error(e.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-dashboard", ws.id] });
      qc.invalidateQueries({ queryKey: ["invoices", ws.id] });
      toast.success("Factura cancelada");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["ws-payments", ws.id] });
    },
  });


  const columns: ColumnDef<Payment>[] = useMemo(
    () => [
      {
        id: "account",
        header: "Cliente",
        required: true,
        sortable: true,
        accessor: (p) => p.account_name ?? "",
        cell: (p) => (
          <span className="font-medium truncate">{p.account_name ?? "—"}</span>
        ),
        width: 170,
      },
      {
        id: "description",
        header: "Descripción",
        sortable: true,
        accessor: (p) => p.description ?? "",
        cell: (p) => (
          <span className="text-[12px] text-muted-foreground line-clamp-2">
            {p.description ?? "—"}
          </span>
        ),
        width: 260,
      },
      {
        id: "due_date",
        header: "Fecha programada",
        sortable: true,
        accessor: (p) => p.due_date ?? "",
        cell: (p) => <span>{fmtDate(p.due_date)}</span>,
        width: 130,
      },
      {
        id: "fecha_emision",
        header: "Fecha emisión",
        sortable: true,
        accessor: (p) => (p.emitido_at ? p.fecha_emision ?? p.emitido_at : ""),
        cell: (p) =>
          p.emitido_at ? (
            <span className="text-emerald-500 tabular-nums">{fmtDate(p.fecha_emision ?? p.emitido_at)}</span>
          ) : (
            <span className="text-muted-foreground/50">—</span>
          ),
        width: 130,
      },
      {
        id: "amount",
        header: "Monto original",
        sortable: true,
        accessor: (p) => Number(p.amount ?? 0),
        cell: (p) => (
          <span
            className="tabular-nums"
            title="Monto pactado en el contrato (neto, sin IVA)"
          >
            {formatMoney(Number(p.amount ?? 0), p.currency)}
          </span>
        ),
        width: 130,
        align: "right",
      },
      {
        id: "monto_clp",
        header: "Monto CLP",
        sortable: true,
        accessor: (p) => Number(p.monto_clp ?? 0),
        cell: (p) => {
          if (p.monto_clp == null) return <span className="text-muted-foreground/50">—</span>;
          const isUF = p.currency === "UF";
          const ufVal = p.uf_usada ? Number(p.uf_usada) : null;
          const isInvoiced = p.status === "invoiced" || p.status === "paid";
          const hasUfDetail = isUF && ufVal && p.amount != null;

          const amtFmt = hasUfDetail
            ? Number(p.amount).toLocaleString("es-CL", { maximumFractionDigits: 2 })
            : "";
          const ufFmt = hasUfDetail
            ? ufVal.toLocaleString("es-CL", { maximumFractionDigits: 2 })
            : "";
          const fechaTxt = hasUfDetail
            ? p.es_uf_estimada
              ? "Último valor UF conocido"
              : p.uf_fecha
                ? `UF del ${p.uf_fecha.split("-").reverse().join("-")}`
                : ""
            : "";

          const trigger = (
            <span
              className={`tabular-nums font-medium inline-flex items-center justify-end gap-1 cursor-pointer select-none ${isUF && p.es_uf_estimada ? "text-amber-400" : ""}`}
            >
              {formatMoney(Number(p.monto_clp ?? 0), "CLP")}
              {isUF && ufVal ? (
                <Info className="h-3 w-3 text-amber-500/80" />
              ) : null}
            </span>
          );

          return (
            <Popover>
              <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                {trigger}
              </PopoverTrigger>
              <PopoverContent
                side="left"
                className="max-w-xs w-auto p-2"
                onClick={(e) => e.stopPropagation()}
              >
                {hasUfDetail ? (
                  <div className="text-xs leading-relaxed">
                    <div className="font-medium">
                      {amtFmt} UF × ${ufFmt}
                    </div>
                    {fechaTxt ? (
                      <div className="text-[10px] opacity-80">{fechaTxt}</div>
                    ) : null}
                    <div className="text-[10px] opacity-70 mt-1">
                      {isInvoiced
                        ? "Monto CLP real del DTE (congelado al emitir)"
                        : "Estimación en CLP con UF de referencia"}
                    </div>
                  </div>
                ) : (
                  <span className="text-xs">
                    {isInvoiced
                      ? "Monto CLP real del DTE (congelado al emitir)"
                      : "Estimación en CLP con UF de referencia"}
                  </span>
                )}
              </PopoverContent>
            </Popover>
          );
        },
        width: 140,
        align: "right",
      },
      {
        id: "status",
        header: "Estado",
        sortable: true,
        accessor: (p) => p.status,
        cell: (p) => (
          <div className="flex items-center gap-1.5">
            <StatusBadge status={p.status} />
            {p.folio_sii ? (
              <span
                className="text-[10px] rounded px-1.5 py-0.5 border bg-muted/40 text-muted-foreground inline-flex items-center gap-1"
                title="Folio SII"
              >
                #{p.folio_sii}
              </span>
            ) : null}
            {p.invoice_estado === "scheduled" && !p.folio_sii ? (
              <span
                className="text-[10px] uppercase rounded px-1.5 py-0.5 border bg-amber-500/15 text-amber-400 border-amber-500/30 inline-flex items-center gap-1"
                title="Enviado al SII; pendiente de recuperar folio"
              >
                pendiente SII
              </span>
            ) : null}
            {p.ready_to_invoice && p.status !== "invoiced" ? (
              <span
                className="text-[10px] uppercase rounded px-1.5 py-0.5 border bg-amber-500/15 text-amber-400 border-amber-500/30 inline-flex items-center gap-1"
                title="Hito alcanzado: listo para facturar"
              >
                <Sparkles className="w-3 h-3" /> facturar
              </span>
            ) : null}
          </div>
        ),
        width: 190,
      },
      {
        id: "contract",
        header: "Contrato",
        sortable: true,
        accessor: (p) => p.contract_name ?? p.contract_id,
        cell: (p) => (
          <span className="text-[11px] text-muted-foreground truncate">
            {p.contract_name ?? p.contract_id}
          </span>
        ),
        width: 200,
        defaultHidden: true,
      },
      {
        id: "kind",
        header: "Tipo",
        sortable: true,
        accessor: (p) => `${p.kind}${p.period_label ? ` · ${p.period_label}` : ""}`,
        cell: (p) => (
          <span className="text-[11px] text-muted-foreground uppercase truncate">
            {p.kind}
            {p.period_label ? ` · ${p.period_label}` : ""}
          </span>
        ),
        width: 140,
        defaultHidden: true,
      },
    ],
    [],
  );

  // Sum across currencies converting UF → CLP using current UF reference.
  const fmtSums = (sums: Record<string, number>) => {
    const entries = Object.entries(sums).filter(([, v]) => v > 0);
    if (entries.length === 0) return "—";
    let totalClp = 0;
    let hasUf = false;
    for (const [cur, v] of entries) {
      if (cur === "UF") {
        if (ufValor) totalClp += v * ufValor;
        hasUf = true;
      } else if (cur === "CLP") {
        totalClp += v;
      } else {
        // Unknown currency: fall back to listing all separately.
        return entries.map(([c, val]) => formatMoney(val, c)).join(" + ");
      }
    }
    if (hasUf && !ufValor) {
      return entries.map(([c, val]) => formatMoney(val, c)).join(" + ");
    }
    return formatMoney(Math.round(totalClp), "CLP");
  };

  // Month / Year selector state derived from monthFilter
  const MESES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  const [selYear, selMonth] = monthFilter
    ? monthFilter.split("-").map(Number)
    : todayKey.split("-").map(Number);

  // Year options: union of years present in data + current year ±2
  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    const curY = new Date().getUTCFullYear();
    for (let y = curY - 2; y <= curY + 2; y++) set.add(y);
    for (const mb of monthly) {
      const y = parseInt(mb.key.slice(0, 4), 10);
      if (!Number.isNaN(y)) set.add(y);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [monthly]);

  const setMY = (y: number, m: number) =>
    setMonthFilter(`${y}-${String(m).padStart(2, "0")}`);

  // Bucket for currently-selected month (computed across all data, not just visible)
  const selectedBucket = useMemo(() => {
    if (!monthFilter) {
      // "Todo": aggregate everything
      const acc = {
        porFacturar: {} as Record<string, number>,
        facturado: {} as Record<string, number>,
        counts: { porFacturar: 0, facturado: 0 },
      };
      for (const mb of monthly) {
        for (const [c, v] of Object.entries(mb.porFacturar))
          acc.porFacturar[c] = (acc.porFacturar[c] ?? 0) + v;
        for (const [c, v] of Object.entries(mb.facturado))
          acc.facturado[c] = (acc.facturado[c] ?? 0) + v;
        acc.counts.porFacturar += mb.counts.porFacturar;
        acc.counts.facturado += mb.counts.facturado;
      }
      return acc;
    }
    return (
      monthly.find((mb) => mb.key === monthFilter) ?? {
        porFacturar: {} as Record<string, number>,
        facturado: {} as Record<string, number>,
        counts: { porFacturar: 0, facturado: 0 },
      }
    );
  }, [monthly, monthFilter]);

  const titleLabel = monthFilter
    ? `${MESES[selMonth - 1]} ${selYear}`
    : "Todos los meses";

  return (
    <div className="flex flex-col h-full">
      {!dteCfg?.activo ? (
        <div className="mx-6 mt-3 border border-amber-500/30 bg-amber-500/10 rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            La emisión de DTE está inactiva. Configura tu API key en{" "}
            <a className="underline font-medium" href={`/w/${workspaceSlug}/finance/settings/dte`}>
              Ajustes → Facturación electrónica
            </a>
            .
          </span>
        </div>
      ) : null}
      {readyCount > 0 && statusFilter !== "ready" ? (
        <div className="mx-6 mt-3 border border-amber-500/30 bg-amber-500/10 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-amber-200">
            <Sparkles className="w-4 h-4" />
            <span>
              <strong>{readyCount}</strong>{" "}
              {readyCount === 1 ? "pago listo" : "pagos listos"} para facturar (hitos completados).
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setStatusFilter("ready")}
          >
            Ver
          </Button>
        </div>
      ) : null}

      {/* Encabezado: título + UF + selector de periodo + acción */}
      <div className="mx-6 mt-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-base font-semibold tracking-tight">Facturación</h2>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
              {titleLabel}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <UfChip workspaceId={ws.id} />
            <div
              className="flex items-center bg-card border border-border rounded-md h-7 p-0.5"
              title="Agrupar el calendario por mes planificado (fecha de cuota) o por mes de emisión real de la factura"
            >
              <button
                type="button"
                onClick={() => setGroupBy("planned")}
                className={`px-2 h-6 text-[11px] font-medium rounded transition-colors ${
                  groupBy === "planned"
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Planificado
              </button>
              <button
                type="button"
                onClick={() => setGroupBy("emission")}
                className={`px-2 h-6 text-[11px] font-medium rounded transition-colors ${
                  groupBy === "emission"
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Emisión
              </button>
            </div>
            <div className="flex items-center bg-card border border-border rounded-md h-7">
              <Select
                value={monthFilter ? String(selMonth) : ""}
                onValueChange={(v) => setMY(selYear, Number(v))}
                disabled={!monthFilter}
              >
                <SelectTrigger className="h-7 w-24 text-xs font-medium border-0 bg-transparent shadow-none focus:ring-0 px-2">
                  <SelectValue placeholder="Mes" />
                </SelectTrigger>
                <SelectContent>
                  {MESES.map((name, i) => (
                    <SelectItem key={i} value={String(i + 1)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="w-px h-4 bg-border" />
              <Select
                value={monthFilter ? String(selYear) : ""}
                onValueChange={(v) => setMY(Number(v), selMonth)}
                disabled={!monthFilter}
              >
                <SelectTrigger className="h-7 w-[68px] text-xs font-medium border-0 bg-transparent shadow-none focus:ring-0 px-2">
                  <SelectValue placeholder="Año" />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setCreateInvoiceOpen(true)}
            >
              <Plus className="size-3 mr-1" /> Factura puntual
            </Button>
          </div>
        </div>

        {/* Resumen — Por facturar / Facturado */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SummaryCard
            tone="warn"
            label="Por facturar"
            count={selectedBucket.counts.porFacturar}
            total={selectedBucket.counts.porFacturar + selectedBucket.counts.facturado}
            value={fmtSums(selectedBucket.porFacturar)}
            hint="Cuotas + por emitir"
          />
          <SummaryCard
            tone="info"
            label="Facturado"
            count={selectedBucket.counts.facturado}
            total={selectedBucket.counts.porFacturar + selectedBucket.counts.facturado}
            value={fmtSums(selectedBucket.facturado)}
            hint="DTEs emitidos / pagados"
          />
        </div>
      </div>

      <CreateInvoiceDialog
        open={createInvoiceOpen}
        onOpenChange={setCreateInvoiceOpen}
        workspaceId={ws.id}
        onCreated={invalidatePayments}
      />




      <DataGrid<Payment>
        viewKey={`payments:${ws.id}`}
        columns={columns}
        rows={payments}
        rowKey={(p) => p.id}
        defaultSort={{ id: "due_date", dir: "asc" }}
        onRowOpen={(p) => setActionPayment(p)}
        empty="Sin pagos."
        toolbarLeft={
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="h-7 w-48 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="ready">Listos para facturar</SelectItem>
                <SelectItem value="scheduled">Por facturar</SelectItem>

                <SelectItem value="overdue">Vencidos</SelectItem>
                <SelectItem value="invoiced">Facturados</SelectItem>
                <SelectItem value="paid">Pagados</SelectItem>
                <SelectItem value="cancelled">Cancelados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      <PaymentActionDialog
        payment={actionPayment}
        onOpenChange={(o) => !o && setActionPayment(null)}
        invoicePending={invoiceM.isPending}
        markPending={m.isPending}
        payPending={payM.isPending}
        cancelPending={cancelM.isPending}
        emitPending={emitM.isPending}
        onInvoice={(p) => {
          if ((p.invoice_estado === "scheduled" || p.source === "invoice") && p.invoice_id) {
            setEmitDialogInvoiceId(p.invoice_id);
            setActionPayment(null);
            return;
          }
          invoiceM.mutate(p.id, {
            onSuccess: () => setActionPayment(null),
          });
        }}
        onEmitDte={(p) => {
          if (!p.invoice_id) return;
          emitM.mutate(p.invoice_id, { onSuccess: () => setActionPayment(null) });
        }}

        onMarkInvoiced={(p) => {
          m.mutate(
            { data: { paymentId: p.id, status: "invoiced" } },
            { onSuccess: () => setActionPayment(null) },
          );
        }}
        onSendEmail={(p) => {
          if (!p.invoice_id) return;
          setEmailInvoiceId(p.invoice_id);
          setActionPayment(null);
        }}
        onMarkPaid={(p) => {
          if (!p.invoice_id) return;
          payM.mutate(p.invoice_id, { onSuccess: () => setActionPayment(null) });
        }}
        onCancelInvoice={(p) => {
          if (!p.invoice_id) return;
          const motivo = window.prompt("Motivo de cancelación");
          if (!motivo) return;
          cancelM.mutate(
            { invoiceId: p.invoice_id, motivo },
            { onSuccess: () => setActionPayment(null) },
          );
        }}
        onReconcile={(p) => {
          if (!p.invoice_id) return;
          setReconcileFor(p.invoice_id);
          setActionPayment(null);
        }}
        onViewPdf={(p) => {
          if (!p.invoice_id || (!p.pdf_url && !p.has_pdf && !p.folio_sii)) return;
          const folio = p.folio_sii ? `FE ${p.folio_sii}` : "Factura";
          const cliente = p.account_name ?? "";
          setPdfPreview({
            url: p.pdf_url ?? "invoice-pdf",
            invoiceId: p.invoice_id,
            title: cliente ? `${folio} - ${cliente}` : folio,
          });
        }}
        onGoToContract={(p) => {
          setActionPayment(null);
          if (!p.contract_id) return;
          navigate({
            to: "/w/$workspaceSlug/contracts/$contractId",
            params: { workspaceSlug, contractId: p.contract_id },
            search: { tab: "pagos" },
          });
        }}
      />

      <SendInvoiceEmailDialog
        open={!!emailInvoiceId}
        onOpenChange={(o) => !o && setEmailInvoiceId(null)}
        invoiceId={emailInvoiceId}
      />

      <ReconcileDteDialog
        open={!!reconcileFor}
        onOpenChange={(o) => !o && setReconcileFor(null)}
        invoiceId={reconcileFor}
        onDone={invalidatePayments}
      />

      <PdfViewerModal
        open={!!pdfPreview}
        onOpenChange={(o) => !o && setPdfPreview(null)}
        pdfUrl={pdfPreview?.url ?? null}
        invoiceId={pdfPreview?.invoiceId ?? null}
        title={pdfPreview?.title}
      />

      <EmitDteDialog
        open={!!emitDialogInvoiceId}
        invoiceId={emitDialogInvoiceId}
        workspaceId={ws.id}
        onOpenChange={(o) => !o && setEmitDialogInvoiceId(null)}
        onEmitted={invalidatePayments}
      />

    </div>
  );

}

function SummaryCard({
  label,
  tone,
  count,
  total,
  value,
  hint,
}: {
  label: string;
  tone: "warn" | "info" | "ok";
  count: number;
  total: number;
  value: string;
  hint?: string;
}) {
  const accent =
    tone === "warn"
      ? { text: "text-amber-500", bar: "bg-amber-500" }
      : tone === "info"
        ? { text: "text-blue-500", bar: "bg-blue-500" }
        : { text: "text-emerald-500", bar: "bg-emerald-500" };
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const m = /^(CLP|UF)\s+(.+)$/.exec(value);
  const currency = m?.[1] ?? "";
  const amount = m?.[2] ?? value;
  return (
    <div className="relative bg-card border border-border rounded-lg pl-3 pr-3 py-2.5 overflow-hidden hover:border-border/80 transition-colors">
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${accent.bar}`} />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className={`text-[10px] font-bold uppercase tracking-wider ${accent.text} leading-tight`}>
            {label}
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg font-semibold tracking-tight tabular-nums leading-none">
              {amount}
            </span>
            {currency ? (
              <span className="text-[10px] font-medium text-muted-foreground">{currency}</span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <div className={`text-base font-semibold ${accent.text} leading-none`}>{count}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>
          </div>
          <div className="hidden sm:flex flex-col items-end gap-1 w-16">
            <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
              <div className={`h-full ${accent.bar}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[9px] font-semibold text-muted-foreground tabular-nums">
              {pct}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function UfChip({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const { data: uf } = useQuery(latestUfRateQO(workspaceId));
  const refreshFn = useServerFn(refreshUfRates);
  const mut = useMutation({
    mutationFn: () => refreshFn({ data: { workspaceId } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(`UF actualizada · ${res.count} valores`);
        qc.invalidateQueries({ queryKey: ["latest-uf-rate", workspaceId] });
        // Las listas que muestran montos en CLP dependen de la UF: refrescarlas
        // con las mismas keys que usa la página (ver líneas 293-295).
        qc.invalidateQueries({ queryKey: ["ws-payments", workspaceId] });
        qc.invalidateQueries({ queryKey: ["finance-dashboard", workspaceId] });
        qc.invalidateQueries({ queryKey: ["invoices", workspaceId] });

      } else {
        toast.error(res.error ?? "No se pudo actualizar la UF");
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error al actualizar UF"),
  });
  const valor = uf?.valor
    ? uf.valor.toLocaleString("es-CL", { maximumFractionDigits: 0 })
    : "—";
  return (
    <div className="inline-flex items-center gap-1.5 h-7 px-2 text-xs text-muted-foreground bg-muted/40 border border-border rounded-md">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
        UF
      </span>
      <span className="font-semibold text-foreground tabular-nums">${valor}</span>
      <button
        type="button"
        onClick={() => mut.mutate()}
        disabled={mut.isPending}
        className="text-muted-foreground/70 hover:text-foreground transition-colors disabled:opacity-50"
        title="Actualizar UF"
      >
        <RefreshCw className={`h-3 w-3 ${mut.isPending ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}

function PaymentActionDialog({
  payment,
  onOpenChange,
  invoicePending,
  markPending,
  payPending,
  cancelPending,
  emitPending,
  onInvoice,
  onMarkInvoiced,
  onEmitDte,
  onSendEmail,
  onMarkPaid,
  onCancelInvoice,
  onReconcile,
  onViewPdf,
  onGoToContract,
}: {
  payment: Payment | null;
  onOpenChange: (open: boolean) => void;
  invoicePending: boolean;
  markPending: boolean;
  payPending: boolean;
  cancelPending: boolean;
  emitPending: boolean;
  onInvoice: (p: Payment) => void;
  onMarkInvoiced: (p: Payment) => void;
  onEmitDte: (p: Payment) => void;
  onSendEmail: (p: Payment) => void;
  onMarkPaid: (p: Payment) => void;
  onCancelInvoice: (p: Payment) => void;
  onReconcile: (p: Payment) => void;
  onViewPdf: (p: Payment) => void;
  onGoToContract: (p: Payment) => void;
}) {

  const open = !!payment;
  const hasInvoice = !!payment?.invoice_id;
  const isEmissionPending = payment?.invoice_estado === "scheduled" && !payment?.folio_sii;
  const canBeInvoiced = payment?.status === "scheduled" || payment?.status === "overdue";
  const isDraft = payment?.status === "draft";
  const isInvoicedOrPaid = payment?.status === "invoiced" || payment?.status === "paid";
  const canCancel =
    hasInvoice && payment?.status !== "paid" && payment?.status !== "cancelled";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {payment ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <StatusBadge status={payment.status} />
                {payment.folio_sii ? (
                  <span className="text-[10px] rounded px-1.5 py-0.5 border bg-muted/40 text-muted-foreground">
                    Folio #{payment.folio_sii}
                  </span>
                ) : null}
                {payment.source === "invoice" ? (
                  <span className="text-[10px] rounded px-1.5 py-0.5 border bg-muted/40 text-muted-foreground">
                    Factura puntual
                  </span>
                ) : null}
              </div>
              <DialogTitle className="text-base mt-2">
                {payment.account_name ?? "Sin cliente"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {payment.description ?? payment.kind}
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Monto
                </div>
                <div className="text-sm font-semibold tabular-nums">
                  {formatMoney(Number(payment.amount ?? 0), payment.currency)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Fecha
                </div>
                <div className="text-sm tabular-nums">{fmtDate(payment.due_date)}</div>
              </div>
            </div>

            {canBeInvoiced ? (
              <div className="flex flex-col gap-2">
                <Button
                  className="w-full justify-start"
                  disabled={invoicePending}
                  onClick={() => onInvoice(payment)}
                >
                  <FilePlus2 className="w-4 h-4 mr-2" />
                  {isEmissionPending ? "Recuperar folio SII" : "Emitir factura electrónica"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  disabled={markPending}
                  onClick={() => onMarkInvoiced(payment)}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Marcar como facturado (sin DTE)
                </Button>
              </div>
            ) : null}

            {isDraft ? (
              <div className="flex flex-col gap-2">
                <Button
                  className="w-full justify-start"
                  onClick={() => onEmitDte(payment)}
                  disabled={!hasInvoice || emitPending}
                >
                  <FilePlus2 className="w-4 h-4 mr-2" />
                  {emitPending ? "Emitiendo…" : "Emitir al SII ahora"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => onReconcile(payment)}
                  disabled={!hasInvoice}
                >
                  <Link2 className="w-4 h-4 mr-2" />
                  Conciliar folio SII (emitida fuera del sistema)
                </Button>
              </div>
            ) : null}


            {isInvoicedOrPaid ? (
              <div className="flex flex-col gap-2">
                {payment.pdf_url || payment.has_pdf || payment.folio_sii ? (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => onViewPdf(payment)}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Ver factura (PDF)
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  disabled={!hasInvoice}
                  onClick={() => onSendEmail(payment)}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Enviar factura por email
                </Button>
                {payment.status !== "paid" ? (
                  <Button
                    className="w-full justify-start"
                    disabled={!hasInvoice || payPending}
                    onClick={() => onMarkPaid(payment)}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Marcar como pagada
                  </Button>
                ) : null}
              </div>
            ) : null}

            {canCancel ? (
              <Button
                variant="ghost"
                className="w-full justify-start text-destructive hover:text-destructive"
                disabled={cancelPending}
                onClick={() => onCancelInvoice(payment)}
              >
                <XCircle className="w-4 h-4 mr-2" />
                Cancelar factura
              </Button>
            ) : null}


            <DialogFooter className="sm:justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => onGoToContract(payment)}
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1" />
                Ir al contrato
              </Button>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

