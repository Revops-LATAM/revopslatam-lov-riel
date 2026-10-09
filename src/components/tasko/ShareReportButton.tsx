import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createReportShareToken,
  listReportShareTokens,
  revokeReportShareToken,
} from "@/lib/api/report-share.functions";
import { sprintsQO } from "@/lib/api/tasko.queries";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Copy, FileText, Trash2 } from "lucide-react";
import { formatDateCL } from "@/lib/date-format";

export function ShareReportButton({
  projectId,
  contractId,
}: {
  projectId: string;
  contractId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileText className="w-4 h-4 mr-1.5" />
        Compartir informe
      </Button>
      {open && (
        <ShareReportDialog
          projectId={projectId}
          contractId={contractId}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}

function ShareReportDialog({
  projectId,
  contractId,
  open,
  onOpenChange,
}: {
  projectId: string;
  contractId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listReportShareTokens);
  const createFn = useServerFn(createReportShareToken);
  const revokeFn = useServerFn(revokeReportShareToken);
  const [selected, setSelected] = useState<string[]>([]);
  const [includeBacklog, setIncludeBacklog] = useState(false);

  const sprintsQ = useQuery({ ...sprintsQO(contractId, projectId), enabled: open });
  const sprints = sprintsQ.data ?? [];

  const tokensQ = useQuery({
    queryKey: ["report-share-tokens", projectId],
    queryFn: () => listFn({ data: { projectId } }),
    enabled: open,
  });

  const urlOf = (token: string) =>
    `${typeof window !== "undefined" ? window.location.origin : ""}/informe/${token}`;

  const createMut = useMutation({
    mutationFn: () => createFn({ data: { projectId, sprintIds: selected, includeBacklog } }),
    onSuccess: async (row) => {
      await qc.invalidateQueries({ queryKey: ["report-share-tokens", projectId] });
      try {
        await navigator.clipboard.writeText(urlOf(row.token));
        toast.success("Informe creado y enlace copiado");
      } catch {
        toast.success("Informe creado");
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["report-share-tokens", projectId] });
      toast.success("Enlace revocado");
    },
  });

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(urlOf(token));
      toast.success("Copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Compartir informe de horas</DialogTitle>
          <DialogDescription>
            Enlace público de solo lectura con el resumen de horas por sprint y el detalle de
            tareas. No muestra costos ni personas del equipo.
          </DialogDescription>
        </DialogHeader>

        <div>
          <Label className="text-xs">
            Sprints a incluir {selected.length === 0 ? "(ninguno marcado = todos)" : ""}
          </Label>
          <div className="mt-1.5 max-h-48 overflow-auto rounded border border-border divide-y divide-border">
            {sprints.length === 0 && (
              <div className="px-3 py-3 text-xs text-muted-foreground">Sin sprints.</div>
            )}
            {sprints.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-muted/40"
              >
                <Checkbox checked={selected.includes(s.id)} onCheckedChange={() => toggle(s.id)} />
                <span className="font-medium">Sprint {s.sprint_number}</span>
                <span className="text-muted-foreground">
                  {formatDateCL(s.start_date)} — {formatDateCL(s.end_date)}
                </span>
              </label>
            ))}
          </div>

          <label className="flex items-start gap-2 mt-3 text-xs cursor-pointer">
            <Checkbox
              checked={includeBacklog}
              onCheckedChange={(v) => setIncludeBacklog(v === true)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Incluir backlog</span>
              <span className="block text-muted-foreground">
                Muestra las tareas del proyecto que aún no están asignadas a un sprint (por
                definir).
              </span>
            </span>
          </label>

          <div className="flex items-center gap-2 mt-2">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSelected([])}>
              Todos
            </Button>
            <div className="flex-1" />
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
              Crear enlace
            </Button>
          </div>
        </div>

        <div className="space-y-2 max-h-56 overflow-auto">
          {tokensQ.data?.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-3">
              Aún no hay informes compartidos.
            </div>
          )}
          {tokensQ.data?.map((t) => {
            const cfg = (t.config ?? {}) as {
              sprintIds?: string[];
              includeBacklog?: boolean;
            };
            const count = cfg.sprintIds?.length ?? 0;
            return (
              <div
                key={t.id}
                className="flex items-center gap-2 rounded border border-border p-2 text-xs"
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate font-mono">{urlOf(t.token)}</div>
                  <div className="text-muted-foreground">
                    {count === 0 ? "Todos los sprints" : `${count} sprint(s)`}
                    {cfg.includeBacklog ? " + backlog" : ""} · Creado {formatDateCL(t.created_at)}
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => copy(t.token)}>
                  <Copy className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => revokeMut.mutate(t.id)}
                  disabled={revokeMut.isPending}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
