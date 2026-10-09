import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { wsBySlugQO, dteConfigQO } from "@/lib/api/tasko.queries";
import { upsertDteConfig } from "@/lib/api/dte.functions";
import { RouteError } from "@/components/tasko/RouteError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/finance/settings/dte")({
  ssr: false,
  loader: async ({ context, params }) => {
    const ws = await context.queryClient.ensureQueryData(wsBySlugQO(params.workspaceSlug));
    await context.queryClient.ensureQueryData(dteConfigQO(ws.id));
    return null;
  },
  errorComponent: RouteError,
  component: DtePage,
});

function DtePage() {
  const { workspaceSlug } = Route.useParams();
  const { data: ws } = useSuspenseQuery(wsBySlugQO(workspaceSlug));
  const { data: cfg } = useSuspenseQuery(dteConfigQO(ws.id));
  const qc = useQueryClient();
  const save = useServerFn(upsertDteConfig);

  const [form, setForm] = useState({
    provider: "openfactura",
    ambiente: "sandbox" as "sandbox" | "production",
    api_key: "",
    rut_emisor: "",
    activo: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (cfg) {
      setForm((f) => ({
        ...f,
        provider: cfg.provider ?? "openfactura",
        ambiente: (cfg.ambiente as "sandbox" | "production") ?? "sandbox",
        rut_emisor: cfg.rut_emisor ?? "",
        activo: cfg.activo ?? false,
        api_key: "",
      }));
    }
  }, [cfg]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await save({
        data: {
          workspaceId: ws.id,
          provider: form.provider,
          ambiente: form.ambiente,
          api_key: form.api_key.trim().length > 0 ? form.api_key : null,
          rut_emisor: form.rut_emisor || null,
          resolucion_sii: null,
          fecha_resolucion: null,
          activo: form.activo,
        },
      });
      toast.success("Configuración DTE guardada");
      setForm((f) => ({ ...f, api_key: "" }));
      qc.invalidateQueries({ queryKey: ["dte-config", ws.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Facturación electrónica (DTE/SII)</h2>
        <p className="text-xs text-muted-foreground">
          Configura tu proveedor DTE (OpenFactura / Haulmer) para emitir facturas electrónicas al
          SII de Chile desde Riel.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Proveedor</Label>
          <Select
            value={form.provider}
            onValueChange={(v) => setForm((f) => ({ ...f, provider: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openfactura">OpenFactura (Haulmer)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Ambiente</Label>
          <Select
            value={form.ambiente}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, ambiente: v as "sandbox" | "production" }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sandbox">Sandbox (pruebas)</SelectItem>
              <SelectItem value="production">Producción</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="col-span-2">
          <Label className="text-xs">
            API Key{" "}
            {cfg?.has_api_key && (
              <span className="text-muted-foreground">(actual: {cfg.api_key_preview})</span>
            )}
          </Label>
          <Input
            type="password"
            placeholder={
              cfg?.has_api_key ? "Deja vacío para mantener el actual" : "Pega aquí tu API key"
            }
            value={form.api_key}
            onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
            autoComplete="off"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Se almacena cifrada en la base de datos. Solo el workspace puede leerla.
          </p>
        </div>

        <div className="col-span-2">
          <Label className="text-xs">RUT emisor</Label>
          <Input
            value={form.rut_emisor}
            onChange={(e) => setForm((f) => ({ ...f, rut_emisor: e.target.value }))}
            placeholder="76.123.456-7"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            La resolución SII y el timbraje los administra OpenFactura con el certificado digital
            cargado en su portal — no se configuran acá.
          </p>
        </div>

        <div className="col-span-2 flex items-center gap-2 pt-2">
          <Switch
            checked={form.activo}
            onCheckedChange={(v) => setForm((f) => ({ ...f, activo: v }))}
          />
          <Label className="text-xs">Activar emisión de DTE</Label>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}
