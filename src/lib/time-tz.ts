// Timezone helpers used by workload / my-time / reports.
// Centraliza la lógica de "qué día (YYYY-MM-DD) le corresponde a un instante en la TZ del workspace".

import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { addDays } from "date-fns";

export function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** YYYY-MM-DD del instante en la TZ dada. */
export function dayInTz(instant: string | Date, tz: string): string {
  return formatInTimeZone(instant, tz, "yyyy-MM-dd");
}

/** Lista de YYYY-MM-DD desde from hasta to (ambos inclusive), en orden. */
export function eachDayStr(from: string, to: string): string[] {
  const out: string[] = [];
  // Trabajamos en UTC para iterar fechas como strings sin shifts.
  const start = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  const d = new Date(start);
  while (d.getTime() <= end.getTime()) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Devuelve [startISO, endISO] = los bordes del día YYYY-MM-DD en la TZ dada, en ISO UTC. */
export function dayBoundsInTz(day: string, tz: string): { startUtc: string; endUtc: string } {
  // Construimos el instante "local 00:00" en TZ y lo expresamos como UTC.
  const localMidnight = new Date(`${day}T00:00:00`);
  const asUtc = toZonedTime(localMidnight, tz);
  // toZonedTime convierte UTC→TZ, pero acá necesitamos al revés.
  // Mejor: usar Intl con offset.
  const startUtc = utcFromTzWall(day, "00:00:00", tz);
  const endUtc = utcFromTzWall(day, "23:59:59.999", tz);
  void asUtc;
  return { startUtc, endUtc };
}

/** Convierte un "wall time" YYYY-MM-DD + HH:MM:SS de una TZ a ISO UTC. */
export function utcFromTzWall(day: string, time: string, tz: string): string {
  // Estrategia: armar un Date asumiendo UTC, luego ajustarle el offset que la TZ tiene en ese instante.
  const asIfUtc = new Date(`${day}T${time}Z`);
  // Calculamos el offset que esa TZ aplica en ese momento:
  const tzPartsStr = formatInTimeZone(asIfUtc, tz, "XXX"); // ej "-03:00" o "Z" para UTC
  let offsetMin = 0;
  if (tzPartsStr && tzPartsStr !== "Z") {
    const sign = tzPartsStr.startsWith("-") ? -1 : 1;
    const [hh, mm] = tzPartsStr.replace(/[+\-]/, "").split(":").map(Number);
    offsetMin = sign * ((hh || 0) * 60 + (mm || 0));
  }
  // Restar el offset para obtener UTC real.
  return new Date(asIfUtc.getTime() - offsetMin * 60000).toISOString();
}

/** Día de la semana 0..6 con Lunes=0 según la TZ del workspace. */
export function weekdayMondayBased(day: string, tz: string): number {
  const name = formatInTimeZone(new Date(day + "T12:00:00Z"), tz, "i"); // 1=Mon..7=Sun
  return (parseInt(name, 10) - 1) % 7;
}

/** Devuelve los 7 días YYYY-MM-DD a partir del lunes weekStart. */
export function weekDays(weekStart: string): string[] {
  const out: string[] = [];
  const base = new Date(weekStart + "T00:00:00Z");
  for (let i = 0; i < 7; i++) {
    out.push(addDays(base, i).toISOString().slice(0, 10));
  }
  return out;
}
