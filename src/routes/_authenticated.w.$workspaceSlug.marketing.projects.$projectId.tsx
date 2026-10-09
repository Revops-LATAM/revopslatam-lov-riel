import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FolderKanban, ArrowLeft } from "lucide-react";
import {
  getProject,
  createTask,
  updateTask,
  deleteTask,
  getWorkspaceBySlug,
} from "@/lib/api/tasko.functions";
import { tasksQO, membersQO, rollupsQO } from "@/lib/api/tasko.queries";
import {
  listMarketingPhases,
  createMarketingPhase,
  updateMarketingPhase,
  deleteMarketingPhase,
} from "@/lib/api/marketing-phases.functions";
import { TaskTableView } from "@/components/tasko/TaskTableView";

import { TaskDetailDrawer } from "@/components/tasko/TaskDetailDrawer";
import { MarketingPhasesBar } from "@/components/tasko/marketing/MarketingPhasesBar";
import { MarketingPhaseDialog } from "@/components/tasko/marketing/MarketingPhaseDialog";
import { Button } from "@/components/ui/button";
import { RouteError } from "@/components/tasko/RouteError";
import { ConfirmDialog } from "@/components/tasko/ConfirmDialog";

export const Route = createFileRoute(
  "/_authenticated/w/$workspaceSlug/marketing/projects/$projectId",
)({
  ssr: false,
  head: () => ({ meta: [{ title: "Proyecto · Marketing · Riel" }] }),
  errorComponent: RouteError,
  component: MarketingProjectDetail,
});

const ALLOWED_MARKETING_TYPES = ["tarea", "reunion"] as const;

