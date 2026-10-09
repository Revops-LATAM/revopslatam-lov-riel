import { ContractSplitsSection } from "@/components/tasko/finance/ContractSplitsSection";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useState } from "react";
import { z } from "zod";
import {
  wsBySlugQO,
  contractQO,
  accountQO,
  contractFinancialsQO,
  contractPaymentsQO,
  sprintsQO,
  contractSprintSummaryQO,
  contractProjectsQO,
  phasesQO,
  milestonesQO,
} from "@/lib/api/tasko.queries";
import { formatDateCL } from "@/lib/date-format";

import {
  upsertContractFinancials,
  updatePaymentStatus,
  createSprint,
  createContractProject,
  updateContractProject,
  generateSprintsForProject,
  createPhase,
  createMilestone,
  updateContract,
  regenerateContractPayments,
} from "@/lib/api/tasko.functions";
import { cancelContract } from "@/lib/api/renewals.functions";
import { updateSprintStatus, updatePhase, deletePhase } from "@/lib/api/operations.functions";
import { CONTRACT_STATUS_OPTIONS, SPRINT_STATUS_OPTIONS } from "@/lib/tasko-constants";
import { StatusBadgeSelect } from "@/components/tasko/StatusBadgeSelect";
import { usePermissions } from "@/lib/permissions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Plus, CheckCircle2, Circle, Lock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { RouteError } from "@/components/tasko/RouteError";
import { ContractTypeBadge } from "@/components/tasko/operations/ContractTypeBadge";
import { DataGrid, type ColumnDef } from "@/components/datagrid/DataGrid";
import { ContractDocuments } from "@/components/tasko/finance/ContractDocuments";

const search = z.object({
  tab: z.enum(["resumen", "plan", "pagos", "financials", "documentos"]).optional(),
});

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/contracts/$contractId")({
  ssr: false,
  validateSearch: search,
  head: () => ({ meta: [{ title: "Contrato · Riel" }] }),
  loader: async ({ context, params }) => {
    const ws = await context.queryClient.ensureQueryData(wsBySlugQO(params.workspaceSlug));
    const contract = await context.queryClient.ensureQueryData(contractQO(params.contractId));
    await context.queryClient.ensureQueryData(accountQO(contract.account_id));
    return { wsId: ws.id };
  },
  errorComponent: RouteError,
  component: ContractDetail,
});

const STATUS_OPTIONS = CONTRACT_STATUS_OPTIONS;

const STATUS_TONE: Record<string, string> = {
  borrador: "bg-muted text-muted-foreground border-border",
  activo: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  en_renovacion: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  finalizado: "bg-muted text-muted-foreground border-border",
  cancelado: "bg-red-500/15 text-red-400 border-red-500/30",
};

