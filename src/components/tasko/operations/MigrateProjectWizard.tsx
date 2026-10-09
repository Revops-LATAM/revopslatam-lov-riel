import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { createOngoingProject } from "@/lib/api/operations.functions";
import { contractsQO, membersQO } from "@/lib/api/tasko.queries";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type Account = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  workspaceSlug: string;
  accounts: Account[];
};

type ContractMode = "existing" | "new";
type AccountMode = "existing" | "new";

const STATE_OPTIONS: Array<{ value: "en_curso" | "en_riesgo" | "planificacion"; label: string }> = [
  { value: "en_curso", label: "Activo / en curso" },
  { value: "en_riesgo", label: "En riesgo" },
  { value: "planificacion", label: "Pausado / planificación" },
];

export function MigrateProjectWizard({
  open,
  onOpenChange,
  workspaceId,
  workspaceSlug,
  accounts,
}: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const migrateFn = useServerFn(createOngoingProject);

  const [step, setStep] = useState(1);

  // Step 1 — account & contract
  const [accountMode, setAccountMode] = useState<AccountMode>("existing");
  const [accountId, setAccountId] = useState<string>("");
  const [newAccountName, setNewAccountName] = useState("");

  const [contractMode, setContractMode] = useState<ContractMode>("existing");
  const [existingContractId, setExistingContractId] = useState<string>("");
  const [ncName, setNcName] = useState("");
  const [ncType, setNcType] = useState<"implementation" | "recurrente">("recurrente");
  const [ncCurrency, setNcCurrency] = useState("CLP");
  const [ncStart, setNcStart] = useState<string>(new Date().toISOString().slice(0, 10));
  const [ncEnd, setNcEnd] = useState<string>("");
  const [ncHoursPerSprint, setNcHoursPerSprint] = useState<string>("");
  const [ncVendedor, setNcVendedor] = useState<string>("");

  // Step 2 — project
  const [pName, setPName] = useState("");
  const [pDescription, setPDescription] = useState("");
  const [pLeadId, setPLeadId] = useState<string>("");
  const [pState, setPState] = useState<"en_curso" | "en_riesgo" | "planificacion">("en_curso");
  const [pInicio, setPInicio] = useState<string>(new Date().toISOString().slice(0, 10));
  const [pEntrega, setPEntrega] = useState<string>("");
  const [pHoras, setPHoras] = useState<string>("");

  // Step 3 — sprint / hito / consumo
  const [hasSprint, setHasSprint] = useState(false);
  const [sNumber, setSNumber] = useState<string>("1");
  const [sStart, setSStart] = useState<string>(new Date().toISOString().slice(0, 10));
  const [sEnd, setSEnd] = useState<string>("");
  const [sHours, setSHours] = useState<string>("");

  const [hasHito, setHasHito] = useState(false);
  const [hName, setHName] = useState("");
  const [hDue, setHDue] = useState<string>("");

  const [horasPrev, setHorasPrev] = useState<string>("");

  // Data
  const resolvedAccountId = accountMode === "existing" ? accountId : "";
  const { data: contracts = [] } = useQuery({
    ...contractsQO(workspaceId, resolvedAccountId || undefined),
    enabled: open && contractMode === "existing" && !!resolvedAccountId,
  });
  const { data: members = [] } = useQuery({
    ...membersQO(workspaceId),
    enabled: open,
  });

  const memberOptions = useMemo(
    () =>
      members.map((m) => ({
        id: m.user_id,
        label: m.profile?.full_name ?? m.profile?.email ?? "(sin nombre)",
      })),
    [members],
  );

  function reset() {
    setStep(1);
    setAccountMode("existing");
    setAccountId("");
    setNewAccountName("");
    setContractMode("existing");
    setExistingContractId("");
    setNcName("");
    setNcType("recurrente");
    setNcCurrency("CLP");
    setNcStart(new Date().toISOString().slice(0, 10));
    setNcEnd("");
    setNcHoursPerSprint("");
    setNcVendedor("");
    setPName("");
    setPDescription("");
    setPLeadId("");
    setPState("en_curso");
    setPInicio(new Date().toISOString().slice(0, 10));
    setPEntrega("");
    setPHoras("");
    setHasSprint(false);
    setSNumber("1");
    setSStart(new Date().toISOString().slice(0, 10));
    setSEnd("");
    setSHours("");
    setHasHito(false);
    setHName("");
    setHDue("");
    setHorasPrev("");
  }

  const step1Valid =
    (accountMode === "existing" ? !!accountId : newAccountName.trim().length > 0) &&
    (contractMode === "existing"
      ? !!existingContractId
      : ncName.trim().length > 0 && !!ncStart);
  const step2Valid = pName.trim().length > 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const account =
        accountMode === "existing"
          ? ({ kind: "existing" as const, accountId })
          : ({ kind: "new" as const, name: newAccountName.trim() });

      const contract =
        contractMode === "existing"
          ? ({ kind: "existing" as const, contractId: existingContractId })
          : ({
              kind: "new" as const,
              name: ncName.trim(),
              type: ncType,
              currency: ncCurrency,
              startDate: ncStart,
              endDate: ncEnd || null,
              hoursPerSprint: ncHoursPerSprint ? Number(ncHoursPerSprint) : null,
              vendedorId: ncVendedor || null,
            });

      return migrateFn({
        data: {
          workspaceId,
          account,
          contract,
          project: {
            name: pName.trim(),
            description: pDescription.trim() || undefined,
            leadId: pLeadId || null,
            state: pState,
            fechaInicioDelivery: pInicio || null,
            fechaEntregaObjetivo: pEntrega || null,
            horasPresupuestadasTotal: pHoras ? Number(pHoras) : null,
          },
          sprint:
            hasSprint && sStart && sEnd
              ? {
                  number: Number(sNumber) || 1,
                  startDate: sStart,
                  endDate: sEnd,
                  contractedHours: sHours ? Number(sHours) : 0,
                }
              : null,
          hito:
            hasHito && hName.trim().length > 0
              ? { name: hName.trim(), dueDate: hDue || null }
              : null,
          horasConsumidasPrevias: horasPrev ? Number(horasPrev) : null,
        },
      });
    },
    onSuccess: (res) => {
      toast.success("Proyecto migrado", {
        description: "Listo para continuar la operación en Riel.",
      });
      qc.invalidateQueries({ queryKey: ["projects", workspaceId] });
      qc.invalidateQueries({ queryKey: ["contracts", workspaceId] });
      qc.invalidateQueries({ queryKey: ["accounts", workspaceId] });
      onOpenChange(false);
      reset();
      navigate({
        to: "/w/$workspaceSlug/contracts/$contractId",
        params: { workspaceSlug, contractId: res.contractId },
      });
    },
    onError: (e: Error) => toast.error("Error al migrar", { description: e.message }),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Migrar proyecto desde Wrike</DialogTitle>
          <DialogDescription>
            Atajo de marcha blanca. Crea proyecto + contrato ya en curso, sin pasar por
            proyección ni handoff. Paso {step} de 3.
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-5">
            <section className="space-y-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Cliente
              </Label>
              <RadioGroup
                value={accountMode}
                onValueChange={(v) => setAccountMode(v as AccountMode)}
                className="flex gap-4"
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="existing" /> Existente
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="new" /> Crear nuevo
                </label>
              </RadioGroup>
              {accountMode === "existing" ? (
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="Nombre del cliente"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                />
              )}
            </section>

            <section className="space-y-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Contrato
              </Label>
              <RadioGroup
                value={contractMode}
                onValueChange={(v) => setContractMode(v as ContractMode)}
                className="flex gap-4"
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="existing" /> Usar existente
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="new" /> Crear en curso
                </label>
              </RadioGroup>
              {contractMode === "existing" ? (
                <Select
                  value={existingContractId}
                  onValueChange={setExistingContractId}
                  disabled={!resolvedAccountId}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        resolvedAccountId
                          ? "Selecciona contrato"
                          : "Primero selecciona un cliente existente"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {contracts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} · {c.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Nombre</Label>
                    <Input value={ncName} onChange={(e) => setNcName(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo</Label>
                    <Select
                      value={ncType}
                      onValueChange={(v) => setNcType(v as "implementation" | "recurrente")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="recurrente">Recurrente</SelectItem>
                        <SelectItem value="implementation">Implementación</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Moneda</Label>
                    <Select value={ncCurrency} onValueChange={setNcCurrency}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CLP">CLP</SelectItem>
                        <SelectItem value="UF">UF</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Inicio real</Label>
                    <Input
                      type="date"
                      value={ncStart}
                      onChange={(e) => setNcStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fin (opcional)</Label>
                    <Input
                      type="date"
                      value={ncEnd}
                      onChange={(e) => setNcEnd(e.target.value)}
                    />
                  </div>
                  {ncType === "recurrente" && (
                    <div className="space-y-1">
                      <Label className="text-xs">Horas por sprint</Label>
                      <Input
                        type="number"
                        min={0}
                        value={ncHoursPerSprint}
                        onChange={(e) => setNcHoursPerSprint(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Vendedor (opcional)</Label>
                    <Select value={ncVendedor} onValueChange={setNcVendedor}>
                      <SelectTrigger>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {memberOptions.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nombre del proyecto</Label>
              <Input value={pName} onChange={(e) => setPName(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1">
              <Label>Descripción</Label>
              <Textarea
                rows={2}
                value={pDescription}
                onChange={(e) => setPDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Lead</Label>
                <Select value={pLeadId} onValueChange={setPLeadId}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {memberOptions.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Estado</Label>
                <Select value={pState} onValueChange={(v) => setPState(v as typeof pState)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Inicio de delivery</Label>
                <Input
                  type="date"
                  value={pInicio}
                  onChange={(e) => setPInicio(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Entrega objetivo</Label>
                <Input
                  type="date"
                  value={pEntrega}
                  onChange={(e) => setPEntrega(e.target.value)}
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Horas totales presupuestadas</Label>
                <Input
                  type="number"
                  min={0}
                  value={pHoras}
                  onChange={(e) => setPHoras(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <section className="space-y-3 border border-border rounded-md p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={hasSprint}
                  onChange={(e) => setHasSprint(e.target.checked)}
                />
                Registrar sprint actual
              </label>
              {hasSprint && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">N° sprint</Label>
                    <Input
                      type="number"
                      min={1}
                      value={sNumber}
                      onChange={(e) => setSNumber(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Horas comprometidas</Label>
                    <Input
                      type="number"
                      min={0}
                      value={sHours}
                      onChange={(e) => setSHours(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Inicio</Label>
                    <Input
                      type="date"
                      value={sStart}
                      onChange={(e) => setSStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fin</Label>
                    <Input
                      type="date"
                      value={sEnd}
                      onChange={(e) => setSEnd(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-3 border border-border rounded-md p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={hasHito}
                  onChange={(e) => setHasHito(e.target.checked)}
                />
                Registrar hito actual
              </label>
              {hasHito && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Nombre</Label>
                    <Input value={hName} onChange={(e) => setHName(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fecha objetivo</Label>
                    <Input
                      type="date"
                      value={hDue}
                      onChange={(e) => setHDue(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <Label>Horas ya consumidas en Wrike</Label>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={horasPrev}
                onChange={(e) => setHorasPrev(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Se registra como un único ajuste imputado al lead, para que el contador de
                horas consumidas vs contratadas quede correcto desde el día 1.
              </p>
            </section>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
              Atrás
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {step < 3 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
            >
              Siguiente
            </Button>
          ) : (
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? "Migrando..." : "Migrar proyecto"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
