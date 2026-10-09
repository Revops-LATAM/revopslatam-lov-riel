import { useMemo, useState, memo, useCallback } from "react";
import {
  DndContext,
  closestCorners,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  useSortable,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery } from "@tanstack/react-query";
import { sprintsQO } from "@/lib/api/tasko.queries";
import { useTaskTypeMeta } from "@/lib/task-type-meta";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MemberAvatar } from "./MemberAvatar";
import { PRIORITY_ICON } from "@/lib/tasko-constants";
import { dueTone, dueToneClass, formatDueShort } from "@/lib/tasko-utils";
import { Calendar, Rocket, Ticket as TicketIcon, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./EmptyState";

type Ticket = {
  id: string;
  title: string;
  priority: string;
  assignee_id: string | null;
  due_date: string | null;
  sprint_id?: string | null;
  task_type_id?: string | null;
  status_id?: string | null;
  severity?: string | null;
  request_type?: string | null;
  parent_task_id?: string | null;
};

type Member = {
  user_id: string;
  profile: {
    id: string;
    full_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  } | null;
};

type Sprint = {
  id: string;
  sprint_number: number;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
};

export function TicketsPipelineView({
  tasks,
  members,
  workspaceId,
  contractId,
  projectId,
  contractType,
  onSelectTask,
  onUpdateTask,
}: {
  tasks: Ticket[];
  members: Member[];
  workspaceId: string;
  contractId: string | null;
  projectId?: string | null;
  contractType: string | null;
  onSelectTask: (id: string) => void;
  onUpdateTask: (vars: { taskId: string; statusId?: string; sprintId?: string | null }) => void;
}) {
  const meta = useTaskTypeMeta(workspaceId);
  const ticketType = useMemo(
    () => meta.types.find((t) => t.key === "ticket") ?? null,
    [meta.types],
  );
  const statuses = useMemo(
    () => (ticketType ? (meta.statusesByType.get(ticketType.id) ?? []) : []),
    [ticketType, meta.statusesByType],
  );

  const isRecurrente = contractType === "recurrente";
  const { data: sprintsData = [] } = useQuery({
    ...sprintsQO(contractId ?? "", projectId),
    enabled: !!contractId && isRecurrente,
  });
  const sprints = useMemo(
    () =>
      (sprintsData as Sprint[])
        .slice()
        .sort((a, b) => (a.sprint_number ?? 0) - (b.sprint_number ?? 0)),
    [sprintsData],
  );
  const memberById = useMemo(() => {
    const m = new Map<string, Member>();
    for (const x of members) m.set(x.user_id, x);
    return m;
  }, [members]);

  // Only root-level tickets of the workspace's ticket task type
  const tickets = useMemo(
    () => tasks.filter((t) => !t.parent_task_id && ticketType && t.task_type_id === ticketType.id),
    [tasks, ticketType],
  );

  const grouped = useMemo(() => {
    const g: Record<string, Ticket[]> = {};
    for (const s of statuses) g[s.id] = [];
    const unassigned: Ticket[] = [];
    for (const t of tickets) {
      if (t.status_id && g[t.status_id]) g[t.status_id].push(t);
      else unassigned.push(t);
    }
    // Drop unassigned into the first column (default) if there is one
    if (unassigned.length > 0 && statuses[0]) {
      g[statuses[0].id].push(...unassigned);
    }
    return g;
  }, [tickets, statuses]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const activeTicket = tickets.find((t) => t.id === activeId) ?? null;

  const findContainer = (id: string): string | null => {
    if (statuses.some((s) => s.id === id)) return id;
    const t = tickets.find((x) => x.id === id);
    return t?.status_id ?? statuses[0]?.id ?? null;
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string);
  const onDragOver = (e: DragOverEvent) => {
    const over = e.over?.id as string | undefined;
    setOverCol(over ? findContainer(over) : null);
  };
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    setOverCol(null);
    if (!over) return;
    const toCol = findContainer(over.id as string);
    const fromCol = findContainer(active.id as string);
    if (!toCol || !fromCol || toCol === fromCol) return;
    onUpdateTask({ taskId: active.id as string, statusId: toCol });
  };

  if (!ticketType) {
    return (
      <div className="p-6">
        <EmptyState
          icon={AlertTriangle}
          title="No hay tipo de tarea 'Ticket'"
          description="El workspace no tiene configurado el tipo de tarea Ticket."
        />
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={TicketIcon}
          title="Aún no hay tickets"
          description="Cuando llegue un ticket por el portal del cliente, aparecerá aquí en el pipeline."
        />
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setOverCol(null);
      }}
    >
      <div className="flex gap-3 p-4 overflow-x-auto flex-1 h-full">
        {statuses.map((s) => (
          <PipelineColumn
            key={s.id}
            id={s.id}
            label={s.name}
            color={s.color}
            tickets={grouped[s.id] ?? []}
            memberById={memberById}
            sprints={sprints}
            isRecurrente={isRecurrente}
            isOver={overCol === s.id}
            onSelectTask={onSelectTask}
            onUpdateTask={onUpdateTask}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTicket && (
          <TicketCard
            ticket={activeTicket}
            memberById={memberById}
            sprints={sprints}
            isRecurrente={isRecurrente}
            onSelect={noop}
            onUpdateTask={noop}
            dragging
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}

const noop = () => {};

const PipelineColumn = memo(function PipelineColumn({
  id,
  label,
  color,
  tickets,
  memberById,
  sprints,
  isRecurrente,
  isOver,
  onSelectTask,
  onUpdateTask,
}: {
  id: string;
  label: string;
  color: string;
  tickets: Ticket[];
  memberById: Map<string, Member>;
  sprints: Sprint[];
  isRecurrente: boolean;
  isOver: boolean;
  onSelectTask: (id: string) => void;
  onUpdateTask: (vars: { taskId: string; statusId?: string; sprintId?: string | null }) => void;
}) {
  const { setNodeRef } = useDroppable({ id });
  const ids = useMemo(() => tickets.map((t) => t.id), [tickets]);
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-w-[280px] w-[280px] flex flex-col rounded-lg border bg-card",
        isOver ? "border-primary ring-1 ring-primary/30" : "border-border",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <span className="text-xs font-medium truncate">{label}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">{tickets.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {tickets.map((t) => (
            <SortableTicket
              key={t.id}
              ticket={t}
              memberById={memberById}
              sprints={sprints}
              isRecurrente={isRecurrente}
              onSelectTask={onSelectTask}
              onUpdateTask={onUpdateTask}
            />
          ))}
        </SortableContext>
        {tickets.length === 0 && (
          <div className="text-[11px] text-muted-foreground text-center py-6">Sin tickets</div>
        )}
      </div>
    </div>
  );
});

const SortableTicket = memo(function SortableTicket(props: {
  ticket: Ticket;
  memberById: Map<string, Member>;
  sprints: Sprint[];
  isRecurrente: boolean;
  onSelectTask: (id: string) => void;
  onUpdateTask: (vars: { taskId: string; statusId?: string; sprintId?: string | null }) => void;
}) {
  const { ticket, onSelectTask } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const onSelect = useCallback(() => onSelectTask(ticket.id), [onSelectTask, ticket.id]);
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TicketCard
        ticket={props.ticket}
        memberById={props.memberById}
        sprints={props.sprints}
        isRecurrente={props.isRecurrente}
        onSelect={onSelect}
        onUpdateTask={props.onUpdateTask}
      />
    </div>
  );
});

