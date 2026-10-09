import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import * as Lucide from "lucide-react";
import { CheckSquare } from "lucide-react";
import { taskTypesQO, taskStatusesQO } from "@/lib/api/tasko.queries";

export type TaskTypeRow = {
  id: string;
  workspace_id: string;
  key: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
};

export type TaskStatusRow = {
  id: string;
  workspace_id: string;
  task_type_id: string;
  key: string;
  name: string;
  color: string;
  category: string;
  is_default: boolean;
  sort_order: number;
};

export function getLucideIcon(
  name: string,
): React.ComponentType<{ className?: string; size?: number }> {
  const icons = Lucide as unknown as Record<
    string,
    React.ComponentType<{ className?: string; size?: number }>
  >;
  return icons[name] ?? CheckSquare;
}

export function useTaskTypeMeta(workspaceId: string | null | undefined) {
  const { data: types = [] } = useQuery({
    ...taskTypesQO(workspaceId ?? ""),
    enabled: !!workspaceId,
  });
  const { data: statuses = [] } = useQuery({
    ...taskStatusesQO(workspaceId ?? ""),
    enabled: !!workspaceId,
  });

  return useMemo(() => {
    const typesArr = types as TaskTypeRow[];
    const statusesArr = statuses as TaskStatusRow[];
    const typeById = new Map(typesArr.map((t) => [t.id, t] as const));
    const statusById = new Map(statusesArr.map((s) => [s.id, s] as const));
    const statusesByType = new Map<string, TaskStatusRow[]>();
    for (const s of statusesArr) {
      const arr = statusesByType.get(s.task_type_id) ?? [];
      arr.push(s);
      statusesByType.set(s.task_type_id, arr);
    }
    for (const arr of statusesByType.values()) {
      arr.sort((a, b) => a.sort_order - b.sort_order);
    }
    return { types: typesArr, statuses: statusesArr, typeById, statusById, statusesByType };
  }, [types, statuses]);
}

/** Render a small swatch + text badge using a hex color. */
export function ColorBadge({
  color,
  label,
  icon,
  className,
}: {
  color: string;
  label: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] uppercase font-medium border ${className ?? ""}`}
      style={{
        backgroundColor: `${color}22`,
        borderColor: `${color}55`,
        color: color,
      }}
    >
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );
}
