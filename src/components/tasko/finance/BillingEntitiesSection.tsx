import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus, Trash2, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SiiActivitySelect } from "@/components/tasko/operations/SiiActivitySelect";
import {
  listBillingEntities,
  upsertBillingEntity,
  archiveBillingEntity,
} from "@/lib/api/billing-entities.functions";

type Entity = {
  id: string;
  rut: string | null;
  razon_social: string;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  email_facturacion: string | null;
  cc_emails: string[];
  is_primary: boolean;
};

const empty = {
  rut: "",
  razon_social: "",
  giro: "",
  direccion: "",
  comuna: "",
  email_facturacion: "",
  cc: "",
  is_primary: false,
};

export function BillingEntitiesSection({ accountId }: { accountId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listBillingEntities);
  const save = useServerFn(upsertBillingEntity);
  const archive = useServerFn(archiveBillingEntity);
  const q = useQuery({ queryKey: ["billing-entities", accountId], queryFn: () => list({ data: { accountId } }) });
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const openEdit = (e?: Entity) => {
    setEditing(e ? e.id : "new");
    setForm(
      e
        ? {
            rut: e.rut ?? "",
            razon_social: e.razon_social,
            giro: e.giro ?? "",
            direccion: e.direccion ?? "",
            comuna: e.comuna ?? "",
            email_facturacion: e.email_facturacion ?? "",
            cc: (e.cc_emails ?? []).join(", "),
            is_primary: e.is_primary,
          }
        : empty,
    );
  };

  const onSave = async () => {
    const cc = form.cc.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
    const bad = [form.email_facturacion, ...cc].filter((x) => x && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(x));
    if (bad.length) {
      toast.error(`Correo inválido: ${bad.join(", ")}`);
      return;
    }
    setSaving(true);
    try {
      await save({
        data: {
          id: editing && editing !== "new" ? editing : undefined,
          accountId,
          rut: form.rut,
          razon_social: form.razon_social,
          giro: form.giro,
          direccion: form.direccion,
          comuna: form.comuna,
          email_facturacion: form.email_facturacion,
          cc_emails: cc,
          is_primary: form.is_primary,
        },
      });
      toast.success("Razón social guardada");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["billing-entities", accountId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const rows = (q.data ?? []) as Entity[];

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold">Razones sociales de facturación</h2>
          <p className="text-xs text-muted-foreground">
            Agrega todas las empresas del grupo a las que se puede facturar.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => openEdit()}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Agregar
        </Button>
      </div>
      <div className="border border-border rounded-md divide-y divide-border">
        {rows.length === 0 && (
          <div className="p-4 text-xs text-muted-foreground text-center">Sin razones sociales.</div>
        )}
        {rows.map((e) => (
          <div key={e.id} className="flex items-center gap-3 p-3 text-sm">
            {e.is_primary && <Star className="w-3.5 h-3.5 text-primary shrink-0" aria-label="Principal" />}
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{e.razon_social}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {e.rut ?? "Sin RUT"} · {e.email_facturacion ?? "sin correo"}
                {e.cc_emails?.length ? ` · CC: ${e.cc_emails.join(", ")}` : ""}
              </div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => openEdit(e)} aria-label="Editar">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            {!e.is_primary && (
              <Button
                size="icon"
                variant="ghost"
                aria-label="Quitar"
                onClick={async () => {
                  if (!confirm(`¿Quitar ${e.razon_social}?`)) return;
                  await archive({ data: { id: e.id } });
                  qc.invalidateQueries({ queryKey: ["billing-entities", accountId] });
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Nueva razón social" : "Editar razón social"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">RUT</Label>
              <Input value={form.rut} onChange={(e) => setForm({ ...form, rut: e.target.value })} placeholder="76.123.456-7" />
            </div>
            <div>
              <Label className="text-xs">Razón social *</Label>
              <Input value={form.razon_social} onChange={(e) => setForm({ ...form, razon_social: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Giro</Label>
              <SiiActivitySelect value={form.giro} onChange={(v) => setForm({ ...form, giro: v.replace(/^\d+\s*—\s*/, "") })} />
              {form.giro && <p className="text-[11px] text-muted-foreground mt-1">{form.giro}</p>}
            </div>
            <div>
              <Label className="text-xs">Dirección</Label>
              <Input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Comuna</Label>
              <Input value={form.comuna} onChange={(e) => setForm({ ...form, comuna: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Correo de facturación</Label>
              <Input value={form.email_facturacion} onChange={(e) => setForm({ ...form, email_facturacion: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">CC (separados por coma)</Label>
              <Input value={form.cc} onChange={(e) => setForm({ ...form, cc: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={onSave} disabled={saving || !form.razon_social.trim()}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