function MarketingProjectDetail() {
  const { workspaceSlug, projectId } = Route.useParams();
  const qc = useQueryClient();

  const fetchWs = useServerFn(getWorkspaceBySlug);
  const fetchProject = useServerFn(getProject);
  const createFn = useServerFn(createTask);
  const updateFn = useServerFn(updateTask);
  const deleteFn = useServerFn(deleteTask);
  const listPhasesFn = useServerFn(listMarketingPhases);
  const createPhaseFn = useServerFn(createMarketingPhase);
  const updatePhaseFn = useServerFn(updateMarketingPhase);
  const deletePhaseFn = useServerFn(deleteMarketingPhase);

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
  const phasesQ = useQuery({
    queryKey: ["marketing-phases", projectId],
    queryFn: () => listPhasesFn({ data: { projectId } }),
  });

  const [selectedTask, setSelectedTask] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<{ ids: string[]; title: string } | null>(null);

  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null | "_none">(null);
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);

  const activePhaseIdForCreate =
    selectedPhaseId && selectedPhaseId !== "_none" ? selectedPhaseId : null;

  const createMut = useMutation({
    mutationFn: (vars: { title: string; taskTypeId?: string | null; phaseId?: string | null }) =>
      createFn({
        data: {
          projectId,
          title: vars.title,
          taskTypeId: vars.taskTypeId ?? null,
          phaseId: vars.phaseId ?? activePhaseIdForCreate,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", projectId] }),
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

  const createPhaseMut = useMutation({
    mutationFn: (v: {
      name: string;
      color: string | null;
      startDate: string | null;
      endDate: string | null;
      ownerId: string | null;
    }) =>
      createPhaseFn({
        data: {
          projectId,
          name: v.name,
          color: v.color,
          startDate: v.startDate,
          endDate: v.endDate,
          ownerId: v.ownerId,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-phases", projectId] });
      toast.success("Fase creada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updatePhaseMut = useMutation({
    mutationFn: (vars: {
      id: string;
      name: string;
      color: string | null;
      startDate: string | null;
      endDate: string | null;
      ownerId: string | null;
    }) =>
      updatePhaseFn({
        data: {
          id: vars.id,
          name: vars.name,
          color: vars.color,
          startDate: vars.startDate,
          endDate: vars.endDate,
          ownerId: vars.ownerId,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketing-phases", projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deletePhaseMut = useMutation({
    mutationFn: (id: string) => deletePhaseFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-phases", projectId] });
      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
      toast.success("Fase eliminada");
      setSelectedPhaseId((prev) => (prev === null ? null : null));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const phasesForTable = useMemo(
    () =>
      (phasesQ.data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color ?? null,
        order_index: p.order_index ?? null,
        owner_id: p.owner_id ?? null,
        start_date: p.start_date ?? null,
        end_date: p.end_date ?? null,
      })),
    [phasesQ.data],
  );

  const editingPhase = useMemo(
    () => (phasesQ.data ?? []).find((p) => p.id === editingPhaseId) ?? null,
    [phasesQ.data, editingPhaseId],
  );

  const allTasks = tasksQ.data ?? [];
  const filteredTasks = useMemo(() => {
    if (selectedPhaseId === null) return allTasks;
    if (selectedPhaseId === "_none") return allTasks.filter((t) => !t.phase_id);
    return allTasks.filter((t) => t.phase_id === selectedPhaseId);
  }, [allTasks, selectedPhaseId]);

  if (!wsQ.data || !projectQ.data) {
    return <div className="p-6 text-sm text-muted-foreground">Cargando proyecto…</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border px-6 py-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <Link
            to="/w/$workspaceSlug/marketing/projects"
            params={{ workspaceSlug }}
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" /> Proyectos
          </Link>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <FolderKanban className="w-4 h-4 text-pink-400 shrink-0" />
            <h1 className="text-sm font-semibold truncate">{projectQ.data.name}</h1>
          </div>
        </div>
      </header>

      <MarketingPhasesBar
        phases={phasesQ.data ?? []}
        members={(membersQ.data ?? []) as Parameters<typeof MarketingPhasesBar>[0]["members"]}
        selectedPhaseId={selectedPhaseId}
        onSelect={setSelectedPhaseId}
        onCreate={(v) => createPhaseMut.mutate(v)}
        onUpdate={(id, v) => updatePhaseMut.mutate({ id, ...v })}
        onDelete={(id) => deletePhaseMut.mutate(id)}
        saving={createPhaseMut.isPending || updatePhaseMut.isPending}
      />

      <div className="flex-1 overflow-hidden">
        <TaskTableView
          key={selectedPhaseId ?? "all"}
          viewKey={`marketing-project:${projectId}:${selectedPhaseId ?? "all"}`}
          tasks={filteredTasks as Parameters<typeof TaskTableView>[0]["tasks"]}
          members={(membersQ.data ?? []) as Parameters<typeof TaskTableView>[0]["members"]}
          phases={phasesForTable}
          contractId={null}
          contractType={null}
          workspaceId={wsQ.data.id}
          rollups={rollupsQ.data ?? undefined}
          allowedTaskTypeKeys={[...ALLOWED_MARKETING_TYPES]}
          initialGroupBy={selectedPhaseId === null ? "phase" : "none"}
          hideGroupBy={selectedPhaseId === null}
          onEditPhase={(phaseId) => setEditingPhaseId(phaseId)}
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

      <MarketingPhaseDialog
        open={!!editingPhaseId}
        initial={
          editingPhase
            ? {
                id: editingPhase.id,
                name: editingPhase.name,
                color: editingPhase.color ?? null,
                startDate: editingPhase.start_date ?? null,
                endDate: editingPhase.end_date ?? null,
                ownerId: editingPhase.owner_id ?? null,
              }
            : null
        }
        members={(membersQ.data ?? []) as Parameters<typeof MarketingPhaseDialog>[0]["members"]}
        onClose={() => setEditingPhaseId(null)}
        onSave={(v) => {
          if (!editingPhaseId) return;
          updatePhaseMut.mutate({ id: editingPhaseId, ...v });
          setEditingPhaseId(null);
        }}
        onDelete={
          editingPhaseId
            ? () => {
                deletePhaseMut.mutate(editingPhaseId);
                setEditingPhaseId(null);
              }
            : undefined
        }
        saving={updatePhaseMut.isPending || deletePhaseMut.isPending}
      />
    </div>
  );
}
