import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/api/tasko.functions";
import {
  listInternalCategories,
  createInternalCategory,
  updateInternalCategory,
  deleteInternalCategory,
} from "@/lib/api/internal.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RouteError } from "@/components/tasko/RouteError";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/internal/settings")({
  ssr: false,
  head: () => ({ meta: [{ title: "Ajustes Internos · Riel" }] }),
  loader: async ({ context, params }) => {
    const { requirePermission } = await import("@/lib/permissions-loader");
    await requirePermission(context.queryClient, params.workspaceSlug, "internal_manage");
    return null;
  },
  errorComponent: RouteError,
  component: InternalSettingsPage,
});

function InternalSettingsPage() {
  const { workspaceSlug } = Route.useParams();
  const qc = useQueryClient();
  const fetchWs = useServerFn(getWorkspaceBySlug);
  const fetchCats = useServerFn(listInternalCategories);
  const createCat = useServerFn(createInternalCategory);
  const updateCat = useServerFn(updateInternalCategory);
  const deleteCat = useServerFn(deleteInternalCategory);

  const wsQ = useQuery({
    queryKey: ["ws", workspaceSlug],
    queryFn: () => fetchWs({ data: { slug: workspaceSlug } }),
  });
  const catsQ = useQuery({
    queryKey: ["internal-cats", wsQ.data?.id],
    queryFn: () => fetchCats({ data: { workspaceId: wsQ.data!.id } }),
    enabled: !!wsQ.data?.id,
  });

  const [name, setName] = useState("");
  const [key, setKey] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      createCat({
        data: {
          workspaceId: wsQ.data!.id,
          key:
            key.trim() ||
            name
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .slice(0, 40),
          name: name.trim(),
        },
      }),
    onSuccess: () => {
      setName("");
      setKey("");
      qc.invalidateQueries({ queryKey: ["internal-cats"] });
      toast.success("Categoría creada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renameMut = useMutation({
    mutationFn: (v: { categoryId: string; name: string }) =>
      updateCat({ data: { categoryId: v.categoryId, name: v.name } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["internal-cats"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (categoryId: string) => deleteCat({ data: { categoryId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["internal-cats"] });
      toast.success("Categoría eliminada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center">
        <h1 className="text-sm font-semibold">Ajustes · Categorías internas</h1>
      </header>
      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-2xl">
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Nueva categoría
          </h2>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim().length === 0) return;
              createMut.mutate();
            }}
          >
            <Input
              placeholder="Nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-sm"
            />
            <Input
              placeholder="key (opcional)"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="h-8 text-sm w-40"
            />
            <Button size="sm" type="submit" disabled={createMut.isPending}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Crear
            </Button>
          </form>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Categorías existentes
          </h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {(catsQ.data ?? []).map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: c.color ?? "#0ea5e9" }}
                />
                <Input
                  defaultValue={c.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== c.name) renameMut.mutate({ categoryId: c.id, name: v });
                  }}
                  className="h-7 text-sm flex-1"
                />
                <span className="text-[11px] text-muted-foreground font-mono">{c.key}</span>
                {!c.is_system && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (confirm(`¿Eliminar la categoría "${c.name}"?`)) deleteMut.mutate(c.id);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
