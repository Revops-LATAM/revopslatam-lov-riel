import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { wsBySlugQO, serviceTypesQO } from "@/lib/api/tasko.queries";
import { upsertServiceType, deleteServiceType } from "@/lib/api/service-types.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { RouteError } from "@/components/tasko/RouteError";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/settings/service-types")({
  ssr: false,
  loader: async ({ context, params }) => {
    const ws = await context.queryClient.ensureQueryData(wsBySlugQO(params.workspaceSlug));
    await context.queryClient.ensureQueryData(serviceTypesQO(ws.id));
    return null;
  },
  errorComponent: RouteError,
  component: ServiceTypesPage,
});

function ServiceTypesPage() {
  const { workspaceSlug } = Route.useParams();
  const { data: ws } = useSuspenseQuery(wsBySlugQO(workspaceSlug));
  const { data: rows } = useSuspenseQuery(serviceTypesQO(ws.id));
  const qc = useQueryClient();
  const upsert = useServerFn(upsertServiceType);
  const del = useServerFn(deleteServiceType);

  const [newName, setNewName] = useState("");

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["service-types", ws.id] });

  const create = useMutation({
    mutationFn: async (name: string) =>
      upsert({ data: { workspaceId: ws.id, name, activo: true, orden: rows.length } }),
    onSuccess: () => {
      invalidate();
      setNewName("");
      toast.success("Tipo de servicio creado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (vars: { id: string; name: string; activo: boolean; orden: number }) =>
      upsert({ data: { workspaceId: ws.id, ...vars } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Eliminado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      <div>
        <h2 className="text-sm font-semibold">Tipos de servicio</h2>
        <p className="text-xs text-muted-foreground">
          Catálogo configurable de servicios disponibles para los contratos.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Ej: HubSpot Onboarding"
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) create.mutate(newName.trim());
          }}
        />
        <Button
          disabled={!newName.trim() || create.isPending}
          onClick={() => create.mutate(newName.trim())}
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Agregar
        </Button>
      </div>

      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Nombre</th>
              <th className="text-left px-3 py-2 font-medium w-24">Activo</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center text-muted-foreground py-8 text-xs">
                  Aún no hay tipos de servicio.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Input
                      defaultValue={r.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== r.name)
                          update.mutate({ id: r.id, name: v, activo: r.activo, orden: r.orden });
                      }}
                      className="h-8"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Switch
                      checked={r.activo}
                      onCheckedChange={(v) =>
                        update.mutate({ id: r.id, name: r.name, activo: v, orden: r.orden })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`¿Eliminar "${r.name}"?`)) remove.mutate(r.id);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
