import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createProjectedContract } from "@/lib/api/contracts-v2.functions";
import { membersWithRolesQO, serviceTypesQO, currencyRatesQO } from "@/lib/api/tasko.queries";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CurrencyInput } from "@/components/tasko/CurrencyInput";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon, Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Mode = "simple" | "multiservicio";
type Type = "implementation" | "recurrente";
type Frequency = "mensual" | "trimestral" | "semestral" | "anual" | "unica" | "hitos";
type Currency = "USD" | "CLP" | "UF";
type Status = "borrador" | "activo";
type DuracionTipo = "meses" | "indefinido" | "manual";

type Hito = {
  numeroHito: number;
  nombre: string;
  descripcion: string;
  monto: string;
  moneda: Currency;
  fechaEstimada: string;
};

type ServiceLine = {
  serviceTypeId: string;
  tipoServicio: string;
  descripcion: string;
  frecuencia: Frequency;
  numeroCuotas: string;
  monto: string;
  moneda: Currency;
  esBono: boolean;
  fechaPrimerPago: string;
  hitos: Hito[];
};

const STEPS = ["Cliente", "Tipo", "Servicios", "Facturación", "Opciones"] as const;

const blankLine = (moneda: Currency): ServiceLine => ({
  serviceTypeId: "__custom__",
  tipoServicio: "",
  descripcion: "",
  frecuencia: "mensual",
  numeroCuotas: "",
  monto: "",
  moneda,
  esBono: false,
  fechaPrimerPago: "",
  hitos: [],
});

const blankHito = (n: number): Hito => ({
  numeroHito: n,
  nombre: "",
  descripcion: "",
  monto: "",
  moneda: "CLP",
  fechaEstimada: "",
});

const freqLabel: Record<Frequency, string> = {
  mensual: "Mensual",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
  unica: "Pago único",
  hitos: "Por hitos",
};

function fmtNum(n: number) {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(n);
}

