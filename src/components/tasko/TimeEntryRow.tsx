import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";
import { Link } from "@tanstack/react-router";
import { MoreHorizontal, Trash2, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateTimeEntry, deleteTimeEntry } from "@/lib/api/time.functions";
import { formatMinutes } from "@/components/tasko/TimeTab";
import { toast } from "sonner";

export type EditableEntry = {
  id: string;
  started_at: string;
  duration_minutes: number | null;
  note: string | null;
  is_billable: boolean;
  task: { id: string; title: string } | null;
  project: { id: string; name: string; color: string | null } | null;
};

export function TimeEntryRow({
  entry,
  workspaceSlug,
  invalidateKeys,
}: {
  entry: EditableEntry;
  workspaceSlug: string;
  invalidateKeys: Array<readonly unknown[]>;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateTimeEntry);
  const deleteFn = useServerFn(deleteTimeEntry);

  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [mins, setMins] = useState(String(entry.duration_minutes ?? 0));
  const [note, setNote] = useState(entry.note ?? "");
  const [billable, setBillable] = useState(entry.is_billable);

  const invalidateAll = () => {
    for (const k of invalidateKeys) qc.invalidateQueries({ queryKey: k as unknown[] });
  };

  const updateMut = useMutation({
    mutationFn: (vars: { startedAt: string; endedAt: string; note: string | null; isBillable: boolean }) =>
      updateFn({ data: { id: entry.id, ...vars } }),
    onSuccess: () => {
      toast.success("Entrada actualizada");
      setEditing(false);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteFn({ data: { id: entry.id } }),
    onSuccess: () => {
      toast.success("Entrada eliminada");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border border-primary/40 bg-primary/5 rounded-md">
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: entry.project?.color ?? "#8b5cf6" }}
        />
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nota"
            className="h-7 text-xs flex-1"
          />
          <label className="text-[10px] inline-flex items-center gap-1 text-muted-foreground">
            <input
              type="checkbox"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
            />
            Fact.
          </label>
          <Input
            type="number"
            min={0}
            max={1440}
            value={mins}
            onChange={(e) => setMins(e.target.value)}
            className="h-7 w-16 text-right text-xs tabular-nums"
          />
          <span className="text-[10px] text-muted-foreground">min</span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="w-6 h-6"
          onClick={() => {
            const m = Math.max(0, Number(mins) || 0);
            const startedAt = entry.started_at;
            const endedAt = new Date(new Date(startedAt).getTime() + m * 60000).toISOString();
            updateMut.mutate({
              startedAt,
              endedAt,
              note: note.trim() || null,
              isBillable: billable,
            });
          }}
          disabled={updateMut.isPending}
          aria-label="Guardar"
        >
          <Check className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="w-6 h-6"
          onClick={() => {
            setEditing(false);
            setMins(String(entry.duration_minutes ?? 0));
            setNote(entry.note ?? "");
            setBillable(entry.is_billable);
          }}
          aria-label="Cancelar"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 px-3 py-2 border border-border rounded-md hover:bg-muted/30 group">
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: entry.project?.color ?? "#8b5cf6" }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate">
            {entry.task ? (
              <Link
                to="/w/$workspaceSlug/projects/$projectId"
                params={{ workspaceSlug, projectId: entry.project?.id ?? "" }}
                search={{ task: entry.task.id }}
                className="hover:underline"
              >
                {entry.task.title}
              </Link>
            ) : (
              <span className="text-muted-foreground italic">Tarea eliminada</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {entry.project?.name ?? "—"}
            {entry.note && ` · ${entry.note}`}
          </div>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {format(parseISO(entry.started_at), "HH:mm")}
        </div>
        <div className="text-sm font-semibold tabular-nums w-16 text-right">
          {formatMinutes(entry.duration_minutes ?? 0)}
        </div>
        {!entry.is_billable && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            no fact.
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="w-6 h-6 opacity-0 group-hover:opacity-100"
              aria-label="Acciones"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditing(true)}>Editar</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setConfirmDel(true)} className="text-destructive">
              <Trash2 className="w-3.5 h-3.5 mr-2" /> Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {confirmDel && (
        <div className="border border-destructive/40 bg-destructive/5 rounded-md px-3 py-2 flex items-center gap-2 text-xs">
          <span className="flex-1">¿Eliminar esta entrada? No se puede deshacer.</span>
          <Button
            size="sm"
            variant="destructive"
            className="h-7 text-xs"
            disabled={deleteMut.isPending}
            onClick={() => deleteMut.mutate()}
          >
            Eliminar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setConfirmDel(false)}
          >
            Cancelar
          </Button>
        </div>
      )}
    </>
  );
}
