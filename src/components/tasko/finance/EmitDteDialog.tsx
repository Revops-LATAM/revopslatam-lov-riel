import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  FileText,
  Building2,
  Calendar,
  ClipboardList,
  Mail,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Eye,
  Send,
  ArrowLeft,
} from "lucide-react";
import { invoiceQO, emisorQO } from "@/lib/api/tasko.queries";
import { emitDte } from "@/lib/api/dte.functions";
import { formatRut } from "@/lib/rut";
import { toast } from "sonner";

type Receptor = {
  rut: string;
  razon_social: string;
  giro: string;
  direccion: string;
  comuna: string;
  email: string;
};

type LineDraft = {
  descripcion: string;
  cantidad: number;
  monto_unitario: number;
  expanded?: boolean;
};

const clp = (n: number) => new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(n);

function todayCL() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
}

function plus30(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 30);
  return d.toLocaleDateString("en-CA");
}

export function EmitDteDialog({
  open,
  invoiceId,
  workspaceId,
  onOpenChange,
  onEmitted,
}: {
  open: boolean;
  invoiceId: string | null;
  workspaceId: string;
  onOpenChange: (v: boolean) => void;
  onEmitted: () => void;
}) {
  const qc = useQueryClient();
  const emitFn = useServerFn(emitDte);
  const invoiceQuery = useQuery({ ...invoiceQO(invoiceId ?? ""), enabled: !!invoiceId && open });
  const emisorQuery = useQuery({ ...emisorQO(workspaceId), enabled: open });

  const [step, setStep] = useState<"edit" | "preview">("edit");
  const [receptor, setReceptor] = useState<Receptor>({
    rut: "",
    razon_social: "",
    giro: "",
    direccion: "",
    comuna: "",
    email: "",
  });
  const [fechaEmision, setFechaEmision] = useState(todayCL());
  const [fechaVenc, setFechaVenc] = useState(plus30(todayCL()));
  const [includeOC, setIncludeOC] = useState(false);
  const [ocFolio, setOcFolio] = useState("");
  const [ocFecha, setOcFecha] = useState(todayCL());
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const submitInFlight = useRef(false);

  // Hydrate state when invoice loads.
  useEffect(() => {
    if (!invoiceQuery.data) return;
    const inv = invoiceQuery.data as unknown as {
      descripcion?: string | null;
      fecha_emision: string | null;
      fecha_vencimiento?: string | null;
      monto_clp?: number | string | null;
      monto_neto?: number | string | null;
      monto_total?: number | string | null;
      estado?: string | null;
      accounts: {
        tax_id?: string | null;
        legal_name?: string | null;
        name?: string | null;
        business_activity?: string | null;
        address?: string | null;
        commune?: string | null;
        billing_email?: string | null;
      } | null;
      invoice_lines: Array<{
        descripcion: string;
        cantidad: number;
        monto_unitario: number;
        orden: number;
      }>;
      contracts?: { name?: string | null } | null;
    };
    const a = inv.accounts;
    const be = (
      inv as unknown as {
        billing_entity?: {
          rut?: string | null;
          razon_social?: string | null;
          giro?: string | null;
          direccion?: string | null;
          comuna?: string | null;
          email_facturacion?: string | null;
        } | null;
      }
    ).billing_entity;
    if (be) {
      setReceptor({
        rut: be.rut ? formatRut(be.rut) : "",
        razon_social: be.razon_social ?? "",
        giro: be.giro ?? "",
        direccion: be.direccion ?? "",
        comuna: be.comuna ?? "",
        email: be.email_facturacion ?? "",
      });
    } else
      setReceptor({
        rut: a?.tax_id ? formatRut(a.tax_id) : "",
        razon_social: a?.legal_name ?? a?.name ?? "",
        giro: a?.business_activity ?? "",
        direccion: a?.address ?? "",
        comuna: a?.commune ?? "",
        email: a?.billing_email ?? "",
      });
    // El SII rechaza fechas de emisión futuras (OF-10 "Fecha Incorrecta").
    // Si la factura tiene una fecha programada a futuro, emitimos con hoy.
    const hoy = todayCL();
    const stored = inv.fecha_emision ?? hoy;
    const fe = stored > hoy ? hoy : stored;
    setFechaEmision(fe);
    setFechaVenc(
      inv.fecha_vencimiento && inv.fecha_vencimiento >= fe ? inv.fecha_vencimiento : plus30(fe),
    );

    const sorted = [...(inv.invoice_lines ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    const fallbackAmount = Number(inv.monto_clp ?? inv.monto_neto ?? inv.monto_total ?? 0);
    const fallbackDescription = (inv.descripcion ?? inv.contracts?.name ?? "Servicio").trim();
    setLines(
      sorted.length > 0
        ? sorted.map((l) => ({
            descripcion: l.descripcion,
            cantidad: Number(l.cantidad),
            monto_unitario: Number(l.monto_unitario),
          }))
        : fallbackAmount > 0
          ? [
              {
                descripcion: fallbackDescription || "Servicio",
                cantidad: 1,
                monto_unitario: fallbackAmount,
              },
            ]
          : [],
    );
    setStep("edit");
    setIncludeOC(false);
    setOcFolio("");
  }, [invoiceQuery.data]);

  const tipoDte = (invoiceQuery.data as { tipo_dte?: number } | undefined)?.tipo_dte ?? 33;
  const isEmissionPending =
    (invoiceQuery.data as { estado?: string | null } | undefined)?.estado === "scheduled";

  const neto = useMemo(
    () => lines.reduce((s, l) => s + Math.round(l.cantidad * l.monto_unitario), 0),
    [lines],
  );
  const iva = tipoDte === 33 ? Math.round(neto * 0.19) : 0;
  const total = neto + iva;

  const canPreview =
    receptor.rut.trim() &&
    receptor.razon_social.trim() &&
    receptor.giro.trim() &&
    receptor.direccion.trim() &&
    receptor.comuna.trim() &&
    lines.length > 0 &&
    lines.every((l) => l.descripcion.trim() && l.cantidad > 0 && l.monto_unitario >= 0);

  const submit = async () => {
    if (!invoiceId || submitInFlight.current) return;
    submitInFlight.current = true;
    setSaving(true);
    try {
      const result = await emitFn({
        data: {
          invoiceId,
          overrides: {
            receptor: {
              rut: receptor.rut.trim(),
              razon_social: receptor.razon_social.trim(),
              giro: receptor.giro.trim(),
              direccion: receptor.direccion.trim(),
              comuna: receptor.comuna.trim(),
              email: receptor.email.trim() || null,
            },
            fecha_emision: fechaEmision,
            fecha_vencimiento: fechaVenc || null,
            lineas: lines.map((l) => ({
              descripcion: l.descripcion.trim(),
              cantidad: l.cantidad,
              monto_unitario: l.monto_unitario,
            })),
            referencia_oc:
              includeOC && ocFolio.trim() ? { folio: ocFolio.trim(), fecha: ocFecha } : null,
          },
        },
      });
      const emitResult = result as { pending?: boolean };
      toast.success(
        emitResult.pending ? "DTE enviado; folio pendiente" : "Factura emitida al SII",
        {
          description: emitResult.pending
            ? "No se reenviará. Vuelve a usar Recuperar folio en unos segundos."
            : undefined,
        },
      );
      qc.invalidateQueries({ queryKey: ["ws-payments", workspaceId] });
      qc.invalidateQueries({ queryKey: ["invoices", workspaceId] });
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      qc.invalidateQueries({ queryKey: ["finance-dashboard", workspaceId] });
      onEmitted();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error emitiendo DTE");
    } finally {
      submitInFlight.current = false;
      setSaving(false);
    }
  };

  const emisor = emisorQuery.data as
    | {
        razon_social?: string | null;
        rut?: string | null;
        giro?: string | null;
        direccion?: string | null;
        comuna?: string | null;
      }
    | null
    | undefined;

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            Emitir Factura Electrónica
          </DialogTitle>
        </DialogHeader>

        {invoiceQuery.isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Cargando factura…</div>
        ) : step === "edit" ? (
          <div className="space-y-4">
            {/* Datos del Receptor */}
            <section className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center gap-2 font-medium text-sm">
                <Building2 className="size-4" />
                Datos del Receptor
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">RUT *</Label>
                  <Input
                    value={receptor.rut}
                    onChange={(e) => setReceptor({ ...receptor, rut: e.target.value })}
                    onBlur={(e) => setReceptor({ ...receptor, rut: formatRut(e.target.value) })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Razón Social *</Label>
                  <Input
                    value={receptor.razon_social}
                    onChange={(e) => setReceptor({ ...receptor, razon_social: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Giro *</Label>
                  <Input
                    value={receptor.giro}
                    onChange={(e) => setReceptor({ ...receptor, giro: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Dirección *</Label>
                  <Input
                    value={receptor.direccion}
                    onChange={(e) => setReceptor({ ...receptor, direccion: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Comuna *</Label>
                  <Input
                    value={receptor.comuna}
                    onChange={(e) => setReceptor({ ...receptor, comuna: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs flex items-center gap-1">
                    <Mail className="size-3" /> Email para envío de DTE
                  </Label>
                  <Input
                    type="email"
                    value={receptor.email}
                    onChange={(e) => setReceptor({ ...receptor, email: e.target.value })}
                    placeholder="finanzas@cliente.com"
                  />
                </div>
              </div>
            </section>

            {/* Datos de Emisión */}
            <section className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center gap-2 font-medium text-sm">
                <Calendar className="size-4" />
                Datos de Emisión
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Fecha de Emisión *</Label>
                  <Input
                    type="date"
                    value={fechaEmision}
                    onChange={(e) => setFechaEmision(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Fecha de Vencimiento *</Label>
                  <Input
                    type="date"
                    value={fechaVenc}
                    onChange={(e) => setFechaVenc(e.target.value)}
                  />
                </div>
              </div>
            </section>

            {/* Referencia OC */}
            <section className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center gap-2 font-medium text-sm">
                <ClipboardList className="size-4" />
                Referencia de Orden de Compra
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={includeOC} onCheckedChange={setIncludeOC} />
                <span className="text-sm">Incluir referencia de OC en la factura</span>
              </div>
              {includeOC && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">N° Orden de Compra</Label>
                    <Input value={ocFolio} onChange={(e) => setOcFolio(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Fecha OC</Label>
                    <Input
                      type="date"
                      value={ocFecha}
                      onChange={(e) => setOcFecha(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </section>

            {/* Detalle */}
            <section className="rounded-lg border border-border p-4 space-y-3">
              <div className="font-medium text-sm">Detalle de la Factura</div>
              <div className="rounded-md border border-border overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <div className="col-span-6">Descripción</div>
                  <div className="col-span-2 text-center">Cant.</div>
                  <div className="col-span-2 text-right">Precio Unit.</div>
                  <div className="col-span-2 text-right">Total</div>
                </div>
                {lines.map((l, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-12 gap-2 px-3 py-2 border-t border-border items-start"
                  >
                    <div className="col-span-6 space-y-1">
                      <Input
                        value={l.descripcion.split("\n")[0]}
                        onChange={(e) => {
                          const rest = l.descripcion.includes("\n")
                            ? "\n" + l.descripcion.split("\n").slice(1).join("\n")
                            : "";
                          setLines((ls) =>
                            ls.map((x, ix) =>
                              ix === i ? { ...x, descripcion: e.target.value + rest } : x,
                            ),
                          );
                        }}
                      />
                      <button
                        type="button"
                        className="text-[11px] text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() =>
                          setLines((ls) =>
                            ls.map((x, ix) => (ix === i ? { ...x, expanded: !x.expanded } : x)),
                          )
                        }
                      >
                        {l.expanded ? (
                          <ChevronUp className="size-3" />
                        ) : (
                          <ChevronDown className="size-3" />
                        )}
                        Agregar descripción
                      </button>
                      {l.expanded && (
                        <Textarea
                          rows={2}
                          placeholder="Descripción extendida (opcional)"
                          value={
                            l.descripcion.includes("\n")
                              ? l.descripcion.split("\n").slice(1).join("\n")
                              : ""
                          }
                          onChange={(e) => {
                            const head = l.descripcion.split("\n")[0];
                            setLines((ls) =>
                              ls.map((x, ix) =>
                                ix === i
                                  ? {
                                      ...x,
                                      descripcion: e.target.value
                                        ? `${head}\n${e.target.value}`
                                        : head,
                                    }
                                  : x,
                              ),
                            );
                          }}
                        />
                      )}
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        className="text-center"
                        value={l.cantidad}
                        onChange={(e) =>
                          setLines((ls) =>
                            ls.map((x, ix) =>
                              ix === i ? { ...x, cantidad: Number(e.target.value) } : x,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        className="text-right"
                        value={l.monto_unitario}
                        onChange={(e) =>
                          setLines((ls) =>
                            ls.map((x, ix) =>
                              ix === i ? { ...x, monto_unitario: Number(e.target.value) } : x,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="col-span-2 text-right pt-2 text-sm font-medium">
                      ${clp(Math.round(l.cantidad * l.monto_unitario))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Totales */}
            <section className="rounded-lg border border-border p-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal Neto:</span>
                <span>${clp(neto)}</span>
              </div>
              {tipoDte === 33 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IVA (19%):</span>
                  <span>${clp(iva)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-2 mt-2 font-semibold">
                <span>Total:</span>
                <span className="text-primary">${clp(total)}</span>
              </div>
            </section>

            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
              <AlertTriangle className="size-4 mt-0.5 shrink-0" />
              {isEmissionPending
                ? "Esta factura ya fue enviada al SII y está pendiente de folio; no se volverá a enviar."
                : "Una vez emitida, la factura electrónica será enviada al SII y no podrá modificarse."}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button disabled={!canPreview} onClick={() => setStep("preview")}>
                <Eye className="size-4 mr-1" /> Vista Previa
              </Button>
            </div>
          </div>
        ) : (
          /* PREVIEW STEP */
          <div className="space-y-4">
            <div className="relative bg-white text-neutral-900 rounded-lg border border-border p-6 shadow-sm overflow-hidden">
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center select-none"
                aria-hidden
              >
                <span className="text-[110px] font-black text-red-500/10 -rotate-12">BORRADOR</span>
              </div>

              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-bold uppercase">{emisor?.razon_social ?? "—"}</div>
                  <div className="text-xs uppercase text-neutral-600">{emisor?.giro ?? ""}</div>
                  <div className="text-xs text-neutral-600">
                    {emisor?.direccion ?? ""}
                    {emisor?.comuna ? `, ${emisor.comuna}` : ""}
                  </div>
                </div>
                <div className="border-2 border-red-600 text-red-600 rounded-md px-4 py-2 text-center min-w-[220px]">
                  <div className="text-xs font-medium">
                    R.U.T.: {emisor?.rut ? formatRut(emisor.rut) : "—"}
                  </div>
                  <div className="text-sm font-bold">FACTURA ELECTRÓNICA</div>
                  <div className="text-xs">N° PENDIENTE</div>
                  <div className="text-[10px] mt-1 text-neutral-600">S.I.I. - CHILE</div>
                </div>
              </div>

              <div className="relative mt-4 border-t border-neutral-200 pt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                <div>
                  <div className="flex gap-2">
                    <span className="text-neutral-500 w-24">Señor(es):</span>
                    <span className="font-medium">{receptor.razon_social}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-neutral-500 w-24">R.U.T.:</span>
                    <span>{receptor.rut}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-neutral-500 w-24">Giro:</span>
                    <span>{receptor.giro}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-neutral-500 w-24">Dirección:</span>
                    <span>{receptor.direccion}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-neutral-500 w-24">Comuna:</span>
                    <span>{receptor.comuna}</span>
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <div>
                    <span className="text-neutral-500">Fecha Emisión: </span>
                    <span className="font-medium">{fechaEmision}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Fecha Vencimiento: </span>
                    <span className="font-medium">{fechaVenc}</span>
                  </div>
                  {includeOC && ocFolio && (
                    <div>
                      <span className="text-neutral-500">OC N°: </span>
                      <span className="font-medium">{ocFolio}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="relative mt-4">
                <div className="grid grid-cols-12 gap-2 bg-neutral-100 px-3 py-2 text-xs font-medium">
                  <div className="col-span-6">Descripción</div>
                  <div className="col-span-2 text-center">Cant.</div>
                  <div className="col-span-2 text-right">P. Unitario</div>
                  <div className="col-span-2 text-right">Total</div>
                </div>
                {lines.map((l, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-neutral-100 text-xs"
                  >
                    <div className="col-span-6 whitespace-pre-wrap">{l.descripcion}</div>
                    <div className="col-span-2 text-center">{l.cantidad}</div>
                    <div className="col-span-2 text-right">${clp(l.monto_unitario)}</div>
                    <div className="col-span-2 text-right font-medium">
                      ${clp(Math.round(l.cantidad * l.monto_unitario))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="relative mt-4 grid grid-cols-2 text-xs">
                <div />
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Subtotal Neto:</span>
                    <span>${clp(neto)}</span>
                  </div>
                  {tipoDte === 33 && (
                    <div className="flex justify-between">
                      <span className="text-neutral-500">I.V.A. 19%:</span>
                      <span>${clp(iva)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-neutral-300 pt-1 font-bold">
                    <span>TOTAL:</span>
                    <span>${clp(total)}</span>
                  </div>
                </div>
              </div>

              <div className="relative mt-6 flex items-end justify-between text-[11px]">
                <div className="border border-dashed border-neutral-300 rounded px-3 py-6 text-neutral-400">
                  Timbre Electrónico
                </div>
                <div className="text-right text-neutral-500">
                  <div>Este documento es una vista previa</div>
                  <div>El folio será asignado al momento de la emisión</div>
                </div>
              </div>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              {isEmissionPending
                ? "Se consultará el folio existente sin reenviar el DTE."
                : "Revisa los datos antes de emitir. Una vez emitida, la factura no puede modificarse."}
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("edit")} disabled={saving}>
                <ArrowLeft className="size-4 mr-1" /> Volver a Editar
              </Button>
              <Button onClick={submit} disabled={saving}>
                <Send className="size-4 mr-1" />
                {saving
                  ? "Procesando…"
                  : isEmissionPending
                    ? "Recuperar folio"
                    : "Confirmar y Emitir"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