export function CreateContractWizardV2({
  open,
  onOpenChange,
  workspaceId,
  workspaceSlug,
  accounts,
  defaultAccountId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  workspaceSlug: string;
  accounts: Array<{ id: string; name: string }>;
  defaultAccountId?: string;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createProjectedContract);
  const { data: members } = useSuspenseQuery(membersWithRolesQO(workspaceId));
  const { data: serviceTypes } = useSuspenseQuery(serviceTypesQO(workspaceId));
  const { data: currencyRates } = useSuspenseQuery(currencyRatesQO(workspaceId));

  const ufRate = useMemo(() => {
    // Find latest UF rate where base=CLP (or rate that converts UF→CLP)
    const ufRow = currencyRates.find(
      (r) => r.currency === "UF" && r.base_currency === "CLP",
    );
    return ufRow?.rate_to_base ?? 0;
  }, [currencyRates]);

  const [step, setStep] = useState(0);

  // Paso 1 — Cliente
  const [accountId, setAccountId] = useState(defaultAccountId ?? "");

  // Paso 2 — Tipo
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [type, setType] = useState<Type>("implementation");
  const [mode, setMode] = useState<Mode>("simple");
  const [status, setStatus] = useState<Status>("borrador");

  // Paso 3 — Servicios
  const [currency, setCurrency] = useState<Currency>("CLP");
  const [lines, setLines] = useState<ServiceLine[]>([blankLine("CLP")]);

  // Paso 4 — Facturación
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [duracionTipo, setDuracionTipo] = useState<DuracionTipo>("meses");
  const [durationMonths, setDurationMonths] = useState("12");
  const [endDateManual, setEndDateManual] = useState("");
  const [diaFacturacion, setDiaFacturacion] = useState("");
  const [fechaPrimeraFacturacion, setFechaPrimeraFacturacion] = useState("");
  const [totalInput, setTotalInput] = useState("");
  const [sprintCadence, setSprintCadence] = useState<"monthly" | "biweekly">("monthly");
  const [hoursPerSprint, setHoursPerSprint] = useState("80");

  // Paso 5 — Opciones
  const [vendedorId, setVendedorId] = useState<string>("__none__");
  const [puedeRenovarse, setPuedeRenovarse] = useState(false);
  const [anticipacionDias, setAnticipacionDias] = useState("30");
  const [notasComerciales, setNotasComerciales] = useState("");
  const [observaciones, setObservaciones] = useState("");

  useEffect(() => {
    if (defaultAccountId) setAccountId(defaultAccountId);
  }, [defaultAccountId]);

  useEffect(() => {
    if (!open) {
      setStep(0);
      setName("");
      setNameTouched(false);
      setType("implementation");
      setMode("simple");
      setStatus("borrador");
      setCurrency("CLP");
      setStartDate(new Date().toISOString().slice(0, 10));
      setDuracionTipo("meses");
      setDurationMonths("12");
      setEndDateManual("");
      setDiaFacturacion("");
      setFechaPrimeraFacturacion("");
      setVendedorId("__none__");
      setPuedeRenovarse(false);
      setAnticipacionDias("30");
      setNotasComerciales("");
      setObservaciones("");
      setLines([blankLine("CLP")]);
    }
  }, [open]);

  // Auto-generate name: <cliente> - <servicio> - <año>
  useEffect(() => {
    if (nameTouched) return;
    const acct = accounts.find((a) => a.id === accountId)?.name ?? "";
    const svc = lines[0]?.tipoServicio?.trim() ?? "";
    const year = new Date(startDate || Date.now()).getFullYear();
    const parts = [acct, svc, String(year)].filter(Boolean);
    setName(parts.join(" - "));
  }, [accountId, lines, startDate, accounts, nameTouched]);

  // Reset extra lines when switching to simple
  useEffect(() => {
    if (mode === "simple" && lines.length > 1) setLines([lines[0]]);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto día_facturacion from startDate
  useEffect(() => {
    if (!diaFacturacion && startDate) {
      setDiaFacturacion(String(new Date(startDate).getDate()));
    }
  }, [startDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto fecha_primera_facturacion = startDate por defecto
  useEffect(() => {
    if (!fechaPrimeraFacturacion && startDate) setFechaPrimeraFacturacion(startDate);
  }, [startDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const endDate = useMemo(() => {
    if (duracionTipo === "indefinido") return "";
    if (duracionTipo === "manual") return endDateManual;
    const months = Number(durationMonths);
    if (!startDate || !months || months <= 0) return "";
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + months);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [startDate, durationMonths, duracionTipo, endDateManual]);

  const totalEstimado = useMemo(() => {
    const byCurrency: Record<string, number> = {};
    for (const l of lines) {
      if (l.frecuencia === "hitos") {
        for (const h of l.hitos) {
          const amt = Number(h.monto || 0);
          if (!amt) continue;
          byCurrency[h.moneda] = (byCurrency[h.moneda] ?? 0) + amt;
        }
        continue;
      }
      const amt = Number(l.monto || 0);
      if (!amt) continue;
      const mult =
        l.frecuencia === "unica"
          ? 1
          : l.frecuencia === "mensual"
            ? Number(l.numeroCuotas || durationMonths || 0)
            : l.frecuencia === "trimestral"
              ? Math.ceil(Number(durationMonths || 0) / 3)
              : l.frecuencia === "semestral"
                ? Math.ceil(Number(durationMonths || 0) / 6)
                : Math.ceil(Number(durationMonths || 0) / 12);
      byCurrency[l.moneda] = (byCurrency[l.moneda] ?? 0) + amt * (mult || 1);
    }
    return byCurrency;
  }, [lines, durationMonths]);

  const mutation = useMutation({
    mutationFn: async () => {
      const parsedLines = lines.map((l, idx) => ({
        serviceTypeId: l.serviceTypeId !== "__custom__" ? l.serviceTypeId : null,
        tipoServicio:
          l.serviceTypeId !== "__custom__"
            ? serviceTypes.find((s) => s.id === l.serviceTypeId)?.name ?? l.tipoServicio.trim()
            : l.tipoServicio.trim(),
        descripcion: l.descripcion.trim() || null,
        frecuencia: l.frecuencia,
        numeroCuotas:
          l.frecuencia === "unica"
            ? 1
            : l.frecuencia === "hitos"
              ? null
              : l.numeroCuotas
                ? Number(l.numeroCuotas)
                : null,
        monto: l.frecuencia === "hitos" ? null : l.monto ? Number(l.monto) : null,
        moneda: l.moneda,
        esBono: l.esBono,
        fechaPrimerPago: l.fechaPrimerPago || null,
        orden: idx,
        hitos:
          l.frecuencia === "hitos"
            ? l.hitos.map((h, hi) => ({
                numeroHito: h.numeroHito || hi + 1,
                nombre: h.nombre.trim(),
                descripcion: h.descripcion.trim() || null,
                monto: h.monto ? Number(h.monto) : null,
                moneda: h.moneda,
                fechaEstimada: h.fechaEstimada || null,
                orden: hi,
              }))
            : [],
      }));
      return create({
        data: {
          workspaceId,
          accountId,
          name: name.trim(),
          type,
          modo: mode,
          currency,
          startDate,
          endDate: endDate || null,
          duracionTipo,
          diaFacturacion: diaFacturacion ? Number(diaFacturacion) : null,
          fechaPrimeraFacturacion: fechaPrimeraFacturacion || null,
          sprintDurationDays: type === "recurrente" ? (sprintCadence === "monthly" ? 30 : 15) : null,
          sprintCadence: type === "recurrente" ? sprintCadence : null,
          hoursPerSprint: type === "recurrente" ? Number(hoursPerSprint || 0) : null,
          vendedorId: vendedorId === "__none__" ? null : vendedorId,
          puedeRenovarse,
          anticipacionRenovacionDias: puedeRenovarse ? Number(anticipacionDias || 0) : null,
          notasComerciales: notasComerciales.trim() || null,
          observaciones: observaciones.trim() || null,
          status,
          lines: parsedLines,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contracts", workspaceId] });
      qc.invalidateQueries({ queryKey: ["ws-payments", workspaceId] });
      qc.invalidateQueries({ queryKey: ["finance-dashboard", workspaceId] });
      qc.invalidateQueries({ queryKey: ["handoffs", workspaceId] });
      toast.success(
        status === "activo" ? "Contrato creado y activado" : "Contrato borrador creado",
      );
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canNext = () => {
    if (step === 0) return Boolean(accountId);
    if (step === 1) return Boolean(name.trim());
    if (step === 2) {
      if (lines.length === 0) return false;
      return lines.every((l) => {
        const hasName =
          l.serviceTypeId !== "__custom__" || l.tipoServicio.trim().length > 0;
        if (l.frecuencia === "hitos") {
          return hasName && l.hitos.length > 0 && l.hitos.every((h) => h.nombre.trim().length > 0);
        }
        return hasName;
      });
    }
    if (step === 3) {
      if (!startDate) return false;
      if (duracionTipo === "meses" && !(Number(durationMonths) > 0)) return false;
      if (duracionTipo === "manual" && !endDateManual) return false;
      return true;
    }
    return true;
  };

  const totalSteps = STEPS.length;
  const lastStep = totalSteps - 1;

  const addLine = () => setLines((arr) => [...arr, blankLine(currency)]);
  const removeLine = (i: number) =>
    setLines((arr) => (arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr));
  const patchLine = (i: number, patch: Partial<ServiceLine>) =>
    setLines((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addHito = (i: number) =>
    patchLine(i, { hitos: [...lines[i].hitos, blankHito(lines[i].hitos.length + 1)] });
  const removeHito = (i: number, hi: number) =>
    patchLine(i, { hitos: lines[i].hitos.filter((_, k) => k !== hi) });
  const patchHito = (i: number, hi: number, patch: Partial<Hito>) =>
    patchLine(i, {
      hitos: lines[i].hitos.map((h, k) => (k === hi ? { ...h, ...patch } : h)),
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Nuevo contrato</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Estado inicial: <strong>{status === "activo" ? "Activo" : "Borrador"}</strong>.
            {status === "borrador"
              ? " No genera facturas hasta que se active."
              : " Operaciones recibirá el handoff inmediatamente."}
          </p>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-2 mb-4">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1">
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
              <span
                className={`text-xs ${i === step ? "font-medium" : "text-muted-foreground"}`}
              >
                {label}
              </span>
              {i < totalSteps - 1 && <div className="flex-1 h-px bg-border" />}
            </div>
          ))}
        </div>

        {/* PASO 1 — Cliente */}
        {step === 0 && (
          <div className="space-y-3">
            <div>
              <Label>Cliente</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un cliente" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                El cliente queda asociado al contrato y a las facturas que se emitan.
              </p>
            </div>
          </div>
        )}

        {/* PASO 2 — Tipo */}
        {step === 1 && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Modo</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple">Simple (1 servicio)</SelectItem>
                    <SelectItem value="multiservicio">Multiservicio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={type} onValueChange={(v) => setType(v as Type)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="implementation">Proyecto</SelectItem>
                    <SelectItem value="recurrente">Recurrente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Estado inicial</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="borrador">Borrador</SelectItem>
                    <SelectItem value="activo">Activo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Nombre interno</Label>
              <Input
                value={name}
                onChange={(e) => {
                  setNameTouched(true);
                  setName(e.target.value);
                }}
                placeholder="Cliente - Servicio - Año"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Se autogenera; puedes editarlo.
              </p>
            </div>
          </div>
        )}

        {/* PASO 3 — Servicios */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-xs">Moneda base del contrato</Label>
                <Select value={currency} onValueChange={(v) => {
                  const next = v as Currency;
                  setCurrency(next);
                  setLines((arr) => arr.map((ln) => ({
                    ...ln,
                    moneda: next,
                    hitos: ln.hitos.map((h) => ({ ...h, moneda: next })),
                  })));
                }}>
                  <SelectTrigger className="h-8 w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CLP">CLP</SelectItem>
                    <SelectItem value="UF">UF</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
                {ufRate > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    UF hoy: ${fmtNum(ufRate)} CLP
                  </span>
                )}
              </div>
              {mode === "multiservicio" && (
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Agregar servicio
                </Button>
              )}
            </div>

            <div className="space-y-3">
              {lines.map((l, i) => (
                <div key={i} className="border border-border rounded-md p-3 space-y-2 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Servicio {i + 1}
                    </span>
                    {mode === "multiservicio" && lines.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLine(i)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <Label className="text-xs">Tipo de servicio</Label>
                      <Select
                        value={l.serviceTypeId}
                        onValueChange={(v) => patchLine(i, { serviceTypeId: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona…" />
                        </SelectTrigger>
                        <SelectContent>
                          {serviceTypes
                            .filter((s) => s.activo)
                            .map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          <SelectItem value="__custom__">— Otro (escribir) —</SelectItem>
                        </SelectContent>
                      </Select>
                      {l.serviceTypeId === "__custom__" && (
                        <Input
                          className="mt-1"
                          value={l.tipoServicio}
                          onChange={(e) => patchLine(i, { tipoServicio: e.target.value })}
                          placeholder="Nombre del servicio"
                        />
                      )}
                    </div>
                    <div>
                      <Label className="text-xs">¿Es bono?</Label>
                      <div className="h-9 flex items-center">
                        <Switch
                          checked={l.esBono}
                          onCheckedChange={(v) => patchLine(i, { esBono: v })}
                        />
                        <span className="ml-2 text-[11px] text-muted-foreground">
                          {l.esBono ? "Monto referencial" : "Fijo"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Descripción / Glosa</Label>
                    <Textarea
                      rows={2}
                      value={l.descripcion}
                      onChange={(e) => patchLine(i, { descripcion: e.target.value })}
                      placeholder="Texto que aparecerá en la factura"
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <Label className="text-xs">Frecuencia</Label>
                      <Select
                        value={l.frecuencia}
                        onValueChange={(v) =>
                          patchLine(i, {
                            frecuencia: v as Frequency,
                            numeroCuotas: v === "unica" ? "1" : l.numeroCuotas,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(freqLabel) as Frequency[]).map((f) => (
                            <SelectItem key={f} value={f}>
                              {freqLabel[f]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {l.frecuencia !== "hitos" && mode === "multiservicio" && (
                      <>
                        <div>
                          <Label className="text-xs">N° de cuotas</Label>
                          <Input
                            type="number"
                            min={1}
                            max={120}
                            disabled={l.frecuencia === "unica"}
                            value={l.frecuencia === "unica" ? "1" : l.numeroCuotas}
                            onChange={(e) => patchLine(i, { numeroCuotas: e.target.value })}
                            placeholder="auto"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">
                            {l.esBono ? "Monto ref. (cuota)" : "Monto por cuota"}
                          </Label>
                          <CurrencyInput
                            currency={l.moneda}
                            value={l.monto}
                            onValueChange={(v) => patchLine(i, { monto: v })}
                          />
                          {l.moneda === "UF" && ufRate > 0 && l.monto && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              ≈ ${fmtNum(Number(l.monto) * ufRate)} CLP
                            </p>
                          )}
                          {l.moneda === "CLP" && ufRate > 0 && l.monto && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              ≈ {(Number(l.monto) / ufRate).toFixed(2)} UF
                            </p>
                          )}
                        </div>
                        <div>
                          <Label className="text-xs">Moneda</Label>
                          <div className="h-10 flex items-center px-3 rounded-md border border-input bg-muted text-sm font-medium">
                            {currency}
                          </div>
                        </div>
                      </>
                    )}
                    {mode === "simple" && l.frecuencia !== "hitos" && (
                      <div className="col-span-3 text-[11px] text-muted-foreground">
                        El monto y las cuotas se definen en el paso <strong>Facturación</strong>.
                      </div>
                    )}
                  </div>

                  {l.esBono && l.frecuencia !== "hitos" && (
                    <div>
                      <Label className="text-xs">Primera fecha de pago (opcional)</Label>
                      <Input
                        type="date"
                        value={l.fechaPrimerPago}
                        onChange={(e) => patchLine(i, { fechaPrimerPago: e.target.value })}
                      />
                    </div>
                  )}

                  {/* HITOS */}
                  {l.frecuencia === "hitos" && (
                    <div className="border-t border-border pt-2 mt-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Hitos de facturación</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addHito(i)}
                        >
                          <Plus className="w-3 h-3 mr-1" /> Hito
                        </Button>
                      </div>
                      {l.hitos.length === 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          Agrega al menos un hito.
                        </p>
                      )}
                      {l.hitos.map((h, hi) => (
                        <div
                          key={hi}
                          className="grid grid-cols-12 gap-1.5 items-end bg-background rounded p-2 border border-border"
                        >
                          <div className="col-span-1">
                            <Label className="text-[10px]">N°</Label>
                            <Input
                              type="number"
                              min={1}
                              value={h.numeroHito}
                              onChange={(e) =>
                                patchHito(i, hi, { numeroHito: Number(e.target.value) })
                              }
                              className="h-8"
                            />
                          </div>
                          <div className="col-span-3">
                            <Label className="text-[10px]">Nombre</Label>
                            <Input
                              value={h.nombre}
                              onChange={(e) => patchHito(i, hi, { nombre: e.target.value })}
                              className="h-8"
                            />
                          </div>
                          <div className="col-span-3">
                            <Label className="text-[10px]">Descripción</Label>
                            <Input
                              value={h.descripcion}
                              onChange={(e) => patchHito(i, hi, { descripcion: e.target.value })}
                              className="h-8"
                            />
                          </div>
                          <div className="col-span-2">
                            <Label className="text-[10px]">Monto</Label>
                            <CurrencyInput
                              currency={h.moneda}
                              value={h.monto}
                              onValueChange={(v) => patchHito(i, hi, { monto: v })}
                              className="h-8"
                            />
                          </div>
                          <div className="col-span-1">
                            <Label className="text-[10px]">Mon</Label>
                            <div className="h-8 flex items-center justify-center px-2 rounded-md border border-input bg-muted text-xs font-medium">
                              {currency}
                            </div>
                          </div>
                          <div className="col-span-1">
                            <Label className="text-[10px]">Fecha</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={cn(
                                    "h-8 w-full justify-start text-left font-normal px-2 text-xs",
                                    !h.fechaEstimada && "text-muted-foreground",
                                  )}
                                >
                                  <CalendarIcon className="w-3.5 h-3.5 mr-1" />
                                  {h.fechaEstimada
                                    ? format(parseISO(h.fechaEstimada), "dd MMM yy", { locale: es })
                                    : "—"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={h.fechaEstimada ? parseISO(h.fechaEstimada) : undefined}
                                  onSelect={(d) =>
                                    patchHito(i, hi, {
                                      fechaEstimada: d ? format(d, "yyyy-MM-dd") : "",
                                    })
                                  }
                                  initialFocus
                                  className={cn("p-3 pointer-events-auto")}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="col-span-1 flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeHito(i, hi)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PASO 4 — Facturación */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Fecha inicio</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label>Duración</Label>
                <Select
                  value={duracionTipo}
                  onValueChange={(v) => setDuracionTipo(v as DuracionTipo)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meses">En meses</SelectItem>
                    <SelectItem value="indefinido">Indefinido</SelectItem>
                    <SelectItem value="manual">Fecha manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                {duracionTipo === "meses" && (
                  <>
                    <Label>Meses</Label>
                    <Input
                      type="number"
                      min={1}
                      max={120}
                      value={durationMonths}
                      onChange={(e) => setDurationMonths(e.target.value)}
                    />
                  </>
                )}
                {duracionTipo === "manual" && (
                  <>
                    <Label>Fecha término</Label>
                    <Input
                      type="date"
                      value={endDateManual}
                      onChange={(e) => setEndDateManual(e.target.value)}
                    />
                  </>
                )}
                {duracionTipo === "indefinido" && (
                  <>
                    <Label>Fecha término</Label>
                    <Input value="—" disabled />
                  </>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Termina el <strong>{endDate || "indefinido"}</strong>
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Día de facturación</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={diaFacturacion}
                  onChange={(e) => setDiaFacturacion(e.target.value)}
                  placeholder="1-31"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Sugerido desde la fecha de inicio.
                </p>
              </div>
              <div>
                <Label>Primera fecha de facturación</Label>
                <Input
                  type="date"
                  value={fechaPrimeraFacturacion}
                  onChange={(e) => setFechaPrimeraFacturacion(e.target.value)}
                />
              </div>
            </div>

            {type === "recurrente" && (
              <div className="border-t border-border pt-3 space-y-2">
                <h4 className="text-sm font-semibold">Sprints</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Cadencia</Label>
                    <Select
                      value={sprintCadence}
                      onValueChange={(v) => setSprintCadence(v as "monthly" | "biweekly")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Mensual</SelectItem>
                        <SelectItem value="biweekly">Quincenal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Horas por sprint</Label>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={hoursPerSprint}
                      onChange={(e) => setHoursPerSprint(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Los sprints se generan automáticamente cuando Operaciones defina la fecha del primer sprint.
                </p>
              </div>
            )}



            {/* Número de Cuotas + Montos (igual al sistema comercial) */}
            {mode === "simple" && lines[0] && lines[0].frecuencia !== "hitos" && (() => {
              const line = lines[0];
              const cuotas =
                line.frecuencia === "unica"
                  ? 1
                  : Number(line.numeroCuotas || durationMonths || 0) || 0;
              const cuotaNum = Number(line.monto || 0);
              const totalComputed = cuotas > 0 ? cuotaNum * cuotas : cuotaNum;
              const totalDisplay =
                totalInput !== ""
                  ? totalInput
                  : totalComputed
                    ? String(Number(totalComputed.toFixed(2)))
                    : "";
              const handleTotalChange = (v: string) => {
                setTotalInput(v);
                const t = Number(v || 0);
                if (cuotas > 0 && t > 0) {
                  patchLine(0, { monto: String(Number((t / cuotas).toFixed(2))) });
                } else if (!v) {
                  patchLine(0, { monto: "" });
                }
              };
              const handleCuotaChange = (v: string) => {
                setTotalInput(""); // clear manual total so it recomputes from cuota
                patchLine(0, { monto: v });
              };
              const handleCuotasChange = (v: string) => {
                setTotalInput("");
                patchLine(0, { numeroCuotas: v });
              };
              return (
                <>
                  <div>
                    <Label>Número de Cuotas</Label>
                    <Input
                      type="number"
                      min={1}
                      max={120}
                      disabled={line.frecuencia === "unica"}
                      value={line.frecuencia === "unica" ? "1" : line.numeroCuotas}
                      onChange={(e) => handleCuotasChange(e.target.value)}
                      placeholder={String(durationMonths || "")}
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Calculado según fechas (puedes ajustarlo).
                    </p>
                  </div>

                  <div className="border-t border-border pt-3 space-y-2">
                    <h4 className="text-sm font-semibold">Montos</h4>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">Monto Total *</Label>
                        <CurrencyInput
                          currency={line.moneda}
                          value={totalDisplay}
                          onValueChange={(v) => handleTotalChange(v)}
                          placeholder="0"
                        />
                        {line.moneda === "UF" && ufRate > 0 && totalComputed > 0 && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            ≈ ${fmtNum(totalComputed * ufRate)} CLP
                          </p>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs">Moneda</Label>
                        <div className="h-10 flex items-center px-3 rounded-md border border-input bg-muted text-sm font-medium">
                          {currency}
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Monto por Cuota</Label>
                        <CurrencyInput
                          currency={line.moneda}
                          value={line.monto}
                          onValueChange={(v) => handleCuotaChange(v)}
                          placeholder="0"
                        />
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {cuotas > 0 ? `${cuotas} cuotas` : "Edita total o cuota"}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}

            {mode === "multiservicio" && Object.keys(totalEstimado).length > 0 && (
              <div className="border-t border-border pt-3">
                <h4 className="text-sm font-semibold mb-1">Total estimado</h4>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {Object.entries(totalEstimado).map(([cur, val]) => (
                    <div key={cur}>
                      {cur}: <strong>{fmtNum(val)}</strong>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Los montos por servicio se editan en el paso anterior.
                </p>
              </div>
            )}
          </div>
        )}

        {/* PASO 5 — Opciones */}
        {step === 4 && (
          <div className="space-y-3">
            <div>
              <Label>Vendedor</Label>
              <Select value={vendedorId} onValueChange={setVendedorId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin vendedor</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.profile?.full_name ?? m.profile?.email ?? m.user_id.slice(0, 6)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                La comisión se gestiona en el módulo de comisiones.
              </p>
            </div>

            <div className="rounded-md border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">¿Puede renovarse?</Label>
                  <p className="text-xs text-muted-foreground">
                    Te avisaremos antes del vencimiento.
                  </p>
                </div>
                <Switch checked={puedeRenovarse} onCheckedChange={setPuedeRenovarse} />
              </div>
              {puedeRenovarse && (
                <div>
                  <Label className="text-xs">Anticipación (días antes de fin)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={365}
                    value={anticipacionDias}
                    onChange={(e) => setAnticipacionDias(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div>
              <Label>Notas comerciales</Label>
              <Textarea
                value={notasComerciales}
                onChange={(e) => setNotasComerciales(e.target.value)}
                rows={2}
                placeholder="Descuentos, contexto comercial…"
              />
            </div>
            <div>
              <Label>Observaciones</Label>
              <Textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={2}
                placeholder="Observaciones generales del contrato"
              />
            </div>

            {/* Resumen */}
            <div className="rounded-md bg-muted/30 border border-border p-3 text-xs space-y-1">
              <div className="font-medium text-sm mb-1">Resumen</div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cliente</span>
                <strong>{accounts.find((a) => a.id === accountId)?.name ?? "—"}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contrato</span>
                <strong>{name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vigencia</span>
                <strong>
                  {startDate} → {endDate || "indefinido"}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Servicios</span>
                <strong>{lines.length}</strong>
              </div>
              <div className="border-t border-border pt-1 mt-1">
                {Object.keys(totalEstimado).length === 0 ? (
                  <span className="text-muted-foreground">Sin montos cargados.</span>
                ) : (
                  Object.entries(totalEstimado).map(([cur, amt]) => (
                    <div key={cur} className="flex justify-between">
                      <span className="text-muted-foreground">Valor estimado ({cur})</span>
                      <strong className="tabular-nums">{fmtNum(amt)}</strong>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between">
          <div className="flex gap-2">
            {step > 0 && (
              <Button
                variant="ghost"
                onClick={() => setStep((s) => s - 1)}
                disabled={mutation.isPending}
              >
                Atrás
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            {step < lastStep ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext()}>
                Siguiente
              </Button>
            ) : (
              <Button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || !canNext()}
              >
                {status === "activo" ? "Crear y activar" : "Crear contrato borrador"}
              </Button>
            )}
          </div>
        </DialogFooter>

        <span className="hidden">{workspaceSlug}</span>
      </DialogContent>
    </Dialog>
  );
}
