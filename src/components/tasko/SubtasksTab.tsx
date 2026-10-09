import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createTask, updateTask } from "@/lib/api/tasko.functions";
import { tasksQO } from "@/lib/api/tasko.queries";
import { Input } from "@/components/ui/input";
import { InlineEditableText } from "./InlineEditableText";
import { Plus, Check, ListTodo } from "lucide-react";
import { toast } from "sonner";
import { isCompleted } from "@/lib/tasko/status";

export function SubtasksTab({
  taskId,
  projectId,
  focusNewSignal,
}: {
  taskId: string;
  projectId: string;
  focusNewSignal?: number;
}) {
  const qc = useQueryClient();
  const createSub = useServerFn(createTask);
  const updateFn = useServerFn(updateTask);

  // Single source of truth: share the project's tasks cache.
  const tasksQuery = useQuery({
    ...tasksQO(projectId),
    select: (rows) => rows.filter((r) => r.parent_task_id === taskId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tasks", projectId] });
  };

  const [subTitle, setSubTitle] = useState("");
  const newInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusNewSignal && newInputRef.current) newInputRef.current.focus();
  }, [focusNewSignal]);
  const createSubMut = useMutation({
    mutationFn: (title: string) =>
      createSub({ data: { projectId, title, parentTaskId: taskId } }),
    onSuccess: () => {
      setSubTitle("");
      invalidate();
    },
    onError: (e: Error) =>
      toast.error("No se pudo crear subtarea", { description: e.message }),
  });

  const toggleMut = useMutation({
    mutationFn: (vars: { id: string; status?: string; title?: string }) =>
      updateFn({
        data: {
          taskId: vars.id,
          ...(vars.status !== undefined ? { status: vars.status as never } : {}),
          ...(vars.title !== undefined ? { title: vars.title } : {}),
        },
      }),
    onSuccess: invalidate,
    onError: (e: Error) =>
      toast.error("No se pudo actualizar", { description: e.message }),
  });

  const subtasks = tasksQuery.data ?? [];
  const completed = subtasks.filter(isCompleted).length;
  const progress = subtasks.length > 0 ? Math.round((completed / subtasks.length) * 100) : null;

  return (
    <div className="space-y-3">
      {progress !== null && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progreso</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (subTitle.trim()) createSubMut.mutate(subTitle.trim());
        }}
        className="flex items-center gap-2"
      >
        <Plus className="w-4 h-4 text-muted-foreground" />
        <Input
          ref={newInputRef}
          value={subTitle}
          onChange={(e) => setSubTitle(e.target.value)}
          placeholder="Añadir subtarea..."
          className="h-8 border-0 shadow-none px-0 focus-visible:ring-0"
        />
      </form>
      <div className="divide-y divide-border">
        {subtasks.map((s) => {
          const done = isCompleted(s);
          return (
          <div key={s.id} className="py-2 flex items-center gap-2 group">
            <button
              type="button"
              onClick={() =>
                toggleMut.mutate({ id: s.id, status: done ? "planificada" : "completada" })
              }
              aria-label={done ? "Marcar como pendiente" : "Marcar como hecha"}
              className="w-4 h-4 rounded border border-border flex items-center justify-center hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {done && <Check className="w-3 h-3 text-primary" />}
            </button>
            <div
              className={`flex-1 text-sm ${
                done ? "line-through text-muted-foreground" : ""
              }`}
            >
              <InlineEditableText
                value={s.title}
                onSave={(v) => toggleMut.mutate({ id: s.id, title: v })}
                ariaLabel="Editar título de subtarea"
                as="span"
              />
            </div>
          </div>
          );
        })}
        {subtasks.length === 0 && (
          <div className="flex flex-col items-center text-center py-6 text-muted-foreground">
            <ListTodo className="w-5 h-5 mb-1.5 opacity-60" aria-hidden="true" />
            <span className="text-xs">Sin subtareas aún</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function subtasksCount(subtasks: { status: string }[]) {
  return subtasks.length;
}
