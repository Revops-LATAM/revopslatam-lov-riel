import { describe, expect, it } from "vitest";
import { addMonths, buildPaymentRows, filterAgainstKept } from "../contract-payments";

const line = (over: Record<string, unknown> = {}) => ({
  id: "L1",
  tipo_servicio: "Soporte",
  frecuencia: "mensual",
  numero_cuotas: 3,
  monto: 100,
  moneda: "USD",
  es_bono: false,
  fecha_primer_pago: null,
  ...over,
});
const base = { contractId: "C1", currency: "USD", baseDate: "2026-01-31" };

describe("addMonths", () => {
  it("ajusta al último día del mes", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 2)).toBe("2026-03-31");
  });
  it("respeta el día de facturación", () => {
    expect(addMonths("2026-01-05", 2, 15)).toBe("2026-03-15");
  });
});

describe("buildPaymentRows", () => {
  it("genera N cuotas mensuales", () => {
    const rows = buildPaymentRows({ ...base, lines: [line()] });
    expect(rows.map((r) => r.due_date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(rows[0].period_label).toBe("Cuota 1/3");
  });
  it("omite hitos, bonos y montos en cero", () => {
    const rows = buildPaymentRows({
      ...base,
      lines: [line({ frecuencia: "hitos" }), line({ es_bono: true }), line({ monto: 0 })],
    });
    expect(rows).toHaveLength(0);
  });
  it("genera un pago único", () => {
    const rows = buildPaymentRows({ ...base, lines: [line({ frecuencia: "unica" })] });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("custom");
  });
  it("calcula cuotas por duración si no hay número de cuotas", () => {
    const rows = buildPaymentRows({
      ...base,
      startDate: "2026-01-01",
      endDate: "2026-06-30",
      lines: [line({ numero_cuotas: null, frecuencia: "trimestral" })],
    });
    expect(rows).toHaveLength(2);
  });
});

describe("filterAgainstKept (idempotencia)", () => {
  const rows = buildPaymentRows({ ...base, lines: [line()] });
  it("no duplica cuotas ya facturadas por misma fecha", () => {
    const out = filterAgainstKept(rows, [{ service_line_id: "L1", due_date: "2026-01-31" }]);
    expect(out).toHaveLength(2);
  });
  it("no duplica aunque la fecha se haya movido", () => {
    const out = filterAgainstKept(rows, [{ service_line_id: "L1", due_date: "2026-01-15" }]);
    expect(out).toHaveLength(2);
  });
  it("regenerar dos veces seguidas no crea cuotas nuevas", () => {
    const kept = rows.map((r) => ({ service_line_id: r.service_line_id, due_date: r.due_date }));
    expect(filterAgainstKept(rows, kept)).toHaveLength(0);
  });
});
