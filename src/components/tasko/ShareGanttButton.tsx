import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createGanttShareToken,
  listGanttShareTokens,
  revokeGanttShareToken,
} from "@/lib/api/gantt-share.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Copy, Share2, Trash2 } from "lucide-react";
import { format } from "date-fns";

export function ShareGanttButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Share2 className="w-4 h-4 mr-1.5" />
        Compartir
      </Button>
      {open && (
        <ShareGanttDialog projectId={projectId} open={open} onOpenChange={setOpen} />
      )}
    </>
  );
}

function ShareGanttDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listGanttShareTokens);
  const createFn = useServerFn(createGanttShareToken);
  const revokeFn = useServerFn(revokeGanttShareToken);
  const [expiresInDays, setExpiresInDays] = useState<string>("30");

  const q = useQuery({
    queryKey: ["gantt-share-tokens", projectId],
    queryFn: () => listFn({ data: { projectId } }),
    enabled: open,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          projectId,
          expiresInDays: expiresInDays ? Number(expiresInDays) || null : null,
        },
      }),
    onSuccess: async (row) => {
      await qc.invalidateQueries({ queryKey: ["gantt-share-tokens", projectId] });
      const url = `${window.location.origin}/gantt/${row.token}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Enlace creado y copiado al portapapeles");
      } catch {
        toast.success("Enlace creado");
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gantt-share-tokens", projectId] });
      toast.success("Enlace revocado");
    },
  });

  const copy = async (token: string) => {
    const url = `${window.location.origin}/gantt/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Compartir vista Gantt</DialogTitle>
          <DialogDescription>
            Genera un enlace público de solo lectura para compartir la Gantt con clientes o
            personas externas.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="expires" className="text-xs">
              Expira en (días, vacío = nunca)
            </Label>
            <Input
              id="expires"
              type="number"
              min="0"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
            />
          </div>
          <Button
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
          >
            Crear enlace
          </Button>
        </div>

        <div className="space-y-2 max-h-64 overflow-auto">
          {q.data?.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">
              Aún no hay enlaces activos.
            </div>
          )}
          {q.data?.map((t) => {
            const url = `${typeof window !== "undefined" ? window.location.origin : ""}/gantt/${t.token}`;
            const expired = t.expires_at && new Date(t.expires_at) < new Date();
            return (
              <div
                key={t.id}
                className="flex items-center gap-2 rounded border border-border p-2 text-xs"
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate font-mono">{url}</div>
                  <div className="text-muted-foreground">
                    Creado {format(new Date(t.created_at), "dd/MM/yyyy")}
                    {t.expires_at
                      ? ` · ${expired ? "Expirado" : "Expira"} ${format(new Date(t.expires_at), "dd/MM/yyyy")}`
                      : " · Sin expiración"}
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