function ContractDetail() {
  const { workspaceSlug, contractId } = Route.useParams();
  const sp = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: ws } = useSuspenseQuery(wsBySlugQO(workspaceSlug));
  const { data: contract } = useSuspenseQuery(contractQO(contractId));
  const { data: account } = useSuspenseQuery(accountQO(contract.account_id));
  const perms = usePermissions(ws.id);
  const canManage = perms.hasAny(["ops_manage"]);
  const canFinance = perms.hasAny(["finance_view", "finance_manage"]);
  const qc = useQueryClient();
  const updateContractFn = useServerFn(updateContract);
  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      updateContractFn({ data: { contractId, status: status as "draft" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract", contractId] });
      qc.invalidateQueries({ queryKey: ["contracts", ws.id] });
      qc.invalidateQueries({ queryKey: ["accounts", ws.id] });
      toast.success("Estado actualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const requestedTab = sp.tab ?? "resumen";
  const tab = !canFinance && requestedTab === "pagos" ? "resumen" : requestedTab;
  const tone = STATUS_TONE[contract.status] ?? STATUS_TONE.draft;
  const statusLabel =
    STATUS_OPTIONS.find((s) => s.value === contract.status)?.label ?? contract.status;

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center gap-3">
        <Link
          to="/w/$workspaceSlug/contracts"
          params={{ workspaceSlug }}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-sm font-semibold truncate">{contract.name}</h1>
        <ContractTypeBadge type={contract.type} />
        <span className="text-xs text-muted-foreground">· {account.name}</span>
        <div className="ml-auto flex items-center gap-2">
          {canManage && contract.status !== "cancelado" && (
            <CancelContractButton
              contractId={contractId}
              contractName={contract.name}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ["contract", contractId] });
                qc.invalidateQueries({ queryKey: ["contracts", ws.id] });
                qc.invalidateQueries({ queryKey: ["contractPayments", contractId] });
              }}
            />
          )}
          {canManage ? (
            <Select
              value={contract.status}
              onValueChange={(v) => statusMutation.mutate(v)}
              disabled={statusMutation.isPending}
            >
              <SelectTrigger
                className={`h-7 text-[10px] uppercase rounded px-2 border ${tone} w-auto gap-1.5`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value} className="text-xs">
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className={`text-[10px] uppercase rounded px-1.5 py-0.5 border ${tone}`}>
              {statusLabel}
            </span>
          )}
        </div>
      </header>
      <Tabs
        value={tab}
        onValueChange={(v) => navigate({ search: { tab: v as "resumen" } })}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <TabsList className="mx-6 mt-3 self-start">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="plan">Plan</TabsTrigger>
          {canFinance && <TabsTrigger value="pagos">Pagos</TabsTrigger>}
          <TabsTrigger value="financials">Financials</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
        </TabsList>
        <div className="flex-1 overflow-auto p-6">
          <TabsContent value="resumen">
            <ResumenTab contract={contract} />
          </TabsContent>
          <TabsContent value="plan">
            <PlanTab contract={contract} />
          </TabsContent>
          {canFinance && (
            <TabsContent value="pagos">
              <PagosTab
                contractId={contractId}
                currency={contract.currency}
                accountId={contract.account_id}
              />
            </TabsContent>
          )}
          <TabsContent value="financials">
            <FinancialsTab contractId={contractId} />
          </TabsContent>
          <TabsContent value="documentos">
            <ContractDocuments workspaceId={contract.workspace_id} contractId={contractId} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

type ContractRow = Awaited<ReturnType<NonNullable<ReturnType<typeof contractQO>["queryFn"]>>>;

