/**
 * Compute SLA target dates from now.
 *
 * Business hours = lun-vie 9:00-18:00 hora local del servidor.
 * Cuando `holidays` se entrega (Set<"YYYY-MM-DD"> en hora local), esos días
 * se saltan completos como sábado/domingo.
 */
export function computeSlaTargets(
  nowIso: string,
  responseMinutes: number,
  resolutionMinutes: number,
  businessHours: boolean,
  holidays?: ReadonlySet<string>,
): { response: string; resolution: string } {
  const now = new Date(nowIso);
  return {
    response: addMinutes(now, responseMinutes, businessHours, holidays).toISOString(),
    resolution: addMinutes(now, resolutionMinutes, businessHours, holidays).toISOString(),
  };
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addMinutes(
  from: Date,
  minutes: number,
  businessHours: boolean,
  holidays?: ReadonlySet<string>,
): Date {
  if (!businessHours) return new Date(from.getTime() + minutes * 60_000);
  const cur = new Date(from);
  let remaining = minutes;
  let guard = 0;
  while (remaining > 0 && guard++ < 5000) {
    const day = cur.getDay();
    const isWeekend = day === 0 || day === 6;
    const isHoliday = holidays?.has(ymd(cur)) ?? false;
    if (isWeekend || isHoliday) {
      // Skip to next day at 9:00
      cur.setDate(cur.getDate() + 1);
      cur.setHours(9, 0, 0, 0);
      continue;
    }
    const h = cur.getHours() + cur.getMinutes() / 60;
    if (h < 9) {
      cur.setHours(9, 0, 0, 0);
      continue;
    }
    if (h >= 18) {
      cur.setDate(cur.getDate() + 1);
      cur.setHours(9, 0, 0, 0);
      continue;
    }
    const endOfDay = new Date(cur);
    endOfDay.setHours(18, 0, 0, 0);
    const minsAvail = (endOfDay.getTime() - cur.getTime()) / 60_000;
    const take = Math.min(minsAvail, remaining);
    cur.setTime(cur.getTime() + take * 60_000);
    remaining -= take;
  }
  return cur;
}
