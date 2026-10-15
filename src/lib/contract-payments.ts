// Lógica pura para generar el calendario de cuotas de un contrato (sin acceso a la BD).

export type ServiceLine = {
  id: string;
  tipo_servicio: string | null;
  frecuencia: string;
  numero_cuotas: number | null;
  monto: number | string | null;
  moneda: string | null;
  es_bono: boolean | null;
  fecha_primer_pago: string | null;
};

export type PaymentRow = {
  contract_id: string;
  service_line_id: string;
  kind: "monthly" | "custom";
  amount: number;
  currency: string;
  due_date: string;
  status: "scheduled";
  period_label: string;
  notes: string | null;
};

export type KeptPayment = { service_line_id: string | null; due_date: string };

const MONTHS_STEP: Record<string, number> = { mensual: 1, trimestral: 3, semestral: 6, anual: 12 };

/** Suma `n` meses a una fecha ISO, respetando el día de facturación y el fin de mes. */
export function addMonths(iso: string, n: number, billingDay?: number | null): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = billingDay ?? d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

export function monthsBetween(start?: string | null, end?: string | null): number {
  if (!start || !end) return 1;
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  return Math.max(
    1,
    (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth()) + 1,
  );
}

export function buildPaymentRows(input: {
  contractId: string;
  currency: string;
  baseDate: string;
  startDate?: string | null;
  endDate?: string | null;
  billingDay?: number | null;
  lines: ServiceLine[];
}): PaymentRow[] {
  const rows: PaymentRow[] = [];
  const totalMonths = monthsBetween(input.startDate, input.endDate);
  for (const l of input.lines) {
    if (l.frecuencia === "hitos" || l.es_bono) continue;
    const amount = Number(l.monto ?? 0);
    if (!amount) continue;
    const first = l.fecha_primer_pago ?? input.baseDate;
    const currency = l.moneda ?? input.currency;
    if (l.frecuencia === "unica") {
      rows.push({
        contract_id: input.contractId,
        service_line_id: l.id,
        kind: "custom",
        amount,
        currency,
        due_date: first,
        status: "scheduled",
        period_label: "Pago único",
        notes: l.tipo_servicio,
      });
      continue;
    }
    const step = MONTHS_STEP[l.frecuencia] ?? 1;
    const count = l.numero_cuotas ?? Math.max(1, Math.round(totalMonths / step));
    for (let i = 0; i < count; i++) {
      rows.push({
        contract_id: input.contractId,
        service_line_id: l.id,
        kind: "monthly",
        amount,
        currency,
        due_date: addMonths(first, i * step, input.billingDay),
        status: "scheduled",
        period_label: `Cuota ${i + 1}/${count}`,
        notes: l.tipo_servicio,
      });
    }
  }
  return rows;
}

/**
 * Descarta las cuotas que ya existen (facturadas, pagadas, etc.): por misma línea y fecha, o,
 * si la fecha se movió, por cantidad de cuotas conservadas de esa línea.
 */
export function filterAgainstKept(rows: PaymentRow[], kept: KeptPayment[]): PaymentRow[] {
  const rowKeys = new Set(rows.map((r) => `${r.service_line_id}|${r.due_date}`));
  // Cuotas conservadas que coinciden por línea y fecha con una fila nueva.
  const matched = new Set<string>();
  // Cuotas conservadas cuya fecha se movió: se descuentan por cantidad, por línea.
  const movedByLine = new Map<string, number>();
  for (const k of kept) {
    const key = `${k.service_line_id ?? ""}|${k.due_date}`;
    if (rowKeys.has(key)) {
      matched.add(key);
    } else if (k.service_line_id) {
      movedByLine.set(k.service_line_id, (movedByLine.get(k.service_line_id) ?? 0) + 1);
    }
  }
  const skipByLine = new Map<string, number>();
  return rows.filter((r) => {
    if (matched.has(`${r.service_line_id}|${r.due_date}`)) return false;
    const remaining = movedByLine.get(r.service_line_id) ?? 0;
    const used = skipByLine.get(r.service_line_id) ?? 0;
    if (used < remaining) {
      skipByLine.set(r.service_line_id, used + 1);
      return false;
    }
    return true;
  });
}
