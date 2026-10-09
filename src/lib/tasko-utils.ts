/**
 * Returns a semantic "tone" for a task's due date, taking status into account.
 * Tasks already done or cancelled never appear urgent.
 */
export type DueTone = "overdue" | "today" | "soon" | "future" | "none";

export function dueTone(due: string | null | undefined, status?: string): DueTone {
  if (!due) return "none";
  if (status === "completada" || status === "cancelada") return "none";
  const today = new Date();
  const t = today.toISOString().slice(0, 10);
  if (due < t) return "overdue";
  if (due === t) return "today";
  // within 2 days → soon
  const d = new Date(due + "T00:00:00");
  const diff = (d.getTime() - new Date(t + "T00:00:00").getTime()) / 86400000;
  if (diff <= 2) return "soon";
  return "none";
}

/**
 * Riel DS: regla única para color de fecha.
 * - overdue → --st-red-text
 * - today | soon (≤2d) → --st-amber-text
 * - resto → --foreground (sin color de urgencia)
 */
export function dueToneClass(tone: DueTone): string {
  switch (tone) {
    case "overdue":
      return "text-[color:var(--st-red-text)]";
    case "today":
    case "soon":
      return "text-[color:var(--st-amber-text)]";
    default:
      return "text-foreground";
  }
}

/** Format an ISO date as dd/mm (Chile). */
export function formatDueShort(due: string): string {
  try {
    const d = new Date(due + "T00:00:00");
    return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" });
  } catch {
    return due;
  }
}

/**
 * Formats an amount with locale es-CL (dot thousands, comma decimals) and
 * prepends the currency code: "UF", "CLP" or "USD".
 * - UF: shows 2 decimals (comma).
 * - CLP / USD / others: no decimals.
 */
export function formatMoney(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  const cur = (currency ?? "CLP").toUpperCase();
  if (amount == null || Number.isNaN(Number(amount))) return `${cur} —`;
  const n = Number(amount);
  const isUF = cur === "UF";
  const formatted = new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: isUF ? 2 : 0,
    maximumFractionDigits: isUF ? 2 : 0,
  }).format(n);
  return `${cur} ${formatted}`;
}

