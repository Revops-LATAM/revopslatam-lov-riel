import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";

const COLOR_SWATCHES = [
  "#ec4899",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#64748b",
];

export type MarketingPhaseFormValue = {
  name: string;
  color: string | null;
  startDate: string | null;
  endDate: string | null;
  ownerId: string | null;
};

export function MarketingPhaseDialog({
  open,
  initial,
  members,
  onClose,
  onSave,
  onDelete,
  saving,
}: {
  open: boolean;
  initial: (Partial<MarketingPhaseFormValue> & { id?: string }) | null;
  members: Array<{ user_id: string; profile: { id: string; full_name?: string | null; email?: string | null } | null }>;
  onClose: () => void;
  onSave: (v: MarketingPhaseFormValue) => void;
  onDelete?: () => void;
  saving?: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState<string | null>(initial?.color ?? COLOR_SWATCHES[0]);
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [ownerId, setOwnerId] = useState<string>(initial?.ownerId ?? "_none");

  const isEdit = !!initial?.id;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {isEdit ? "Editar fase" : "Nueva fase"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Nombre
            </Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Discovery, Producción, Publicación…"
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Color
            </Label>
            <div className="flex gap-1.5 mt-1">
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${
                    color === c ? "border-foreground scale-110" : "border-transparent"
                  }`}
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Inicio
              </Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Fin
              </Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Responsable
            </Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none" className="text-xs">
                  Sin responsable
                </SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id} className="text-xs">
                    {m.profile?.full_name ?? m.profile?.email ?? m.user_id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
          {isEdit && onDelete ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="w-3 h-3 mr-1" /> Eliminar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={saving || !name.trim()}
              onClick={() =>
                onSave({
                  name: name.trim(),
                  color,
                  startDate: startDate || null,
                  endDate: endDate || null,
                  ownerId: ownerId === "_none" ? null : ownerId,
                })
              }
            >
              {saving ? "Guardando…" : isEdit ? "Guardar" : "Crear"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
