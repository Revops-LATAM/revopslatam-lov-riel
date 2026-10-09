import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Star, StarOff, Edit2, X } from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/api/tasko.functions";
import {
  listCadenceTemplates,
  getCadenceTemplate,
  upsertCadenceTemplate,
  deleteCadenceTemplate,
  listPillars,
  PIECE_FORMATS,
  PIECE_CHANNELS,
} from "@/lib/api/grilla.functions";
import { RouteError } from "@/components/tasko/RouteError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/marketing/settings/cadencia")({
  ssr: false,
  head: () => ({ meta: [{ title: "Cadencia · Marketing · Riel" }] }),
  errorComponent: RouteError,
  component: CadenceSettings,
});

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

type Slot = {
  weekday: number;
  timeOfDay: string | null;
  format: (typeof PIECE_FORMATS)[number];
  channels: (typeof PIECE_CHANNELS)[number][];
  pillarId: string | null;
};

function CadenceSettings() {
  const { workspaceSlug } = Route.useParams();
  const qc = useQueryClient();
  const fetchWs = useServerFn(getWorkspaceBySlug);
  const listFn = useServerFn(listCadenceTemplates);
  const deleteFn = useServerFn(deleteCadenceTemplate);

  const wsQ = useQuery({
    queryKey: ["ws", workspaceSlug],
    queryFn: () => fetchWs({ data: { slug: workspaceSlug } }),
  });
  const tplsQ = useQuery({
    queryKey: ["cadence-templates", wsQ.data?.id],
    queryFn: () => listFn({ data: { workspaceId: wsQ.data!.id } }),
    enabled: !!wsQ.data?.id,
  });

  const [editing, setEditing] = useState<string | null | undefined>(undefined); // undefined = closed, null = new, string = edit id
  const delMut = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cadence-templates"] });
      toast.success("Plantilla eliminada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center justify-between">
        <h1 className="text-sm font-semibold">Plantillas de cadencia</h1>
        <Button size="sm" className="h-7 text-xs" onClick={() => setEditing(null)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Nueva plantilla
        </Button>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-2">
          {(tplsQ.data ?? []).length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-16">
              No hay plantillas todavía. Crea la primera para generar tu grilla mensual.
            </div>
          )}
          {(tplsQ.data ?? []).map((t) => (
            <div key={t.id} className="rounded-md border border-border bg-card p-4 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium">{t.name}</div>
                  {t.is_default && (
                    <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px]">
                      <Star className="w-3 h-3 mr-1" /> Por defecto
                    </Badge>
                  )}
                  {!t.is_active && (
                    <Badge variant="secondary" className="text-[10px]">Inactiva</Badge>
                  )}
                </div>
                {t.description && <div className="text-xs text-muted-foreground mt-1">{t.description}</div>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(t.id)}>
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive"
                  onClick={() => {
                    if (confirm(`¿Eliminar "${t.name}"?`)) delMut.mutate({ data: { templateId: t.id } });
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing !== undefined && wsQ.data && (
        <EditTemplateDialog
          workspaceId={wsQ.data.id}
          templateId={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}

function EditTemplateDialog({
  workspaceId,
  templateId,
  onClose,
}: {
  workspaceId: string;
  templateId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getCadenceTemplate);
  const upsertFn = useServerFn(upsertCadenceTemplate);
  const listPillarsFn = useServerFn(listPillars);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [slots, setSlots] = useState<Slot[]>([]);

  const pillarsQ = useQuery({
    queryKey: ["pillars", workspaceId, true],
    queryFn: () => listPillarsFn({ data: { workspaceId, onlyActive: true } }),
  });

  const tplQ = useQuery({
    queryKey: ["cadence-template", templateId],
    queryFn: () => getFn({ data: { templateId: templateId! } }),
    enabled: !!templateId,
  });

  useEffect(() => {
    if (templateId && tplQ.data) {
      setName(tplQ.data.template.name);
      setDescription(tplQ.data.template.description ?? "");
      setIsDefault(tplQ.data.template.is_default);
      setIsActive(tplQ.data.template.is_active);
      setSlots(
        tplQ.data.slots.map((s) => ({
          weekday: s.weekday,
          timeOfDay: s.time_of_day,
          format: s.format,
          channels: s.channels ?? [],
          pillarId: s.pillar_id,
        })),
      );
    } else if (!templateId) {
      setName("");
      setDescription("");
      setIsDefault(false);
      setIsActive(true);
      setSlots([]);
    }
  }, [templateId, tplQ.data]);

  const saveMut = useMutation({
    mutationFn: upsertFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cadence-templates"] });
      toast.success("Plantilla guardada");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function addSlot() {
    setSlots((s) => [
      ...s,
      { weekday: 0, timeOfDay: "09:00", format: "post", channels: ["instagram"], pillarId: null },
    ]);
  }
  function removeSlot(idx: number) {
    setSlots((s) => s.filter((_, i) => i !== idx));
  }
  function updateSlot(idx: number, patch: Partial<Slot>) {
    setSlots((s) => s.map((sl, i) => (i === idx ? { ...sl, ...patch } : sl)));
  }
  function toggleChannel(idx: number, ch: (typeof PIECE_CHANNELS)[number]) {
    setSlots((s) =>
      s.map((sl, i) => {
        if (i !== idx) return sl;
        const has = sl.channels.includes(ch);
        return { ...sl, channels: has ? sl.channels.filter((c) => c !== ch) : [...sl.channels, ch] };
      }),
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{templateId ? "Editar plantilla" : "Nueva plantilla de cadencia"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Nombre</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cadencia estándar" />
            </div>
            <div className="flex items-end gap-4">
              <label className="text-xs flex items-center gap-2">
                <Switch checked={isDefault} onCheckedChange={setIsDefault} />
                Por defecto
              </label>
              <label className="text-xs flex items-center gap-2">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                Activa
              </label>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Descripción</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Slots semanales ({slots.length})
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addSlot}>
                <Plus className="w-3 h-3 mr-1" /> Agregar slot
              </Button>
            </div>
            <div className="space-y-1.5">
              {slots.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-4 border border-dashed border-border rounded">
                  Agrega un slot por cada publicación semanal que quieras que la plantilla genere.
                </div>
              )}
              {slots.map((s, idx) => (
                <div key={idx} className="grid grid-cols-[6rem_5rem_7rem_1fr_1fr_2rem] items-center gap-2 p-2 rounded border border-border bg-muted/20">
                  <Select value={String(s.weekday)} onValueChange={(v) => updateSlot(idx, { weekday: parseInt(v, 10) })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((w, i) => (
                        <SelectItem key={i} value={String(i)}>{w}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="time"
                    className="h-8 text-xs"
                    value={s.timeOfDay ?? ""}
                    onChange={(e) => updateSlot(idx, { timeOfDay: e.target.value || null })}
                  />
                  <Select value={s.format} onValueChange={(v) => updateSlot(idx, { format: v as Slot["format"] })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PIECE_FORMATS.map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-1">
                    {PIECE_CHANNELS.map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => toggleChannel(idx, ch)}
                        className={`text-[10px] px-1.5 py-0.5 rounded border ${
                          s.channels.includes(ch)
                            ? "bg-primary/20 border-primary/40 text-primary-foreground"
                            : "bg-background border-border text-muted-foreground"
                        }`}
                      >
                        {ch.slice(0, 2).toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <Select
                    value={s.pillarId ?? "__none__"}
                    onValueChange={(v) => updateSlot(idx, { pillarId: v === "__none__" ? null : v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin pilar</SelectItem>
                      {(pillarsQ.data ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeSlot(idx)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={saveMut.isPending || !name}
            onClick={() =>
              saveMut.mutate({
                data: {
                  id: templateId ?? undefined,
                  workspaceId,
                  name,
                  description: description || null,
                  isDefault,
                  isActive,
                  slots,
                },
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
