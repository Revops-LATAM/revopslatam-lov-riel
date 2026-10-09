import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { wsBySlugQO, handoffsQO } from "@/lib/api/tasko.queries";
import { updateHandoff } from "@/lib/api/tasko.functions";
import { RouteError } from "@/components/tasko/RouteError";
import { Button } from "@/components/ui/button";
import { Handshake, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { DeliveryPlanWizard } from "@/components/tasko/operations/DeliveryPlanWizard";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/handoffs")({
  ssr: false,
  head: () => ({ meta: [{ title: "Handoffs · Riel" }] }),
  loader: async ({ context, params }) => {
    const ws = await context.queryClient.ensureQueryData(wsBySlugQO(params.workspaceSlug));
    await context.queryClient.ensureQueryData(handoffsQO(ws.id));
    return null;
  },
  errorComponent: RouteError,
  component: HandoffsBoard,
});

type HandoffState = "pendiente" | "en_planificacion" | "completado";

const COLUMNS: { id: HandoffState; label: string; tone: string; hint: string }[] = [
  {
    id: "pendiente",
    label: "Pendientes",
    tone: "border-amber-500/40",
    hint: "Esperan inicio de planificación",
  },
  {
    id: "en_planificacion",
    label: "En planificación",
    tone: "border-blue-500/40",
    hint: "Plan de delivery inconcluso",
  },
  {
    id: "completado",
    label: "Completados",
    tone: "border-emerald-500/40",
    hint: "Listos para ejecución",
  },
];

function HandoffsBoard() {
  const { workspaceSlug } = Route.useParams();
  const { data: ws } = useSuspenseQuery(wsBySlugQO(workspaceSlug));
  const { data: handoffs } = useSuspenseQuery(handoffsQO(ws.id));
  const qc = useQueryClient();
  const updateFn = useServerFn(updateHandoff);
  const [wizard, setWizard] = useState<{
    handoffId: string;
    contractId: string;
    name: string;
  } | null>(null);

  const m = useMutation({
    mutationFn: updateFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["handoffs", ws.id] });
      qc.invalidateQueries({ queryKey: ["handoffs-pending-count", ws.id] });
      toast.success("Handoff actualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grouped = new Map<HandoffState, typeof handoffs>();
  for (const c of COLUMNS) grouped.set(c.id, []);
  for (const h of handoffs) {
    const list = grouped.get(h.state as HandoffState);
    if (list) list.push(h);
  }

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center gap-2">
        <Handshake className="w-4 h-4 text-muted-foreground" />
        <h1 className="text-sm font-semibold">Handoffs Finanzas → Operaciones</h1>
        <span className="text-xs text-muted-foreground ml-2">
          {handoffs.length} contratos en transición
        </span>
      </header>
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map((col) => {
            const items = grouped.get(col.id) ?? [];
            return (
              <section
                key={col.id}
                className={`border-t-2 ${col.tone} bg-card/40 rounded-md flex flex-col min-h-[60vh]`}
              >
                <header className="px-3 py-2 border-b border-border flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{col.label}</div>
                    <div className="text-[10px] text-muted-foreground">{col.hint}</div>
                  </div>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </header>
                <div className="p-2 space-y-2 flex-1">
                  {items.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-6">
                      Sin handoffs.
                    </div>
                  ) : (
                    items.map((h) => (
                      <HandoffCard
                        key={h.id}
                        h={h}
                        workspaceSlug={workspaceSlug}
                        onPlan={() =>
                          setWizard({
                            handoffId: h.id,
                            contractId: h.contract_id,
                            name: h.contracts?.name ?? "",
                          })
                        }
                        onAdvance={(next) =>
                          m.mutate({ data: { handoffId: h.id, patch: { state: next } } })
                        }
                        busy={m.isPending}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {wizard && (
        <DeliveryPlanWizard
          open={!!wizard}
          onOpenChange={(v) => !v && setWizard(null)}
          handoffId={wizard.handoffId}
          contractId={wizard.contractId}
          workspaceId={ws.id}
          defaultName={wizard.name}
        />
      )}
    </div>
  );
}

type HandoffRow = Awaited<
  ReturnType<NonNullable<ReturnType<typeof handoffsQO>["queryFn"]>>
>[number];

function HandoffCard({
  h,
  workspaceSlug,
  onPlan,
  onAdvance,
  busy,
}: {
  h: HandoffRow;
  workspaceSlug: string;
  onPlan: () => void;
  onAdvance: (next: HandoffState) => void;
  busy: boolean;
}) {
  const account = h.contracts?.accounts?.name ?? "—";
  const contractName = h.contracts?.name ?? "Contrato";
  const created = h.created_at ? format(new Date(h.created_at), "dd/MM", { locale: es }) : "";
  // state-derived labels handled inline below
  return (
    <div className="border border-border bg-background rounded-md p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            to="/w/$workspaceSlug/contracts/$contractId"
            params={{ workspaceSlug, contractId: h.contract_id }}
            className="text-sm font-medium hover:underline truncate block"
          >
            {contractName}
          </Link>
          <div className="text-[11px] text-muted-foreground truncate">{account}</div>
        </div>
        {h.contracts?.currency && (
          <span className="text-[10px] uppercase text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">
            {h.contracts.currency}
          </span>
        )}
      </div>
      {h.margen_estimado_pct !== null && h.margen_estimado_pct !== undefined && (
        <div className="text-[11px] text-muted-foreground">
          Margen est.{" "}
          <span className={h.alerta_margen ? "text-rose-400 font-medium" : "text-foreground"}>
            {Number(h.margen_estimado_pct).toFixed(1)}%
          </span>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[10px] text-muted-foreground">Creado {created}</span>
        {h.state === "pendiente" ? (
          <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={onPlan}>
            <Sparkles className="w-3.5 h-3.5 mr-1" />
            Planificar
          </Button>
        ) : h.state === "en_planificacion" ? (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={onPlan}
              disabled={busy}
            >
              Continuar planificación
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={busy}
              onClick={() => onAdvance("completado")}
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Marcar lista
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
