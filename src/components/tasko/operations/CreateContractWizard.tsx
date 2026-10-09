import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createContract,
  upsertContractFinancials,
  createPhase,
} from "@/lib/api/tasko.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Plus, X } from "lucide-react";
import { toast } from "sonner";

type ContractType = "implementation" | "recurrente";
type PaymentScheduleType = "monthly_fixed" | "per_milestone" | "mixed" | "none";
type BillingModel = "fixed" | "monthly" | "mixed";

const STEPS = ["Básico", "Plan de trabajo", "Financiero"] as const;

export function CreateContractWizard({
  open,
  onOpenChange,
  workspaceId,
  accounts,
  defaultAccountId,
  canSeeFinancials,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  accounts: Array<{ id: string; name: string }>;
  defaultAccountId?: string;
  canSeeFinancials: boolean;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createContract);
  const upsertFin = useServerFn(upsertContractFinancials);
  
  const addPhase = useServerFn(createPhase);

  const [step, setStep] = useState(0);

  // step 1
  const [accountId, setAccountId] = useState(defaultAccountId ?? "");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState<ContractType>("recurrente");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [durationMonths, setDurationMonths] = useState("12");

  // step 2 (recurrente)
  const [sprintDays, setSprintDays] = useState("15");
  const [hoursPerSprint, setHoursPerSprint] = useState("80");

  // step 2 (implementation / project)
  const [phaseNames, setPhaseNames] = useState<string[]>(["Discovery", "Implementación", "Go-live"]);

  // step 3
  const [currency, setCurrency] = useState("USD");
  const [billingModel, setBillingModel] = useState<BillingModel>("monthly");
  const [paymentScheduleType, setPaymentScheduleType] =
    useState<PaymentScheduleType>("monthly_fixed");
  const [feeTotal, setFeeTotal] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("");
  const [internalHourlyCost, setInternalHourlyCost] = useState("");

  useEffect(() => {
    if (defaultAccountId) setAccountId(defaultAccountId);
  }, [defaultAccountId]);

  useEffect(() => {
    if (!open) {
      setStep(0);
      setName("");
      setCode("");
      setFeeTotal("");
      setMonthlyFee("");
      setInternalHourlyCost("");
      setPhaseNames(["Discovery", "Implementación", "Go-live"]);
    }
  }, [open]);

  const endDate = useMemo(() => {
    const months = Number(durationMonths);
    if (!startDate || !months || months <= 0) return "";
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + months);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [startDate, durationMonths]);

  const sprintCount = useMemo(() => {
    if (type === "implementation") return 0;
    const days = Number(sprintDays);
    const months = Number(durationMonths);
    if (!days) return 0;
    // Sprint cadence mensual: 1 sprint por mes contratado (evita redondeos por días variables por mes).
    if (days === 30 && months > 0) return months;
    if (!startDate || !endDate) return 0;
    const ms = new Date(endDate).getTime() - new Date(startDate).getTime();
    const totalDays = Math.floor(ms / 86400000) + 1;
    return Math.max(0, Math.round(totalDays / days));
  }, [type, sprintDays, startDate, endDate, durationMonths]);

  const totalSteps = canSeeFinancials ? 3 : 2;
  const lastStep = totalSteps - 1;

  const mutation = useMutation({
    mutationFn: async () => {
      const cadence: "monthly" | "biweekly" | null =
        type === "implementation"
          ? null
          : Number(sprintDays) === 30
            ? "monthly"
            : "biweekly";
      const contract = await create({
        data: {
          workspaceId,
          accountId,
          name: name.trim(),
          code: code.trim() || undefined,
          type,
          billingModel: canSeeFinancials ? billingModel : "fixed",
          currency,
          startDate,
          endDate: endDate || null,
          sprintDurationDays: type === "implementation" ? null : Number(sprintDays),
          sprintCadence: cadence,
          hoursPerSprint:
            type === "implementation" || !hoursPerSprint ? null : Number(hoursPerSprint),
          paymentScheduleType: canSeeFinancials ? paymentScheduleType : "none",
        },
      });

      // Sprints are NOT created here. Operaciones generates them when the
      // delivery plan sets "fecha de inicio del primer sprint".

      // phases for project-type contracts
      if (type === "implementation" && contract?.project_id) {
        const names = phaseNames.map((n) => n.trim()).filter(Boolean);
        for (const phaseName of names) {
          await addPhase({ data: { projectId: contract.project_id, name: phaseName } });
        }
      }

      // financials
      if (canSeeFinancials && contract?.id) {
        const hasFin =
          feeTotal || monthlyFee || internalHourlyCost || hoursPerSprint;
        if (hasFin) {
          await upsertFin({
            data: {
              contractId: contract.id,
              feeTotal: feeTotal ? Number(feeTotal) : null,
              monthlyFee: monthlyFee ? Number(monthlyFee) : null,
              internalHourlyCost: internalHourlyCost ? Number(internalHourlyCost) : null,
              contractedHoursTotal:
                type !== "implementation" && hoursPerSprint
                  ? Number(hoursPerSprint) * sprintCount
                  : null,
            },
          });
        }
      }

      return contract;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contracts", workspaceId] });
      qc.invalidateQueries({ queryKey: ["operations-tree", workspaceId] });
      qc.invalidateQueries({ queryKey: ["ws-payments", workspaceId] });
      qc.invalidateQueries({ queryKey: ["finance-dashboard", workspaceId] });
      toast.success("Contrato creado");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canNext = () => {
    if (step === 0) return accountId && name.trim() && startDate && Number(durationMonths) > 0;
    if (step === 1) {
      if (type === "implementation") return true;
      return Number(sprintDays) > 0;
    }
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nuevo contrato</DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-2 mb-4">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 flex-1">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                  i < step
                    ? "bg-primary text-primary-foreground"
                    : i === step
                      ? "bg-primary/20 text-primary border border-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              <span className={`text-xs ${i === step ? "font-medium" : "text-muted-foreground"}`}>
                {STEPS[i]}
              </span>
              {i < totalSteps - 1 && <div className="flex-1 h-px bg-border" />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-3">
            <div>
              <Label>Cliente</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Selecciona un cliente" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label>Nombre</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contrato 2026" />
              </div>
              <div>
                <Label>Código</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="OPT" />
              </div>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as ContractType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="implementation">Proyecto</SelectItem>
                  <SelectItem value="recurrente">Recurrente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Fecha inicio</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label>Duración (meses)</Label>
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={durationMonths}
                  onChange={(e) => setDurationMonths(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Termina el <strong>{endDate || "—"}</strong>
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            {type === "implementation" ? (
              <div className="space-y-2">
                <Label>Fases del proyecto</Label>
                <p className="text-xs text-muted-foreground">
                  Define las fases iniciales. Podrás editarlas o agregar hitos desde el detalle del contrato.
                </p>
                <div className="space-y-1.5">
                  {phaseNames.map((n, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-5 text-right tabular-nums">
                        {i + 1}.
                      </span>
                      <Input
                        value={n}
                        onChange={(e) =>
                          setPhaseNames((arr) => arr.map((v, idx) => (idx === i ? e.target.value : v)))
                        }
                        placeholder={`Fase ${i + 1}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setPhaseNames((arr) => arr.filter((_, idx) => idx !== i))}
                        disabled={phaseNames.length <= 1}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPhaseNames((arr) => [...arr, ""])}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Agregar fase
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Duración del sprint</Label>
                    <Select value={sprintDays} onValueChange={setSprintDays}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">Quincenal (15 días)</SelectItem>
                        <SelectItem value="30">Mensual (30 días)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Horas por sprint</Label>
                    <Input
                      type="number"
                      min={0}
                      max={10000}
                      step={0.5}
                      value={hoursPerSprint}
                      onChange={(e) => setHoursPerSprint(e.target.value)}
                    />
                  </div>
                </div>
                <div className="rounded-md bg-muted/30 border border-border p-3 text-xs space-y-1">
                  <div>
                    Los sprints se crearán automáticamente cuando Operaciones defina la <strong>fecha de inicio del primer sprint</strong> en el plan de delivery.
                  </div>
                  <div className="text-muted-foreground">
                    Estimación: <strong>{sprintCount}</strong> sprints ·{" "}
                    <strong>{(sprintCount * Number(hoursPerSprint || 0)).toFixed(1)} h</strong> totales
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {step === 2 && canSeeFinancials && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Moneda</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD · Dólar</SelectItem>
                    <SelectItem value="CLP">CLP · Peso chileno</SelectItem>
                    <SelectItem value="UF">UF · Unidad de Fomento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Modelo de cobro</Label>
                <Select value={billingModel} onValueChange={(v) => setBillingModel(v as BillingModel)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fijo</SelectItem>
                    <SelectItem value="monthly">Mensual</SelectItem>
                    <SelectItem value="mixed">Mixto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(billingModel === "fixed" || billingModel === "mixed") && (
                <div>
                  <Label>Valor total ({currency})</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={feeTotal}
                    onChange={(e) => setFeeTotal(e.target.value)}
                    placeholder="0"
                  />
                </div>
              )}
              {(billingModel === "monthly" || billingModel === "mixed") && (
                <div>
                  <Label>Fee mensual ({currency})</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={monthlyFee}
                    onChange={(e) => setMonthlyFee(e.target.value)}
                    placeholder="0"
                  />
                </div>
              )}
            </div>
            <div>
              <Label>Calendario de pagos</Label>
              <Select
                value={paymentScheduleType}
                onValueChange={(v) => setPaymentScheduleType(v as PaymentScheduleType)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly_fixed">Mensual fijo (genera pagos automáticos)</SelectItem>
                  <SelectItem value="per_milestone">Por hito</SelectItem>
                  <SelectItem value="mixed">Mixto</SelectItem>
                  <SelectItem value="none">Sin calendario</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Costo interno hora ({currency}) — opcional</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={internalHourlyCost}
                onChange={(e) => setInternalHourlyCost(e.target.value)}
                placeholder="Para calcular rentabilidad"
              />
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between">
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={mutation.isPending}>
                Atrás
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              Cancelar
            </Button>
            {step < lastStep ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext()}>
                Siguiente
              </Button>
            ) : (
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !canNext()}>
                {mutation.isPending ? "Creando..." : "Crear contrato"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
