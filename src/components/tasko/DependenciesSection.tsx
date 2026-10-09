import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listTaskDependencies,
  addTaskDependency,
  removeTaskDependency,
} from "@/lib/api/dependencies.functions";
import { tasksQO } from "@/lib/api/tasko.queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Plus, X, ArrowRight, GitBranch } from "lucide-react";
import { toast } from "sonner";

export function DependenciesSection({
  taskId,
  projectId,
}: {
  taskId: string;
  projectId: string;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listTaskDependencies);
  const addFn = useServerFn(addTaskDependency);
  const removeFn = useServerFn(removeTaskDependency);

  const depsQ = useQuery({
    queryKey: ["task-deps", projectId],
    queryFn: () => listFn({ data: { projectId } }),
  });
  const tasksQ = useQuery(tasksQO(projectId));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["task-deps", projectId] });
    qc.invalidateQueries({ queryKey: ["tasks", projectId] });
  };

  const addMut = useMutation({
    mutationFn: (v: { predecessorTaskId: string; successorTaskId: string; lagDays: number }) =>
      addFn({ data: v }),
    onSuccess: () => {
      invalidate();
      toast.success("Dependencia añadida");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const tasks = tasksQ.data ?? [];
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t] as const)), [tasks]);
  const deps = depsQ.data ?? [];
  const blockedBy = deps.filter((d) => d.successor_task_id === taskId);
  const blocks = deps.filter((d) => d.predecessor_task_id === taskId);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        <GitBranch className="w-3.5 h-3.5" />
        Dependencias
      </div>

      <DepList
        label="Bloqueada por"
        rows={blockedBy.map((d) => ({
          id: d.id,
          otherId: d.predecessor_task_id,
          title: taskById.get(d.predecessor_task_id)?.title ?? "(tarea)",
          lag: d.lag_days,
        }))}
        onRemove={(id) => removeMut.mutate(id)}
      />
      <AddDepInline
        placeholder="Añadir predecesora..."
        candidates={tasks.filter(
          (t) =>
            t.id !== taskId &&
            !blockedBy.some((d) => d.predecessor_task_id === t.id),
        )}
        onAdd={(otherId, lag) =>
          addMut.mutate({
            predecessorTaskId: otherId,
            successorTaskId: taskId,
            lagDays: lag,
          })
        }
      />

      <DepList
        label="Bloquea a"
        rows={blocks.map((d) => ({
          id: d.id,
          otherId: d.successor_task_id,
          title: taskById.get(d.successor_task_id)?.title ?? "(tarea)",
          lag: d.lag_days,
        }))}
        onRemove={(id) => removeMut.mutate(id)}
      />
      <AddDepInline
        placeholder="Añadir sucesora..."
        candidates={tasks.filter(
          (t) =>
            t.id !== taskId &&
            !blocks.some((d) => d.successor_task_id === t.id),
        )}
        onAdd={(otherId, lag) =>
          addMut.mutate({
            predecessorTaskId: taskId,
            successorTaskId: otherId,
            lagDays: lag,
          })
        }
      />
    </div>
  );
}

function DepList({
  label,
  rows,
  onRemove,
}: {
  label: string;
  rows: { id: string; otherId: string; title: string; lag: number }[];
  onRemove: (id: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-2 text-sm px-2 py-1.5 rounded border border-border bg-muted/30"
          >
            <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="truncate flex-1">{r.title}</span>
            {r.lag > 0 && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                +{r.lag}d
              </span>
            )}
            <button
              type="button"
              onClick={() => onRemove(r.id)}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Quitar dependencia"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddDepInline({
  placeholder,
  candidates,
  onAdd,
}: {
  placeholder: string;
  candidates: { id: string; title: string }[];
  onAdd: (otherId: string, lag: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [lag, setLag] = useState(0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground">
          <Plus className="w-3.5 h-3.5" /> {placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar tarea..." />
          <CommandList>
            <CommandEmpty>Sin coincidencias</CommandEmpty>
            <CommandGroup>
              {candidates.map((t) => (
                <CommandItem
                  key={t.id}
                  value={t.title}
                  onSelect={() => {
                    onAdd(t.id, lag);
                    setOpen(false);
                    setLag(0);
                  }}
                >
                  <span className="truncate">{t.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <div className="border-t border-border px-2 py-2 flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Lag (días)</span>
            <Input
              type="number"
              min={0}
              value={lag}
              onChange={(e) => setLag(Math.max(0, Number(e.target.value) || 0))}
              className="h-7 w-16 text-xs"
            />
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
