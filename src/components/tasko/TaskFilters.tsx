import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { PRIORITY_OPTIONS, PRIORITY_ICON } from "@/lib/tasko-constants";
import { MemberAvatar } from "./MemberAvatar";
import { useTaskTypeMeta, getLucideIcon } from "@/lib/task-type-meta";

export type TaskFiltersValue = {
  q: string;
  priority: string; // "all" | priority value
  assignee: string; // "all" | "unassigned" | user_id
  taskType: string; // "all" | task_type_id
};

export const EMPTY_FILTERS: TaskFiltersValue = {
  q: "",
  priority: "all",
  assignee: "all",
  taskType: "all",
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

export function TaskFilters({
  value,
  onChange,
  members,
  workspaceId,
}: {
  value: TaskFiltersValue;
  onChange: (v: TaskFiltersValue) => void;
  members: Member[];
  workspaceId?: string | null;
}) {
  const meta = useTaskTypeMeta(workspaceId);
  const hasActive =
    value.q.trim() !== "" ||
    value.priority !== "all" ||
    value.assignee !== "all" ||
    value.taskType !== "all";
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-1 min-w-[160px] max-w-xs">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value.q}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
          placeholder="Buscar..."
          aria-label="Buscar tareas"
          className="h-7 pl-7 text-xs"
        />
      </div>

      <Select value={value.priority} onValueChange={(v) => onChange({ ...value, priority: v })}>
        <SelectTrigger className="h-7 w-auto gap-1.5 text-xs" aria-label="Filtrar por prioridad">
          <SelectValue placeholder="Prioridad" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Cualquier prioridad</SelectItem>
          {PRIORITY_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              <span className="flex items-center gap-2">
                {PRIORITY_ICON[o.value]} {o.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={value.assignee} onValueChange={(v) => onChange({ ...value, assignee: v })}>
        <SelectTrigger className="h-7 w-auto gap-1.5 text-xs" aria-label="Filtrar por asignado">
          <SelectValue placeholder="Asignado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Cualquier asignado</SelectItem>
          <SelectItem value="unassigned">Sin asignar</SelectItem>
          {members.map((m) => (
            <SelectItem key={m.user_id} value={m.user_id}>
              <span className="flex items-center gap-2">
                <MemberAvatar profile={m.profile} size={16} />
                <span className="truncate max-w-[10rem]">
                  {m.profile?.full_name ?? m.profile?.email ?? "Miembro"}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {meta.types.length > 0 && (
        <Select value={value.taskType} onValueChange={(v) => onChange({ ...value, taskType: v })}>
          <SelectTrigger className="h-7 w-auto gap-1.5 text-xs" aria-label="Filtrar por tipo">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Cualquier tipo</SelectItem>
            {meta.types.map((t) => {
              const Icon = getLucideIcon(t.icon);
              return (
                <SelectItem key={t.id} value={t.id}>
                  <span className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5" size={14} />
                    {t.name}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      )}

      {hasActive && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => onChange(EMPTY_FILTERS)}
        >
          <X className="w-3 h-3" />
          Limpiar
        </Button>
      )}
    </div>
  );
}

export function applyFilters<
  T extends {
    title: string;
    priority: string;
    assignee_id: string | null;
    assignees?: Array<{ user_id: string }> | null;
    task_type_id?: string | null;
  },
>(items: T[], f: TaskFiltersValue): T[] {
  const q = f.q.trim().toLowerCase();
  return items.filter((t) => {
    if (q && !t.title.toLowerCase().includes(q)) return false;
    if (f.priority !== "all" && t.priority !== f.priority) return false;
    if (f.assignee !== "all") {
      const assigneeIds = (t.assignees ?? []).map((a) => a.user_id);
      const hasAssignee = assigneeIds.length > 0 || !!t.assignee_id;
      if (f.assignee === "unassigned" && hasAssignee) return false;
      if (
        f.assignee !== "unassigned" &&
        !assigneeIds.includes(f.assignee) &&
        t.assignee_id !== f.assignee
      )
        return false;
    }
    if (f.taskType !== "all" && t.task_type_id !== f.taskType) return false;
    return true;
  });
}
