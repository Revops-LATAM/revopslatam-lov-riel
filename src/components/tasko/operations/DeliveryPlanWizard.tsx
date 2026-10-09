import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  contractServiceLinesQO,
  membersWithRolesQO,
  contractQO,
  contractPaymentsQO,
  contractProjectsQO,
  projectQO,
  projectHourBudgetQO,
  projectServiceLinesQO,
  phasesQO,
  milestonesQO,
  milestoneLinksQO,
} from "@/lib/api/tasko.queries";
import {
  createProjectFromHandoff,
  upsertProjectHourBudget,
  createMilestone,
  upsertMilestoneLink,
  createPhase,
  deleteProjectPhases,
  deleteProjectMilestones,
  listSlas,
} from "@/lib/api/tasko.functions";
import { formatMoney } from "@/lib/tasko-utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  handoffId: string;
  contractId: string;
  workspaceId: string;
  defaultName?: string;
  onDone?: () => void;
};

type BudgetRow = {
  key: string;
  rol: string;
  horas: string;
  costoHora: string;
};

type PhaseRow = {
  key: string;
  name: string;
  durationValue: number;
  durationUnit: "weeks" | "months";
  endOverride?: string; // user-edited end date; takes precedence over computed
};

function addDuration(dateISO: string, value: number, unit: "weeks" | "months"): string {
  if (!dateISO) return "";
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (unit === "weeks") {
    dt.setUTCDate(dt.getUTCDate() + value * 7);
  } else {
    dt.setUTCMonth(dt.getUTCMonth() + value);
  }
  return dt.toISOString().slice(0, 10);
}

function computePhaseDates(
  phases: PhaseRow[],
  startISO: string,
): Array<{ start: string; end: string }> {
  const out: Array<{ start: string; end: string }> = [];
  let cursor = startISO;
  for (const p of phases) {
    if (!cursor) {
      out.push({ start: "", end: "" });
      continue;
    }
    const end =
      p.endOverride && p.endOverride >= cursor
        ? p.endOverride
        : addDuration(cursor, p.durationValue || 0, p.durationUnit);
    out.push({ start: cursor, end });
    cursor = end;
  }
  return out;
}

