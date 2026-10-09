import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getProject,
  createTask,
  updateTask,
  deleteTask,
  getWorkspaceBySlug,
} from "@/lib/api/tasko.functions";
import { tasksQO, membersQO, rollupsQO } from "@/lib/api/tasko.queries";
import { listInternalCategories } from "@/lib/api/internal.functions";
import { TaskTableView } from "@/components/tasko/TaskTableView";
import { TaskDetailDrawer } from "@/components/tasko/TaskDetailDrawer";
import { Coffee } from "lucide-react";
import { toast } from "sonner";
import { RouteError } from "@/components/tasko/RouteError";
import { ConfirmDialog } from "@/components/tasko/ConfirmDialog";

export const Route = createFileRoute(
  "/_authenticated/w/$workspaceSlug/internal/projects/$projectId",
)({
  ssr: false,
  head: () => ({ meta: [{ title: "Proyecto interno · Riel" }] }),
  errorComponent: RouteError,
  component: InternalProjectPage,
});

function InternalProjectPage() {
  const { workspaceSlug, projectId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fetchWs = useServerFn(getWorkspaceBySlug);
  const fetchProject = useServerFn(getProject);
  const fetchCats = useServerFn(listInternalCategories);
  const createFn = useServerFn(createTask);
  const updateFn = useServerFn(updateTask);
  const deleteFn = useServerFn(deleteTask);

  const wsQ = useQuery({
    queryKey: ["ws", workspaceSlug],
    queryFn: () => fetchWs({ data: { slug: workspaceSlug } }),
  });
  const projectQ = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetchProject({ data: { projectId } }),
  });
  const tasksQ = useQuery(tasksQO(projectId));
  const membersQ = useQuery({
    ...membersQO(wsQ.data?.id ?? ""),
    enabled: !!wsQ.data?.id,
  });
  const rollupsQ = useQuery(rollupsQO(projectId));
  const catsQ = useQuery({
    queryKey: ["internal-cats", wsQ.data?.id],
    queryFn: () => fetchCats({ data: { workspaceId: wsQ.data!.id } }),
    enabled: !!wsQ.data?.id,
  });

  const category = useMemo(
    () =>
      (catsQ.data ?? []).find(
        (c) =>
          c.id ===
          (projectQ.data as { internal_category_id?: string | null } | undefined)
            ?.internal_category_id,
      ),
    [catsQ.data, projectQ.data],
  );

  const [selectedTask, setSelectedTask] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<{ ids: string[]; title: string } | null>(null);

  const createMut = useMutation({
    mutationFn: (vars: { title: string; taskTypeId?: string | null }) =>
      createFn({
        data: {
          projectId,
          title: vars.title,
          taskTypeId: vars.taskTypeId ?? null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (vars: {
      taskId: string;
      title?: string;
      assigneeId?: string | null;
      dueDate?: string | null;
      startDate?: string | null;
      statusId?: string | null;
      priority?: "none" | "baja" | "media" | "alta" | "urgente";
      totalEffortHours?: number | null;
      effortMode?: "basic" | "flexible" | "fixed_daily" | "due_date";
      sprintId?: string | null;
      phaseId?: string | null;
      taskTypeId?: string | null;
    }) => updateFn({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["rollups", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (taskId: string) => deleteFn({ data: { taskId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
      toast.success("Tarea eliminada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!wsQ.data || !projectQ.data) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Cargando proyecto…</div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center gap-3">
        <Coffee className="w-4 h-4 text-sky-500" />
        <Link
          to="/w/$workspaceSlug/internal"
          params={{ workspaceSlug }}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Interno
        </Link>
        {category && (
          <>
            <span className="text-muted-foreground">›</span>
            <Link
              to="/w/$workspaceSlug/internal/categories/$key"
              params={{ workspaceSlug, key: category.key }}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              {category.name}
            </Link>
          </>
        )}
        <span className="text-muted-foreground">›</span>
        <h1 className="text-sm font-semibold">{projectQ.data.name}</h1>
      </header>

      <div className="flex-1 overflow-hidden">
        <TaskTableView
          viewKey={`internal-project:${projectId}`}
          tasks={(tasksQ.data ?? []) as Parameters<typeof TaskTableView>[0]["tasks"]}
          members={(membersQ.data ?? []) as Parameters<typeof TaskTableView>[0]["members"]}
          phases={[]}
          contractId={null}
          contractType={null}
          workspaceId={wsQ.data.id}
          rollups={rollupsQ.data ?? undefined}
          onOpenTask={setSelectedTask}
          onCreate={(title, taskTypeId) =>
            createMut.mutate({ title, taskTypeId: taskTypeId ?? null })
          }
          onUpdate={(vars) => updateMut.mutate(vars as never)}
          onDelete={(t) => setPendingDelete({ ids: [t.id], title: t.title })}
          onBulkDelete={(ts) => {
            if (ts.length === 0) return;
            setPendingDelete({
              ids: ts.map((t) => t.id),
              title: ts.length === 1 ? ts[0].title : `${ts.length} tareas`,
            });
          }}
        />
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title={
          pendingDelete && pendingDelete.ids.length > 1
            ? "¿Eliminar estas tareas?"
            : "¿Eliminar esta tarea?"
        }
        description={
          pendingDelete
            ? `"${pendingDelete.title}" se eliminará${pendingDelete.ids.length > 1 ? "n" : ""} permanentemente, incluyendo sus subtareas y comentarios.`
            : undefined
        }
        confirmLabel="Eliminar"
        destructive
        loading={deleteMut.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          const ids = pendingDelete.ids;
          setPendingDelete(null);
          for (const id of ids) deleteMut.mutate(id);
        }}
      />

      <TaskDetailDrawer
        taskId={selectedTask}
        workspaceId={wsQ.data.id}
        onClose={() => {
          setSelectedTask(null);
          qc.invalidateQueries({ queryKey: ["tasks", projectId] });
        }}
      />
    </div>
  );
}
