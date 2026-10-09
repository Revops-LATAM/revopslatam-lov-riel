import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fragment as FragmentRow, useEffect, useState } from "react";
import { wsBySlugQO, partnersQO, partnerProjectsQO, asanaWorkspacesQO, asanaProjectsQO } from "@/lib/api/tasko.queries";
import { upsertPartner, deletePartner } from "@/lib/api/partners.functions";
import { createProject, deleteProject, updateProject, getProjectHoursSummary } from "@/lib/api/projects.functions";
import { syncAsanaProjectTasks } from "@/lib/api/asana.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Building2, ChevronDown, ChevronRight, FolderPlus, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { RouteError } from "@/components/tasko/RouteError";
import { AsanaSyncControls } from "@/components/tasko/AsanaSyncControls";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/settings/partners")({
  ssr: false,
  loader: async ({ context, params }) => {
    const ws = await context.queryClient.ensureQueryData(wsBySlugQO(params.workspaceSlug));
    await context.queryClient.ensureQueryData(partnersQO(ws.id));
    return null;
  },
  errorComponent: RouteError,
  component: PartnersPage,
});

type PartnerRow = {
  id: string;
  name: string;
  country: string | null;
  billing_entity: string | null;
  external_billing_system: string | null;
  notes: string | null;
};

