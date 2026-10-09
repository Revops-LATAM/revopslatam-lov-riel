import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Clock, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listTimeEntries, createTimeEntry, deleteTimeEntry } from "@/lib/api/time.functions";

function fmtDurationMin(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function toLocalIsoInput(d: Date) {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export function PieceTimeDialog({
  pieceId,
  pieceTitle,
  onClose,
}: {
  pieceId: string;
  pieceTitle: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listTimeEntries);
  const createFn = useServerFn(createTimeEntry);
  const deleteFn = useServerFn(deleteTimeEntry);

  const key = ["piece-time-entries", pieceId];
  const entriesQ = useQuery({
    queryKey: key,
    queryFn: () => listFn({ data: { contentPieceId: pieceId } }),
  });

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const [start, setStart] = useState(toLocalIsoInput(oneHourAgo));
  const [end, setEnd] = useState(toLocalIsoInput(now));
  const [note, setNote] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          contentPieceId: pieceId,
          startedAt: new Date(start).toISOString(),
          endedAt: new Date(end).toISOString(),
          note: note.trim() || undefined,
          isBillable: false,
        },
      }),
    onSuccess: () => {
      toast.success("Tiempo registrado");
      setNote("");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Entrada eliminada");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalMin = (entriesQ.data ?? []).reduce((a, r) => a + (r.duration_minutes ?? 0), 0);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-pink-400" />
            Tiempo · {pieceTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Total registrado
            </div>
            <div className="text-lg font-semibold tabular-nums">{fmtDurationMin(totalMin)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Interno · no facturable</div>
          </div>

          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="text-xs font-semibold">Nueva entrada</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Inicio</Label>
                <Input
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Fin</Label>
                <Input
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <Textarea
              placeholder="Nota (opcional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="text-xs"
            />
            <Button
              size="sm"
              className="h-8 text-xs w-full"
              disabled={createMut.isPending || !start || !end}
              onClick={() => createMut.mutate()}
            >
              <Plus className="w-3 h-3 mr-1" /> Registrar
            </Button>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Entradas
            </div>
            <div className="space-y-1 max-h-64 overflow-auto">
              {(entriesQ.data ?? []).map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-2 rounded border border-border bg-card px-2 py-1.5 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="tabular-nums">
                      {new Date(e.started_at).toLocaleString("es-CL", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {" · "}
                      <span className="font-semibold">
                        {fmtDurationMin(e.duration_minutes ?? 0)}
                      </span>
                    </div>
                    {e.note && (
                      <div className="text-[10px] text-muted-foreground truncate">{e.note}</div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => deleteMut.mutate(e.id)}
                    disabled={deleteMut.isPending}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              {entriesQ.data && entriesQ.data.length === 0 && (
                <div className="text-[11px] text-muted-foreground text-center py-4">
                  Sin entradas todavía
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