const TicketCard = memo(function TicketCard({
  ticket,
  memberById,
  sprints,
  isRecurrente,
  onSelect,
  onUpdateTask,
  dragging,
}: {
  ticket: Ticket;
  memberById: Map<string, Member>;
  sprints: Sprint[];
  isRecurrente: boolean;
  onSelect: () => void;
  onUpdateTask: (vars: { taskId: string; statusId?: string; sprintId?: string | null }) => void;
  dragging?: boolean;
}) {
  const assignee = ticket.assignee_id ? (memberById.get(ticket.assignee_id) ?? null) : null;
  const priorityIcon = ticket.priority
    ? PRIORITY_ICON[ticket.priority as keyof typeof PRIORITY_ICON]
    : null;
  const due = ticket.due_date ? formatDueShort(ticket.due_date) : null;
  const dueClass = ticket.due_date ? dueToneClass(dueTone(ticket.due_date)) : "";
  const isCritico =
    ticket.severity === "urgente_critico" ||
    ticket.severity === "alta" ||
    ticket.severity === "critica";

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-background p-2.5 text-xs hover:border-primary/40 cursor-pointer space-y-1.5 shadow-sm",
        dragging && "shadow-lg",
      )}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-no-card-open]")) return;
        onSelect();
      }}
    >
      <div className="flex items-start gap-1.5">
        {isCritico && <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />}
        <span className="font-medium leading-snug line-clamp-2 flex-1">{ticket.title}</span>
      </div>

      {(ticket.request_type || ticket.severity) && (
        <div className="flex items-center gap-1 flex-wrap">
          {ticket.request_type && (
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {ticket.request_type === "incidencia" ? "Incidencia" : "Requerimiento"}
            </span>
          )}
          {ticket.severity && (
            <span
              className={cn(
                "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded",
                isCritico
                  ? "bg-red-500/10 text-red-600 dark:text-red-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {ticket.severity === "urgente_critico" ? "Urgente" : "Normal"}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        {priorityIcon && (
          <span className="inline-flex items-center gap-0.5" title={`Prioridad ${ticket.priority}`}>
            {priorityIcon}
          </span>
        )}
        {due && (
          <span className={cn("inline-flex items-center gap-0.5", dueClass)}>
            <Calendar className="w-3 h-3" />
            {due}
          </span>
        )}
        <span className="ml-auto">
          {assignee?.profile ? (
            <MemberAvatar profile={assignee.profile} size={20} />
          ) : (
            <span className="text-[10px]">Sin asignar</span>
          )}
        </span>
      </div>

      {isRecurrente && (
        <div data-no-card-open onClick={(e) => e.stopPropagation()}>
          <Select
            value={ticket.sprint_id ?? "__none"}
            onValueChange={(v) =>
              onUpdateTask({ taskId: ticket.id, sprintId: v === "__none" ? null : v })
            }
          >
            <SelectTrigger className="h-6 text-[11px] px-1.5">
              <Rocket className="w-3 h-3 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Sin sprint" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none" className="text-xs">
                Sin sprint
              </SelectItem>
              {sprints.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  Sprint {s.sprint_number}
                  {s.status === "en_curso" ? " · en curso" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
});
