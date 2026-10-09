/**
 * Formato de fecha estándar Chile: dd/mm/yyyy.
 * Úsalo para todos los displays. NO usar para valores enviados a la BD
 * (ahí seguimos con ISO yyyy-MM-dd).
 */

const TZ = "America/Santiago";

function toDate(input: Date | string | number | null | undefined): Date | null {
  if (input == null || input === "") return null;
  const d = input instanceof Date ? input : new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

/** dd/mm/yyyy */
export function formatDateCL(input: Date | string | number | null | undefined, fallback = "—"): string {
  const d = toDate(input);
  if (!d) return fallback;
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TZ,
  });
}

/** dd/mm (sin año) */
export function formatDateShortCL(input: Date | string | number | null | undefined, fallback = "—"): string {
  const d = toDate(input);
  if (!d) return fallback;
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    timeZone: TZ,
  });
}

/** dd/mm/yy */
export function formatDateCompactCL(input: Date | string | number | null | undefined, fallback = "—"): string {
  const d = toDate(input);
  if (!d) return fallback;
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: TZ,
  });
}

/** dd/mm/yyyy HH:mm */
export function formatDateTimeCL(input: Date | string | number | null | undefined, fallback = "—"): string {
  const d = toDate(input);
  if (!d) return fallback;
  const date = d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TZ,
  });
  const time = d.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  });
  return `${date} ${time}`;
}

/** date-fns pattern equivalente para dd/MM/yyyy — úsalo en llamadas a date-fns/format */
export const CL_DATE_PATTERN = "dd/MM/yyyy";
export const CL_DATE_SHORT_PATTERN = "dd/MM";
export const CL_DATETIME_PATTERN = "dd/MM/yyyy HH:mm";
