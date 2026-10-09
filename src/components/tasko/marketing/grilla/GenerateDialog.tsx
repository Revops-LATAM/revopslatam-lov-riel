import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateMonthlyGrid } from "@/lib/api/grilla.functions";
import { MONTH_NAMES } from "./constants";

export function GenerateDialog({
  workspaceId,
  year,
  month,
  templates,
  onClose,
  onDone,
}: {
  workspaceId: string;
  year: number;
  month: number;
  templates: { id: string; name: string; is_default: boolean }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const genFn = useServerFn(generateMonthlyGrid);
  const [templateId, setTemplateId] = useState<string>(
    templates.find((t) => t.is_default)?.id ?? templates[0]?.id ?? "",
  );
  const [mode, setMode] = useState<"additive" | "replace_drafts" | "block_if_exists">("additive");
  const mut = useMutation({
    mutationFn: genFn,
    onSuccess: (res) => {
      toast.success(
        `Generación: ${res.created} creadas, ${res.skipped} omitidas, ${res.replaced} reemplazadas`,
      );
      onDone();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Generar {MONTH_NAMES[month - 1]} {year}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {templates.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No hay plantillas de cadencia. Crea una en <b>Marketing → Plantillas de cadencia</b>.
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs text-muted-foreground">Plantilla</label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                        {t.is_default ? " (por defecto)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Modo</label>
                <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="additive">Aditivo (solo rellena huecos)</SelectItem>
                    <SelectItem value="replace_drafts">
                      Reemplazar borradores (Idea/Copy)
                    </SelectItem>
                    <SelectItem value="block_if_exists">Bloquear si ya hay piezas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!templateId || mut.isPending}
            onClick={() => mut.mutate({ data: { workspaceId, year, month, templateId, mode } })}
          >
            {mut.isPending ? "Generando…" : "Generar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
