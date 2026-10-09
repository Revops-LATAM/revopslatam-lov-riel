import { addDays, format, getISOWeek, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";

export const ZOOMS = ["day", "week", "month"] as const;
export type Zoom = (typeof ZOOMS)[number];

export type WindowColumn = {
  key: string;
  label: string;
  sublabel: string;
  rangeStart: string;
  rangeEnd: string;
  days: string[];
  isToday: boolean;
};

export type WindowSpec = {
  start: Date;
  end: Date;
  totalDays: number;
  columns: WindowColumn[];
};

/**
 * Build a scrollable time window (day/week/month zoom) starting on the ISO
 * Monday of the anchor. Shared between Workload and Mi tiempo.
 */
export function buildWindow(anchor: Date, zoom: Zoom): WindowSpec {
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const todayKey = format(new Date(), "yyyy-MM-dd");
  if (zoom === "day") {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const columns: WindowColumn[] = days.map((d) => {
      const k = format(d, "yyyy-MM-dd");
      return {
        key: k,
        label: format(d, "EEE", { locale: es }),
        sublabel: format(d, "dd/MM", { locale: es }),
        rangeStart: k,
        rangeEnd: k,
        days: [k],
        isToday: k === todayKey,
      };
    });
    return { start: weekStart, end: addDays(weekStart, 6), totalDays: 7, columns };
  }
  if (zoom === "week") {
    const columns: WindowColumn[] = Array.from({ length: 4 }, (_, i) => {
      const colStart = addDays(weekStart, i * 7);
      const colEnd = addDays(colStart, 6);
      const startK = format(colStart, "yyyy-MM-dd");
      const endK = format(colEnd, "yyyy-MM-dd");
      const days = Array.from({ length: 7 }, (_, j) => format(addDays(colStart, j), "yyyy-MM-dd"));
      return {
        key: startK,
        label: `S${getISOWeek(colStart)}`,
        sublabel: `${format(colStart, "dd/MM", { locale: es })} – ${format(colEnd, "dd/MM", { locale: es })}`,
        rangeStart: startK,
        rangeEnd: endK,
        days,
        isToday: days.includes(todayKey),
      };
    });
    return { start: weekStart, end: addDays(weekStart, 27), totalDays: 28, columns };
  }
  const columns: WindowColumn[] = Array.from({ length: 8 }, (_, i) => {
    const colStart = addDays(weekStart, i * 7);
    const colEnd = addDays(colStart, 6);
    const startK = format(colStart, "yyyy-MM-dd");
    const endK = format(colEnd, "yyyy-MM-dd");
    const days = Array.from({ length: 7 }, (_, j) => format(addDays(colStart, j), "yyyy-MM-dd"));
    return {
      key: startK,
      label: `S${getISOWeek(colStart)}`,
      sublabel: format(colStart, "dd/MM", { locale: es }),
      rangeStart: startK,
      rangeEnd: endK,
      days,
      isToday: days.includes(todayKey),
    };
  });
  return { start: weekStart, end: addDays(weekStart, 55), totalDays: 56, columns };
}