function ResumenTab({ contract }: { contract: ContractRow }) {
  const qc = useQueryClient();
  const updateContractFn = useServerFn(updateContract);
  const [glosa, setGlosa] = useState(contract.descripcion_factura ?? "");
  const glosaMut = useMutation({
    mutationFn: () =>
      updateContractFn({ data: { contractId: contract.id, descripcionFactura: glosa } }),
    onSuccess: () => {
      toast.success("Glosa de factura actualizada");
      qc.invalidateQueries({ queryKey: ["contract", contract.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const dirty = (glosa ?? "").trim() !== (contract.descripcion_factura ?? "").trim();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
      <Card title="Tipo">
        <ContractTypeBadge type={contract.type} />
      </Card>
      <Card title="Estado">
        <StatusBadgeSelect value={contract.status} options={CONTRACT_STATUS_OPTIONS} readOnly />
      </Card>
      <Card title="Período">
        {contract.start_date} → {contract.end_date ?? "en curso"}
      </Card>
      <Card title="Moneda">{contract.currency}</Card>
      {contract.type !== "implementation" && (
        <Card title="Duración de sprint">{contract.sprint_duration_days ?? "—"} días</Card>
      )}
      <Card title="Modalidad de pago">{contract.payment_schedule_type}</Card>
      <div className="md:col-span-2 border border-border rounded-md p-3">
        <div className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">
          Glosa para factura
        </div>
        <div className="flex gap-2 items-start">
          <Textarea
            value={glosa}
            onChange={(e) => setGlosa(e.target.value)}
            placeholder={`Se usa como descripción en el DTE. Si queda vacío se usa el nombre del contrato ("${contract.name}").`}
            className="text-sm min-h-[60px]"
            maxLength={500}
          />
          <Button
            size="sm"
            disabled={!dirty || glosaMut.isPending}
            onClick={() => glosaMut.mutate()}
          >
            Guardar
          </Button>
        </div>
        <div className="text-[10px] text-muted-foreground mt-1">
          Al emitir se agrega automáticamente el sufijo de cuota (ej. " - 3/12") o el nombre del
          hito.
        </div>
      </div>
      {contract.notes && (
        <div className="md:col-span-2 border border-border rounded-md p-3 text-sm text-muted-foreground whitespace-pre-wrap">
          {contract.notes}
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-md p-3">
      <div className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">{title}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

// ============ PLAN ============

function PlanTab({
  contract,
}: {
  contract: { id: string; type: "implementation" | "recurrente"; workspace_id: string };
}) {
  if (contract.type === "recurrente") return <SprintsSection contractId={contract.id} />;
  if (contract.type === "implementation")
    return <ProjectsSection contractId={contract.id} workspaceId={contract.workspace_id} />;
  return (
    <div className="space-y-6">
      <ProjectsSection contractId={contract.id} workspaceId={contract.workspace_id} />
      <SprintsSection contractId={contract.id} />
    </div>
  );
}

function fmtH(n: number) {
  return `${n.toLocaleString("es-CL", { maximumFractionDigits: 1 })} h`;
}

function ConsumptionBar({ real, contracted }: { real: number; contracted: number }) {
  if (!contracted) return <span className="text-muted-foreground">—</span>;
  const pct = (real / contracted) * 100;
  const tone = pct > 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-[11px] tabular-nums text-muted-foreground w-10 text-right">
        {Math.round(pct)}%
      </span>
    </div>
  );
}

const PERIOD_STATUS_LABEL: Record<string, string> = {
  planificado: "Planificado",
  en_curso: "En curso",
  cerrado: "Cerrado",
};

function SprintsSection({ contractId }: { contractId: string }) {
  const { data: summary } = useSuspenseQuery(contractSprintSummaryQO(contractId));
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const periods = summary.periods;
  const totals = periods.reduce(
    (acc, p) => ({
      contracted: acc.contracted + p.contractedHours,
      estimated: acc.estimated + p.estimatedHours,
      real: acc.real + p.realHours,
      tasksTotal: acc.tasksTotal + p.tasksTotal,
      tasksDone: acc.tasksDone + p.tasksDone,
    }),
    { contracted: 0, estimated: 0, real: 0, tasksTotal: 0, tasksDone: 0 },
  );

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card title="Horas contratadas">{fmtH(totals.contracted)}</Card>
        <Card title="Horas reales">
          {fmtH(totals.real)}
          {totals.contracted > 0 && (
            <span className="text-muted-foreground text-xs">
              {" "}
              ({Math.round((totals.real / totals.contracted) * 100)}%)
            </span>
          )}
        </Card>
        <Card title="Estimado vs. real">
          {fmtH(totals.estimated)} → {fmtH(totals.real)}
          <span
            className={`text-xs ml-1 ${totals.real > totals.estimated ? "text-destructive" : "text-emerald-600"}`}
          >
            ({totals.real - totals.estimated >= 0 ? "+" : ""}
            {(totals.real - totals.estimated).toLocaleString("es-CL", {
              maximumFractionDigits: 1,
            })}{" "}
            h)
          </span>
        </Card>
        <Card title="Avance de tareas">
          {totals.tasksDone}/{totals.tasksTotal}
        </Card>
      </div>

      <div className="border border-border rounded-md overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <h2 className="text-sm font-semibold">Sprints por período</h2>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Nuevo sprint
          </Button>
        </div>
        <div className="overflow-auto max-h-[60vh]">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-medium">Período</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium text-right">Contratadas</th>
                <th className="px-3 py-2 font-medium text-right">Estimadas</th>
                <th className="px-3 py-2 font-medium text-right">Reales</th>
                <th className="px-3 py-2 font-medium">Consumo</th>
                <th className="px-3 py-2 font-medium text-right">Tareas</th>
              </tr>
            </thead>
            <tbody>
              {periods.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    Sin sprints.
                  </td>
                </tr>
              )}
              {periods.map((p) => {
                const isOpen = expanded === p.sprintNumber;
                return (
                  <Fragment key={p.sprintNumber}>
                    <tr
                      className="border-t border-border hover:bg-muted/40 cursor-pointer"
                      onClick={() => setExpanded(isOpen ? null : p.sprintNumber)}
                    >
                      <td className="px-3 py-2 font-medium whitespace-nowrap">
                        <span className="inline-block w-3 text-muted-foreground">
                          {isOpen ? "▾" : "▸"}
                        </span>
                        Sprint #{p.sprintNumber}
                        <span className="text-muted-foreground font-normal ml-2">
                          {formatDateCL(p.startDate)} – {formatDateCL(p.endDate)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {PERIOD_STATUS_LABEL[p.status] ?? p.status}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtH(p.contractedHours)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtH(p.estimatedHours)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtH(p.realHours)}</td>
                      <td className="px-3 py-2">
                        <ConsumptionBar real={p.realHours} contracted={p.contractedHours} />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {p.tasksDone}/{p.tasksTotal}
                      </td>
                    </tr>
                    {isOpen &&
                      p.byProject.map((bp) => (
                        <tr key={bp.sprintId} className="border-t border-border/50 bg-muted/20">
                          <td className="px-3 py-1.5 pl-10 text-muted-foreground">
                            {bp.projectName}
                          </td>
                          <td className="px-3 py-1.5" />
                          <td className="px-3 py-1.5" />
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {fmtH(bp.estimatedHours)}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {fmtH(bp.realHours)}
                          </td>
                          <td className="px-3 py-1.5" />
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {bp.tasksDone}/{bp.tasksTotal}
                          </td>
                        </tr>
                      ))}
                    {isOpen && p.byProject.length === 0 && (
                      <tr className="border-t border-border/50 bg-muted/20">
                        <td colSpan={7} className="px-3 py-1.5 pl-10 text-muted-foreground">
                          Sin actividad registrada en este período.
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <NewSprintDialog open={open} onOpenChange={setOpen} contractId={contractId} />
    </section>
  );
}

function NewSprintDialog({
  open,
  onOpenChange,
  contractId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contractId: string;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(createSprint);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hours, setHours] = useState("40");
  const m = useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sprints", contractId] });
      toast.success("Sprint creado");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo sprint</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Inicio</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>Fin</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Horas contratadas</Label>
            <Input type="number" value={hours} onChange={(e) => setHours(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!startDate || !endDate || m.isPending}
            onClick={() =>
              m.mutate({ data: { contractId, startDate, endDate, contractedHours: Number(hours) } })
            }
          >
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectsSection({ contractId, workspaceId }: { contractId: string; workspaceId: string }) {
  const { data: projects } = useSuspenseQuery(contractProjectsQO(contractId));
  const qc = useQueryClient();
  const fn = useServerFn(createContractProject);
  const genFn = useServerFn(generateSprintsForProject);
  const updFn = useServerFn(updateContractProject);
  const [name, setName] = useState("");
  const [hours, setHours] = useState("");
  const [withSprints, setWithSprints] = useState(true);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["contract-projects", contractId] });
    qc.invalidateQueries({ queryKey: ["contract-children", contractId] });
    qc.invalidateQueries({ queryKey: ["operations-tree"] });
  };
  const m = useMutation({
    mutationFn: fn,
    onSuccess: (r: { sprintsCreated?: number }) => {
      refresh();
      toast.success(
        r?.sprintsCreated ? `Proyecto creado con ${r.sprintsCreated} sprints` : "Proyecto creado",
      );
      setName("");
      setHours("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const gen = useMutation({
    mutationFn: genFn,
    onSuccess: (r: { created: number }) => {
      refresh();
      toast.success(`${r.created} sprints generados`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const upd = useMutation({
    mutationFn: updFn,
    onSuccess: () => {
      refresh();
      toast.success("Proyecto actualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Proyectos del contrato</h2>
        <span className="text-xs text-muted-foreground">
          Cada proyecto tiene su propia grilla de sprints y fases.
        </span>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Nombre del proyecto (ej. Performance)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-xs"
        />
        <Input
          placeholder="Horas / sprint"
          type="number"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="w-32"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={withSprints}
            onChange={(e) => setWithSprints(e.target.checked)}
          />
          Generar sprints
        </label>
        <Button
          size="sm"
          disabled={!name.trim() || m.isPending}
          onClick={() =>
            m.mutate({
              data: {
                contractId,
                workspaceId,
                name: name.trim(),
                hoursPerSprint: hours ? Number(hours) : null,
                generateSprints: withSprints,
              },
            })
          }
        >
          Crear
        </Button>
      </div>
      {projects.length === 0 ? (
        <div className="border border-dashed border-border rounded-md p-6 text-center text-sm text-muted-foreground">
          Sin proyectos.
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => (
            <div key={p.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {p.is_primary ? (
                  <span className="rounded border border-emerald-500/30 bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 text-[10px] uppercase">
                    Principal
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[11px]"
                    disabled={upd.isPending}
                    onClick={() =>
                      upd.mutate({ data: { projectId: p.id, patch: { is_primary: true } } })
                    }
                  >
                    Marcar principal
                  </Button>
                )}
                <span>{p.sprint_count} sprints</span>
                {p.hours_per_sprint != null && <span>· {p.hours_per_sprint} h/sprint</span>}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[11px]"
                  disabled={gen.isPending}
                  onClick={() => gen.mutate({ data: { projectId: p.id } })}
                >
                  Generar sprints
                </Button>
              </div>
              <ProjectBlock projectId={p.id} name={p.name} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectBlock({ projectId, name }: { projectId: string; name: string }) {
  const { data: phases } = useQuery(phasesQO(projectId));
  const { data: milestones } = useQuery(milestonesQO(projectId));
  const qc = useQueryClient();
  const phaseFn = useServerFn(createPhase);
  const msFn = useServerFn(createMilestone);
  const [phaseName, setPhaseName] = useState("");
  const [msName, setMsName] = useState("");
  const [msAmount, setMsAmount] = useState("");
  const [msBillable, setMsBillable] = useState(false);

  return (
    <div className="border border-border rounded-md p-3 space-y-3">
      <div className="text-sm font-medium">{name}</div>
      <div>
        <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">Fases</div>
        <div className="flex gap-2 mb-2">
          <Input
            placeholder="Nueva fase"
            value={phaseName}
            onChange={(e) => setPhaseName(e.target.value)}
            className="max-w-xs h-8 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!phaseName.trim()}
            onClick={async () => {
              await phaseFn({ data: { projectId, name: phaseName.trim() } });
              qc.invalidateQueries({ queryKey: ["phases", projectId] });
              setPhaseName("");
            }}
          >
            + Fase
          </Button>
        </div>
        {(phases ?? []).length === 0 ? (
          <div className="text-xs text-muted-foreground">Sin fases.</div>
        ) : (
          <ul className="space-y-1.5">
            {phases?.map((p) => (
              <PhaseRow key={p.id} phase={p} projectId={projectId} />
            ))}
          </ul>
        )}
      </div>
      <div>
        <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">
          Milestones
        </div>
        <div className="flex gap-2 mb-2 flex-wrap">
          <Input
            placeholder="Nombre"
            value={msName}
            onChange={(e) => setMsName(e.target.value)}
            className="max-w-xs h-8 text-sm"
          />
          <Input
            placeholder="Monto"
            value={msAmount}
            onChange={(e) => setMsAmount(e.target.value)}
            type="number"
            className="w-24 h-8 text-sm"
          />
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={msBillable}
              onChange={(e) => setMsBillable(e.target.checked)}
            />
            Facturable
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={!msName.trim()}
            onClick={async () => {
              await msFn({
                data: {
                  projectId,
                  name: msName.trim(),
                  isBillableEvent: msBillable,
                  amount: msAmount ? Number(msAmount) : null,
                },
              });
              qc.invalidateQueries({ queryKey: ["milestones", projectId] });
              qc.invalidateQueries({ queryKey: ["contract-payments"] });
              setMsName("");
              setMsAmount("");
              setMsBillable(false);
            }}
          >
            + Milestone
          </Button>
        </div>
        {(milestones ?? []).length === 0 ? (
          <div className="text-xs text-muted-foreground">Sin milestones.</div>
        ) : (
          <ul className="text-sm space-y-1">
            {milestones?.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                {m.status === "achieved" || m.status === "invoiced" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                <span>{m.name}</span>
                {m.is_billable_event && m.amount && (
                  <span className="text-xs text-muted-foreground">· {m.amount}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PhaseRow({
  phase,
  projectId,
}: {
  phase: { id: string; name: string; start_date: string | null; end_date: string | null };
  projectId: string;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updatePhase);
  const deleteFn = useServerFn(deletePhase);
  const [name, setName] = useState(phase.name);
  const [startDate, setStartDate] = useState(phase.start_date ?? "");
  const [endDate, setEndDate] = useState(phase.end_date ?? "");
  const dirty =
    name !== phase.name ||
    (startDate || "") !== (phase.start_date ?? "") ||
    (endDate || "") !== (phase.end_date ?? "");

  const save = async () => {
    try {
      await updateFn({
        data: {
          phaseId: phase.id,
          name: name.trim() || phase.name,
          startDate: startDate || null,
          endDate: endDate || null,
        },
      });
      toast.success("Fase actualizada");
      qc.invalidateQueries({ queryKey: ["phases", projectId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al actualizar");
    }
  };

  const remove = async () => {
    if (!confirm(`¿Eliminar la fase "${phase.name}"?`)) return;
    try {
      await deleteFn({ data: { phaseId: phase.id } });
      toast.success("Fase eliminada");
      qc.invalidateQueries({ queryKey: ["phases", projectId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-2 border border-border rounded-md px-2 py-1.5">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-7 text-sm flex-1 min-w-[160px]"
      />
      <Input
        type="date"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        className="h-7 text-xs w-[140px]"
      />
      <span className="text-xs text-muted-foreground">→</span>
      <Input
        type="date"
        value={endDate}
        onChange={(e) => setEndDate(e.target.value)}
        className="h-7 text-xs w-[140px]"
      />
      <Button size="sm" variant="outline" className="h-7" disabled={!dirty} onClick={save}>
        Guardar
      </Button>
      <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={remove}>
        Eliminar
      </Button>
    </li>
  );
}

// ============ PAGOS ============

function RegeneratePaymentsButton({ contractId }: { contractId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(regenerateContractPayments);
  const m = useMutation({
    mutationFn: fn,
    onSuccess: (r: { created: number }) => {
      qc.invalidateQueries({ queryKey: ["contract-payments", contractId] });
      toast.success(`${r.created} cuotas generadas`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={m.isPending}
      onClick={() => m.mutate({ data: { contractId } })}
    >
      <RefreshCw className="w-3.5 h-3.5 mr-1" />
      Regenerar cuotas
    </Button>
  );
}

function PagosTab({
  contractId,
  currency,
  accountId,
}: {
  contractId: string;
  currency: string;
  accountId: string | null;
}) {
  const { data: payments } = useSuspenseQuery(contractPaymentsQO(contractId));
  const cuotaAmount = (() => {
    const list = (
      payments as Array<{ due_date: string; amount: number | string; kind: string }>
    ).filter((p) => p.kind === "monthly");
    if (!list.length) return null;
    const first = list.map((p) => p.due_date).sort()[0];
    return list.filter((p) => p.due_date === first).reduce((s, p) => s + Number(p.amount), 0);
  })();
  const splitsUi = accountId ? (
    <ContractSplitsSection
      contractId={contractId}
      accountId={accountId}
      currency={currency}
      cuotaAmount={cuotaAmount}
    />
  ) : null;
  const qc = useQueryClient();
  const fn = useServerFn(updatePaymentStatus);
  if (payments.length === 0) {
    return (
      <div className="space-y-3">
        {splitsUi}
        <div className="border border-dashed border-border rounded-md p-6 text-center text-sm text-muted-foreground space-y-3">
          <div>
            Sin pagos programados. Puedes generarlos desde las líneas de servicio del contrato.
          </div>
          <RegeneratePaymentsButton contractId={contractId} />
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {splitsUi}
      <div className="flex justify-end">
        <RegeneratePaymentsButton contractId={contractId} />
      </div>
      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs text-muted-foreground uppercase">
            <tr>
              <th className="text-left px-3 py-2">Tipo</th>
              <th className="text-left px-3 py-2">Período</th>
              <th className="text-left px-3 py-2">Vence</th>
              <th className="text-right px-3 py-2">Monto</th>
              <th className="text-left px-3 py-2">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2">{p.kind}</td>
                <td className="px-3 py-2">{p.period_label ?? "—"}</td>
                <td className="px-3 py-2">{p.due_date ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  {p.amount} {currency}
                </td>
                <td className="px-3 py-2">
                  <span className="text-[10px] uppercase border border-border rounded px-1.5 py-0.5">
                    {p.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  {p.status !== "paid" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await fn({ data: { paymentId: p.id, status: "paid" } });
                        qc.invalidateQueries({ queryKey: ["contract-payments", contractId] });
                        toast.success("Pago marcado");
                      }}
                    >
                      Marcar pagado
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ FINANCIALS ============

function FinancialsTab({ contractId }: { contractId: string }) {
  const { data: fin, isLoading } = useQuery(contractFinancialsQO(contractId));
  const qc = useQueryClient();
  const fn = useServerFn(upsertContractFinancials);
  const [monthlyFee, setMonthlyFee] = useState("");
  const [feeTotal, setFeeTotal] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [notes, setNotes] = useState("");
  const [loaded, setLoaded] = useState(false);

  if (!isLoading && fin === null) {
    return (
      <div className="border border-border rounded-md p-6 max-w-md text-sm text-muted-foreground flex items-start gap-3">
        <Lock className="w-4 h-4 mt-0.5" />
        <div>
          Solo el owner y los admins del workspace pueden ver los datos financieros de este
          contrato.
        </div>
      </div>
    );
  }

  if (fin && !loaded) {
    setMonthlyFee(fin.monthly_fee?.toString() ?? "");
    setFeeTotal(fin.fee_total?.toString() ?? "");
    setHourlyRate(fin.hourly_rate?.toString() ?? "");
    setNotes(fin.notes ?? "");
    setLoaded(true);
  }

  return (
    <div className="space-y-3 max-w-md">
      <div>
        <Label>Cuota mensual</Label>
        <Input type="number" value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} />
      </div>
      <div>
        <Label>Valor total del contrato</Label>
        <Input type="number" value={feeTotal} onChange={(e) => setFeeTotal(e.target.value)} />
      </div>
      <div>
        <Label>Tarifa por hora</Label>
        <Input type="number" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
      </div>
      <div>
        <Label>Notas</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button
        onClick={async () => {
          await fn({
            data: {
              contractId,
              monthlyFee: monthlyFee ? Number(monthlyFee) : null,
              feeTotal: feeTotal ? Number(feeTotal) : null,
              hourlyRate: hourlyRate ? Number(hourlyRate) : null,
              notes: notes || null,
            },
          });
          qc.invalidateQueries({ queryKey: ["contract-financials", contractId] });
          qc.invalidateQueries({ queryKey: ["contract-payments", contractId] });
          toast.success("Guardado");
        }}
      >
        Guardar
      </Button>
      <p className="text-xs text-muted-foreground">
        Si defines una cuota mensual, se generarán pagos automáticos.
      </p>
    </div>
  );
}

function CancelContractButton({
  contractId,
  contractName,
  onDone,
}: {
  contractId: string;
  contractName: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const cancel = useServerFn(cancelContract);

  const handle = async () => {
    if (!motivo.trim()) {
      toast.error("Indica el motivo");
      return;
    }
    setSaving(true);
    try {
      await cancel({ data: { contractId, motivo, fechaCancelacion: fecha } });
      toast.success("Contrato cancelado");
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="h-7 text-xs">
        Cancelar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar {contractName}</DialogTitle>
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
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cerrar
            </Button>
            <Button variant="destructive" onClick={handle} disabled={saving}>
              {saving ? "Cancelando…" : "Confirmar cancelación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
