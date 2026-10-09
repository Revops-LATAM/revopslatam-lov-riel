import { useEffect, useMemo, useState } from "react";
import {
  Trash2,
  Plus,
  ChevronDown,
  ChevronRight,
  X,
  ArrowUpRight,
  Columns3,
  Pencil,
  Calendar as CalendarLucide,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { MemberAvatar } from "@/components/tasko/MemberAvatar";
import { DataGrid, type ColumnDef } from "@/components/datagrid/DataGrid";
import { cn } from "@/lib/utils";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { StatusBadgeSelect, mapCategoryToStColor } from "@/components/tasko/StatusBadgeSelect";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { MultiAssigneeSelect } from "@/components/tasko/MultiAssigneeSelect";
import { InlineEditableText } from "@/components/tasko/InlineEditableText";
import { useQuery } from "@tanstack/react-query";
import { sprintsQO } from "@/lib/api/tasko.queries";
import { PRIORITY_OPTIONS, PRIORITY_ICON } from "@/lib/tasko-constants";
import { isCompleted, isCancelled, getTaskStatus } from "@/lib/tasko/status";
import { dueTone, dueToneClass, formatDueShort } from "@/lib/tasko-utils";
import { formatDateTimeCL } from "@/lib/date-format";
import { useTaskTypeMeta, getLucideIcon } from "@/lib/task-type-meta";

type JoinedStatus = {
  id?: string | null;
  key?: string | null;
  name?: string | null;
  category?: import("@/lib/tasko/status").TaskStatusCategory | null;
  color?: string | null;
};

export type TaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee_id: string | null;
  assignees?: Array<{ user_id: string }> | null;
  due_date: string | null;
  start_date?: string | null;
  total_effort_hours?: number | null;
  sprint_id: string | null;
  phase_id: string | null;
  parent_task_id: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  task_type_id?: string | null;
  status_id?: string | null;
  task_statuses?: JoinedStatus | JoinedStatus[] | null;
};

export type MemberRow = {
  user_id: string;
  profile: {
    id: string;
    full_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  } | null;
};

export type TaskUpdateVars = {
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
};

const getAssigneeIds = (task: {
  assignee_id?: string | null;
  assignees?: Array<{ user_id: string }> | null;
}) => {
  const ids = (task.assignees ?? []).map((a) => a.user_id);
  if (ids.length === 0 && task.assignee_id) return [task.assignee_id];
  return ids;
};

type PhaseRow = {
  id: string;
  name: string;
  color?: string | null;
  order_index?: number | null;
  owner_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

const PRIORITY_LABEL = Object.fromEntries(
  PRIORITY_OPTIONS.map((o) => [o.value, o.label]),
) as Record<string, string>;
const PRIORITY_RANK = Object.fromEntries(PRIORITY_OPTIONS.map((o, i) => [o.value, i])) as Record<
  string,
  number
>;

type GroupKey = "none" | "status" | "priority" | "assignee" | "due" | "sprint" | "phase";

const GROUP_OPTIONS: { value: GroupKey; label: string }[] = [
  { value: "none", label: "Sin agrupar" },
  { value: "status", label: "Estado" },
  { value: "priority", label: "Prioridad" },
  { value: "assignee", label: "Asignado" },
  { value: "due", label: "Vencimiento" },
  { value: "sprint", label: "Sprint" },
  { value: "phase", label: "Fase" },
];

type StatusFilter = "todas" | "activas" | "atrasadas" | "completadas" | "canceladas";

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "activas", label: "Activas" },
  { value: "atrasadas", label: "Atrasadas" },
  { value: "completadas", label: "Completadas" },
  { value: "canceladas", label: "Canceladas" },
];

