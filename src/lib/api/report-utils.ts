/** Pure helpers shared by report server functions. */

export function expandDays(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00Z");
  const endD = new Date(end + "T00:00:00Z");
  while (d.getTime() <= endD.getTime()) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Calendar span minus weekends; falls back to the raw span for weekend-only ranges. */
export function expandWorkDays(start: string, end: string): string[] {
  const all = expandDays(start, end);
  const work = all.filter((d) => {
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    return dow !== 0 && dow !== 6;
  });
  return work.length > 0 ? work : all;
}

export function chunk<T>(arr: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type StatusJoin = { category?: string | null };

export function statusCategory(task: {
  status?: string | null;
  task_statuses?: StatusJoin | StatusJoin[] | null;
}): string {
  const joined = Array.isArray(task.task_statuses) ? task.task_statuses[0] : task.task_statuses;
  if (joined?.category) return joined.category;
  if (task.status === "completada") return "completada";
  if (task.status === "cancelada") return "cancelada";
  if (task.status === "en_curso") return "en_progreso";
  if (task.status === "en_pausa") return "bloqueada";
  return "abierta";
}

/**
 * Hours of a task that fall inside [from, to], prorated over business days
 * of the task span. Mirrors the workload module so numbers stay consistent.
 */
export function proratedHoursInRange(
  totalHours: number,
  start: string | null,
  end: string | null,
  from: string,
  to: string,
): number {
  if (!totalHours || totalHours <= 0) return 0;
  const s = start ?? end;
  const e = end ?? start;
  if (!s || !e) return 0;
  const span = expandWorkDays(s < e ? s : e, s < e ? e : s);
  if (span.length === 0) return 0;
  const inside = span.filter((d) => d >= from && d <= to).length;
  if (inside === 0) return 0;
  return (totalHours / span.length) * inside;
}
