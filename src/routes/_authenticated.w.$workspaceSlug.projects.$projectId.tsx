import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { memo, useEffect, useState, useMemo, useRef, useCallback, type ReactNode } from "react";
import { z } from "zod";
import { useSuspenseQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createTask, updateTask, deleteTask, reorderTasks } from "@/lib/api/tasko.functions";
import { AsanaSyncControls } from "@/components/tasko/AsanaSyncControls";
import {
  DndContext,
  closestCorners,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  wsBySlugQO,
  projectQO,
  tasksQO,
  membersQO,
  rollupsQO,
  projectHealthQO,
  sprintsQO,
  sprintMetricsQO,
  phasesQO,
  operationsTreeQO,
  taskTypesQO,
  taskStatusesQO,
} from "@/lib/api/tasko.queries";
import { getProjectBundle } from "@/lib/api/project-bundle.functions";
import { EstimateChip } from "@/components/tasko/EstimateChip";
import { TicketPortalPanel } from "@/components/tasko/TicketPortalPanel";
import { TicketsPipelineView } from "@/components/tasko/TicketsPipelineView";
import { TaskTableView } from "@/components/tasko/TaskTableView";
import { ProjectGanttView } from "@/components/tasko/ProjectGanttView";
import { ShareGanttButton } from "@/components/tasko/ShareGanttButton";
import { ShareReportButton } from "@/components/tasko/ShareReportButton";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  Rocket,
  ChevronDown,
  ChevronRight,
  Table2,
  Layers,
  X,
  Play,
  Flag,
  Timer,
  Ticket,
  RefreshCw,
  GitBranch,
} from "lucide-react";

import { getProjectTicketForm } from "@/lib/api/client-tickets.functions";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { getLucideIcon } from "@/lib/task-type-meta";

import { toast } from "sonner";
import {
  PRIORITY_OPTIONS,
  PRIORITY_ICON,
  SPRINT_STATUS_OPTIONS,
  PHASE_STATUS_OPTIONS,
} from "@/lib/tasko-constants";
import { isCompleted, isCancelled, getTaskStatus } from "@/lib/tasko/status";
import { StatusBadgeSelect } from "@/components/tasko/StatusBadgeSelect";
import {
  updateSprintStatus,
  updatePhaseStatus,
  moveSprintPendingTasks,
} from "@/lib/api/operations.functions";
import { dueTone, formatDueShort } from "@/lib/tasko-utils";

