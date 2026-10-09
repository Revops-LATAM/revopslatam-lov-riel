import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  wsBySlugQO,
  contractsQO,
  accountsQO,
  handoffsQO,
  membersWithRolesQO,
  serviceTypesQO,
  currencyRatesQO,
} from "@/lib/api/tasko.queries";
import { RouteError } from "@/components/tasko/RouteError";
import { ContractTypeBadge } from "@/components/tasko/operations/ContractTypeBadge";
import { CreateContractWizardV2 } from "@/components/tasko/finance/CreateContractWizardV2";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/finance/contracts")({
  ssr: false,
  loader: async ({ context, params }) => {
    const ws = await context.queryClient.ensureQueryData(wsBySlugQO(params.workspaceSlug));
    await Promise.all([
      context.queryClient.ensureQueryData(contractsQO(ws.id)),
      context.queryClient.ensureQueryData(accountsQO(ws.id)),
      context.queryClient.ensureQueryData(handoffsQO(ws.id)),
      context.queryClient.ensureQueryData(membersWithRolesQO(ws.id)),
      context.queryClient.ensureQueryData(serviceTypesQO(ws.id)),
      context.queryClient.ensureQueryData(currencyRatesQO(ws.id)),
    ]);
    return null;
  },

  errorComponent: RouteError,
  component: FinanceContractsPage,
});

const STATUS_LABEL: Record<string, string> = {
  proyectado: "Proyectado",
  draft: "Borrador",
  active: "Activo",
  activo: "Activo",
  paused: "Pausado",
  pausado: "Pausado",
  completed: "Cerrado",
  finalizado: "Finalizado",
  cancelled: "Cancelado",
  cancelado: "Cancelado",
};

const STATUS_CLASS: Record<string, string> = {
  proyectado: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
  draft: "bg-muted text-muted-foreground border border-border",
  active: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40",
  activo: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40",
  paused: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  pausado: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  completed: "bg-slate-500/15 text-slate-400 border border-slate-500/30",
  finalizado: "bg-slate-500/15 text-slate-400 border border-slate-500/30",
  cancelled: "bg-rose-500/15 text-rose-400 border border-rose-500/30",
  cancelado: "bg-rose-500/15 text-rose-400 border border-rose-500/30",
};

const HANDOFF_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  en_planificacion: "Planificando",
  completado: "Completado",
};

const HANDOFF_CLASS: Record<string, string> = {
  pendiente: "bg-amber-500/10 text-amber-600",
  en_planificacion: "bg-blue-500/10 text-blue-600",
  completado: "bg-emerald-500/10 text-emerald-600",
};

function FinanceContractsPage() {
  const { workspaceSlug } = Route.useParams();
  const { data: ws } = useSuspenseQuery(wsBySlugQO(workspaceSlug));
  const { data: contracts } = useSuspenseQuery(contractsQO(ws.id));
  const { data: accounts } = useSuspenseQuery(accountsQO(ws.id));
  const { data: handoffs } = useSuspenseQuery(handoffsQO(ws.id));
  const byAccount = new Map(accounts.map((a) => [a.id, a]));
  const handoffByContract = new Map(handoffs.map((h) => [h.contract_id, h]));

  const [wizardOpen, setWizardOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredContracts = useMemo(
    () => (statusFilter === "all" ? contracts : contracts.filter((c) => c.status === statusFilter)),
    [contracts, statusFilter],
  );

  return (
    <div className="p-6 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Vista financiera de contratos. Los contratos nuevos parten en <strong>Proyectado</strong>{" "}
          y pasan a Operaciones al activarlos.
        </p>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[160px] text-xs" aria-label="Filtrar por estado">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {[
                ["proyectado", "Proyectado"],
                ["activo", "Activo"],
                ["pausado", "Pausado"],
                ["finalizado", "Finalizado"],
                ["cancelado", "Cancelado"],
              ].map(([v, label]) => (
                <SelectItem key={v} value={v}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setWizardOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nuevo contrato
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Contrato</th>
              <th className="text-left px-3 py-2 font-medium">Cliente</th>
              <th className="text-left px-3 py-2 font-medium">Tipo</th>
              <th className="text-left px-3 py-2 font-medium">Moneda</th>
              <th className="text-left px-3 py-2 font-medium">Estado</th>
              <th className="text-left px-3 py-2 font-medium">Handoff</th>
              <th className="text-left px-3 py-2 font-medium">Inicio</th>
              <th className="text-left px-3 py-2 font-medium">Fin</th>
            </tr>
          </thead>
          <tbody>
            {filteredContracts.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted-foreground py-10">
                  Sin contratos.
                </td>
              </tr>
            ) : (
              filteredContracts.map((c) => {
                const h = handoffByContract.get(c.id);
                return (
                  <tr key={c.id} className="border-t border-border hover:bg-accent/30">
                    <td className="px-3 py-2">
                      <Link
                        to="/w/$workspaceSlug/contracts/$contractId"
                        params={{ workspaceSlug, contractId: c.id }}
                        search={{ tab: "financials" }}
                        className="hover:underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {byAccount.get(c.account_id)?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <ContractTypeBadge type={c.type} />
                    </td>
                    <td className="px-3 py-2">{c.currency}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${
                          STATUS_CLASS[c.status] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {STATUS_LABEL[c.status] ?? c.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {h ? (
                        <span
                          className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${
                            HANDOFF_CLASS[h.state] ?? "bg-muted text-muted-foreground"
                          }`}
                        >
                          {HANDOFF_LABEL[h.state] ?? h.state}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{c.start_date}</td>
                    <td className="px-3 py-2">{c.end_date ?? "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <CreateContractWizardV2
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        workspaceId={ws.id}
        workspaceSlug={workspaceSlug}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      />
    </div>
  );
}