function formatDateEs(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const STEPS = [
  { id: 1, label: "Proyecto" },
  { id: 2, label: "Servicios" },
  { id: 6, label: "Fases" },
  { id: 3, label: "Horas" },
  { id: 4, label: "Hitos" },
  { id: 5, label: "Margen" },
] as const;

export function DeliveryPlanWizard({
  open,
  onOpenChange,
  handoffId,
  contractId,
  workspaceId,
  defaultName,
  onDone,
}: Props) {
  const [step, setStep] = useState(1);
  // Estructura de entrega: proyectos internos adicionales bajo el mismo contrato.
  const [extraProjects, setExtraProjects] = useState<{ name: string; hours: string }[]>([]);

  // Contract context (drives deliveryType + milestone step visibility)
  const contractQ = useQuery({ ...contractQO(contractId), enabled: open });
  const contractType = contractQ.data?.type ?? null; // 'implementation' | 'recurrente'
  const paymentSchedule = contractQ.data?.payment_schedule_type ?? "none";
  const hasMilestones = paymentSchedule === "per_milestone" || paymentSchedule === "mixed";
  const isRecurrente = contractType === "recurrente";

  // Step 1
  const [name, setName] = useState(defaultName ?? "");
  const [deliveryType, setDeliveryType] = useState<"proyecto" | "raas">("proyecto");
  const [leadId, setLeadId] = useState<string | "">("");
  const [fechaInicio, setFechaInicio] = useState(() => new Date().toISOString().slice(0, 10));
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [entregaQuickValue, setEntregaQuickValue] = useState<string>("");
  const [entregaQuickUnit, setEntregaQuickUnit] = useState<"weeks" | "months">("months");
  const [margenObjetivo, setMargenObjetivo] = useState("40");
  const [firstSprintStart, setFirstSprintStart] = useState("");
  const [requiresClientTickets, setRequiresClientTickets] = useState(false);
  const [slaId, setSlaId] = useState<string>("");

  // SLAs list (workspace-scoped)
  const slasFn = useServerFn(listSlas);
  const slasQ = useQuery({
    queryKey: ["slas", workspaceId],
    queryFn: () => slasFn({ data: { workspaceId } }),
    enabled: open,
  });

  // Hydrate tickets state from contract
  useEffect(() => {
    if (!contractQ.data) return;
    const c = contractQ.data as {
      requires_client_tickets?: boolean | null;
      sla_id?: string | null;
    };
    setRequiresClientTickets(!!c.requires_client_tickets);
    setSlaId(c.sla_id ?? "");
  }, [contractQ.data]);

  // Preselect "Normal" when toggling on without a SLA chosen
  useEffect(() => {
    if (!requiresClientTickets || slaId) return;
    const normal = (slasQ.data ?? []).find((s) => s.name === "Normal");
    if (normal) setSlaId(normal.id);
  }, [requiresClientTickets, slaId, slasQ.data]);

  // Lock deliveryType to the contract's configured type
  useEffect(() => {
    if (!contractType) return;
    setDeliveryType(contractType === "recurrente" ? "raas" : "proyecto");
  }, [contractType]);

  // Step 2
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  const linesQ = useQuery({ ...contractServiceLinesQO(contractId), enabled: open });
  const lines = linesQ.data ?? [];

  // Milestone payments from Finance (for step 4)
  const paymentsQ = useQuery({ ...contractPaymentsQO(contractId), enabled: open && hasMilestones });
  const milestonePayments = useMemo(
    () => (paymentsQ.data ?? []).filter((p) => p.kind === "milestone"),
    [paymentsQ.data],
  );

  // Step 4 — editable milestone rows keyed by paymentId
  type MilestoneRow = { enabled: boolean; name: string; dueDate: string };
  const [milestoneByPayment, setMilestoneByPayment] = useState<Record<string, MilestoneRow>>({});

  // Seed milestone rows when payments load
  useEffect(() => {
    if (!hasMilestones) return;
    if (milestonePayments.length === 0) return;
    setMilestoneByPayment((prev) => {
      const next: Record<string, MilestoneRow> = { ...prev };
      milestonePayments.forEach((p, i) => {
        if (next[p.id]) return;
        next[p.id] = {
          enabled: true,
          name: p.period_label?.trim() || `Hito ${i + 1}`,
          dueDate: p.due_date ?? "",
        };
      });
      return next;
    });
  }, [hasMilestones, milestonePayments]);

  // Auto-select all lines on first load
  useEffect(() => {
    if (!open) return;
    if (lines.length === 0) return;
    if (selectedLines.size > 0) return;
    setSelectedLines(new Set(lines.map((l) => l.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lines.length]);

  // Step 3
  const [budget, setBudget] = useState<BudgetRow[]>([
    { key: crypto.randomUUID(), rol: "", horas: "", costoHora: "" },
  ]);
  const [skipHours, setSkipHours] = useState(false);
  const membersQ = useQuery({ ...membersWithRolesQO(workspaceId), enabled: open });

  // Step "Fases" (only for implementation contracts).
  // The phase chain anchors to step 1's `fechaInicio` (Inicio delivery) — single source of truth.
  const [phases, setPhases] = useState<PhaseRow[]>([]);
  const phaseDates = useMemo(() => computePhaseDates(phases, fechaInicio), [phases, fechaInicio]);

  // -------- Hydration from existing project (continuar planificación) --------
  const contractProjectsQ = useQuery({ ...contractProjectsQO(contractId), enabled: open });
  const existingProjectId = contractProjectsQ.data?.[0]?.id ?? null;
  const isContinuation = !!existingProjectId;

  const existingProjectQ = useQuery({
    ...projectQO(existingProjectId ?? ""),
    enabled: open && !!existingProjectId,
  });
  const existingBudgetQ = useQuery({
    ...projectHourBudgetQO(existingProjectId ?? ""),
    enabled: open && !!existingProjectId,
  });
  const existingPSLQ = useQuery({
    ...projectServiceLinesQO(existingProjectId ?? ""),
    enabled: open && !!existingProjectId,
  });
  const existingPhasesQ = useQuery({
    ...phasesQO(existingProjectId ?? ""),
    enabled: open && !!existingProjectId,
  });
  const existingMilestonesQ = useQuery({
    ...milestonesQO(existingProjectId ?? ""),
    enabled: open && !!existingProjectId && hasMilestones,
  });
  const existingLinksQ = useQuery({
    ...milestoneLinksQO(existingProjectId ?? ""),
    enabled: open && !!existingProjectId && hasMilestones,
  });

  const hydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      hydratedRef.current = null;
      return;
    }
    if (!existingProjectId) return;
    if (hydratedRef.current === existingProjectId) return;
    if (!existingProjectQ.data) return;
    // Wait for all dependent data
    if (existingBudgetQ.isLoading || existingPSLQ.isLoading || existingPhasesQ.isLoading) return;
    if (hasMilestones && (existingMilestonesQ.isLoading || existingLinksQ.isLoading)) return;

    const p = existingProjectQ.data as {
      name: string;
      lead_id: string | null;
      margen_objetivo_pct: number | null;
      fecha_inicio_delivery: string | null;
      fecha_entrega_objetivo: string | null;
      first_sprint_start_date: string | null;
    };
    setName(p.name ?? defaultName ?? "");
    setLeadId(p.lead_id ?? "");
    if (p.margen_objetivo_pct != null) setMargenObjetivo(String(p.margen_objetivo_pct));
    setFechaInicio(p.fecha_inicio_delivery ?? "");
    setFechaEntrega(p.fecha_entrega_objetivo ?? "");
    setFirstSprintStart(p.first_sprint_start_date ?? "");

    // Service lines
    const psl = (existingPSLQ.data ?? []) as Array<{ service_line_id: string }>;
    if (psl.length > 0) setSelectedLines(new Set(psl.map((r) => r.service_line_id)));

    // Hour budget
    const bg = (existingBudgetQ.data ?? []) as Array<{
      rol: string;
      horas_estimadas: number | string;
      costo_hora: number | string | null;
    }>;
    if (bg.length > 0) {
      setBudget(
        bg.map((r) => ({
          key: crypto.randomUUID(),
          rol: r.rol,
          horas: String(r.horas_estimadas ?? ""),
          costoHora: r.costo_hora != null ? String(r.costo_hora) : "",
        })),
      );
    }

    // Phases — reverse duration as full weeks (round)
    const ph = (existingPhasesQ.data ?? []) as Array<{
      name: string;
      start_date: string | null;
      end_date: string | null;
    }>;
    if (ph.length > 0) {
      const first = ph[0];
      if (first.start_date) setFechaInicio(first.start_date);
      setPhases(
        ph.map((row) => {
          let weeks = 2;
          if (row.start_date && row.end_date) {
            const [ys, ms, ds] = row.start_date.split("-").map(Number);
            const [ye, me, de] = row.end_date.split("-").map(Number);
            const days = Math.round(
              (Date.UTC(ye, me - 1, de) - Date.UTC(ys, ms - 1, ds)) / 86400000,
            );
            weeks = Math.max(1, Math.round(days / 7));
          }
          return {
            key: crypto.randomUUID(),
            name: row.name,
            durationValue: weeks,
            durationUnit: "weeks" as const,
            endOverride: row.end_date ?? undefined,
          };
        }),
      );
    }

    // Milestones linked to payments
    if (hasMilestones) {
      const ms = (existingMilestonesQ.data ?? []) as Array<{
        id: string;
        name: string;
        due_date: string | null;
      }>;
      const links = (existingLinksQ.data ?? []) as Array<{
        milestone_id: string;
        payment_id: string;
      }>;
      const byMilestone = new Map(ms.map((m) => [m.id, m]));
      const next: Record<string, { enabled: boolean; name: string; dueDate: string }> = {};
      for (const l of links) {
        const mil = byMilestone.get(l.milestone_id);
        if (!mil) continue;
        next[l.payment_id] = {
          enabled: true,
          name: mil.name,
          dueDate: mil.due_date ?? "",
        };
      }
      if (Object.keys(next).length > 0) {
        setMilestoneByPayment((prev) => ({ ...prev, ...next }));
      }
    }

    hydratedRef.current = existingProjectId;
  }, [
    open,
    existingProjectId,
    existingProjectQ.data,
    existingBudgetQ.data,
    existingBudgetQ.isLoading,
    existingPSLQ.data,
    existingPSLQ.isLoading,
    existingPhasesQ.data,
    existingPhasesQ.isLoading,
    existingMilestonesQ.data,
    existingMilestonesQ.isLoading,
    existingLinksQ.data,
    existingLinksQ.isLoading,
    hasMilestones,
    defaultName,
  ]);
  // ---------------------------------------------------------------

  // Prefill first budget row with the project lead picked in step 1.
  useEffect(() => {
    if (!leadId) return;
    const lead = (membersQ.data ?? []).find((m) => m.user_id === leadId);
    if (!lead) return;
    const leadName = lead.profile?.full_name ?? lead.profile?.email ?? "";
    if (!leadName) return;
    setBudget((prev) => {
      if (prev.length === 0) return prev;
      const first = prev[0];
      // Only prefill when the first row is still empty/untouched.
      if (first.rol.trim() !== "" || first.horas !== "" || first.costoHora !== "") return prev;
      const next = [...prev];
      next[0] = { ...first, rol: leadName };
      return next;
    });
  }, [leadId, membersQ.data]);

  // Margin calc client-side.
  // For recurrente (raas): revenue + hours are monthly → use one period's monto.
  // For implementation (proyecto): use total contracted amount (monto * cuotas).
  const revenueByCurrency = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) {
      if (!selectedLines.has(l.id)) continue;
      const factor = isRecurrente ? 1 : (l.numero_cuotas ?? 1);
      const amount = Number(l.monto ?? 0) * factor;
      m.set(l.moneda, (m.get(l.moneda) ?? 0) + amount);
    }
    return m;
  }, [lines, selectedLines, isRecurrente]);

  const totalCost = useMemo(() => {
    let s = 0;
    for (const r of budget) {
      const h = Number(r.horas || 0);
      const c = Number(r.costoHora || 0);
      s += h * c;
    }
    return s;
  }, [budget]);

  // Use first currency revenue as comparable revenue
  const primaryRevenue = revenueByCurrency.values().next().value ?? 0;
  const primaryCurrency = revenueByCurrency.keys().next().value ?? "CLP";
  const margenPct = primaryRevenue > 0 ? ((primaryRevenue - totalCost) / primaryRevenue) * 100 : 0;
  const margenObjetivoNum = Number(margenObjetivo || 0);
  const margenAlerta = primaryRevenue > 0 && margenPct < margenObjetivoNum;

  const qc = useQueryClient();
  const createFn = useServerFn(createProjectFromHandoff);
  const budgetFn = useServerFn(upsertProjectHourBudget);
  const createMilestoneFn = useServerFn(createMilestone);
  const linkMilestoneFn = useServerFn(upsertMilestoneLink);
  const createPhaseFn = useServerFn(createPhase);
  const deletePhasesFn = useServerFn(deleteProjectPhases);
  const deleteMilestonesFn = useServerFn(deleteProjectMilestones);

  const confirmM = useMutation({
    mutationFn: async () => {
      const { projectId } = await createFn({
        data: {
          handoffId,
          project: {
            name,
            deliveryType,
            margenObjetivoPct: margenObjetivoNum,
            leadId: leadId || null,
            fechaInicioDelivery: fechaInicio || null,
            fechaEntregaObjetivo: fechaEntrega || null,
            firstSprintStartDate: isRecurrente && firstSprintStart ? firstSprintStart : null,
          },
          extraProjects: extraProjects
            .filter((p) => p.name.trim())
            .map((p) => ({
              name: p.name.trim(),
              hoursPerSprint: p.hours ? Number(p.hours) : null,
            })),
          serviceLineIds: Array.from(selectedLines),
          requiresClientTickets,
          slaId: requiresClientTickets ? slaId || null : null,
        },
      });
      const rows = skipHours
        ? []
        : budget
            .filter((r) => r.rol.trim() && Number(r.horas) > 0)
            .map((r, idx) => ({
              rol: r.rol.trim(),
              horasEstimadas: Number(r.horas),
              costoHora: r.costoHora ? Number(r.costoHora) : null,
              orden: idx,
            }));
      if (rows.length > 0) {
        await budgetFn({ data: { projectId, rows, replaceAll: true } });
      }

      // Create phases (implementation only) in declared order.
      // On "continuar planificación" wipe existing phases first to avoid duplicates.
      if (!isRecurrente) {
        if (isContinuation) {
          await deletePhasesFn({ data: { projectId } });
        }
        const phaseRows = phases
          .map((p, i) => ({
            name: p.name.trim(),
            startDate: phaseDates[i]?.start || null,
            endDate: phaseDates[i]?.end || null,
          }))
          .filter((p) => p.name.length > 0);
        for (const p of phaseRows) {
          await createPhaseFn({
            data: {
              projectId,
              name: p.name,
              startDate: p.startDate,
              endDate: p.endDate,
            },
          });
        }
      }

      // Create milestones + link to existing contract payments (Finanzas).
      // IMPORTANT: keep isBillableEvent=false so the milestone billing trigger
      // does NOT create a duplicate contract_payment — the link drives billing.
      // On "continuar planificación" wipe existing milestones first to avoid duplicates.
      if (hasMilestones) {
        if (isContinuation) {
          await deleteMilestonesFn({ data: { projectId } });
        }
        for (const p of milestonePayments) {
          const row = milestoneByPayment[p.id];
          if (!row?.enabled) continue;
          const trimmed = row.name.trim();
          if (!trimmed) continue;
          const m = await createMilestoneFn({
            data: {
              projectId,
              name: trimmed,
              dueDate: row.dueDate || null,
              isBillableEvent: false,
            },
          });
          await linkMilestoneFn({
            data: {
              milestoneId: m.id,
              paymentId: p.id,
              tipoVinculo: "gatilla_facturacion",
            },
          });
        }
      }

      return { projectId };
    },
    onSuccess: ({ projectId }) => {
      qc.invalidateQueries({ queryKey: ["handoffs", workspaceId] });
      qc.invalidateQueries({ queryKey: ["handoffs-pending-count", workspaceId] });
      qc.invalidateQueries({ queryKey: ["handoff", handoffId] });
      qc.invalidateQueries({ queryKey: ["contract-projects", contractId] });
      qc.invalidateQueries({ queryKey: ["operations-tree", workspaceId] });
      qc.invalidateQueries({ queryKey: ["contract-children", contractId] });
      qc.invalidateQueries({ queryKey: ["phases", projectId] });
      qc.invalidateQueries({ queryKey: ["milestones", projectId] });
      qc.invalidateQueries({ queryKey: ["contract-payments", contractId] });
      toast.success(isContinuation ? "Plan guardado." : "Plan creado. Proyecto generado.");
      onOpenChange(false);
      setStep(1);
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visibleSteps = STEPS.filter((s) => {
    if (s.id === 4 && !hasMilestones) return false;
    if (s.id === 6 && isRecurrente) return false;
    return true;
  });
  const currentIdx = Math.max(
    0,
    visibleSteps.findIndex((s) => s.id === step),
  );
  const isLastStep = currentIdx === visibleSteps.length - 1;

  const canNext = (() => {
    if (step === 1) return name.trim().length > 0 && deliveryType;
    if (step === 2) return selectedLines.size > 0;
    if (step === 3) return skipHours || budget.some((r) => r.rol.trim() && Number(r.horas) > 0);
    if (step === 6) return phases.every((p) => p.name.trim().length > 0);
    return true;
  })();

  function toggleLine(id: string) {
    setSelectedLines((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setStep(1);
      }}
    >
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {isContinuation ? "Continuar plan de delivery" : "Plan de delivery"}
          </DialogTitle>
        </DialogHeader>

        {/* Steps indicator */}
        <ol className="flex items-center gap-1.5 text-[11px] mb-2">
          {visibleSteps.map((s, idx) => (
            <li
              key={s.id}
              className={`flex-1 px-2 py-1 rounded border ${
                s.id === step
                  ? "bg-primary/10 border-primary/40 text-foreground"
                  : idx < currentIdx
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : "border-border text-muted-foreground"
              }`}
            >
              {idx + 1}. {s.label}
            </li>
          ))}
        </ol>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {step === 1 && (
            <div className="space-y-3">
              <div>
                <Label>Nombre del proyecto</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Implementación CRM…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo de entrega</Label>
                  <Select value={deliveryType} disabled>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="proyecto">Proyecto</SelectItem>
                      <SelectItem value="raas">Recurrente</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Definido en el contrato (Finanzas).
                  </p>
                </div>
                <div>
                  <Label>Margen objetivo (%)</Label>
                  <Input
                    type="number"
                    value={margenObjetivo}
                    onChange={(e) => setMargenObjetivo(e.target.value)}
                  />
                </div>
              </div>
              <div className="rounded-md border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs">Estructura de entrega</Label>
                    <p className="text-[10px] text-muted-foreground">
                      Agrega proyectos internos si el contrato se ejecuta en varias líneas (cada uno
                      con sus propios sprints y fases).
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setExtraProjects((p) => [...p, { name: "", hours: "" }])}
                  >
                    Agregar proyecto
                  </Button>
                </div>
                {extraProjects.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    1 proyecto interno ({name || "principal"}).
                  </p>
                ) : (
                  <div className="space-y-2">
                    {extraProjects.map((p, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <Input
                          className="h-8 text-xs"
                          placeholder={`Proyecto interno ${i + 2}`}
                          value={p.name}
                          onChange={(e) =>
                            setExtraProjects((arr) =>
                              arr.map((r, idx) => (idx === i ? { ...r, name: e.target.value } : r)),
                            )
                          }
                        />
                        <Input
                          className="h-8 w-28 text-xs"
                          type="number"
                          placeholder="h/sprint"
                          value={p.hours}
                          onChange={(e) =>
                            setExtraProjects((arr) =>
                              arr.map((r, idx) =>
                                idx === i ? { ...r, hours: e.target.value } : r,
                              ),
                            )
                          }
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs"
                          onClick={() =>
                            setExtraProjects((arr) => arr.filter((_, idx) => idx !== i))
                          }
                        >
                          Quitar
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <Label>Lead del proyecto</Label>
                <Select
                  value={leadId || "none"}
                  onValueChange={(v) => setLeadId(v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin asignar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin asignar</SelectItem>
                    {(membersQ.data ?? []).map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.profile?.full_name ?? m.profile?.email ?? m.user_id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{isRecurrente ? "Inicio 1er sprint" : "Inicio del proyecto"}</Label>
                  <Input
                    type="date"
                    value={isRecurrente ? firstSprintStart : fechaInicio}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (isRecurrente) {
                        setFirstSprintStart(v);
                        setFechaInicio(v);
                      } else {
                        setFechaInicio(v);
                      }
                    }}
                  />
                  {isRecurrente ? (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Define el inicio del proyecto y del primer sprint.
                    </p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Se usa también como inicio en el paso de Fases.
                    </p>
                  )}
                </div>
                {!isRecurrente && (
                  <div>
                    <Label>Entrega objetivo</Label>
                    <Input
                      type="date"
                      value={fechaEntrega}
                      onChange={(e) => setFechaEntrega(e.target.value)}
                    />
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="text-[10px] text-muted-foreground">Atajo:</span>
                      <Input
                        type="number"
                        min={1}
                        className="h-7 w-16 text-xs"
                        placeholder="N°"
                        value={entregaQuickValue}
                        onChange={(e) => setEntregaQuickValue(e.target.value)}
                      />
                      <Select
                        value={entregaQuickUnit}
                        onValueChange={(v) => setEntregaQuickUnit(v as "weeks" | "months")}
                      >
                        <SelectTrigger className="h-7 w-24 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weeks">semanas</SelectItem>
                          <SelectItem value="months">meses</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={!fechaInicio || !Number(entregaQuickValue)}
                        onClick={() => {
                          const n = Number(entregaQuickValue);
                          if (!fechaInicio || !n) return;
                          setFechaEntrega(addDuration(fechaInicio, n, entregaQuickUnit));
                        }}
                      >
                        Calcular
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Calcula desde el inicio del proyecto. Puedes ajustar la fecha manualmente.
                    </p>
                  </div>
                )}
              </div>
              {isRecurrente && (
                <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                  <div className="text-xs font-semibold">Sprints (configuración del contrato)</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[11px]">Cadencia</Label>
                      <Input
                        disabled
                        value={
                          contractQ.data?.sprint_cadence === "monthly"
                            ? "Mensual"
                            : contractQ.data?.sprint_cadence === "biweekly"
                              ? "Quincenal"
                              : (contractQ.data?.sprint_cadence as string | null) === "weekly"
                                ? "Semanal"
                                : "—"
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">Horas / sprint</Label>
                      <Input disabled value={contractQ.data?.hours_per_sprint ?? "—"} />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Cadencia y horas vienen del contrato (Finanzas). Al confirmar, se generan los
                    sprints automáticamente desde la fecha de inicio.
                  </p>
                </div>
              )}

              {/* Portal de tickets del cliente */}
              <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={requiresClientTickets}
                    onCheckedChange={(v) => setRequiresClientTickets(!!v)}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold">
                      Requiere portal de tickets del cliente
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Crea una fase "Tickets" y un formulario público para que el cliente envíe
                      solicitudes.
                    </p>
                  </div>
                </label>
                {requiresClientTickets && (
                  <div className="pl-6">
                    <Label className="text-[11px]">SLA aplicable</Label>
                    <Select value={slaId} onValueChange={setSlaId}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecciona un SLA" />
                      </SelectTrigger>
                      <SelectContent>
                        {(slasQ.data ?? []).map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Configura los SLAs en Ajustes → SLAs de tickets.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Selecciona qué líneas del contrato cubrirá este proyecto. Una línea puede mapearse a
                otro proyecto después.
              </p>
              {lines.length === 0 ? (
                <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-4 text-center">
                  El contrato no tiene líneas de servicio.
                </div>
              ) : (
                <ul className="border border-border rounded-md divide-y divide-border">
                  {lines.map((l) => (
                    <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <Checkbox
                        checked={selectedLines.has(l.id)}
                        onCheckedChange={() => toggleLine(l.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{l.tipo_servicio}</div>
                        <div className="text-xs text-muted-foreground">
                          {l.frecuencia}
                          {l.numero_cuotas ? ` · ${l.numero_cuotas} cuotas` : ""}
                        </div>
                      </div>
                      <div className="text-xs tabular-nums">
                        {l.monto ? `${Number(l.monto).toLocaleString()} ${l.moneda}` : "—"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {step === 3 &&
            (() => {
              const hoursPerSprint = Number(contractQ.data?.hours_per_sprint ?? 0);
              const hasSprintHours = isRecurrente && hoursPerSprint > 0;
              const totalHoras = budget.reduce((s, r) => s + Number(r.horas || 0), 0);
              const hoursDiff = hasSprintHours ? totalHoras - hoursPerSprint : 0;
              const hoursLabel = hasSprintHours
                ? "Horas / sprint"
                : isRecurrente
                  ? "Horas / mes"
                  : "Horas totales";
              return (
                <div className="space-y-2">
                  <label className="flex items-start gap-2 text-xs bg-muted/30 border border-border rounded-md px-2 py-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={skipHours}
                      onChange={(e) => setSkipHours(e.target.checked)}
                    />
                    <span>
                      <span className="text-foreground font-medium">Definir horas más tarde.</span>{" "}
                      <span className="text-muted-foreground">
                        Si aún no tienes claridad del presupuesto por rol, puedes saltar este paso y
                        configurarlo después desde el proyecto.
                      </span>
                    </span>
                  </label>
                  {!skipHours && (
                    <p className="text-xs text-muted-foreground">
                      {hasSprintHours
                        ? `El contrato tiene ${hoursPerSprint} horas contratadas por sprint. Distribúyelas entre los roles o personas que participarán en cada sprint.`
                        : isRecurrente
                          ? "Estima horas mensuales y costo por rol o persona. Como el contrato es recurrente, las horas representan la dedicación mensual de cada rol."
                          : "Estima horas totales y costo por rol o persona para todo el proyecto. Esto define el margen estimado."}
                    </p>
                  )}
                  {!skipHours && (
                    <>
                      <div className="border border-border rounded-md overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
                            <tr>
                              <th className="text-left px-2 py-1.5">Rol / Persona</th>
                              <th className="text-right px-2 py-1.5 w-28">{hoursLabel}</th>
                              <th className="text-right px-2 py-1.5 w-32">Costo/hora</th>
                              <th className="w-8" />
                            </tr>
                          </thead>
                          <tbody>
                            {budget.map((r, i) => (
                              <tr key={r.key} className="border-t border-border">
                                <td className="px-1 py-1">
                                  <Input
                                    className="h-8"
                                    value={r.rol}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setBudget((prev) =>
                                        prev.map((row, idx) =>
                                          idx === i ? { ...row, rol: v } : row,
                                        ),
                                      );
                                    }}
                                    placeholder="Ej. Tech Lead"
                                  />
                                </td>
                                <td className="px-1 py-1">
                                  <Input
                                    className="h-8 text-right"
                                    type="number"
                                    value={r.horas}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setBudget((prev) =>
                                        prev.map((row, idx) =>
                                          idx === i ? { ...row, horas: v } : row,
                                        ),
                                      );
                                    }}
                                  />
                                </td>
                                <td className="px-1 py-1">
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                                      {primaryCurrency}
                                    </span>
                                    <Input
                                      className="h-8 text-right pl-10"
                                      type="text"
                                      inputMode={primaryCurrency === "UF" ? "decimal" : "numeric"}
                                      value={(() => {
                                        const raw = r.costoHora;
                                        if (!raw) return "";
                                        if (primaryCurrency === "UF") {
                                          const [intPart, decPart] = raw.split(".");
                                          const intFmt = Number(intPart || 0).toLocaleString(
                                            "es-CL",
                                          );
                                          return decPart !== undefined
                                            ? `${intFmt},${decPart}`
                                            : intFmt;
                                        }
                                        const n = Number(raw.replace(/\D/g, ""));
                                        return Number.isFinite(n) && raw !== ""
                                          ? n.toLocaleString("es-CL")
                                          : "";
                                      })()}
                                      onChange={(e) => {
                                        let v = e.target.value;
                                        if (primaryCurrency === "UF") {
                                          v = v
                                            .replace(/\./g, "")
                                            .replace(",", ".")
                                            .replace(/[^0-9.]/g, "");
                                          const parts = v.split(".");
                                          if (parts.length > 2)
                                            v = parts[0] + "." + parts.slice(1).join("");
                                        } else {
                                          v = v.replace(/\D/g, "");
                                        }
                                        setBudget((prev) =>
                                          prev.map((row, idx) =>
                                            idx === i ? { ...row, costoHora: v } : row,
                                          ),
                                        );
                                      }}
                                    />
                                  </div>
                                </td>
                                <td className="px-1 py-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() =>
                                      setBudget((prev) => prev.filter((_, idx) => idx !== i))
                                    }
                                    disabled={budget.length <= 1}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setBudget((prev) => [
                            ...prev,
                            { key: crypto.randomUUID(), rol: "", horas: "", costoHora: "" },
                          ])
                        }
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Agregar línea
                      </Button>
                      <div className="text-xs text-muted-foreground pt-2 flex items-center justify-between">
                        <span>
                          Costo{" "}
                          {isRecurrente ? (hasSprintHours ? "por sprint" : "mensual") : "total"}{" "}
                          estimado:{" "}
                          <span className="text-foreground tabular-nums">
                            {formatMoney(totalCost, primaryCurrency)}
                          </span>
                        </span>
                        {hasSprintHours && (
                          <span
                            className={`tabular-nums ${hoursDiff === 0 ? "text-emerald-400" : "text-amber-400"}`}
                          >
                            {totalHoras} / {hoursPerSprint} h
                            {hoursDiff !== 0 ? ` (${hoursDiff > 0 ? "+" : ""}${hoursDiff})` : " ✓"}
                          </span>
                        )}
                      </div>
                      {hasSprintHours && hoursDiff !== 0 && (
                        <div className="flex items-start gap-2 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-md px-2 py-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>
                            La suma de horas asignadas {hoursDiff > 0 ? "supera" : "es menor que"}{" "}
                            las {hoursPerSprint} h contratadas por sprint.
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

          {step === 4 && (
            <div className="space-y-3">
              {!hasMilestones ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    El contrato en Finanzas no contempla hitos de facturación
                    {paymentSchedule === "monthly_fixed" ? " (pago mensual fijo)" : ""}. No es
                    necesario configurar hitos para este plan.
                  </p>
                  <div className="border border-dashed border-border rounded-md p-4 text-center text-sm text-muted-foreground">
                    No aplica para este contrato.
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Por cada pago por hito definido en Finanzas, crea un hito del proyecto y
                    vincúlalo. Al marcar el hito como cumplido, el pago queda listo para facturar
                    automáticamente. Podrás asignarlo a una fase del proyecto más tarde, desde el
                    detalle del proyecto.
                  </p>
                  {milestonePayments.length === 0 ? (
                    <div className="border border-dashed border-border rounded-md p-4 text-center text-sm text-muted-foreground">
                      Aún no hay pagos por hito definidos en el contrato.
                    </div>
                  ) : (
                    <div className="border border-border rounded-md overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
                          <tr>
                            <th className="w-8 px-2 py-1.5" />
                            <th className="text-left px-2 py-1.5">Pago (Finanzas)</th>
                            <th className="text-left px-2 py-1.5">Nombre del hito</th>
                            <th className="text-left px-2 py-1.5 w-36">Fecha objetivo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {milestonePayments.map((p) => {
                            const row = milestoneByPayment[p.id] ?? {
                              enabled: true,
                              name: p.period_label ?? "",
                              dueDate: p.due_date ?? "",
                            };
                            const update = (patch: Partial<MilestoneRow>) =>
                              setMilestoneByPayment((prev) => ({
                                ...prev,
                                [p.id]: { ...row, ...patch },
                              }));
                            return (
                              <tr key={p.id} className="border-t border-border align-top">
                                <td className="px-2 py-2">
                                  <Checkbox
                                    checked={row.enabled}
                                    onCheckedChange={(v) => update({ enabled: Boolean(v) })}
                                  />
                                </td>
                                <td className="px-2 py-2">
                                  <div className="truncate">{p.period_label ?? "Hito"}</div>
                                  <div className="text-[11px] text-muted-foreground tabular-nums">
                                    {formatMoney(Number(p.amount ?? 0), p.currency)}
                                    {p.due_date ? ` · ${p.due_date}` : ""}
                                  </div>
                                </td>
                                <td className="px-1 py-1">
                                  <Input
                                    className="h-8"
                                    value={row.name}
                                    onChange={(e) => update({ name: e.target.value })}
                                    placeholder="Ej. Kickoff aprobado"
                                    disabled={!row.enabled}
                                  />
                                </td>
                                <td className="px-1 py-1">
                                  <Input
                                    className="h-8"
                                    type="date"
                                    value={row.dueDate}
                                    onChange={(e) => update({ dueDate: e.target.value })}
                                    disabled={!row.enabled}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {step === 6 && !isRecurrente && (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Define las fases del delivery (ej. Discovery, Build, UAT, Go-live). Elige duración
                  en semanas o meses; el inicio de cada fase es el fin de la anterior.
                </p>
                {phases.length === 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() =>
                      setPhases([
                        {
                          key: crypto.randomUUID(),
                          name: "Discovery",
                          durationValue: 2,
                          durationUnit: "weeks",
                        },
                        {
                          key: crypto.randomUUID(),
                          name: "Build",
                          durationValue: 2,
                          durationUnit: "months",
                        },
                        {
                          key: crypto.randomUUID(),
                          name: "UAT",
                          durationValue: 2,
                          durationUnit: "weeks",
                        },
                        {
                          key: crypto.randomUUID(),
                          name: "Go-live",
                          durationValue: 1,
                          durationUnit: "weeks",
                        },
                      ])
                    }
                  >
                    Usar plantilla
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Inicio del proyecto</Label>
                <Input
                  type="date"
                  className="h-8 w-44"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                />
                <span className="text-[10px] text-muted-foreground">
                  Sincronizado con el paso 1.
                </span>
              </div>
              {!fechaInicio && (
                <p className="text-[11px] text-amber-500">
                  Define la fecha de inicio del delivery en el paso 1 para calcular las fases.
                </p>
              )}

              {phases.length === 0 ? (
                <div className="border border-dashed border-border rounded-md p-4 text-center text-sm text-muted-foreground">
                  Aún no hay fases. Agrega una o usa la plantilla.
                </div>
              ) : (
                <div className="border border-border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
                      <tr>
                        <th className="text-left px-2 py-1.5 w-8">#</th>
                        <th className="text-left px-2 py-1.5 min-w-[16rem]">Nombre</th>
                        <th className="text-left px-2 py-1.5 w-[150px]">Duración</th>
                        <th className="text-left px-2 py-1.5 w-[110px] whitespace-nowrap">
                          Inicio
                        </th>
                        <th className="text-left px-2 py-1.5 w-[150px]">Fin</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {phases.map((p, i) => (
                        <tr key={p.key} className="border-t border-border">
                          <td className="px-2 py-1 text-xs text-muted-foreground tabular-nums">
                            {i + 1}
                          </td>
                          <td className="px-1 py-1">
                            <Input
                              className="h-8 w-full font-medium"
                              value={p.name}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPhases((prev) =>
                                  prev.map((row, idx) => (idx === i ? { ...row, name: v } : row)),
                                );
                              }}
                              placeholder="Ej. Discovery & Diseño funcional"
                            />
                          </td>
                          <td className="px-1 py-1">
                            <div className="flex gap-1">
                              <Input
                                type="number"
                                min={1}
                                className="h-8 w-12 px-1.5"
                                value={p.durationValue || ""}
                                onChange={(e) => {
                                  const n = Math.max(0, Number(e.target.value) || 0);
                                  setPhases((prev) =>
                                    prev.map((row, idx) =>
                                      idx === i ? { ...row, durationValue: n } : row,
                                    ),
                                  );
                                }}
                              />
                              <Select
                                value={p.durationUnit}
                                onValueChange={(v) =>
                                  setPhases((prev) =>
                                    prev.map((row, idx) =>
                                      idx === i
                                        ? { ...row, durationUnit: v as "weeks" | "months" }
                                        : row,
                                    ),
                                  )
                                }
                              >
                                <SelectTrigger className="h-8 w-[88px] px-2">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="weeks">Sem.</SelectItem>
                                  <SelectItem value="months">Meses</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </td>
                          <td className="px-2 py-1 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                            {formatDateEs(phaseDates[i]?.start ?? "")}
                          </td>
                          <td className="px-1 py-1">
                            <Input
                              type="date"
                              className="h-8 px-1.5"
                              value={phaseDates[i]?.end ?? ""}
                              min={phaseDates[i]?.start ?? undefined}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPhases((prev) =>
                                  prev.map((row, idx) =>
                                    idx === i ? { ...row, endOverride: v } : row,
                                  ),
                                );
                              }}
                            />
                          </td>
                          <td className="px-1 py-1 text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() =>
                                setPhases((prev) => prev.filter((_, idx) => idx !== i))
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setPhases((prev) => [
                    ...prev,
                    { key: crypto.randomUUID(), name: "", durationValue: 2, durationUnit: "weeks" },
                  ])
                }
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Agregar fase
              </Button>

              <p className="text-[11px] text-muted-foreground">
                Si no agregas fases, podrás crearlas luego desde el detalle del proyecto.
              </p>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="border border-border rounded-md p-3">
                  <div className="text-[10px] uppercase text-muted-foreground tracking-wider">
                    Ingreso{isRecurrente ? " / mes" : ""}
                  </div>
                  <div className="text-lg font-semibold tabular-nums">
                    {formatMoney(primaryRevenue, primaryCurrency)}
                  </div>
                </div>
                <div className="border border-border rounded-md p-3">
                  <div className="text-[10px] uppercase text-muted-foreground tracking-wider">
                    Costo{isRecurrente ? " / mes" : ""}
                  </div>
                  <div className="text-lg font-semibold tabular-nums">
                    {formatMoney(totalCost, primaryCurrency)}
                  </div>
                </div>
                <div
                  className={`border rounded-md p-3 ${margenAlerta ? "border-rose-500/40 bg-rose-500/5" : "border-emerald-500/40 bg-emerald-500/5"}`}
                >
                  <div className="text-[10px] uppercase text-muted-foreground tracking-wider">
                    Margen
                  </div>
                  <div
                    className={`text-lg font-semibold tabular-nums ${margenAlerta ? "text-rose-400" : "text-emerald-400"}`}
                  >
                    {margenPct.toFixed(1)}%
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Objetivo {margenObjetivoNum}%
                  </div>
                </div>
              </div>
              {revenueByCurrency.size > 1 && (
                <div className="text-[11px] text-muted-foreground">
                  Nota: el contrato tiene múltiples monedas. El margen se calcula con la primera (
                  {primaryCurrency}). Para análisis multi-moneda, ajusta tipos de cambio en
                  Finanzas.
                </div>
              )}
              {margenAlerta ? (
                <div className="flex items-start gap-2 text-xs text-rose-400 border border-rose-500/30 bg-rose-500/5 rounded-md p-3">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    El margen estimado ({margenPct.toFixed(1)}%) está bajo el objetivo (
                    {margenObjetivoNum}%). Puedes continuar, pero el handoff quedará marcado con
                    alerta de margen.
                  </div>
                </div>
              ) : primaryRevenue > 0 ? (
                <div className="flex items-start gap-2 text-xs text-emerald-400 border border-emerald-500/30 bg-emerald-500/5 rounded-md p-3">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>Margen sobre objetivo. Listo para crear el proyecto.</div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Sin ingreso definido. Verifica las líneas de servicio antes de confirmar.
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const prev = visibleSteps[Math.max(0, currentIdx - 1)];
              if (prev) setStep(prev.id);
            }}
            disabled={currentIdx === 0 || confirmM.isPending}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Atrás
          </Button>
          {!isLastStep ? (
            <Button
              size="sm"
              onClick={() => {
                const next = visibleSteps[Math.min(visibleSteps.length - 1, currentIdx + 1)];
                if (next) setStep(next.id);
              }}
              disabled={!canNext}
            >
              Siguiente <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => confirmM.mutate()}
              disabled={confirmM.isPending || !name.trim()}
            >
              {confirmM.isPending ? "Guardando…" : isContinuation ? "Guardar plan" : "Crear plan"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