import { TaskDetailDrawer } from "@/components/tasko/TaskDetailDrawer";
import { MultiAssigneeSelect } from "@/components/tasko/MultiAssigneeSelect";
import { EmptyState } from "@/components/tasko/EmptyState";
import { TaskFilters, applyFilters, type TaskFiltersValue } from "@/components/tasko/TaskFilters";
import { TaskListSkeleton, PageHeaderSkeleton } from "@/components/tasko/Skeletons";
import { RouteError } from "@/components/tasko/RouteError";
import { ConfirmDialog } from "@/components/tasko/ConfirmDialog";
import { Breadcrumbs } from "@/components/tasko/Breadcrumbs";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/projects/$projectId")({
  ssr: false,
  shouldReload: false,
  head: () => ({
    meta: [
      { title: "Proyecto · Riel" },
      { name: "description", content: "Gestiona tareas, asignaciones y progreso del proyecto." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) =>
    z
      .object({
        task: z.string().uuid().optional(),
        q: z.string().optional(),
        priority: z.string().optional(),
        assignee: z.string().optional(),
        taskType: z.string().optional(),
        sprint: z.string().uuid().optional(),
        phase: z.string().uuid().optional(),
        tab: z
          .enum(["tickets-pipeline", "phases", "sprints", "gantt", "table", "tickets"])
          .optional(),
      })
      .parse(s),
  loader: async ({ context, params }) => {
    const ws = await context.queryClient.ensureQueryData(wsBySlugQO(params.workspaceSlug));
    // Single bundled RPC — collapses 6 round-trips into 1.
    const bundle = await getProjectBundle({
      data: { projectId: params.projectId, workspaceId: ws.id },
    });
    // Hydrate each queryOptions cache so components' useSuspenseQuery hits.
    const qc = context.queryClient;
    qc.setQueryData(projectQO(params.projectId).queryKey, bundle.project);
    qc.setQueryData(tasksQO(params.projectId).queryKey, bundle.tasks);
    qc.setQueryData(membersQO(ws.id).queryKey, bundle.members as never);
    qc.setQueryData(phasesQO(params.projectId).queryKey, bundle.phases);
    qc.setQueryData(taskTypesQO(ws.id).queryKey, bundle.taskTypes);
    qc.setQueryData(taskStatusesQO(ws.id).queryKey, bundle.taskStatuses);
    // Non-critical: prefetch in background, don't block navigation
    void context.queryClient.prefetchQuery(rollupsQO(params.projectId));
    void context.queryClient.prefetchQuery(projectHealthQO(params.projectId));
    void context.queryClient.prefetchQuery(operationsTreeQO(ws.id));
    return null;
  },
  pendingComponent: () => (
    <div className="flex flex-col h-full">
      <PageHeaderSkeleton />
      <TaskListSkeleton />
    </div>
  ),
  errorComponent: RouteError,
  component: ProjectDetail,
});

function ProjectDetail() {
  const { projectId, workspaceSlug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();
  const createFn = useServerFn(createTask);
  const updateFn = useServerFn(updateTask);
  const deleteFn = useServerFn(deleteTask);

  const { data: ws } = useSuspenseQuery(wsBySlugQO(workspaceSlug));
  const { data: project } = useSuspenseQuery(projectQO(projectId));
  const { data: tasks } = useSuspenseQuery(tasksQO(projectId));
  const { data: members } = useSuspenseQuery(membersQO(ws.id));
  const { data: rollups } = useQuery(rollupsQO(projectId));
  const { data: health } = useQuery(projectHealthQO(projectId));
  const { data: phases = [] } = useQuery(phasesQO(projectId));
  const { data: taskTypes = [] } = useQuery(taskTypesQO(ws.id));
  const { data: opsTree = [] } = useQuery(operationsTreeQO(ws.id));
  const { data: sprintsForCrumb = [] } = useQuery({
    ...sprintsQO(project.contract_id ?? "", projectId),
    enabled: !!project.contract_id && !!search.sprint,
  });
  const { data: ticketFormSummary } = useQuery({
    queryKey: ["project-ticket-form", projectId],
    queryFn: () => getProjectTicketForm({ data: { projectId } }),
    staleTime: 60_000,
  });
  const hasTicketPortal = !!ticketFormSummary?.form;

  const breadcrumbCrumbs = useMemo(() => {
    const acc = opsTree.find((a) => a.contracts.some((c) => c.project_id === projectId));
    const contract = acc?.contracts.find((c) => c.project_id === projectId);
    const base: Array<{ label: ReactNode; to?: string; params?: Record<string, string> }> = [];
    if (acc) {
      base.push({
        label: acc.name,
        to: "/w/$workspaceSlug/accounts/$accountId",
        params: { workspaceSlug, accountId: acc.id },
      });
    } else {
      base.push({
        label: "Proyectos",
        to: "/w/$workspaceSlug/projects",
        params: { workspaceSlug },
      });
    }
    if (contract) {
      base.push({ label: contract.name });
    }
    base.push({
      label: project.name,
      to: "/w/$workspaceSlug/projects/$projectId",
      params: { workspaceSlug, projectId },
    });
    if (search.sprint) {
      const s = sprintsForCrumb.find((x) => x.id === search.sprint);
      base.push({ label: s ? `Sprint ${s.sprint_number}` : "Sprint" });
    } else if (search.phase) {
      const p = phases.find((x) => x.id === search.phase);
      base.push({ label: p?.name ?? "Fase" });
    }
    // Last crumb shouldn't be a link
    if (base.length > 0) {
      base[base.length - 1] = { label: base[base.length - 1].label };
    }
    return base;
  }, [
    opsTree,
    projectId,
    workspaceSlug,
    project.name,
    search.sprint,
    search.phase,
    sprintsForCrumb,
    phases,
  ]);

  const filters: TaskFiltersValue = useMemo(
    () => ({
      q: search.q ?? "",
      priority: search.priority ?? "all",
      assignee: search.assignee ?? "all",
      taskType: (search as { taskType?: string }).taskType ?? "all",
    }),
    [search.q, search.priority, search.assignee, (search as { taskType?: string }).taskType],
  );
  const setFilters = useCallback(
    (f: TaskFiltersValue) => {
      navigate({
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          q: f.q.trim() || undefined,
          priority: f.priority === "all" ? undefined : f.priority,
          assignee: f.assignee === "all" ? undefined : f.assignee,
          taskType: f.taskType === "all" ? undefined : f.taskType,
        }),
        replace: true,
      });
    },
    [navigate],
  );

  const visitedTabsRef = useRef<Set<string>>(new Set());

  const [selectedTask, setSelectedTask] = useState<string | null>(search.task ?? null);

  useEffect(() => {
    if (search.task) setSelectedTask(search.task);
  }, [search.task]);
  useEffect(() => {
    if (project?.name && typeof document !== "undefined") {
      document.title = `${project.name} · Riel`;
    }
  }, [project?.name]);
  type TaskRow = (typeof tasks)[number];

  const createMut = useMutation({
    mutationFn: (vars: {
      title: string;
      status?: string;
      sprintId?: string | null;
      phaseId?: string | null;
      taskTypeId?: string | null;
    }) =>
      createFn({
        data: {
          projectId,
          title: vars.title,
          status: vars.status,
          sprintId: vars.sprintId,
          phaseId: vars.phaseId,
          taskTypeId: vars.taskTypeId,
        } as never,
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["tasks", projectId] });
      const prev = qc.getQueryData<TaskRow[]>(["tasks", projectId]);
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      qc.setQueryData<TaskRow[]>(["tasks", projectId], (old) => {
        if (!old) return old;
        const template = (old[0] ?? {}) as Partial<TaskRow>;
        const optimistic = {
          ...template,
          id: tempId,
          title: vars.title,
          status: (vars.status ?? "nueva") as TaskRow["status"],
          priority: "media" as TaskRow["priority"],
          assignee_id: null,
          assignees: [],
          due_date: null,
          start_date: null,
          sprint_id: vars.sprintId ?? null,
          phase_id: vars.phaseId ?? null,
          task_type_id: vars.taskTypeId ?? null,
          status_id: null,
          parent_task_id: null,
          total_effort_hours: null,
          project_id: projectId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          _optimistic: true,
        } as unknown as TaskRow;
        return [...old, optimistic];
      });
      return { prev, tempId };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["tasks", projectId], ctx.prev);
      toast.error("No se pudo crear", { description: e.message });
    },
    onSuccess: () => {
      toast.success("Tarea añadida");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["sprint-metrics"] });
    },
  });

  const updateMut = useMutation({
    mutationFn: (vars: {
      taskId: string;
      status?: string;
      statusId?: string | null;
      priority?: string;
      title?: string;
      assigneeId?: string | null;
      assigneeIds?: string[];
      dueDate?: string | null;
      startDate?: string | null;
      sprintId?: string | null;
      phaseId?: string | null;
      totalEffortHours?: number | null;
    }) => updateFn({ data: vars as never }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["tasks", projectId] });
      const prev = qc.getQueryData<TaskRow[]>(["tasks", projectId]);
      qc.setQueryData<TaskRow[]>(["tasks", projectId], (old) => {
        if (!old) return old;
        return old.map((t) => {
          if (t.id !== vars.taskId) return t;
          const patched: TaskRow = {
            ...t,
            ...(vars.status !== undefined ? { status: vars.status as TaskRow["status"] } : {}),
            ...(vars.statusId !== undefined
              ? { status_id: vars.statusId as TaskRow["status_id"] }
              : {}),
            ...(vars.priority !== undefined
              ? { priority: vars.priority as TaskRow["priority"] }
              : {}),
            ...(vars.title !== undefined ? { title: vars.title } : {}),
            ...(vars.assigneeId !== undefined ? { assignee_id: vars.assigneeId } : {}),
            ...(vars.assigneeIds !== undefined
              ? {
                  assignee_id: vars.assigneeIds[0] ?? null,
                  assignees: vars.assigneeIds.map((user_id) => ({ user_id })),
                }
              : {}),
            ...(vars.dueDate !== undefined ? { due_date: vars.dueDate } : {}),
            ...(vars.startDate !== undefined ? { start_date: vars.startDate } : {}),
            ...(vars.sprintId !== undefined ? { sprint_id: vars.sprintId } : {}),
            ...(vars.phaseId !== undefined ? { phase_id: vars.phaseId } : {}),
            ...(vars.totalEffortHours !== undefined
              ? { total_effort_hours: vars.totalEffortHours }
              : {}),
          };
          return patched;
        });
      });
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["tasks", projectId], ctx.prev);
      toast.error("No se pudo actualizar", { description: e.message });
    },
    onSuccess: (_data, vars) => {
      // El optimistic update ya dejó la fila correcta; evitamos refetchar
      // toda la lista de tareas (puede ser +900) en cada click.
      if (
        vars.status !== undefined ||
        vars.statusId !== undefined ||
        vars.totalEffortHours !== undefined ||
        vars.assigneeIds !== undefined
      ) {
        qc.invalidateQueries({ queryKey: ["sprint-metrics"] });
        qc.invalidateQueries({ queryKey: ["rollups", projectId] });
        qc.invalidateQueries({ queryKey: ["project-health", projectId] });
      }
      // Estimado, estado y asignados pueden ser modificados por triggers
      // (split de horas, sync de status, etc.). Refrescamos la lista para
      // reflejar el valor real persistido y evitar "parece que no guarda".
      if (
        vars.totalEffortHours !== undefined ||
        vars.statusId !== undefined ||
        vars.status !== undefined
      ) {
        qc.invalidateQueries({ queryKey: ["tasks", projectId] });
      }
    },
  });

  const [pendingDelete, setPendingDelete] = useState<{ ids: string[]; title: string } | null>(null);
  const deleteMut = useMutation({
    mutationFn: (taskId: string) => deleteFn({ data: { taskId } }),
    onSuccess: () => {
      toast.success("Tarea eliminada");
      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
    onError: (e: Error) => toast.error("No se pudo eliminar", { description: e.message }),
  });

  const rootTasks = useMemo(() => tasks.filter((t) => !t.parent_task_id), [tasks]);
  const scopedTasks = useMemo(() => {
    if (search.sprint) return rootTasks.filter((t) => t.sprint_id === search.sprint);
    if (search.phase) return rootTasks.filter((t) => t.phase_id === search.phase);
    return rootTasks;
  }, [rootTasks, search.sprint, search.phase]);
  const filteredTasks = useMemo(() => applyFilters(scopedTasks, filters), [scopedTasks, filters]);
  const hasActiveFilters =
    filters.q.trim() !== "" || filters.priority !== "all" || filters.assignee !== "all";

  // Precomputed subtask append for sprints view — avoid rebuilding on every parent render
  const sprintsViewTasks = useMemo(() => {
    const rootIds = new Set(filteredTasks.map((t) => t.id));
    const subs = tasks.filter((t) => t.parent_task_id && rootIds.has(t.parent_task_id));
    return [...filteredTasks, ...subs];
  }, [filteredTasks, tasks]);

  const contractType = (project as { contract?: { type?: string } | null }).contract?.type ?? null;
  const showPhases = contractType !== "recurrente" && phases.length > 0;
  const showSprints = contractType === "recurrente" && !!project.contract_id;
  const showTicketsPipeline = hasTicketPortal;
  // Default view when entering a project (or clicking a sprint/phase deep-link) is the table.
  const fallbackTab = "table" as const;
  const routedActiveTab = search.tab ?? fallbackTab;
  const [activeTab, setLocalActiveTab] = useState(routedActiveTab);

  useEffect(() => {
    visitedTabsRef.current.add(routedActiveTab);
    setLocalActiveTab(routedActiveTab);
  }, [routedActiveTab]);

  const isMounted = useCallback((tab: string) => visitedTabsRef.current.has(tab), []);
  type ProjectTab = "gantt" | "phases" | "sprints" | "table" | "tickets" | "tickets-pipeline";
  const setActiveTab = useCallback(
    (value: string) => {
      const tab = value as ProjectTab;
      visitedTabsRef.current.add(tab);
      setLocalActiveTab(tab);
      navigate({
        to: ".",
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          tab: tab === fallbackTab ? undefined : tab,
        }),
        replace: true,
      });
    },
    [fallbackTab, navigate, projectId, ws.slug],
  );

  const tableCount = rootTasks.length;
  const sprintsCount = sprintsViewTasks.length;

  // Stable callbacks so memoized children (SprintTaskRow, etc.) don't re-render every parent tick.
  const handleSelectTask = useCallback((id: string) => setSelectedTask(id), []);
  const handleUpdateTask = useCallback(
    (vars: Parameters<typeof updateMut.mutate>[0]) => updateMut.mutate(vars),
    [updateMut],
  );
  const handleCreateSprintTask = useCallback(
    (title: string, sprintId: string | null, taskTypeId: string | null) =>
      createMut.mutate({ title, sprintId, taskTypeId } as never),
    [createMut],
  );
  const handleCreatePhaseTask = useCallback(
    (title: string, phaseId: string | null) => createMut.mutate({ title, phaseId } as never),
    [createMut],
  );

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border px-6 py-2 flex flex-col gap-1">
        <Breadcrumbs items={breadcrumbCrumbs} />

        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: project.color ?? "#8b5cf6" }}
            aria-hidden="true"
          />
          <h1 className="text-sm font-semibold truncate">{project.name}</h1>
          {health && (health.estimateHours > 0 || health.loggedHours > 0) && (
            <EstimateChip estimate={health.estimateHours} logged={health.loggedHours} />
          )}
          <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
            {hasActiveFilters
              ? `${filteredTasks.length} de ${rootTasks.length}`
              : `${rootTasks.length} ${rootTasks.length === 1 ? "tarea" : "tareas"}`}
          </span>
          {(project as { asana_project_gid?: string | null }).asana_project_gid && (
            <AsanaSyncControls projectId={project.id} />
          )}
        </div>
      </header>

      <Tabs
        key={search.sprint ?? search.phase ?? "all"}
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <div className="border-b border-border px-6 py-1.5 flex items-center gap-3 flex-wrap">
          <TabsList className="h-8">
            {showTicketsPipeline && (
              <TabsTrigger value="tickets-pipeline" className="text-xs gap-1.5">
                <Ticket className="w-3.5 h-3.5" /> Tickets
              </TabsTrigger>
            )}
            {showPhases && (
              <TabsTrigger value="phases" className="text-xs gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Fases
                <span className="ml-1 text-[10px] tabular-nums text-muted-foreground">
                  {phases.length}
                </span>
              </TabsTrigger>
            )}
            {showSprints && (
              <TabsTrigger value="sprints" className="text-xs gap-1.5">
                <Rocket className="w-3.5 h-3.5" /> Sprints
                <span className="ml-1 text-[10px] tabular-nums text-muted-foreground">
                  {sprintsCount}
                </span>
              </TabsTrigger>
            )}
            <TabsTrigger value="table" className="text-xs gap-1.5">
              <Table2 className="w-3.5 h-3.5" /> Tabla
              <span className="ml-1 text-[10px] tabular-nums text-muted-foreground">
                {tableCount}
              </span>
            </TabsTrigger>
            {contractType === "implementation" && (
              <TabsTrigger value="gantt" className="text-xs gap-1.5">
                <GitBranch className="w-3.5 h-3.5" /> Gantt
              </TabsTrigger>
            )}
            <TabsTrigger value="tickets" className="text-xs gap-1.5">
              <Ticket className="w-3.5 h-3.5" /> Portal de tickets
            </TabsTrigger>
          </TabsList>
          <div className="ml-auto">
            <TaskFilters
              value={filters}
              onChange={setFilters}
              members={members}
              workspaceId={ws.id}
            />
          </div>
        </div>

        {showTicketsPipeline && isMounted("tickets-pipeline") && (
          <TabsContent
            forceMount
            value="tickets-pipeline"
            className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden"
          >
            <TicketsPipelineView
              tasks={filteredTasks}
              members={members}
              workspaceId={ws.id}
              contractId={(project as { contract_id?: string | null }).contract_id ?? null}
              projectId={projectId}
              contractType={contractType}
              onSelectTask={handleSelectTask}
              onUpdateTask={handleUpdateTask}
            />
          </TabsContent>
        )}

        {showPhases && isMounted("phases") && (
          <TabsContent
            forceMount
            value="phases"
            className="flex-1 overflow-auto mt-0 data-[state=inactive]:hidden"
          >
            <PhasesView
              phases={phases}
              tasks={filteredTasks}
              members={members}
              scopedPhaseId={search.phase ?? null}
              onSelectTask={handleSelectTask}
              onCreateTask={handleCreatePhaseTask}
              onUpdateTask={handleUpdateTask}
            />
          </TabsContent>
        )}

        {showSprints && project.contract_id && isMounted("sprints") && (
          <TabsContent
            forceMount
            value="sprints"
            className="flex-1 overflow-auto mt-0 data-[state=inactive]:hidden"
          >
            <SprintsView
              contractId={project.contract_id}
              projectId={projectId}
              tasks={sprintsViewTasks}
              members={members}
              rollups={rollups}
              scopedSprintId={search.sprint ?? null}
              onSelectTask={handleSelectTask}
              taskTypes={taskTypes}
              onCreateTask={handleCreateSprintTask}
              onUpdateTask={handleUpdateTask}
            />
          </TabsContent>
        )}

        {isMounted("table") && (
          <TabsContent
            forceMount
            value="table"
            className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden"
          >
            <TaskTableView
              viewKey={`project-tasks-v2:${projectId}`}
              tasks={filteredTasks}
              members={members}
              phases={phases}
              contractId={(project as { contract_id?: string | null }).contract_id ?? null}
              projectId={projectId}
              contractType={contractType}
              workspaceId={ws.id}
              rollups={rollups}
              onOpenTask={setSelectedTask}
              onCreate={(title, taskTypeId) =>
                createMut.mutate({
                  title,
                  taskTypeId: taskTypeId ?? null,
                  ...(search.phase ? { phaseId: search.phase } : {}),
                  ...(search.sprint ? { sprintId: search.sprint } : {}),
                })
              }
              onUpdate={(vars) => updateMut.mutate(vars)}
              onDelete={(t) => setPendingDelete({ ids: [t.id], title: t.title })}
              onBulkDelete={(ts) => {
                if (ts.length === 0) return;
                setPendingDelete({
                  ids: ts.map((t) => t.id),
                  title: ts.length === 1 ? ts[0].title : `${ts.length} tareas`,
                });
              }}
              emptyHasFilters={hasActiveFilters}
              onClearFilters={() =>
                setFilters({ q: "", priority: "all", assignee: "all", taskType: "all" })
              }
            />
          </TabsContent>
        )}

        {contractType === "implementation" && isMounted("gantt") && (
          <TabsContent
            forceMount
            value="gantt"
            className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden"
          >
            <ProjectGanttView
              projectId={projectId}
              tasks={filteredTasks as Parameters<typeof ProjectGanttView>[0]["tasks"]}
              phases={phases as Parameters<typeof ProjectGanttView>[0]["phases"]}
              onOpenTask={setSelectedTask}
              headerRight={<ShareGanttButton projectId={projectId} />}
            />
          </TabsContent>
        )}

        {isMounted("tickets") && (
          <TabsContent
            forceMount
            value="tickets"
            className="flex-1 overflow-auto mt-0 data-[state=inactive]:hidden"
          >
            <TicketPortalPanel projectId={projectId} />
          </TabsContent>
        )}
      </Tabs>

      <TaskDetailDrawer
        taskId={selectedTask}
        workspaceId={ws.id}
        onClose={() => setSelectedTask(null)}
      />

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
    </div>
  );
}

type SprintTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee_id: string | null;
  assignees?: Array<{ user_id: string }> | null;
  due_date: string | null;
  start_date: string | null;
  sprint_id: string | null;
  parent_task_id: string | null;
  total_effort_hours: number | null;
  task_type_id?: string | null;
};

const getTaskAssigneeIds = (task: {
  assignee_id?: string | null;
  assignees?: Array<{ user_id: string }> | null;
}) => {
  const ids = (task.assignees ?? []).map((a) => a.user_id);
  if (ids.length === 0 && task.assignee_id) return [task.assignee_id];
  return ids;
};

type MemberRow = {
  user_id: string;
  profile: {
    id: string;
    full_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  } | null;
};

function SprintsView({
  contractId,
  projectId,
  tasks,
  members,
  rollups,
  scopedSprintId,
  taskTypes,
  onSelectTask,
  onCreateTask,
  onUpdateTask,
}: {
  contractId: string;
  projectId: string;
  tasks: SprintTask[];
  members: MemberRow[];
  rollups?: Record<string, { estimate: number; logged: number }>;
  scopedSprintId?: string | null;
  taskTypes: Array<{ id: string; name: string; icon: string | null; sort_order: number }>;
  onSelectTask: (id: string) => void;
  onCreateTask: (title: string, sprintId: string | null, taskTypeId: string | null) => void;
  onUpdateTask: (vars: {
    taskId: string;
    status?: string;
    assigneeId?: string | null;
    assigneeIds?: string[];
    sprintId?: string | null;
    dueDate?: string | null;
    startDate?: string | null;
    totalEffortHours?: number | null;
  }) => void;
}) {
  const { data: sprints = [], isLoading } = useQuery(sprintsQO(contractId, projectId));
  const { data: metrics = [] } = useQuery(sprintMetricsQO(contractId, projectId));
  const metricsBySprint = useMemo(() => new Map(metrics.map((m) => [m.sprint_id, m])), [metrics]);
  const qc = useQueryClient();
  const updateSprintStatusFn = useServerFn(updateSprintStatus);
  const reorderFn = useServerFn(reorderTasks);
  const moveSprintFn = useServerFn(moveSprintPendingTasks);
  const sprintStatusMut = useMutation({
    mutationFn: (vars: { sprintId: string; status: string }) =>
      updateSprintStatusFn({
        data: { sprintId: vars.sprintId, status: vars.status as "planificado" },
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["sprints", contractId] });
      const prev = qc.getQueryData<Array<{ id: string; status: string }>>(["sprints", contractId]);
      qc.setQueryData<Array<{ id: string; status: string }>>(["sprints", contractId], (old) =>
        old ? old.map((s) => (s.id === vars.sprintId ? { ...s, status: vars.status } : s)) : old,
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["sprints", contractId], ctx.prev);
      toast.error(e.message);
    },
    onSuccess: () => toast.success("Estado del sprint actualizado"),
  });
  const moveMut = useMutation({
    mutationFn: (vars: { sprintId: string }) =>
      moveSprintFn({ data: { sprintId: vars.sprintId, projectId } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["sprint-metrics", contractId, projectId] });
      toast.success(
        `${res.moved} ${res.moved === 1 ? "tarea movida" : "tareas movidas"} al siguiente sprint`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const reorderMut = useMutation({
    mutationFn: (updates: Array<{ taskId: string; position: number }>) =>
      reorderFn({ data: { updates } }),
    onError: (e: Error) => {
      toast.error("Error al reordenar", { description: e.message });
      // Only on failure do we refetch to restore server truth.
      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
    // No onSettled invalidate: DnD already applied optimistic order via
    // setLocalTasks. Refetching ~900 rows on every drop was the bottleneck.
  });

  const [openSprints, setOpenSprints] = useState<Record<string, boolean>>({});
  const [newTitleBySprint, setNewTitleBySprint] = useState<Record<string, string>>({});
  const [typeBySprint, setTypeBySprint] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const defaultTypeId = taskTypes[0]?.id ?? null;
  const typeById = useMemo(() => new Map(taskTypes.map((t) => [t.id, t])), [taskTypes]);

  // Local optimistic mirror of tasks for smooth drag-and-drop
  const [localTasks, setLocalTasks] = useState<SprintTask[] | null>(null);
  const lastTasksRef = useRef(tasks);
  useEffect(() => {
    if (lastTasksRef.current !== tasks) {
      lastTasksRef.current = tasks;
      setLocalTasks(null);
    }
  }, [tasks]);
  const view = localTasks ?? tasks;

  const tasksBySprint = useMemo(() => {
    const map = new Map<string, SprintTask[]>();
    for (const t of view) {
      if (t.parent_task_id) continue;
      const key = t.sprint_id ?? "unassigned";
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [view]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, SprintTask[]>();
    for (const t of view) {
      if (!t.parent_task_id) continue;
      const arr = map.get(t.parent_task_id) ?? [];
      arr.push(t);
      map.set(t.parent_task_id, arr);
    }
    return map;
  }, [view]);

  const toggle = (id: string, defaultOpen: boolean) =>
    setOpenSprints((s) => ({ ...s, [id]: !(s[id] ?? defaultOpen) }));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overSection, setOverSection] = useState<string | null>(null);
  const activeTask = view.find((t) => t.id === activeId) ?? null;

  // Map any droppable id (section id or task id) to its section id
  const sectionOf = (id: string): string | null => {
    if (id.startsWith("section:")) return id.slice("section:".length);
    const t = view.find((x) => x.id === id);
    if (!t) return null;
    return t.sprint_id ?? "unassigned";
  };

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };
  const handleDragOver = (e: DragOverEvent) => {
    const overId = e.over?.id ? String(e.over.id) : null;
    setOverSection(overId ? sectionOf(overId) : null);
  };
  const handleDragCancel = () => {
    setActiveId(null);
    setOverSection(null);
  };
  const handleDragEnd = (e: DragEndEvent) => {
    const activeStr = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    setActiveId(null);
    setOverSection(null);
    if (!overId) return;
    const fromSec = sectionOf(activeStr);
    const toSec = sectionOf(overId);
    if (!fromSec || !toSec) return;

    const base = view.slice();
    const movingIdx = base.findIndex((t) => t.id === activeStr);
    if (movingIdx === -1) return;
    const moving = base[movingIdx];

    if (fromSec !== toSec) {
      const newSprintId = toSec === "unassigned" ? null : toSec;
      const updated: SprintTask = { ...moving, sprint_id: newSprintId };
      const next = base.slice();
      next.splice(movingIdx, 1);
      // Insert at the position of overId (if it's a task) or at the end
      const overTaskIdx = overId.startsWith("section:")
        ? next.length
        : next.findIndex((t) => t.id === overId);
      const insertAt = overTaskIdx === -1 ? next.length : overTaskIdx;
      next.splice(insertAt, 0, updated);
      setLocalTasks(next);
      onUpdateTask({ taskId: activeStr, sprintId: newSprintId });
      return;
    }

    // Same section reorder
    const secItems = base.filter(
      (t) => (t.sprint_id ?? "unassigned") === toSec && !t.parent_task_id,
    );
    const oldIdx = secItems.findIndex((t) => t.id === activeStr);
    const newIdx = overId.startsWith("section:")
      ? secItems.length - 1
      : secItems.findIndex((t) => t.id === overId);
    if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;
    const reordered = arrayMove(secItems, oldIdx, newIdx);
    const others = base.filter((t) => !secItems.some((s) => s.id === t.id));
    setLocalTasks([...others, ...reordered]);
    reorderMut.mutate(reordered.map((t, i) => ({ taskId: t.id, position: i })));
  };

  const today = new Date().toISOString().slice(0, 10);
  const visibleSprints = scopedSprintId ? sprints.filter((s) => s.id === scopedSprintId) : sprints;
  type Section = {
    id: string;
    title: string;
    range: string;
    isCurrent: boolean;
    hours: number | null;
    status: string | null;
    endDate: string | null;
  };
  const backlogSection: Section | null = scopedSprintId
    ? null
    : {
        id: "unassigned",
        title: "Backlog",
        range: "",
        isCurrent: false,
        hours: null,
        status: null,
        endDate: null,
      };
  const sprintSections: Section[] = visibleSprints.map((s) => ({
    id: s.id,
    title: `Sprint ${s.sprint_number}`,
    range: `${s.start_date} → ${s.end_date}`,
    isCurrent: s.start_date <= today && s.end_date >= today,
    hours: s.contracted_hours,
    status: s.status,
    endDate: s.end_date,
  }));
  const isClosed = (s: Section) =>
    s.status === "cerrado" || (s.endDate != null && s.endDate < today);
  const openSprintSections = sprintSections.filter((s) => !isClosed(s));
  const closedSprintSections = sprintSections
    .filter(isClosed)
    .sort((a, b) => (b.endDate ?? "").localeCompare(a.endDate ?? ""));
  const openSections: Section[] = [
    ...(backlogSection ? [backlogSection] : []),
    ...openSprintSections,
  ];
  const archiveKey = `sprints-archive-open:${projectId}`;
  const [archiveOpen, setArchiveOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const raw = window.localStorage.getItem(archiveKey);
      if (raw != null) return raw === "1";
    } catch {
      /* ignore */
    }
    return false;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(archiveKey, archiveOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [archiveOpen, archiveKey]);
  // When user navigates to a closed sprint via URL, ensure archive is open
  useEffect(() => {
    if (scopedSprintId && closedSprintSections.some((s) => s.id === scopedSprintId)) {
      setArchiveOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedSprintId]);

  if (isLoading) {
    return <div className="p-6 text-xs text-muted-foreground">Cargando sprints...</div>;
  }

  if (sprints.length === 0) {
    return (
      <EmptyState
        icon={Rocket}
        title="Sin sprints aún"
        description="Este contrato no tiene sprints generados. Configúralos desde el detalle del contrato."
      />
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="p-4 space-y-2">
        <div className="flex justify-end">
          <ShareReportButton projectId={projectId} contractId={contractId} />
        </div>

        {(() => {
          const renderSection = (sec: Section) => {
            const items = (tasksBySprint.get(sec.id) ?? []).filter((t) => !t.parent_task_id);
            const defaultOpen = sec.id === "unassigned" || sec.isCurrent;
            const isOpen = openSprints[sec.id] ?? defaultOpen;
            const isOver = overSection === sec.id;
            const isBacklog = sec.id === "unassigned";
            const isActive = sec.isCurrent;
            const monthShort = [
              "ene",
              "feb",
              "mar",
              "abr",
              "may",
              "jun",
              "jul",
              "ago",
              "sep",
              "oct",
              "nov",
              "dic",
            ];
            const fmtDateShort = (iso: string) => {
              const parts = iso.split("-").map(Number);
              if (parts.length < 3) return iso;
              return `${parts[2]} ${monthShort[(parts[1] || 1) - 1]}`;
            };
            const renderRange = (raw: string) => {
              const [a, b] = raw.split(" → ");
              if (!a || !b) return raw;
              return `${fmtDateShort(a)} — ${fmtDateShort(b)}`;
            };
            const fmtH = (n: number) => {
              const r = Math.round(n * 10) / 10;
              return Number.isInteger(r) ? `${r}` : r.toFixed(1);
            };
            return (
              <div
                key={sec.id}
                style={{
                  contentVisibility: isActive ? undefined : "auto",
                  containIntrinsicSize: "auto 400px",
                }}
                className={cn(
                  "relative bg-card rounded-xl overflow-hidden transition-all",
                  isActive
                    ? "border-2 border-primary/25 ring-4 ring-primary/5 shadow-sm"
                    : "border border-border shadow-sm hover:border-border/70",
                  isOver && "ring-2 ring-primary/30 border-primary/50",
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" aria-hidden />
                )}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggle(sec.id, defaultOpen)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(sec.id, defaultOpen);
                    }
                  }}
                  className={cn(
                    "w-full flex items-center gap-4 text-left cursor-pointer select-none",
                    isBacklog ? "px-5 py-3 bg-muted/30 border-b border-border" : "px-5 py-3",
                  )}
                >
                  {isOpen ? (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  )}

                  {isBacklog ? (
                    <>
                      <span className="text-sm font-semibold text-foreground">{sec.title}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 gap-1 text-[11px] font-medium text-primary hover:bg-primary/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!(openSprints[sec.id] ?? defaultOpen)) toggle(sec.id, defaultOpen);
                          setTimeout(() => inputRefs.current[sec.id]?.focus(), 60);
                        }}
                      >
                        <Plus className="w-3 h-3" /> Nueva
                      </Button>
                      <span className="ml-auto text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        {items.length} {items.length === 1 ? "tarea" : "tareas"}
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="min-w-[110px] flex flex-col gap-1 shrink-0">
                        <span
                          className={cn(
                            "text-sm leading-tight",
                            isActive
                              ? "font-bold text-foreground"
                              : "font-semibold text-foreground/85",
                          )}
                        >
                          {sec.title}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {sec.status && (
                            <div onClick={(e) => e.stopPropagation()}>
                              <StatusBadgeSelect
                                value={sec.status}
                                options={SPRINT_STATUS_OPTIONS}
                                onChange={(v) =>
                                  sprintStatusMut.mutate({ sprintId: sec.id, status: v })
                                }
                                disabled={sprintStatusMut.isPending}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {sec.range && (
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs shrink-0">
                          <CalendarIcon className="w-3.5 h-3.5" />
                          <span className="font-medium">{renderRange(sec.range)}</span>
                        </div>
                      )}

                      {(() => {
                        const m = metricsBySprint.get(sec.id);
                        if (!m) return <div className="flex-1" />;
                        const cap = m.contracted_hours || m.team_capacity_hours || 0;
                        const overEst = cap > 0 && m.estimated_hours > cap;
                        const overReal = cap > 0 && m.real_hours > cap;
                        const loadPct =
                          cap > 0 ? Math.min(100, (m.estimated_hours / cap) * 100) : 0;
                        const progressDen = m.estimated_hours > 0 ? m.estimated_hours : cap;
                        const progressPct =
                          progressDen > 0 ? Math.min(100, (m.real_hours / progressDen) * 100) : 0;
                        const isEmpty = m.estimated_hours === 0 && m.real_hours === 0;
                        const capTitle = `Capacidad contratada: ${fmtH(m.contracted_hours)}h${m.team_capacity_hours > 0 ? ` · Equipo: ${fmtH(m.team_capacity_hours)}h` : ""}`;
                        return (
                          <div
                            className={cn(
                              "flex-1 flex items-center justify-end gap-6 pl-4 border-l border-border/60",
                              isEmpty && !isActive && "opacity-50",
                            )}
                          >
                            {/* CARGA */}
                            <div className="flex flex-col gap-1 w-32 shrink-0" title={capTitle}>
                              <div className="flex justify-between text-[10px] font-semibold text-muted-foreground">
                                <span className="tracking-wide">CARGA</span>
                                <span>
                                  {cap > 0 && m.estimated_hours > 0
                                    ? `${Math.round((m.estimated_hours / cap) * 100)}%`
                                    : "—"}
                                </span>
                              </div>
                              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                {m.estimated_hours > 0 && cap > 0 && (
                                  <div
                                    className={cn(
                                      "h-full rounded-full transition-all",
                                      overEst ? "bg-amber-500" : "bg-blue-500",
                                    )}
                                    style={{ width: `${loadPct}%` }}
                                  />
                                )}
                              </div>
                              <span className="text-[9px] text-muted-foreground">
                                {m.estimated_hours > 0
                                  ? `${fmtH(m.estimated_hours)}h de ${fmtH(cap)}h`
                                  : cap > 0
                                    ? `Sin estimar · ${fmtH(cap)}h`
                                    : "Sin estimar"}
                              </span>
                            </div>

                            {/* AVANCE */}
                            <div
                              className="flex flex-col gap-1 w-32 shrink-0"
                              title="Horas reales cargadas vs estimadas"
                            >
                              <div className="flex justify-between text-[10px] font-semibold text-muted-foreground">
                                <span className="tracking-wide">AVANCE</span>
                                <span>
                                  {progressDen > 0 && m.real_hours > 0
                                    ? `${Math.round((m.real_hours / progressDen) * 100)}%`
                                    : "—"}
                                </span>
                              </div>
                              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                {m.real_hours > 0 && progressDen > 0 && (
                                  <div
                                    className={cn(
                                      "h-full rounded-full transition-all",
                                      overReal ? "bg-destructive" : "bg-primary",
                                    )}
                                    style={{ width: `${progressPct}%` }}
                                  />
                                )}
                              </div>
                              <span
                                className={cn(
                                  "text-[9px] text-right",
                                  overReal
                                    ? "text-destructive font-semibold"
                                    : "text-muted-foreground",
                                )}
                              >
                                Real: {fmtH(m.real_hours)}h
                              </span>
                            </div>

                            {overReal && m.pending_tasks > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[10px] border-destructive/40 text-destructive hover:bg-destructive/10 shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveMut.mutate({ sprintId: sec.id });
                                }}
                                disabled={moveMut.isPending}
                              >
                                Mover {m.pending_tasks} →
                              </Button>
                            )}
                          </div>
                        );
                      })()}

                      <span
                        className={cn(
                          "text-xs text-right min-w-[70px] shrink-0",
                          items.length > 0
                            ? "font-bold text-foreground"
                            : "font-medium text-muted-foreground",
                        )}
                      >
                        {items.length} {items.length === 1 ? "tarea" : "tareas"}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 gap-1 text-[11px] font-medium text-primary hover:bg-primary/10 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!(openSprints[sec.id] ?? defaultOpen)) toggle(sec.id, defaultOpen);
                          setTimeout(() => inputRefs.current[sec.id]?.focus(), 60);
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" /> Nueva tarea
                      </Button>
                    </>
                  )}
                </div>

                {isOpen && (
                  <SprintDroppable sectionId={sec.id} isOver={isOver}>
                    <SortableContext
                      items={items.map((t) => t.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="divide-y divide-border">
                        <form
                          className="px-3 py-2 flex items-center gap-2 bg-muted/20"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const v = (newTitleBySprint[sec.id] ?? "").trim();
                            if (!v) return;
                            const typeId: string | null = typeBySprint[sec.id] ?? defaultTypeId;
                            onCreateTask(v, sec.id === "unassigned" ? null : sec.id, typeId);
                            setNewTitleBySprint((s) => ({ ...s, [sec.id]: "" }));
                          }}
                        >
                          <Plus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <Input
                            ref={(el) => {
                              inputRefs.current[sec.id] = el;
                            }}
                            value={newTitleBySprint[sec.id] ?? ""}
                            onChange={(e) =>
                              setNewTitleBySprint((s) => ({ ...s, [sec.id]: e.target.value }))
                            }
                            placeholder="Añadir tarea... (Enter)"
                            className="border-0 shadow-none focus-visible:ring-0 px-0 h-7 bg-transparent text-sm flex-1"
                          />
                          {taskTypes.length > 0 && (
                            <Select
                              value={typeBySprint[sec.id] ?? defaultTypeId ?? undefined}
                              onValueChange={(v) => setTypeBySprint((s) => ({ ...s, [sec.id]: v }))}
                            >
                              <SelectTrigger className="h-7 w-[130px] text-xs shrink-0">
                                <SelectValue placeholder="Tipo" />
                              </SelectTrigger>
                              <SelectContent>
                                {taskTypes.map((tt) => {
                                  const Icon = getLucideIcon(tt.icon ?? "circle");
                                  return (
                                    <SelectItem key={tt.id} value={tt.id}>
                                      <span className="flex items-center gap-1.5">
                                        <Icon className="w-3.5 h-3.5" />
                                        {tt.name}
                                      </span>
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          )}
                        </form>
                        {items.map((task) => {
                          const subs = childrenByParent.get(task.id) ?? [];
                          return (
                            <div key={task.id}>
                              <SprintTaskRow
                                task={task}
                                members={members}
                                rollup={rollups?.[task.id]}
                                typeById={typeById}
                                onSelect={onSelectTask}
                                onUpdate={onUpdateTask}
                                selected={selectedIds.has(task.id)}
                                onToggleSelected={toggleSelected}
                              />
                              {subs.length > 0 && (
                                <div className="bg-muted/20 border-l-2 border-border ml-6">
                                  {subs.map((sub) => (
                                    <SprintTaskRow
                                      key={sub.id}
                                      task={sub}
                                      members={members}
                                      rollup={rollups?.[sub.id]}
                                      typeById={typeById}
                                      onSelect={onSelectTask}
                                      onUpdate={onUpdateTask}
                                      selected={selectedIds.has(sub.id)}
                                      onToggleSelected={toggleSelected}
                                      isSubtask
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {items.length === 0 && (
                          <div
                            className={`px-3 py-4 text-center text-[11px] text-muted-foreground ${activeId ? "bg-primary/[0.03]" : ""}`}
                          >
                            {activeId ? "Soltar aquí" : "Sin tareas"}
                          </div>
                        )}
                      </div>
                    </SortableContext>
                  </SprintDroppable>
                )}
              </div>
            );
          };
          return (
            <>
              {openSections.map((sec) => renderSection(sec))}
              {closedSprintSections.length > 0 && (
                <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setArchiveOpen((v) => !v)}
                    className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-muted/30"
                    aria-expanded={archiveOpen}
                  >
                    {archiveOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    )}
                    <Rocket className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-semibold text-muted-foreground">
                      Sprints cerrados
                    </span>
                    <span className="ml-auto text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      {closedSprintSections.length}
                    </span>
                  </button>
                  {archiveOpen && (
                    <div className="p-3 pt-0 space-y-2 opacity-90">
                      {closedSprintSections.map((sec) => renderSection(sec))}
                    </div>
                  )}
                </div>
              )}
            </>
          );
        })()}
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
        {activeTask && (
          <div className="bg-card border border-primary/50 rounded-md shadow-xl px-3 py-2 flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: getTaskStatus(activeTask).color ?? "#94a3b8" }}
            />
            <span className="truncate max-w-[320px]">{activeTask.title}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function SprintDroppable({
  sectionId,
  isOver,
  children,
}: {
  sectionId: string;
  isOver: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: `section:${sectionId}` });
  return (
    <div ref={setNodeRef} className={isOver ? "bg-primary/[0.04]" : ""}>
      {children}
    </div>
  );
}

const SprintTaskRow = memo(function SprintTaskRow({
  task,
  members,
  rollup,
  typeById,
  onSelect,
  onUpdate,
  selected = false,
  onToggleSelected,
  isSubtask = false,
}: {
  task: SprintTask;
  members: MemberRow[];
  rollup?: { estimate: number; logged: number };
  typeById?: Map<string, { id: string; name: string; icon: string | null; sort_order: number }>;
  onSelect: (id: string) => void;
  onUpdate: (vars: {
    taskId: string;
    status?: string;
    assigneeId?: string | null;
    assigneeIds?: string[];
    sprintId?: string | null;
    dueDate?: string | null;
    startDate?: string | null;
    totalEffortHours?: number | null;
  }) => void;
  selected?: boolean;
  onToggleSelected?: (id: string) => void;
  isSubtask?: boolean;
}) {
  const sortable = useSortable({ id: task.id, disabled: isSubtask });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;
  const style: React.CSSProperties = isSubtask
    ? {}
    : {
        transform: CSS.Transform.toString(transform),
        transition: transition ?? "transform 200ms cubic-bezier(0.2, 0, 0, 1)",
        opacity: isDragging ? 0.3 : 1,
      };
  const done = isCompleted(task);
  const cancelled = isCancelled(task);
  const dynType = task.task_type_id && typeById ? typeById.get(task.task_type_id) : null;
  const TypeIcon = dynType ? getLucideIcon(dynType.icon ?? "circle") : null;
  return (
    <div
      ref={isSubtask ? undefined : setNodeRef}
      style={style}
      {...(isSubtask ? {} : attributes)}
      {...(isSubtask ? {} : listeners)}
      className={cn(
        "flex items-center gap-2 hover:bg-accent/40 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        isSubtask
          ? "pl-3 pr-4 py-1.5 text-xs cursor-pointer border-b border-border/40 last:border-b-0"
          : "px-4 py-2.5 cursor-grab active:cursor-grabbing",
      )}
      onClick={() => onSelect(task.id)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className="shrink-0 flex items-center"
      >
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelected?.(task.id)}
          aria-label={selected ? "Deseleccionar tarea" : "Seleccionar tarea"}
        />
      </div>
      {TypeIcon && dynType ? (
        <TypeIcon
          className="shrink-0 w-3.5 h-3.5 text-muted-foreground"
          aria-label={dynType.name}
          size={14}
        />
      ) : (
        <span
          aria-hidden
          className="shrink-0 inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: getTaskStatus(task).color ?? "#94a3b8" }}
        />
      )}
      <span
        className={`flex-1 text-sm font-medium truncate ${
          done || cancelled ? "line-through text-muted-foreground font-normal" : "text-foreground"
        }`}
      >
        {task.title}
      </span>

      <div className="flex items-center gap-1.5 shrink-0">
        <DateChip
          value={task.start_date}
          icon={<Play className="w-3.5 h-3.5" />}
          label="Inicio"
          onChange={(d) => onUpdate({ taskId: task.id, startDate: d })}
        />
        <DateChip
          value={task.due_date}
          icon={<Flag className="w-3.5 h-3.5" />}
          label="Vence"
          onChange={(d) => onUpdate({ taskId: task.id, dueDate: d })}
        />
        <EffortInputChip
          value={task.total_effort_hours}
          logged={rollup?.logged ?? 0}
          onChange={(h) => onUpdate({ taskId: task.id, totalEffortHours: h })}
        />

        <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <MultiAssigneeSelect
            members={members}
            value={getTaskAssigneeIds(task)}
            onChange={(ids) => onUpdate({ taskId: task.id, assigneeIds: ids })}
          />
        </div>
      </div>
    </div>
  );
});

/**
 * Parse flexible duration input into hours.
 * Accepts: "1", "1.5", "1,5", "1h", "1 h", "1 hr", "1 hora", "2 horas",
 *          "30m", "30 min", "30 minutos", "1h30", "1h30m", "1:30", "90min".
 * Returns null if it can't be parsed.
 */
function parseDuration(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/,/g, ".");
  if (!s) return null;

  // HH:MM
  const colon = s.match(/^(\d+):([0-5]?\d)$/);
  if (colon) return parseInt(colon[1], 10) + parseInt(colon[2], 10) / 60;

  // Pure number → hours
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);

  let hours = 0;
  let matched = false;
  // hours: 1h, 1 h, 1hr, 1 hrs, 1hora, 1 horas
  const hMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:h(?:r?s?)?|horas?)\b/);
  if (hMatch) {
    hours += parseFloat(hMatch[1]);
    matched = true;
  }
  // minutes: 30m, 30 min, 30 mins, 30 minutos
  const mMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:m(?:in(?:s|utos?)?)?)\b/);
  if (mMatch) {
    hours += parseFloat(mMatch[1]) / 60;
    matched = true;
  }
  // "1h30" trailing number after h with no unit → minutes
  const trailing = s.match(/(\d+(?:\.\d+)?)\s*h(?:r?s?|oras?)?\s*(\d+)$/);
  if (trailing) {
    return parseFloat(trailing[1]) + parseInt(trailing[2], 10) / 60;
  }
  return matched ? hours : null;
}

function EffortInputChip({
  value,
  logged,
  onChange,
}: {
  value: number | null;
  logged: number;
  onChange: (next: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string>(value != null ? String(value) : "");
  useEffect(() => {
    setDraft(value != null ? String(value) : "");
  }, [value]);

  const estimate = value ?? 0;
  const pct = estimate > 0 ? (logged / estimate) * 100 : logged > 0 ? 999 : 0;
  let tone =
    "text-muted-foreground border-transparent hover:border-border hover:bg-background hover:text-foreground";
  if (estimate > 0 && pct > 100)
    tone = "text-destructive bg-destructive/10 border-transparent hover:bg-destructive/15";
  else if (estimate > 0 && pct >= 80)
    tone =
      "text-status-in-progress bg-status-in-progress/10 border-transparent hover:bg-status-in-progress/15";
  else if (estimate > 0) tone = "text-foreground bg-muted/60 border-transparent hover:bg-muted";
  else if (logged > 0) tone = "text-foreground bg-muted/60 border-transparent hover:bg-muted";

  const fmt = (h: number) => {
    if (!h || h <= 0) return "0h";
    const totalMin = Math.round(h * 60);
    const hh = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    if (hh === 0) return `${mm}m`;
    if (mm === 0) return `${hh}h`;
    return `${hh}h ${mm}m`;
  };

  const parsed = parseDuration(draft);

  const commit = () => {
    if (draft.trim() === "") {
      onChange(null);
      setOpen(false);
      return;
    }
    if (parsed != null && parsed >= 0) {
      onChange(parsed);
      setOpen(false);
    }
  };

  const hasData = logged > 0 || value != null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Estimado"
          title={value != null ? `${fmt(logged)} de ${fmt(value)} estimadas` : "Sin estimado"}
          className={cn(
            "text-[12px] inline-flex items-center gap-1.5 rounded-md px-2 py-1 border transition-all tabular-nums font-medium",
            tone,
            !hasData && "opacity-70 group-hover:opacity-100",
          )}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Timer className="w-3.5 h-3.5" />
          <span>
            {hasData ? `${fmt(logged)}${value != null ? ` / ${fmt(value)}` : ""}` : "Estimar"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-2"
        align="end"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Estimado
        </label>
        <div className="flex items-center gap-1 mt-1">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              }
            }}
            className="h-7 text-xs"
            placeholder="ej: 1h 30m, 1:30, 1,5"
          />
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground min-h-[14px]">
          {draft.trim() === "" ? (
            <>Acepta: 1h, 30m, 1h30m, 1:30, 1,5, 90 min</>
          ) : parsed != null ? (
            <span className="text-foreground">= {fmt(parsed)}</span>
          ) : (
            <span className="text-destructive">Formato no válido</span>
          )}
        </div>
        <div className="flex justify-between mt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            Quitar
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={commit}
            disabled={draft.trim() !== "" && parsed == null}
          >
            Guardar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DateChip({
  value,
  icon,
  label,
  onChange,
}: {
  value: string | null;
  icon: React.ReactNode;
  label: string;
  onChange: (next: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={value ? `${label}: ${formatDueShort(value)}` : `Definir ${label.toLowerCase()}`}
          className={cn(
            "text-[12px] inline-flex items-center gap-1.5 rounded-md px-2 py-1 border transition-all",
            value
              ? "text-primary bg-primary/10 border-transparent hover:bg-primary/15"
              : "text-muted-foreground border-transparent hover:border-border hover:bg-background hover:text-foreground opacity-70 group-hover:opacity-100",
          )}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {icon}
          <span className="tabular-nums font-medium">{value ? formatDueShort(value) : label}</span>
          {value && (
            <span
              role="button"
              tabIndex={-1}
              aria-label={`Quitar ${label.toLowerCase()}`}
              className="ml-0.5 opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            >
              <X className="w-3 h-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Calendar
          mode="single"
          selected={value ? new Date(value) : undefined}
          onSelect={(d) => {
            onChange(d ? d.toISOString().slice(0, 10) : null);
            setOpen(false);
          }}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

type PhaseRow = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  order_index: number;
  is_ticket_inbox?: boolean | null;
};

type PhaseTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee_id: string | null;
  assignees?: Array<{ user_id: string }> | null;
  due_date: string | null;
  phase_id: string | null;
  parent_task_id: string | null;
  sla_target_resolution_at?: string | null;
  sla_target_response_at?: string | null;
};

function PhasesView({
  phases,
  tasks,
  members,
  scopedPhaseId,
  onSelectTask,
  onCreateTask,
  onUpdateTask,
}: {
  phases: PhaseRow[];
  tasks: PhaseTask[];
  members: MemberRow[];
  scopedPhaseId?: string | null;
  onSelectTask: (id: string) => void;
  onCreateTask: (title: string, phaseId: string | null) => void;
  onUpdateTask: (vars: {
    taskId: string;
    status?: string;
    assigneeId?: string | null;
    assigneeIds?: string[];
  }) => void;
}) {
  const qc = useQueryClient();
  const updatePhaseStatusFn = useServerFn(updatePhaseStatus);
  const phaseStatusMut = useMutation({
    mutationFn: (vars: { phaseId: string; status: string }) =>
      updatePhaseStatusFn({
        data: { phaseId: vars.phaseId, status: vars.status as "sin_iniciar" },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["phases"] });
      toast.success("Estado de la fase actualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [openPhases, setOpenPhases] = useState<Record<string, boolean>>({});
  const [newTitleByPhase, setNewTitleByPhase] = useState<Record<string, string>>({});

  const tasksByPhase = useMemo(() => {
    const map = new Map<string, PhaseTask[]>();
    for (const t of tasks) {
      const key = t.phase_id ?? "unassigned";
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [tasks]);

  const toggle = (id: string) => setOpenPhases((s) => ({ ...s, [id]: !(s[id] ?? true) }));

  const visiblePhases = scopedPhaseId ? phases.filter((p) => p.id === scopedPhaseId) : phases;

  const sections = [
    ...visiblePhases.map((p) => ({
      id: p.id,
      title: p.name,
      range:
        p.start_date && p.end_date
          ? `${p.start_date} → ${p.end_date}`
          : (p.start_date ?? p.end_date ?? ""),
      status: p.status,
      isTicketInbox: !!p.is_ticket_inbox,
    })),
    ...(scopedPhaseId
      ? []
      : [{ id: "unassigned", title: "Sin fase", range: "", status: "", isTicketInbox: false }]),
  ];
  // Push ticket-inbox phases to the bottom so they don't dominate the project board.
  sections.sort((a, b) => (a.isTicketInbox === b.isTicketInbox ? 0 : a.isTicketInbox ? 1 : -1));

  return (
    <div className="p-4 space-y-3">
      {sections.map((sec) => {
        const items = tasksByPhase.get(sec.id) ?? [];
        const isOpen = openPhases[sec.id] ?? true;
        return (
          <div
            key={sec.id}
            className={`border rounded-md overflow-hidden ${
              sec.isTicketInbox ? "border-amber-500/40" : "border-border"
            }`}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggle(sec.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle(sec.id);
                }
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer select-none ${
                sec.isTicketInbox
                  ? "bg-amber-500/10 hover:bg-amber-500/15"
                  : "bg-muted/30 hover:bg-muted/50"
              }`}
            >
              {isOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              )}
              {sec.isTicketInbox && (
                <Ticket className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              )}
              <span className="text-sm font-medium">{sec.title}</span>
              {sec.isTicketInbox && (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-semibold">
                  Tickets del cliente
                </span>
              )}
              {sec.status && sec.id !== "unassigned" && !sec.isTicketInbox && (
                <StatusBadgeSelect
                  value={sec.status}
                  options={PHASE_STATUS_OPTIONS}
                  onChange={(v) => phaseStatusMut.mutate({ phaseId: sec.id, status: v })}
                  disabled={phaseStatusMut.isPending}
                />
              )}
              {sec.range && !sec.isTicketInbox && (
                <span className="text-xs text-muted-foreground">{sec.range}</span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {items.length}{" "}
                {items.length === 1 ? "ticket" : sec.isTicketInbox ? "tickets" : "tareas"}
              </span>
            </div>

            {isOpen && (
              <div className="divide-y divide-border">
                <form
                  className="px-3 py-2 flex items-center gap-2 bg-muted/20"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = (newTitleByPhase[sec.id] ?? "").trim();
                    if (!v) return;
                    onCreateTask(v, sec.id === "unassigned" ? null : sec.id);
                    setNewTitleByPhase((s) => ({ ...s, [sec.id]: "" }));
                  }}
                >
                  <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={newTitleByPhase[sec.id] ?? ""}
                    onChange={(e) =>
                      setNewTitleByPhase((s) => ({ ...s, [sec.id]: e.target.value }))
                    }
                    placeholder="Añadir tarea a esta fase... (Enter)"
                    className="border-0 shadow-none focus-visible:ring-0 px-0 h-7 bg-transparent text-sm"
                  />
                </form>
                {items
                  .filter((t) => !t.parent_task_id)
                  .map((task) => (
                    <div
                      key={task.id}
                      className="px-3 py-2 flex items-center gap-2 hover:bg-accent/30 cursor-pointer group"
                      onClick={() => onSelectTask(task.id)}
                    >
                      <span
                        aria-hidden
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ backgroundColor: getTaskStatus(task).color ?? "#94a3b8" }}
                      />
                      <span
                        className={`flex-1 text-sm truncate ${
                          isCompleted(task) || isCancelled(task)
                            ? "line-through text-muted-foreground"
                            : ""
                        }`}
                      >
                        {task.title}
                      </span>
                      <SlaDot
                        target={
                          task.sla_target_resolution_at ?? task.sla_target_response_at ?? null
                        }
                        done={isCompleted(task) || isCancelled(task)}
                      />
                      {task.due_date && (
                        <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                          <CalendarIcon className="w-3 h-3" /> {formatDueShort(task.due_date)}
                        </span>
                      )}
                      <div onClick={(e) => e.stopPropagation()}>
                        <MultiAssigneeSelect
                          members={members}
                          value={getTaskAssigneeIds(task)}
                          onChange={(ids) => onUpdateTask({ taskId: task.id, assigneeIds: ids })}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SlaDot({ target, done }: { target: string | null; done: boolean }) {
  if (!target || done) return null;
  const diffMin = (new Date(target).getTime() - Date.now()) / 60000;
  let tone: string;
  let label: string;
  if (diffMin < 0) {
    tone = "bg-destructive/15 text-destructive border-destructive/30";
    label = "SLA vencido";
  } else if (diffMin < 60 * 4) {
    tone = "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
    label = "SLA por vencer";
  } else {
    tone = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
    label = "SLA en plazo";
  }
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${tone}`}
      title={`Objetivo: ${new Date(target).toLocaleString("es-CL")}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
