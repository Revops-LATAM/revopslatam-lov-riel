import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getWorkloadCellTasks } from "@/lib/api/tasko.functions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2 } from "lucide-react";
import { formatMinutes } from "@/components/tasko/TimeTab";

/**
 * Drill-down popover for a single user × day cell in the workload grid.
 * Shows the planned tasks (with estimate) and logged entries.
 */
export function WorkloadCellPopover({
  children,
  workspaceId,
  workspaceSlug,
  userId,
  day,
  enabled,
}: {
  children: React.ReactNode;
  workspaceId: string;
  workspaceSlug: string;
  userId: string;
  day: string;
  enabled: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="center">
        {enabled ? (
          <CellContent
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            userId={userId}
            day={day}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function CellContent({
  workspaceId,
  workspaceSlug,
  userId,
  day,
}: {
  workspaceId: string;
  workspaceSlug: string;
  userId: string;
  day: string;
}) {
  const fetchFn = useServerFn(getWorkloadCellTasks);
  const q = useQuery({
    queryKey: ["workload-cell", workspaceId, userId, day],
    queryFn: () => fetchFn({ data: { workspaceId, userId, day } }),
    staleTime: 30_000,
  });

  if (q.isLoading) {
    return (
      <div className="p-4 text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-3 h-3 animate-spin" /> Cargando...
      </div>
    );
  }
  const planned = q.data?.planned ?? [];
  const logged = q.data?.logged ?? [];

  return (
    <div className="max-h-80 overflow-y-auto">
      <div className="px-3 py-2 border-b text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {day}
      </div>
      <section className="p-2">
        <h4 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-1 mb-1">
          Planificado · {planned.length}
        </h4>
        {planned.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1">Sin tareas planificadas.</p>
        ) : (
          <ul className="space-y-0.5">
            {planned.map((t) => (
              <li key={t.task_id}>
                <Link
                  to="/w/$workspaceSlug/projects/$projectId"
                  params={{ workspaceSlug, projectId: t.project?.id ?? "" }}
                  search={{ task: t.task_id }}
                  className="flex items-center gap-2 px-1 py-1 rounded hover:bg-accent text-xs"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: t.project?.color ?? "#8b5cf6" }}
                  />
                  <span className="flex-1 truncate">{t.title}</span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {formatMinutes(t.estimateMin)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="p-2 border-t">
        <h4 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-1 mb-1">
          Logueado · {logged.length}
        </h4>
        {logged.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1">Sin tiempo registrado.</p>
        ) : (
          <ul className="space-y-0.5">
            {logged.map((e) => (
              <li
                key={e.entry_id}
                className="flex items-center gap-2 px-1 py-1 text-xs"
                title={e.note ?? ""}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: e.project?.color ?? "#8b5cf6" }}
                />
                <span className="flex-1 truncate">{e.title}</span>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {formatMinutes(e.minutes)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
