import { Timer } from "lucide-react";

/**
 * Compact "estimate vs logged" chip for cards/rows.
 * - Verde si está dentro del estimado o si no hay log aún.
 * - Naranja si pasó el 80%.
 * - Rojo si pasó el estimado.
 */
export function EstimateChip({
  estimate,
  logged,
  size = "sm",
}: {
  estimate: number;
  logged: number;
  size?: "sm" | "xs";
}) {
  if (estimate <= 0 && logged <= 0) return null;
  const pct = estimate > 0 ? (logged / estimate) * 100 : logged > 0 ? 999 : 0;
  let tone = "text-muted-foreground bg-muted/40";
  if (estimate > 0 && pct > 100) tone = "text-destructive bg-destructive/10";
  else if (estimate > 0 && pct >= 80) tone = "text-status-in-progress bg-status-in-progress/10";
  else if (logged > 0) tone = "text-status-done bg-status-done/10";

  const fmt = (h: number) => (Math.round(h * 10) / 10).toString().replace(/\.0$/, "");

  return (
    <span
      className={`inline-flex items-center gap-1 rounded ${tone} ${
        size === "xs" ? "text-[10px] px-1 py-0" : "text-[11px] px-1.5 py-0.5"
      }`}
      title={
        estimate > 0
          ? `${fmt(logged)}h logueadas de ${fmt(estimate)}h estimadas`
          : `${fmt(logged)}h logueadas (sin estimado)`
      }
    >
      <Timer className={size === "xs" ? "w-2.5 h-2.5" : "w-3 h-3"} />
      <span className="tabular-nums">
        {fmt(logged)}h{estimate > 0 ? ` / ${fmt(estimate)}h` : ""}
      </span>
    </span>
  );
}