function PartnersPage() {
  const { workspaceSlug } = Route.useParams();
  const { data: ws } = useSuspenseQuery(wsBySlugQO(workspaceSlug));
  const { data: rows } = useSuspenseQuery(partnersQO(ws.id));
  const qc = useQueryClient();
  const upsert = useServerFn(upsertPartner);
  const del = useServerFn(deletePartner);

  const [editing, setEditing] = useState<PartnerRow | null>(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const invalidate = () => qc.invalidateQueries({ queryKey: ["partners", ws.id] });

  const save = useMutation({
    mutationFn: async (vars: {
      id?: string;
      name: string;
      country: string | null;
      billingEntity: string | null;
      externalBillingSystem: string | null;
      notes: string | null;
    }) => upsert({ data: { workspaceId: ws.id, ...vars } }),
    onSuccess: () => {
      invalidate();
      setOpen(false);
      setEditing(null);
      toast.success("Partner guardado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Partner eliminado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };
  const openEdit = (p: PartnerRow) => {
    setEditing(p);
    setOpen(true);
  };

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold">Partners</h2>
          <p className="text-xs text-muted-foreground max-w-2xl">
            Empresas externas (consultoras, agencias) que te subcontratan trabajo. Los proyectos de
            partner viven fuera del flujo de contratos: no generan facturas en Riel ni alimentan los
            reportes financieros — la facturación ocurre en la entidad que tú indiques.
          </p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="w-3.5 h-3.5 mr-1" /> Nuevo partner
        </Button>
      </div>

      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="w-8"></th>
              <th className="text-left px-3 py-2 font-medium">Nombre</th>
              <th className="text-left px-3 py-2 font-medium">País</th>
              <th className="text-left px-3 py-2 font-medium">Entidad de facturación</th>
              <th className="text-left px-3 py-2 font-medium">Sistema</th>
              <th className="w-20"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-muted-foreground py-12 text-xs">
                  <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  Aún no hay partners. Crea uno para registrar proyectos subcontratados.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const isOpen = !!expanded[r.id];
                return (
                  <FragmentRow key={r.id}>
                    <tr className="border-t border-border">
                      <td className="px-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setExpanded((s) => ({ ...s, [r.id]: !s[r.id] }))}
                        >
                          {isOpen ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </td>
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.country ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.billing_entity ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.external_billing_system ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm(`¿Eliminar "${r.name}"?`)) remove.mutate(r.id);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr className="border-t border-border bg-muted/20">
                        <td></td>
                        <td colSpan={5} className="px-3 py-3">
                          <PartnerProjects
                            partnerId={r.id}
                            partnerName={r.name}
                            workspaceId={ws.id}
                            workspaceSlug={workspaceSlug}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </FragmentRow>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <PartnerDialog
        key={editing?.id ?? "new"}
        open={open}
        onOpenChange={setOpen}
        initial={editing}
        pending={save.isPending}
        onSave={(values) => save.mutate({ id: editing?.id, ...values })}
      />
    </div>
  );
}

function PartnerProjects({
  partnerId,
  partnerName,
  workspaceId,
  workspaceSlug,
}: {
  partnerId: string;
  partnerName: string;
  workspaceId: string;
  workspaceSlug: string;
}) {
  const { data: projects, isLoading } = useQuery(partnerProjectsQO(partnerId));
  const qc = useQueryClient();
  const createFn = useServerFn(createProject);
  const syncFn = useServerFn(syncAsanaProjectTasks);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [asanaWsGid, setAsanaWsGid] = useState<string>("");
  const [asanaGid, setAsanaGid] = useState<string>("");
  const [deliveryType, setDeliveryType] = useState<"proyecto" | "raas">("proyecto");
  const [sprintCadence, setSprintCadence] = useState<"weekly" | "biweekly" | "monthly">("biweekly");
  const [hoursMode, setHoursMode] = useState<"per_sprint" | "per_week" | "total">("per_sprint");
  const [hoursValue, setHoursValue] = useState<number>(40);
  const [durationMode, setDurationMode] = useState<"sprints" | "weeks">("sprints");
  const [sprintCount, setSprintCount] = useState<number>(6);
  const [weeksCount, setWeeksCount] = useState<number>(12);
  const [firstSprintStart, setFirstSprintStart] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const sprintDurationDays =
    sprintCadence === "monthly" ? 30 : sprintCadence === "weekly" ? 7 : 15;
  const sprintWeeks =
    sprintCadence === "monthly" ? 4 : sprintCadence === "weekly" ? 1 : 2;
  const effectiveSprintCount =
    durationMode === "weeks"
      ? Math.max(1, Math.ceil((Number.isFinite(weeksCount) ? weeksCount : 0) / sprintWeeks))
      : sprintCount;
  const effectiveWeeks =
    durationMode === "weeks" ? (Number.isFinite(weeksCount) ? weeksCount : 0) : sprintCount * sprintWeeks;
  const safeHours = Number.isFinite(hoursValue) ? hoursValue : 0;
  const totalHours =
    hoursMode === "total"
      ? safeHours
      : hoursMode === "per_week"
        ? safeHours * effectiveWeeks
        : safeHours * effectiveSprintCount;
  const hoursPerSprint =
    effectiveSprintCount > 0 ? Math.round((totalHours / effectiveSprintCount) * 100) / 100 : 0;

  const { data: asanaWorkspaces, isLoading: loadingWs, error: wsError } = useQuery({
    ...asanaWorkspacesQO(),
    enabled: open,
  });
  const { data: asanaProjects, isLoading: loadingAsanaProjects } = useQuery({
    ...asanaProjectsQO(asanaWsGid || undefined),
    enabled: open && !!asanaWsGid,
  });

  useEffect(() => {
    if (open && !asanaWsGid && asanaWorkspaces && asanaWorkspaces.length > 0) {
      setAsanaWsGid(asanaWorkspaces[0].gid);
    }
  }, [open, asanaWsGid, asanaWorkspaces]);

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          workspaceId,
          name: name.trim(),
          area: "operations",
          billingMode: "partner",
          partnerId,
          asanaProjectGid: asanaGid || undefined,
          partnerDeliveryType: deliveryType,
          ...(deliveryType === "raas"
            ? {
                sprintDurationDays,
                sprintCadence,
                hoursPerSprint,
                sprintCount: effectiveSprintCount,
                firstSprintStart,
              }
            : { startDate: firstSprintStart }),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-projects", partnerId] });
      qc.invalidateQueries({ queryKey: ["projects", workspaceId] });
      qc.invalidateQueries({ queryKey: ["operations-tree", workspaceId] });
      qc.invalidateQueries({ queryKey: ["accounts", workspaceId] });
      setOpen(false);
      setName("");
      setAsanaGid("");
      setDeliveryType("proyecto");
      toast.success("Proyecto creado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sync = useMutation({
    mutationFn: (projectId: string) => syncFn({ data: { projectId } }),
    onSuccess: (res) => {
      toast.success(`Sincronizado: ${res.created} nuevas · ${res.updated} actualizadas`);
      qc.invalidateQueries({ queryKey: ["partner-projects", partnerId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteFn = useServerFn(deleteProject);
  const del = useMutation({
    mutationFn: (projectId: string) => deleteFn({ data: { projectId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-projects", partnerId] });
      qc.invalidateQueries({ queryKey: ["projects", workspaceId] });
      qc.invalidateQueries({ queryKey: ["operations-tree", workspaceId] });
      toast.success("Proyecto eliminado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  type EditablePartnerProject = {
    id: string;
    name: string;
    delivery_type: "proyecto" | "raas" | null;
    startDate: string;
    sprintCadence: "weekly" | "biweekly" | "monthly" | null;
    hoursPerSprint: string;
    contractedHoursTotal: string;
    estimatedHoursTotal: string;
    hourBudgetRowCount: number;
    sprintCount: string;
    currentSprintCount: number;
  };

  const [editProject, setEditProject] = useState<EditablePartnerProject | null>(null);
  const updateFn = useServerFn(updateProject);
  const getHoursFn = useServerFn(getProjectHoursSummary);
  const updateMut = useMutation({
    mutationFn: (v: EditablePartnerProject) => {
      const numOrUndef = (s: string) => {
        const t = s.trim();
        if (t === "") return undefined;
        const n = Number(t);
        return Number.isFinite(n) && n >= 0 ? n : undefined;
      };
      return updateFn({
        data: {
          projectId: v.id,
          name: v.name,
          ...(v.delivery_type === "raas"
            ? {
                firstSprintStartDate: v.startDate || null,
                sprintCadence: v.sprintCadence ?? undefined,
                hoursPerSprint: numOrUndef(v.hoursPerSprint),
                sprintCount: numOrUndef(v.sprintCount),
              }
            : {
                fechaInicioDelivery: v.startDate || null,
                estimatedHoursTotal: numOrUndef(v.estimatedHoursTotal),
              }),
          contractedHoursTotal: numOrUndef(v.contractedHoursTotal) ?? null,
        },
      });

    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-projects", partnerId] });
      qc.invalidateQueries({ queryKey: ["projects", workspaceId] });
      setEditProject(null);
      toast.success("Proyecto actualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Proyectos de {partnerName}
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <FolderPlus className="w-3.5 h-3.5 mr-1" /> Nuevo proyecto
        </Button>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground py-2">Cargando…</div>
      ) : !projects || projects.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2 italic">Sin proyectos aún.</div>
      ) : (
        <ul className="divide-y divide-border border border-border rounded bg-background">
          {projects.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: p.color ?? "#8b5cf6" }}
                />
                <span className="font-medium truncate">{p.name}</span>
                {p.asana_project_gid ? (
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    Asana
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {p.asana_project_gid ? (
                  <AsanaSyncControls projectId={p.id} />
                ) : null}
                <Link
                  to="/w/$workspaceSlug/projects/$projectId"
                  params={{ workspaceSlug, projectId: p.id }}
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  Abrir <ExternalLink className="w-3 h-3" />
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={async () => {
                    const anyP = p as unknown as {
                      delivery_type: "proyecto" | "raas" | null;
                      first_sprint_start_date: string | null;
                      fecha_inicio_delivery: string | null;
                      contract: { sprint_cadence: "weekly" | "biweekly" | "monthly" | null; hours_per_sprint: number | null } | null;
                    };
                    // open with placeholders, then hydrate hours
                    setEditProject({
                      id: p.id,
                      name: p.name,
                      delivery_type: anyP.delivery_type,
                      startDate:
                        (anyP.delivery_type === "raas"
                          ? anyP.first_sprint_start_date
                          : anyP.fecha_inicio_delivery) ?? "",
                      sprintCadence: anyP.contract?.sprint_cadence ?? null,
                      hoursPerSprint:
                        anyP.contract?.hours_per_sprint != null ? String(anyP.contract.hours_per_sprint) : "",
                      contractedHoursTotal: "",
                      estimatedHoursTotal: "",
                      hourBudgetRowCount: 0,
                      sprintCount: "",
                      currentSprintCount: 0,
                    });

                    try {
                      const s = await getHoursFn({ data: { projectId: p.id } });
                      setEditProject((prev) =>
                        prev && prev.id === p.id
                          ? {
                              ...prev,
                              hoursPerSprint:
                                s.hoursPerSprint != null ? String(s.hoursPerSprint) : prev.hoursPerSprint,
                              contractedHoursTotal:
                                s.contractedHoursTotal != null ? String(s.contractedHoursTotal) : "",
                              estimatedHoursTotal:
                                s.estimatedHoursTotal > 0 ? String(s.estimatedHoursTotal) : "",
                              hourBudgetRowCount: s.hourBudgetRowCount,
                              sprintCount: s.sprintCount > 0 ? String(s.sprintCount) : "",
                              currentSprintCount: s.sprintCount,

                            }
                          : prev,
                      );
                    } catch {
                      /* keep placeholders */
                    }
                  }}
                >
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                  disabled={del.isPending}
                  onClick={() => {
                    if (confirm(`¿Eliminar el proyecto "${p.name}"? Esta acción no se puede deshacer.`)) {
                      del.mutate(p.id);
                    }
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo proyecto · {partnerName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre del proyecto *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Implementación HubSpot Acme Corp"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Tipo de proyecto *</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDeliveryType("proyecto")}
                  className={`text-left rounded border p-2 text-xs ${deliveryType === "proyecto" ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <div className="font-semibold">Por fases</div>
                  <div className="text-[11px] text-muted-foreground">Implementación con kanban y fases</div>
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveryType("raas")}
                  className={`text-left rounded border p-2 text-xs ${deliveryType === "raas" ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <div className="font-semibold">Por sprints</div>
                  <div className="text-[11px] text-muted-foreground">Trabajo recurrente por sprints</div>
                </button>
              </div>
            </div>

            {deliveryType === "raas" ? (
              <div className="space-y-2 rounded border border-border p-3 bg-muted/20">
                <Label className="text-xs font-semibold">Configuración de sprints</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px]">Cadencia</Label>
                    <Select value={sprintCadence} onValueChange={(v) => setSprintCadence(v as "weekly" | "biweekly" | "monthly")}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Semanal (7 días)</SelectItem>
                        <SelectItem value="biweekly">Quincenal (15 días)</SelectItem>
                        <SelectItem value="monthly">Mensual (30 días)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px]">Horas por</Label>
                    <Select value={hoursMode} onValueChange={(v) => setHoursMode(v as "per_sprint" | "per_week" | "total")}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="per_sprint">Por sprint</SelectItem>
                        <SelectItem value="per_week">Por semana</SelectItem>
                        <SelectItem value="total">Total del proyecto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px]">
                      {hoursMode === "total" ? "Horas totales" : hoursMode === "per_week" ? "Horas por semana" : "Horas por sprint"}
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.5"
                      value={Number.isFinite(hoursValue) ? hoursValue : ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setHoursValue(v === "" ? NaN : Math.max(0, Number(v)));
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Duración por</Label>
                    <Select value={durationMode} onValueChange={(v) => setDurationMode(v as "sprints" | "weeks")}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sprints">Cantidad de sprints</SelectItem>
                        <SelectItem value="weeks">Cantidad de semanas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {durationMode === "sprints" ? (
                    <div>
                      <Label className="text-[11px]">Cantidad de sprints</Label>
                      <Input
                        type="number"
                        min={1}
                        max={52}
                        value={Number.isFinite(sprintCount) ? sprintCount : ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setSprintCount(v === "" ? NaN : Math.max(1, Number(v)));
                        }}
                      />
                    </div>
                  ) : (
                    <div>
                      <Label className="text-[11px]">Cantidad de semanas</Label>
                      <Input
                        type="number"
                        min={1}
                        max={260}
                        value={Number.isFinite(weeksCount) ? weeksCount : ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setWeeksCount(v === "" ? NaN : Math.max(1, Number(v)));
                        }}
                      />
                    </div>
                  )}
                  <div>
                    <Label className="text-[11px]">Inicio 1er sprint</Label>
                    <Input
                      type="date"
                      value={firstSprintStart}
                      onChange={(e) => setFirstSprintStart(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Se generarán {effectiveSprintCount} sprint(s) de {sprintDurationDays} días · presupuesto total{" "}
                  <span className="font-semibold text-foreground">{totalHours} h</span>
                  {" "}(≈ {hoursPerSprint} h/sprint, {effectiveWeeks > 0 ? Math.round((totalHours / effectiveWeeks) * 10) / 10 : 0} h/semana).
                  Los sprints quedan sin horas fijas y el sistema controlará que no se exceda el total.
                </p>
              </div>
            ) : (
              <div>
                <Label className="text-xs">Fecha de inicio del proyecto</Label>
                <Input
                  type="date"
                  value={firstSprintStart}
                  onChange={(e) => setFirstSprintStart(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Desde cuándo comienza a regir este proyecto (podrás editarla luego).
                </p>
              </div>
            )}







            <div className="space-y-2 rounded border border-border p-3 bg-muted/20">
              <Label className="text-xs font-semibold">Vincular a Asana (opcional)</Label>
              {wsError ? (
                <p className="text-[11px] text-destructive">
                  No se pudo conectar con Asana: {(wsError as Error).message}
                </p>
              ) : (
                <>
                  {asanaWorkspaces && asanaWorkspaces.length > 1 ? (
                    <Select value={asanaWsGid} onValueChange={(v) => { setAsanaWsGid(v); setAsanaGid(""); }}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Workspace de Asana" />
                      </SelectTrigger>
                      <SelectContent>
                        {asanaWorkspaces.map((w) => (
                          <SelectItem key={w.gid} value={w.gid}>{w.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}

                  <Select value={asanaGid} onValueChange={setAsanaGid} disabled={loadingWs || loadingAsanaProjects || !asanaWsGid}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder={loadingWs || loadingAsanaProjects ? "Cargando proyectos…" : "Seleccionar proyecto de Asana"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(asanaProjects ?? []).map((p) => (
                        <SelectItem key={p.gid} value={p.gid}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Una vez vinculado podrás traer las tareas con el botón "Sync Asana".
                  </p>
                </>
              )}
            </div>

            <div className="rounded border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
              Este proyecto no tendrá contrato en Riel ni generará facturas — la facturación se
              hace desde {partnerName === "" ? "el partner" : `tu acuerdo con ${partnerName}`}.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "Creando…" : "Crear proyecto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editProject} onOpenChange={(v) => !v && setEditProject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar proyecto</DialogTitle>
          </DialogHeader>
          {editProject && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Nombre</Label>
                <Input
                  value={editProject.name}
                  onChange={(e) => setEditProject({ ...editProject, name: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">
                  {editProject.delivery_type === "raas" ? "Inicio 1er sprint" : "Fecha de inicio"}
                </Label>
                <Input
                  type="date"
                  value={editProject.startDate}
                  onChange={(e) => setEditProject({ ...editProject, startDate: e.target.value })}
                />
              </div>
              {editProject.delivery_type === "raas" && (
                <div>
                  <Label className="text-xs">Cadencia</Label>
                  <Select
                    value={editProject.sprintCadence ?? "biweekly"}
                    onValueChange={(v) =>
                      setEditProject({ ...editProject, sprintCadence: v as "weekly" | "biweekly" | "monthly" })
                    }
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Semanal (7 días)</SelectItem>
                      <SelectItem value="biweekly">Quincenal (15 días)</SelectItem>
                      <SelectItem value="monthly">Mensual (30 días)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Se regeneran las fechas de todos los sprints (se conservan tareas y estado).
                  </p>
                </div>
              )}

              {editProject.delivery_type === "raas" && (
                <div>
                  <Label className="text-xs">Cantidad de sprints</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={editProject.sprintCount}
                    onChange={(e) => {
                      const nextCount = e.target.value;
                      const total = Number(editProject.contractedHoursTotal);
                      const n = Number(nextCount);
                      const nextHps =
                        Number.isFinite(total) && total > 0 && Number.isFinite(n) && n > 0
                          ? String(Math.round((total / n) * 100) / 100)
                          : editProject.hoursPerSprint;
                      setEditProject({ ...editProject, sprintCount: nextCount, hoursPerSprint: nextHps });
                    }}
                    placeholder="0"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Actualmente: {editProject.currentSprintCount}. Los cambios se aplican a todos los sprints.
                  </p>
                </div>
              )}

              {editProject.delivery_type === "raas" && (
                <div>
                  <Label className="text-xs">Horas por sprint (auto)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={editProject.hoursPerSprint}
                    readOnly
                    className="bg-muted"
                    placeholder="0"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Se calcula automáticamente: horas totales ÷ cantidad de sprints. Se aplica a todos los sprints.
                  </p>
                </div>
              )}



              <div>
                <Label className="text-xs">Horas totales del contrato</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={editProject.contractedHoursTotal}
                  onChange={(e) => {
                    const nextTotal = e.target.value;
                    const t = Number(nextTotal);
                    const n = Number(editProject.sprintCount);
                    const nextHps =
                      Number.isFinite(t) && t > 0 && Number.isFinite(n) && n > 0
                        ? String(Math.round((t / n) * 100) / 100)
                        : editProject.hoursPerSprint;
                    setEditProject({ ...editProject, contractedHoursTotal: nextTotal, hoursPerSprint: nextHps });
                  }}
                  placeholder="0"
                />
              </div>

              {editProject.delivery_type !== "raas" && (
                <div>
                  <Label className="text-xs">Horas estimadas del proyecto (por fases)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={editProject.estimatedHoursTotal}
                    onChange={(e) =>
                      setEditProject({ ...editProject, estimatedHoursTotal: e.target.value })
                    }
                    placeholder="0"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {editProject.hourBudgetRowCount > 1
                      ? `Reemplaza el desglose actual por rol (${editProject.hourBudgetRowCount} filas) con una sola fila "Total".`
                      : "Se guarda como una única fila \"Total\" en el presupuesto de horas."}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProject(null)}>Cancelar</Button>
            <Button
              disabled={updateMut.isPending || !editProject?.name.trim()}
              onClick={() => editProject && updateMut.mutate(editProject)}
            >
              {updateMut.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PartnerDialog({
  open,
  onOpenChange,
  initial,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: PartnerRow | null;
  pending: boolean;
  onSave: (v: {
    name: string;
    country: string | null;
    billingEntity: string | null;
    externalBillingSystem: string | null;
    notes: string | null;
  }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [country, setCountry] = useState(initial?.country ?? "");
  const [billingEntity, setBillingEntity] = useState(initial?.billing_entity ?? "");
  const [externalSystem, setExternalSystem] = useState(initial?.external_billing_system ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Editar partner" : "Nuevo partner"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nombre *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Cortado Group" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">País</Label>
              <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Ej: USA" />
            </div>
            <div>
              <Label className="text-xs">Sistema de facturación externo</Label>
              <Input
                value={externalSystem}
                onChange={(e) => setExternalSystem(e.target.value)}
                placeholder="Ej: QuickBooks"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Entidad desde la que facturas a este partner</Label>
            <Input
              value={billingEntity}
              onChange={(e) => setBillingEntity(e.target.value)}
              placeholder="Ej: RevOps LATAM USA LLC"
            />
          </div>
          <div>
            <Label className="text-xs">Notas</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Información relevante sobre el partner, condiciones, contactos..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!name.trim() || pending}
            onClick={() =>
              onSave({
                name: name.trim(),
                country: country.trim() || null,
                billingEntity: billingEntity.trim() || null,
                externalBillingSystem: externalSystem.trim() || null,
                notes: notes.trim() || null,
              })
            }
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
