import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { wsBySlugQO, emisorQO } from "@/lib/api/tasko.queries";
import { upsertEmisor } from "@/lib/api/emisor.functions";
import { RouteError } from "@/components/tasko/RouteError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { formatRut, isValidRut, cleanRut } from "@/lib/rut";
import { SiiActivitySelect } from "@/components/tasko/operations/SiiActivitySelect";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/finance/settings/emisor")({
  ssr: false,
  loader: async ({ context, params }) => {
    const ws = await context.queryClient.ensureQueryData(wsBySlugQO(params.workspaceSlug));
    await context.queryClient.ensureQueryData(emisorQO(ws.id));
    return null;
  },
  errorComponent: RouteError,
  component: EmisorPage,
});

function EmisorPage() {
  const { workspaceSlug } = Route.useParams();
  const { data: ws } = useSuspenseQuery(wsBySlugQO(workspaceSlug));
  const { data: emisor } = useSuspenseQuery(emisorQO(ws.id));
  const qc = useQueryClient();
  const save = useServerFn(upsertEmisor);

  const [form, setForm] = useState({
    rut: "",
    razon_social: "",
    giro: "",
    direccion: "",
    comuna: "",
    email_contacto: "",
    telefono: "",
    banco: "",
    tipo_cuenta: "Cuenta corriente",
    numero_cuenta: "",
    email_finanzas: "",
    cobranza_dias_recordatorio: 7,
    cobranza_cc_emails_text: "",
    cobranza_activa: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (emisor) {
      const e = emisor as Record<string, string | number | boolean | string[] | null | undefined>;
      setForm({
        rut: (e.rut as string) ?? "",
        razon_social: (e.razon_social as string) ?? "",
        giro: (e.giro as string) ?? "",
        direccion: (e.direccion as string) ?? "",
        comuna: (e.comuna as string) ?? "",
        email_contacto: (e.email_contacto as string) ?? "",
        telefono: (e.telefono as string) ?? "",
        banco: (e.banco as string) ?? "",
        tipo_cuenta: (e.tipo_cuenta as string) ?? "Cuenta corriente",
        numero_cuenta: (e.numero_cuenta as string) ?? "",
        email_finanzas: (e.email_finanzas as string) ?? "",
        cobranza_dias_recordatorio: (e.cobranza_dias_recordatorio as number) ?? 7,
        cobranza_cc_emails_text: ((e.cobranza_cc_emails as string[]) ?? []).join(", "),
        cobranza_activa: Boolean(e.cobranza_activa),
      });
    }
  }, [emisor]);

  const rutValid = form.rut.trim() === "" || isValidRut(form.rut);

  const handleSave = async () => {
    if (form.rut.trim() !== "" && !isValidRut(form.rut)) {
      toast.error("RUT inválido. Verifica el dígito verificador.");
      return;
    }
    setSaving(true);
    try {
      const cc = form.cobranza_cc_emails_text
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const { cobranza_cc_emails_text: _omit, ...rest } = form;
      void _omit;
      const normalizedRut = rest.rut ? formatRut(rest.rut) : rest.rut;
      await save({
        data: { workspaceId: ws.id, ...rest, rut: normalizedRut, cobranza_cc_emails: cc },
      });
      toast.success("Datos del emisor guardados");
      qc.invalidateQueries({ queryKey: ["emisor", ws.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h2 className="text-sm font-semibold">Datos del emisor</h2>
        <p className="text-xs text-muted-foreground">
          Información legal del workspace usada para facturación electrónica (DTE/SII) y emails de
          factura.
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Información legal
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">RUT</Label>
            <Input
              value={form.rut}
              onChange={(e) => setForm((f) => ({ ...f, rut: cleanRut(e.target.value) }))}
              onBlur={() => setForm((f) => ({ ...f, rut: f.rut ? formatRut(f.rut) : "" }))}
              placeholder="76.123.456-7"
              aria-invalid={!rutValid}
              className={
                !rutValid ? "border-destructive focus-visible:ring-destructive" : undefined
              }
            />
            {!rutValid && <p className="mt-1 text-xs text-destructive">RUT inválido</p>}
          </div>
          <div>
            <Label className="text-xs">Razón social</Label>
            <Input value={form.razon_social} onChange={set("razon_social")} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Giro</Label>
            <SiiActivitySelect
              value={form.giro}
              onChange={(v) => setForm((f) => ({ ...f, giro: v }))}
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Lista oficial de actividades económicas del SII.
            </p>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Dirección</Label>
            <Textarea value={form.direccion} onChange={set("direccion")} rows={2} />
          </div>
          <div>
            <Label className="text-xs">Comuna</Label>
            <Input value={form.comuna} onChange={set("comuna")} />
          </div>
          <div>
            <Label className="text-xs">Teléfono</Label>
            <Input value={form.telefono} onChange={set("telefono")} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Email de contacto</Label>
            <Input type="email" value={form.email_contacto} onChange={set("email_contacto")} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Datos bancarios (para email de factura)
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Banco</Label>
            <Input value={form.banco} onChange={set("banco")} placeholder="Santander" />
          </div>
          <div>
            <Label className="text-xs">Tipo de cuenta</Label>
            <Input value={form.tipo_cuenta} onChange={set("tipo_cuenta")} />
          </div>
          <div>
            <Label className="text-xs">N° de cuenta</Label>
            <Input value={form.numero_cuenta} onChange={set("numero_cuenta")} />
          </div>
          <div>
            <Label className="text-xs">Email de finanzas</Label>
            <Input
              type="email"
              value={form.email_finanzas}
              onChange={set("email_finanzas")}
              placeholder="finanzas@empresa.com"
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Alertas de cobranza
        </h3>
        <div className="flex items-center gap-3">
          <Switch
            checked={form.cobranza_activa}
            onCheckedChange={(v) => setForm((f) => ({ ...f, cobranza_activa: v }))}
          />
          <span className="text-xs">Enviar recordatorios automáticos de facturas vencidas</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Reenviar cada (días)</Label>
            <Input
              type="number"
              min={1}
              max={90}
              value={form.cobranza_dias_recordatorio}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  cobranza_dias_recordatorio: Math.max(1, Number(e.target.value) || 1),
                }))
              }
            />
          </div>
          <div>
            <Label className="text-xs">Destinatarios CC (separados por coma)</Label>
            <Input
              value={form.cobranza_cc_emails_text}
              onChange={set("cobranza_cc_emails_text")}
              placeholder="finanzas@empresa.com, gerencia@empresa.com"
            />
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}
