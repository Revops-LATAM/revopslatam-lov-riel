import { FileText, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MONTH_NAMES } from "./constants";

export function EmptyGrilla({
  month, year, onGenerate, onCreate,
}: {
  month: number; year: number; onGenerate: () => void; onCreate: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div
        className="w-16 h-20 rounded-lg border-2 border-dashed mb-4 flex items-center justify-center"
        style={{ borderColor: "var(--border-strong)" }}
      >
        <FileText className="w-6 h-6 text-muted-foreground/60" />
      </div>
      <div className="text-base font-semibold text-foreground">
        {MONTH_NAMES[month - 1]} {year} aún no tiene piezas
      </div>
      <div className="text-xs text-muted-foreground mt-1 max-w-sm">
        Generá el mes desde una plantilla de cadencia o creá una pieza a mano.
      </div>
      <div className="flex items-center gap-2 mt-5">
        <Button size="sm" variant="outline" onClick={onGenerate}>
          <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generar mes
        </Button>
        <Button size="sm" onClick={onCreate}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Nueva pieza
        </Button>
      </div>
    </div>
  );
}
