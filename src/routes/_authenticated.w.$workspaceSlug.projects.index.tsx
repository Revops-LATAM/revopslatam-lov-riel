import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createProject } from "@/lib/api/tasko.functions";
import { wsBySlugQO, projectsQO } from "@/lib/api/tasko.queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Folder } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/tasko/EmptyState";
import { ProjectGridSkeleton } from "@/components/tasko/Skeletons";
import { RouteError } from "@/components/tasko/RouteError";
import { DataGrid, type ColumnDef } from "@/components/datagrid/DataGrid";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/projects/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Proyectos · Riel" }] }),
  loader: async ({ context, params }) => {
    const ws = await context.queryClient.ensureQueryData(wsBySlugQO(params.workspaceSlug));
    await context.queryClient.ensureQueryData(projectsQO(ws.id));
    return null;
  },
  pendingComponent: () => (
    <div className="p-6">
      <ProjectGridSkeleton />
    </div>
  ),
  errorComponent: RouteError,
  component: ProjectsList,
});

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  archived: boolean;
  created_at: string;
};

import { formatDateCL } from "@/lib/date-format";

function fmtDate(s: string | null) {
  return formatDateCL(s);
}

function ProjectsList() {
  const { workspaceSlug } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createProject);

  const { data: ws } = useSuspenseQuery(wsBySlugQO(workspaceSlug));
  const { data: projects } = useSuspenseQuery(projectsQO(ws.id));

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#8b5cf6");

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          workspaceId: ws.id,
          name,
          description: description || undefined,
          color,
        },
      }),
    onSuccess: () => {
      toast.success("Proyecto creado");
      qc.invalidateQueries({ queryKey: ["projects", ws.id] });
      setOpen(false);
      setName("");
      setDescription("");
    },
    onError: (e: Error) => toast.error("Error", { description: e.message }),
  });

  const columns: ColumnDef<ProjectRow>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Proyecto",
        required: true,
        sortable: true,
        accessor: (p) => p.name,
        cell: (p) => (
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: p.color ?? "#8b5cf6" }}
            />
            <span className="font-medium truncate">{p.name}</span>
          </div>
        ),
        width: 260,
      },
      {
        id: "description",
        header: "Descripción",
        sortable: true,
        accessor: (p) => p.description ?? "",
        cell: (p) => <span className="text-muted-foreground truncate">{p.description ?? "—"}</span>,
        width: 420,
      },
      {
        id: "created_at",
        header: "Creado",
        sortable: true,
        accessor: (p) => p.created_at,
        cell: (p) => <span className="text-muted-foreground">{fmtDate(p.created_at)}</span>,
        width: 120,
      },
    ],
    [],
  );

  if (ws.kind === "operations") {
    return (
      <div className="flex flex-col h-full">
        <header className="h-12 border-b border-border px-6 flex items-center">
          <h1 className="text-sm font-semibold">Tareas</h1>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <EmptyState
            icon={Folder}
            title="Selecciona un elemento"
            description="Elige un cliente, contrato, sprint o fase en el árbol de la izquierda para ver y gestionar sus tareas."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-sm font-semibold">Proyectos</h1>
          <p className="text-xs text-muted-foreground">
            {projects.length} {projects.length === 1 ? "proyecto" : "proyectos"} en este espacio
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1" /> Nuevo proyecto
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear proyecto</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>
              <div className="space-y-2">
                <Label>Descripción</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <Input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-20 p-1"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => createMut.mutate()}
                disabled={!name.trim() || createMut.isPending}
              >
                {createMut.isPending ? "Creando..." : "Crear"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {projects.length === 0 ? (
        <div className="flex-1 p-6">
          <EmptyState
            icon={Folder}
            title="Aún no tienes proyectos"
            description="Crea tu primer proyecto para empezar a organizar tareas y colaborar con tu equipo."
            action={{
              label: "Crear el primero",
              onClick: () => setOpen(true),
              icon: <Plus className="w-4 h-4 mr-1" aria-hidden="true" />,
            }}
          />
        </div>
      ) : (
        <DataGrid<ProjectRow>
          viewKey={`projects:${ws.id}`}
          columns={columns}
          rows={projects as ProjectRow[]}
          rowKey={(p) => p.id}
          defaultSort={{ id: "created_at", dir: "desc" }}
          onRowOpen={(p) =>
            navigate({
              to: "/w/$workspaceSlug/projects/$projectId",
              params: { workspaceSlug, projectId: p.id },
            })
          }
          empty="Sin proyectos."
        />
      )}
    </div>
  );
}