function matchesStatusFilter(
  t: { due_date?: string | null } & Parameters<typeof getTaskStatus>[0],
  f: StatusFilter,
): boolean {
  if (f === "todas") return true;
  const cat = getTaskStatus(t).category;
  if (f === "completadas") return cat === "completada";
  if (f === "canceladas") return cat === "cancelada";
  const activeCat = cat === "abierta" || cat === "en_progreso" || cat === "bloqueada";
  if (f === "activas") return activeCat;
  if (f === "atrasadas") {
    if (!activeCat) return false;
    if (!t.due_date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(t.due_date);
    if (Number.isNaN(due.getTime())) return false;
    due.setHours(0, 0, 0, 0);
    return due.getTime() < today.getTime();
  }
  return true;
}

function dueBucket(d: string | null): { key: string; label: string; order: number } {
  if (!d) return { key: "_none", label: "Sin fecha", order: 999 };
  const due = new Date(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { key: "overdue", label: "Atrasadas", order: 0 };
  if (diff === 0) return { key: "today", label: "Hoy", order: 1 };
  if (diff <= 7) return { key: "week", label: "Esta semana", order: 2 };
  if (diff <= 30) return { key: "month", label: "Este mes", order: 3 };
  return { key: "later", label: "Más adelante", order: 4 };
}

function DateCell({
  value,
  tone,
  placeholder = "Añadir",
  onChange,
}: {
  value: string | null;
  tone?: ReturnType<typeof dueTone> | "none";
  placeholder?: string;
  onChange: (next: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  // Parse "YYYY-MM-DD" como fecha local (no UTC) para evitar desfases de zona horaria.
  const parsedValue = value
    ? (() => {
        const [y, m, d] = value.split("-").map(Number);
        if (!y || !m || !d) return undefined;
        return new Date(y, m - 1, d);
      })()
    : undefined;
  const formatLocal = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`group/date text-[13px] inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent ${
            value && tone ? dueToneClass(tone) : "text-muted-foreground"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {value ? formatDueShort(value) : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <Calendar
          mode="single"
          selected={parsedValue}
          onSelect={(d) => {
            onChange(d ? formatLocal(d) : null);
            setOpen(false);
          }}
          initialFocus
        />
        {value && (
          <div className="border-t border-border p-2">
            <button
              type="button"
              className="w-full text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1 py-1 rounded hover:bg-accent"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
                setOpen(false);
              }}
            >
              <X className="w-3 h-3" /> Quitar fecha
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function formatHours(h: number | null | undefined): string {
  if (h == null || Number.isNaN(h)) return "—";
  if (h === 0) return "0h";
  // Show 1 decimal if non-integer, else integer
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

function HoursEditCell({
  value,
  onChange,
  ariaLabel,
}: {
  value: number | null | undefined;
  onChange: (next: number | null) => void;
  ariaLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value == null ? "" : String(value));
  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        step="0.25"
        min="0"
        aria-label={ariaLabel}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const n = draft.trim() === "" ? null : Number(draft);
          if (n === null || Number.isFinite(n)) onChange(n);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(value == null ? "" : String(value));
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className="h-6 w-16 px-1 text-xs bg-transparent border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
      />
    );
  }
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        setDraft(value == null ? "" : String(value));
        setEditing(true);
      }}
      className="text-xs text-muted-foreground hover:text-foreground rounded px-1.5 py-0.5 hover:bg-accent"
    >
      {formatHours(value ?? null)}
    </button>
  );
}

export function TaskTableView({
  viewKey,
  tasks,
  members,
  phases = [],
  contractId,
  projectId,
  contractType,
  workspaceId,
  rollups,
  onOpenTask,
  onCreate,
  onUpdate,
  onDelete,
  onBulkDelete,
  emptyHasFilters,
  onClearFilters,
  allowedTaskTypeKeys,
  initialGroupBy,
  hideGroupBy,
  onEditPhase,
}: {
  viewKey: string;
  tasks: TaskRow[];
  members: MemberRow[];
  phases?: PhaseRow[];
  contractId?: string | null;
  projectId?: string | null;
  contractType?: string | null;
  workspaceId?: string | null;
  rollups?: Record<string, { estimate: number; logged: number }>;
  onOpenTask: (id: string) => void;
  onCreate?: (title: string, taskTypeId?: string | null) => void;
  onUpdate: (vars: TaskUpdateVars) => void;
  onDelete: (task: TaskRow) => void;
  onBulkDelete?: (tasks: TaskRow[]) => void;
  emptyHasFilters?: boolean;
  onClearFilters?: () => void;
  /** When set, restrict quick-add task-type picker to these type keys. */
  allowedTaskTypeKeys?: string[];
  /** Initial group-by selection (user can still change it in the UI). */
  initialGroupBy?: GroupKey;
  /** Hide the group-by selector (parent locks grouping). */
  hideGroupBy?: boolean;
  /** Called when the user clicks the edit-phase icon in a section header. */
  onEditPhase?: (phaseId: string) => void;
}) {
  // Per-user status filter, persisted in localStorage per viewKey.
  const filterStorageKey = `tasko:table:statusFilter:${viewKey}`;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("activas");
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(filterStorageKey);
      if (raw && STATUS_FILTER_OPTIONS.some((o) => o.value === raw)) {
        setStatusFilter(raw as StatusFilter);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStorageKey]);
  const updateStatusFilter = (next: StatusFilter) => {
    setStatusFilter(next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(filterStorageKey, next);
      } catch {
        /* ignore */
      }
    }
  };

  const metaRaw = useTaskTypeMeta(workspaceId);
  const meta = useMemo(() => {
    if (!allowedTaskTypeKeys || allowedTaskTypeKeys.length === 0) return metaRaw;
    const allowed = new Set(allowedTaskTypeKeys);
    const types = metaRaw.types.filter((t) => allowed.has(t.key));
    return { ...metaRaw, types };
  }, [metaRaw, allowedTaskTypeKeys]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.user_id, m] as const)), [members]);
  const phaseById = useMemo(() => new Map(phases.map((p) => [p.id, p] as const)), [phases]);

  const { data: sprints = [] } = useQuery({
    ...sprintsQO(contractId ?? "", projectId),
    enabled: !!contractId,
  });
  const sprintById = useMemo(
    () =>
      new Map(
        (sprints as { id: string; sprint_number?: number | null; notes?: string | null }[]).map(
          (s) => [s.id, s] as const,
        ),
      ),
    [sprints],
  );

  const [groupBy, setGroupBy] = useState<GroupKey>(initialGroupBy ?? "none");
  const [newTitle, setNewTitle] = useState("");
  const [quickAddTypeId, setQuickAddTypeId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Shared column-visibility state across grouped DataGrids (grouped mode only).
  const [sharedHidden, setSharedHidden] = useState<Record<string, boolean>>({});
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverPhaseKey, setDragOverPhaseKey] = useState<string | null>(null);

  const handleRowDragStart = (row: TaskRow, e: React.DragEvent<HTMLTableRowElement>) => {
    e.dataTransfer.setData("application/x-task-id", row.id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingTaskId(row.id);
  };
  const handleRowDragEnd = () => {
    setDraggingTaskId(null);
    setDragOverPhaseKey(null);
  };

  // Default the quick-add type to "Tarea" (or first available) once types load.
  const defaultTypeId = useMemo(() => {
    if (meta.types.length === 0) return null;
    return meta.types.find((t) => t.key === "tarea")?.id ?? meta.types[0].id;
  }, [meta.types]);
  const activeQuickAddTypeId = quickAddTypeId ?? defaultTypeId;

  const columns: ColumnDef<TaskRow>[] = useMemo(
    () => [
      {
        id: "title",
        header: "Tarea",
        required: true,
        sortable: true,
        accessor: (t) => t.title,
        cell: (t) => {
          const dynType = t.task_type_id ? meta.typeById.get(t.task_type_id) : null;
          const TypeIcon = dynType ? getLucideIcon(dynType.icon) : null;
          return (
            <div
              className={`group/title flex items-center gap-1.5 min-w-0 cursor-pointer ${
                isCompleted(t)
                  ? "line-through text-muted-foreground"
                  : isCancelled(t)
                    ? "text-muted-foreground"
                    : ""
              }`}
            >
              {TypeIcon && dynType && (
                <TypeIcon className="w-3.5 h-3.5 shrink-0" aria-label={dynType.name} size={14} />
              )}
              <InlineEditableText
                value={t.title}
                onSave={(v) => onUpdate({ taskId: t.id, title: v })}
                ariaLabel="Editar título"
                as="span"
                className="block truncate flex-1 min-w-0 group-hover/title:text-primary"
              />
              <ArrowUpRight
                className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0"
                aria-hidden="true"
              />
            </div>
          );
        },
        width: 320,
      },
      ...((): ColumnDef<TaskRow>[] => {
        // Dynamic column: a project uses either Sprints (recurring contracts)
        // or Phases (everything else, e.g. waterfall projects). Show whichever
        // applies — never both.
        const usesSprints = contractType === "recurrente";
        if (usesSprints) {
          return [
            {
              id: "sprint",
              header: "Sprint",
              sortable: true,
              accessor: (t) => {
                if (!t.sprint_id) return -1;
                const s = sprintById.get(t.sprint_id);
                return s?.sprint_number ?? 0;
              },
              cell: (t) => (
                <div onClick={(e) => e.stopPropagation()}>
                  <Select
                    value={t.sprint_id ?? "_none"}
                    onValueChange={(v) =>
                      onUpdate({ taskId: t.id, sprintId: v === "_none" ? null : v })
                    }
                  >
                    <SelectTrigger
                      aria-label="Sprint"
                      className="h-7 px-1.5 text-[13px] leading-5 gap-1 border-0 bg-transparent shadow-none w-full justify-start [&>svg]:hidden"
                    >
                      <SelectValue>
                        {t.sprint_id ? (
                          <span className="truncate">
                            {(() => {
                              const s = sprintById.get(t.sprint_id);
                              return s?.sprint_number != null
                                ? `Sprint ${s.sprint_number}`
                                : "Sprint";
                            })()}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Backlog</span>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none" className="text-[13px]">
                        Backlog
                      </SelectItem>
                      {(sprints as { id: string; sprint_number?: number | null }[]).map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-[13px]">
                          {s.sprint_number != null ? `Sprint ${s.sprint_number}` : "Sprint"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ),
              width: 140,
            },
          ];
        }
        return [
          {
            id: "phase",
            header: "Fase",
            sortable: true,
            accessor: (t) => (t.phase_id ? (phaseById.get(t.phase_id)?.name ?? "") : ""),
            cell: (t) => (
              <div onClick={(e) => e.stopPropagation()}>
                <Select
                  value={t.phase_id ?? "_none"}
                  onValueChange={(v) =>
                    onUpdate({ taskId: t.id, phaseId: v === "_none" ? null : v })
                  }
                >
                  <SelectTrigger
                    aria-label="Fase"
                    className="h-6 px-1.5 text-[11px] gap-1 border-0 bg-transparent shadow-none w-full justify-start [&>svg]:hidden"
                  >
                    <SelectValue>
                      {t.phase_id ? (
                        <span className="truncate">{phaseById.get(t.phase_id)?.name ?? "—"}</span>
                      ) : (
                        <span className="text-muted-foreground">Sin fase</span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none" className="text-xs">
                      Sin fase
                    </SelectItem>
                    {phases.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ),
            width: 160,
          },
        ];
      })(),
      {
        id: "status",
        header: "Estado",
        sortable: true,
        accessor: (t) => getTaskStatus(t).name,
        cell: (t) => {
          const isBacklog = contractType === "recurrente" && !t.sprint_id;
          const st = getTaskStatus(t);
          const dynStatuses = t.task_type_id ? (meta.statusesByType.get(t.task_type_id) ?? []) : [];
          if (dynStatuses.length === 0) {
            return (
              <div className="text-[11px] text-muted-foreground italic px-1.5">
                Tipo sin estados
              </div>
            );
          }
          const options = dynStatuses
            .filter((s) => !(isBacklog && s.category !== "abierta" && s.category !== "cancelada"))
            .map((s) => ({
              value: s.id,
              label: s.name,
              color: mapCategoryToStColor(s.category),
              hex: s.color,
            }));
          const currentHex = dynStatuses.find((s) => s.id === t.status_id)?.color ?? null;
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <StatusBadgeSelect
                value={t.status_id ?? ""}
                options={options}
                onChange={(v) => onUpdate({ taskId: t.id, statusId: v })}
                color={mapCategoryToStColor(st.category)}
                hex={currentHex}
              />
            </div>
          );
        },
        width: 150,
      },
      {
        id: "assignee",
        header: "Asignado",
        sortable: true,
        accessor: (t) => {
          return getAssigneeIds(t)
            .map((id) => {
              const m = memberById.get(id);
              return m?.profile?.full_name ?? m?.profile?.email ?? "";
            })
            .filter(Boolean)
            .join(", ");
        },
        cell: (t) => (
          <div onClick={(e) => e.stopPropagation()}>
            <MultiAssigneeSelect
              members={members}
              value={getAssigneeIds(t)}
              onChange={(ids) => onUpdate({ taskId: t.id, assigneeIds: ids })}
            />
          </div>
        ),
        width: 170,
      },
      {
        id: "start_date",
        header: "Fecha inicio",
        sortable: true,
        accessor: (t) => t.start_date ?? "",
        cell: (t) => (
          <DateCell
            value={t.start_date ?? null}
            tone="none"
            onChange={(next) => onUpdate({ taskId: t.id, startDate: next })}
          />
        ),
        width: 130,
      },
      {
        id: "due",
        header: "Fecha término",
        sortable: true,
        accessor: (t) => t.due_date ?? "",
        cell: (t) => (
          <DateCell
            value={t.due_date}
            tone={t.due_date ? dueTone(t.due_date, getTaskStatus(t).key) : "none"}
            onChange={(next) => onUpdate({ taskId: t.id, dueDate: next })}
          />
        ),
        width: 130,
      },
      {
        id: "estimate",
        header: "Estimado",
        sortable: true,
        accessor: (t) => t.total_effort_hours ?? -1,
        cell: (t) => (
          <HoursEditCell
            value={t.total_effort_hours}
            ariaLabel="Tiempo estimado (horas)"
            onChange={(next) => onUpdate({ taskId: t.id, totalEffortHours: next })}
          />
        ),
        width: 130,
      },
      {
        id: "actual",
        header: "Real",
        sortable: true,
        accessor: (t) => rollups?.[t.id]?.logged ?? -1,
        cell: (t) => {
          const logged = rollups?.[t.id]?.logged ?? null;
          return <span className="text-xs text-muted-foreground">{formatHours(logged)}</span>;
        },
        width: 110,
      },
      {
        id: "priority",
        header: "Prioridad",
        sortable: true,
        accessor: (t) => PRIORITY_RANK[t.priority] ?? 99,
        cell: (t) => (
          <div onClick={(e) => e.stopPropagation()}>
            <Select
              value={t.priority}
              onValueChange={(v) => onUpdate({ taskId: t.id, priority: v })}
            >
              <SelectTrigger
                aria-label="Prioridad"
                className="h-6 px-1.5 text-[11px] gap-1 border-0 bg-transparent shadow-none w-full justify-start [&>svg]:hidden"
              >
                <SelectValue>
                  <span className="inline-flex items-center gap-1.5">
                    {PRIORITY_ICON[t.priority as keyof typeof PRIORITY_ICON]}
                    <span className="truncate">{PRIORITY_LABEL[t.priority] ?? t.priority}</span>
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ),
        width: 110,
        defaultHidden: true,
      },
      {
        id: "created_at",
        header: "Creado",
        sortable: true,
        accessor: (t) => t.created_at ?? "",
        cell: (t) => (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {t.created_at ? formatDateTimeCL(t.created_at) : "—"}
          </span>
        ),
        width: 140,
      },
    ],
    [
      members,
      memberById,
      sprintById,
      phaseById,
      phases,
      sprints,
      onUpdate,
      contractType,
      meta,
      rollups,
    ],
  );

  const rootTasks = useMemo(
    () => tasks.filter((t) => !t.parent_task_id && matchesStatusFilter(t, statusFilter)),
    [tasks, statusFilter],
  );

  const groups = useMemo(() => {
    if (groupBy === "none") return null;
    type Group = {
      key: string;
      label: string;
      order: number;
      color?: string | null;
      phaseId?: string | null;
      ownerId?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      rows: TaskRow[];
    };
    const map = new Map<string, Group>();
    const push = (g: Omit<Group, "rows">, row: TaskRow) => {
      const ex = map.get(g.key);
      if (ex) ex.rows.push(row);
      else map.set(g.key, { ...g, rows: [row] });
    };
    for (const t of rootTasks) {
      if (groupBy === "status") {
        const st = getTaskStatus(t);
        const CAT_ORDER: Record<string, number> = {
          abierta: 0,
          en_progreso: 1,
          bloqueada: 2,
          completada: 3,
          cancelada: 4,
        };
        const CAT_LABEL: Record<string, string> = {
          abierta: "Abiertas",
          en_progreso: "En progreso",
          bloqueada: "Bloqueadas",
          completada: "Completadas",
          cancelada: "Canceladas",
        };
        push(
          {
            key: st.category,
            label: CAT_LABEL[st.category] ?? st.category,
            order: CAT_ORDER[st.category] ?? 99,
          },
          t,
        );
      } else if (groupBy === "priority") {
        const idx = PRIORITY_RANK[t.priority] ?? 99;
        push({ key: t.priority, label: PRIORITY_LABEL[t.priority] ?? t.priority, order: idx }, t);
      } else if (groupBy === "assignee") {
        const assigneeIds = getAssigneeIds(t);
        if (assigneeIds.length === 0) {
          push({ key: "_none", label: "Sin asignar", order: 999 }, t);
        } else {
          assigneeIds.forEach((id) => {
            const m = memberById.get(id);
            push(
              {
                key: id,
                label: m?.profile?.full_name ?? m?.profile?.email ?? "Desconocido",
                order: 0,
              },
              t,
            );
          });
        }
      } else if (groupBy === "due") {
        push(dueBucket(t.due_date), t);
      } else if (groupBy === "sprint") {
        if (!t.sprint_id) push({ key: "_none", label: "Backlog", order: -1 }, t);
        else {
          const s = sprintById.get(t.sprint_id);
          push(
            {
              key: t.sprint_id,
              label: s?.sprint_number != null ? `Sprint ${s.sprint_number}` : "Sprint",
              order: s?.sprint_number ?? 0,
            },
            t,
          );
        }
      } else if (groupBy === "phase") {
        if (!t.phase_id) push({ key: "_none", label: "Sin fase", order: 9999 }, t);
        else {
          const p = phaseById.get(t.phase_id);
          push(
            {
              key: t.phase_id,
              label: p?.name ?? "—",
              order: p?.order_index ?? 0,
              color: p?.color ?? null,
              phaseId: t.phase_id,
              ownerId: p?.owner_id ?? null,
              startDate: p?.start_date ?? null,
              endDate: p?.end_date ?? null,
            },
            t,
          );
        }
      }
    }
    // Ensure phases with no tasks are still visible when grouping by phase.
    if (groupBy === "phase") {
      for (const p of phases) {
        if (!map.has(p.id)) {
          map.set(p.id, {
            key: p.id,
            label: p.name,
            order: p.order_index ?? 0,
            color: p.color ?? null,
            phaseId: p.id,
            ownerId: p.owner_id ?? null,
            startDate: p.start_date ?? null,
            endDate: p.end_date ?? null,
            rows: [],
          });
        }
      }
    }
    return [...map.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  }, [rootTasks, groupBy, memberById, sprintById, phaseById, phases]);

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const v = newTitle.trim();
    if (!v || !onCreate) return;
    onCreate(v, activeQuickAddTypeId);
    setNewTitle("");
  };

  const activeQuickType = activeQuickAddTypeId ? meta.typeById.get(activeQuickAddTypeId) : null;
  const QuickTypeIcon = activeQuickType ? getLucideIcon(activeQuickType.icon) : null;

  const quickAddRow = onCreate ? (
    <form
      onSubmit={handleQuickAdd}
      className="border-t border-border px-4 py-1.5 flex items-center gap-2 bg-muted/20"
    >
      {meta.types.length > 0 ? (
        <Select value={activeQuickAddTypeId ?? ""} onValueChange={(v) => setQuickAddTypeId(v)}>
          <SelectTrigger
            aria-label="Tipo de tarea"
            className="h-6 px-1.5 text-[11px] gap-1 border-0 bg-transparent shadow-none w-auto [&>svg]:hidden"
          >
            <SelectValue>
              <span className="inline-flex items-center gap-1.5">
                {QuickTypeIcon && <QuickTypeIcon className="w-3.5 h-3.5" size={14} />}
                <span className="truncate">{activeQuickType?.name ?? "Tipo"}</span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {meta.types.map((t) => {
              const Icon = getLucideIcon(t.icon);
              return (
                <SelectItem key={t.id} value={t.id} className="text-xs">
                  <span className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5" size={14} />
                    {t.name}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      ) : (
        <Plus className="w-3.5 h-3.5 text-muted-foreground" />
      )}
      <Input
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
        placeholder={`Añadir ${activeQuickType?.name.toLowerCase() ?? "tarea"}... (Enter para crear)`}
        className="h-7 border-0 shadow-none focus-visible:ring-0 px-0 bg-transparent text-xs"
      />
    </form>
  ) : null;

  const statusFilterChips = (
    <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Filtrar tareas">
      {STATUS_FILTER_OPTIONS.map((o) => {
        const active = statusFilter === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => updateStatusFilter(o.value)}
            className={cn(
              "h-7 px-2 rounded-md text-[11px] border transition-colors",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-transparent text-muted-foreground border-border hover:bg-accent hover:text-foreground",
            )}
            aria-pressed={active}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );

  const toolbarLeft = (
    <div className="flex items-center gap-3 flex-wrap">
      {statusFilterChips}
      {!hideGroupBy && (
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Agrupar:</span>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupKey)}>
            <SelectTrigger className="h-7 text-xs w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );

  const renderSelectionActions = (selected: TaskRow[]) => (
    <>
      <Select
        onValueChange={(v) => {
          for (const t of selected) onUpdate({ taskId: t.id, priority: v });
        }}
      >
        <SelectTrigger className="h-7 text-xs w-32" aria-label="Cambiar prioridad">
          <SelectValue placeholder="Prioridad..." />
        </SelectTrigger>
        <SelectContent>
          {PRIORITY_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        onValueChange={(v) => {
          const next = v === "_none" ? null : v;
          for (const t of selected) onUpdate({ taskId: t.id, assigneeIds: next ? [next] : [] });
        }}
      >
        <SelectTrigger className="h-7 text-xs w-36" aria-label="Reasignar">
          <SelectValue placeholder="Asignar a..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_none" className="text-xs">
            Sin asignar
          </SelectItem>
          {members.map((m) => (
            <SelectItem key={m.user_id} value={m.user_id} className="text-xs">
              {m.profile?.full_name ?? m.profile?.email ?? "Usuario"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {onBulkDelete && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-destructive hover:text-destructive"
          onClick={() => onBulkDelete(selected)}
        >
          <Trash2 className="w-3.5 h-3.5 mr-1" />
          Eliminar
        </Button>
      )}
    </>
  );

  const emptyMessage = emptyHasFilters ? (
    <div className="flex flex-col items-center gap-2">
      <span>Ningún resultado coincide con los filtros activos.</span>
      {onClearFilters && (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onClearFilters}>
          Limpiar filtros
        </Button>
      )}
    </div>
  ) : (
    "Sin tareas. Usa la fila de arriba para añadir la primera."
  );

  const rowActions = (t: TaskRow) => (
    <Button
      size="icon"
      variant="ghost"
      className="w-7 h-7"
      aria-label={`Eliminar ${t.title}`}
      onClick={() => onDelete(t)}
    >
      <Trash2 className="w-3.5 h-3.5" />
    </Button>
  );

  if (groups) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="border-b border-border px-4 py-2 flex items-center gap-2 flex-wrap">
          {toolbarLeft}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              {rootTasks.length} {rootTasks.length === 1 ? "tarea" : "tareas"} en {groups.length}{" "}
              {groups.length === 1 ? "grupo" : "grupos"}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                  <Columns3 className="w-3.5 h-3.5" /> Columnas
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs">Mostrar columnas</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {columns.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={!sharedHidden[c.id]}
                    disabled={c.required}
                    onCheckedChange={(checked) =>
                      setSharedHidden((h) => ({ ...h, [c.id]: !checked }))
                    }
                    className="text-xs"
                  >
                    {c.header}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {quickAddRow}
        <div className="flex-1 overflow-auto">
          {groups.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">{emptyMessage}</div>
          ) : (
            (() => {
              const firstVisibleIdx = groups.findIndex(
                (gg) => !collapsed[gg.key] && gg.rows.length > 0,
              );
              return groups.map((g, gIdx) => {
                const isCollapsed = collapsed[g.key];
                const ownerProfile = g.ownerId
                  ? (memberById.get(g.ownerId)?.profile ?? null)
                  : null;
                const ownerLabel = ownerProfile
                  ? (ownerProfile.full_name ?? ownerProfile.email ?? "Responsable")
                  : null;
                const fmtDate = (iso?: string | null) => {
                  if (!iso) return null;
                  try {
                    return format(parseISO(iso), "dd/MM", { locale: es });
                  } catch {
                    return null;
                  }
                };
                const startTxt = fmtDate(g.startDate);
                const endTxt = fmtDate(g.endDate);
                const dateTxt =
                  startTxt && endTxt
                    ? `${startTxt} – ${endTxt}`
                    : startTxt
                      ? `Desde ${startTxt}`
                      : endTxt
                        ? `Hasta ${endTxt}`
                        : null;
                const targetPhaseId = groupBy === "phase" ? (g.phaseId ?? null) : undefined;
                const isDndTarget = groupBy === "phase" && draggingTaskId !== null;
                const isOver = dragOverPhaseKey === g.key;
                return (
                  <div
                    key={g.key}
                    onDragOver={
                      isDndTarget
                        ? (e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            if (dragOverPhaseKey !== g.key) setDragOverPhaseKey(g.key);
                          }
                        : undefined
                    }
                    onDragLeave={
                      isDndTarget
                        ? (e) => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                              setDragOverPhaseKey((k) => (k === g.key ? null : k));
                            }
                          }
                        : undefined
                    }
                    onDrop={
                      isDndTarget
                        ? (e) => {
                            e.preventDefault();
                            const taskId =
                              e.dataTransfer.getData("application/x-task-id") || draggingTaskId;
                            setDragOverPhaseKey(null);
                            setDraggingTaskId(null);
                            if (!taskId) return;
                            const task = tasks.find((t) => t.id === taskId);
                            if (!task) return;
                            if ((task.phase_id ?? null) === (targetPhaseId ?? null)) return;
                            onUpdate({ taskId, phaseId: targetPhaseId ?? null });
                          }
                        : undefined
                    }
                    className={cn(isOver && "ring-2 ring-primary/60 ring-inset")}
                  >
                    <div className="w-full px-4 py-1.5 flex items-center gap-2 bg-muted/30 hover:bg-muted/50 border-t border-b border-border">
                      <button
                        type="button"
                        className="flex items-center gap-2 min-w-0 flex-1 text-left"
                        onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                        )}
                        {g.color && (
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: g.color }}
                            aria-hidden="true"
                          />
                        )}
                        <span className="text-xs font-medium truncate">{g.label}</span>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {g.rows.length}
                        </span>
                      </button>
                      <div className="flex items-center gap-3 shrink-0">
                        {ownerProfile && (
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <MemberAvatar profile={ownerProfile} size={18} shape="circle" />
                            <span className="max-w-[120px] truncate">{ownerLabel}</span>
                          </div>
                        )}
                        {dateTxt && (
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <CalendarLucide className="w-3 h-3" />
                            <span>{dateTxt}</span>
                          </div>
                        )}
                        {g.phaseId && onEditPhase && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="w-6 h-6"
                            aria-label={`Editar fase ${g.label}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditPhase(g.phaseId!);
                            }}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {!isCollapsed && g.rows.length > 0 && (
                      <DataGrid<TaskRow>
                        viewKey={`${viewKey}:${groupBy}:${g.key}`}
                        columns={columns}
                        rows={g.rows}
                        rowKey={(t) => t.id}
                        onRowClick={(t) => onOpenTask(t.id)}
                        searchable={false}
                        showRowNumbers={false}
                        empty={emptyMessage}
                        rowActions={rowActions}
                        renderSelectionActions={renderSelectionActions}
                        hideToolbar
                        hideHeader={gIdx !== firstVisibleIdx}
                        hidden={sharedHidden}
                        onHiddenChange={setSharedHidden}
                        autoHeight
                        rowDraggable={groupBy === "phase"}
                        onRowDragStart={handleRowDragStart}
                        onRowDragEnd={handleRowDragEnd}
                      />
                    )}

                    {!isCollapsed && g.rows.length === 0 && (
                      <div className="px-6 py-2 text-[11px] text-muted-foreground italic">
                        {isDndTarget
                          ? "Suelta aquí para mover a esta fase"
                          : "Sin tareas en esta fase."}
                      </div>
                    )}
                  </div>
                );
              });
            })()
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {quickAddRow}
      <div className="flex-1 min-h-0">
        <DataGrid<TaskRow>
          viewKey={viewKey}
          columns={columns}
          rows={rootTasks}
          rowKey={(t) => t.id}
          onRowClick={(t) => onOpenTask(t.id)}
          searchable={false}
          empty={emptyMessage}
          toolbarLeft={toolbarLeft}
          renderSelectionActions={renderSelectionActions}
          rowActions={rowActions}
        />
      </div>
    </div>
  );
}
