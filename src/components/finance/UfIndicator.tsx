import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Info, RefreshCw } from "lucide-react";
import { latestUfRateQO } from "@/lib/api/tasko.queries";
import { refreshUfRates } from "@/lib/api/finance.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function formatCLP(n: number) {
  return n.toLocaleString("es-CL", { maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return null;
  }
}

export function UfIndicator({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const { data: uf } = useQuery(latestUfRateQO(workspaceId));
  const refreshFn = useServerFn(refreshUfRates);
  const mut = useMutation({
    mutationFn: () => refreshFn({ data: { workspaceId } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(`UF actualizada · ${res.count} valores`);
        qc.invalidateQueries({ queryKey: ["latest-uf-rate", workspaceId] });
        // Refrescar listas que dependen de la UF (alineado con las keys reales).
        qc.invalidateQueries({ queryKey: ["ws-payments", workspaceId] });
        qc.invalidateQueries({ queryKey: ["finance-dashboard", workspaceId] });
        qc.invalidateQueries({ queryKey: ["invoices", workspaceId] });
      } else {
        toast.error(res.error ?? "No se pudo actualizar la UF");
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error al actualizar UF"),
  });

  const updatedTxt = fmtTime(uf?.updatedAt);

  return (
    <div className="inline-flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 border border-border/50 rounded-lg px-3 py-1.5">
      <Info className="h-3.5 w-3.5" />
      {uf ? (
        <>
          <span>
            UF referencia: <strong className="text-foreground">${formatCLP(uf.valor)}</strong>
            <span className="ml-1 text-muted-foreground/80">({fmtDate(uf.fecha)})</span>
          </span>
          {updatedTxt ? (
            <span className="text-muted-foreground/70">· Actualizado: {updatedTxt}</span>
          ) : null}
        </>
      ) : (
        <span>Sin valor UF cargado</span>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 ml-1"
        onClick={() => mut.mutate()}
        disabled={mut.isPending}
        title="Actualizar UF desde mindicador.cl"
      >
        <RefreshCw className={`h-3 w-3 ${mut.isPending ? "animate-spin" : ""}`} />
      </Button>
    </div>
  );
}
