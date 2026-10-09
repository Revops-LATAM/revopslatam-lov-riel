import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/api/tasko.functions";
import { listPillars, upsertPillar, deletePillar } from "@/lib/api/grilla.functions";
import { RouteError } from "@/components/tasko/RouteError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/marketing/settings/pilares")(
  {
    ssr: false,
    head: () => ({ meta: [{ title: "Pilares · Marketing · Riel" }] }),
    errorComponent: RouteError,
    component: PillarsSettings,
  },
);

type Draft = {
  id?: string;
  key: string;
  label: string;
  color: string;
  sort_order: number;
  is_active: boolean;
};

function PillarsSettings() {
  const { workspaceSlug } = Route.useParams();
  const qc = useQueryClient();
  const fetchWs = useServerFn(getWorkspaceBySlug);
  const listFn = useServerFn(listPillars);
  const upsertFn = useServerFn(upsertPillar);
  const deleteFn = useServerFn(deletePillar);

  const wsQ = useQuery({
    queryKey: ["ws", workspaceSlug],
    queryFn: () => fetchWs({ data: { slug: workspaceSlug } }),
  });
  const pillarsQ = useQuery({
    queryKey: ["pillars", wsQ.data?.id],
    queryFn: () => listFn({ data: { workspaceId: wsQ.data!.id } }),
    enabled: !!wsQ.data?.id,
  });

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [newRow, setNewRow] = useState<Draft | null>(null);

  const saveMut = useMutation({
    mutationFn: upsertFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pillars"] });
      setDrafts({});
      setNewRow(null);
      toast.success("Guardado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pillars"] });
      toast.success("Eliminado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function draftFor(p: NonNullable<typeof pillarsQ.data>[number]): Draft {
    return (
      drafts[p.id] ?? {
        id: p.id,
        key: p.key,
        label: p.label,
        color: p.color ?? "#94a3b8",
        sort_order: p.sort_order,
        is_active: p.is_active,
      }
    );
  }

  function patchDraft(id: string, patch: Partial<Draft>) {
    setDrafts((d) => ({
      ...d,
      [id]: {
        ...(d[id] ?? { id, key: "", label: "", color: "#94a3b8", sort_order: 0, is_active: true }),
        ...patch,
      },
    }));
  }

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center justify-between">
        <h1 className="text-sm font-semibold">Pilares de contenido</h1>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() =>
            setNewRow({
              key: "",
              label: "",
              color: "#94a3b8",
              sort_order: (pillarsQ.data?.length ?? 0) + 1,
              is_active: true,
            })
          }
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Nuevo pilar
        </Button>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-2">
          <div className="grid grid-cols-[3rem_2fr_2fr_5rem_5rem_3rem_3rem] items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <div>Orden</div>
            <div>Etiqueta</div>
            <div>Key</div>
            <div>Color</div>
            <div>Activo</div>
            <div></div>
            <div></div>
          </div>

          {(pillarsQ.data ?? []).map((p) => {
            const d = draftFor(p);
            const isDirty = !!drafts[p.id];
            return (
              <div
                key={p.id}
                className="grid grid-cols-[3rem_2fr_2fr_5rem_5rem_3rem_3rem] items-center gap-2 px-3 py-2 rounded-md border border-border bg-card"
              >
                <Input
                  type="number"
                  className="h-8"
                  value={d.sort_order}
                  onChange={(e) =>
                    patchDraft(p.id, { sort_order: parseInt(e.target.value, 10) || 0 })
                  }
                />
                <Input
                  className="h-8"
                  value={d.label}
                  onChange={(e) => patchDraft(p.id, { label: e.target.value })}
                />
                <Input
                  className="h-8 font-mono text-xs"
                  value={d.key}
                  onChange={(e) => patchDraft(p.id, { key: e.target.value })}
                />
                <Input
                  type="color"
                  className="h-8 p-1"
                  value={d.color}
                  onChange={(e) => patchDraft(p.id, { color: e.target.value })}
                />
                <div className="flex justify-center">
                  <Switch
                    checked={d.is_active}
                    onCheckedChange={(v) => patchDraft(p.id, { is_active: v })}
                  />
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  disabled={!isDirty || saveMut.isPending}
                  onClick={() =>
                    saveMut.mutate({
                      data: {
                        id: p.id,
                        workspaceId: wsQ.data!.id,
                        key: d.key,
                        label: d.label,
                        color: d.color,
                        sortOrder: d.sort_order,
                        isActive: d.is_active,
                      },
                    })
                  }
                >
                  <Save className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive"
                  onClick={() => {
                    if (confirm("¿Eliminar este pilar?")) delMut.mutate({ data: { id: p.id } });
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}

          {newRow && (
            <div className="grid grid-cols-[3rem_2fr_2fr_5rem_5rem_3rem_3rem] items-center gap-2 px-3 py-2 rounded-md border border-primary/40 bg-primary/5">
              <Input
                type="number"
                className="h-8"
                value={newRow.sort_order}
                onChange={(e) =>
                  setNewRow({ ...newRow, sort_order: parseInt(e.target.value, 10) || 0 })
                }
              />
              <Input
                className="h-8"
                placeholder="Etiqueta"
                value={newRow.label}
                onChange={(e) => setNewRow({ ...newRow, label: e.target.value })}
              />
              <Input
                className="h-8 font-mono text-xs"
                placeholder="key_slug"
                value={newRow.key}
                onChange={(e) => setNewRow({ ...newRow, key: e.target.value })}
              />
              <Input
                type="color"
                className="h-8 p-1"
                value={newRow.color}
                onChange={(e) => setNewRow({ ...newRow, color: e.target.value })}
              />
              <div className="flex justify-center">
                <Switch
                  checked={newRow.is_active}
                  onCheckedChange={(v) => setNewRow({ ...newRow, is_active: v })}
                />
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                disabled={saveMut.isPending || !newRow.key || !newRow.label}
                onClick={() =>
                  saveMut.mutate({
                    data: {
                      workspaceId: wsQ.data!.id,
                      key: newRow.key,
                      label: newRow.label,
                      color: newRow.color,
                      sortOrder: newRow.sort_order,
                      isActive: newRow.is_active,
                    },
                  })
                }
              >
                <Save className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setNewRow(null)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
