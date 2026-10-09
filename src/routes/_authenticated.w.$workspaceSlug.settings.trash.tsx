import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RotateCcw, Trash2 } from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/api/tasko.functions";
import { listDeletedTasks, restoreDeletedTask } from "@/lib/api/trash.functions";
import { formatDateTimeCL } from "@/lib/date-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/settings/trash")({
  head: () => ({
    meta: [
      { title: "Papelera de tareas · Riel" },
      {
        name: "description",
        content: "Revisa y restaura las tareas eliminadas en los últimos 30 días.",
      },
    ],
  }),
  component: SettingsTrash,
});

function SettingsTrash() {
  const { workspaceSlug } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const fetchWs = useServerFn(getWorkspaceBySlug);
  const fetchTrash = useServerFn(listDeletedTasks);
  const restoreFn = useServerFn(restoreDeletedTask);

  const ws = useQuery({
    queryKey: ["ws", workspaceSlug],
    queryFn: () => fetchWs({ data: { slug: workspaceSlug } }),
  });

  const trashQ = useQuery({
    queryKey: ["deleted-tasks", ws.data?.id, q],
    enabled: !!ws.data?.id,
    queryFn: () => fetchTrash({ data: { workspaceId: ws.data!.id, days: 30, q: q || undefined } }),
  });

  const restoreMut = useMutation({
    mutationFn: (id: string) => restoreFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Tarea restaurada");
      qc.invalidateQueries({ queryKey: ["deleted-tasks"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo restaurar"),
  });

  if (!ws.data) return <div className="p-6 text-sm text-muted-foreground">Cargando…</div>;

  const rows = trashQ.data ?? [];

  return (
    <div className="p-6 max-w-5xl space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Trash2 className="h-4 w-4" /> Papelera de tareas
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Tareas eliminadas en los últimos 30 días. Solo visible para administradores del espacio y
          super admins. Al restaurar se recupera la tarea con sus asignados (los comentarios y
          registros de tiempo no se recuperan).
        </p>
      </div>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por título…"
        className="h-8 max-w-xs text-xs"
      />

      {trashQ.isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-8 text-center">
          No hay tareas eliminadas en los últimos 30 días.
        </div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-3 py-2">Tarea</th>
                <th className="text-left font-medium px-3 py-2">Proyecto</th>
                <th className="text-left font-medium px-3 py-2">Asignados</th>
                <th className="text-left font-medium px-3 py-2">Eliminada</th>
                <th className="text-left font-medium px-3 py-2">Por</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{r.title}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.project_name ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.assignee_names.length ? r.assignee_names.join(", ") : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDateTimeCL(r.deleted_at)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.deleted_by_name ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {r.restored_at ? (
                      <button
                        type="button"
                        className="text-[11px] text-primary hover:underline"
                        onClick={() =>
                          r.project_id &&
                          navigate({
                            to: "/w/$workspaceSlug/projects/$projectId",
                            params: { workspaceSlug, projectId: r.project_id },
                          })
                        }
                      >
                        Restaurada
                      </button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        disabled={restoreMut.isPending}
                        onClick={() => restoreMut.mutate(r.id)}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" /> Restaurar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
