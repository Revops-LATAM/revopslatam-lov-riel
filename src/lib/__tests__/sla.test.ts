import { describe, expect, it } from "vitest";
import { computeSlaTargets } from "../sla";

describe("computeSlaTargets", () => {
  it("suma minutos corridos cuando no hay horario hábil", () => {
    const r = computeSlaTargets("2026-01-05T10:00:00", 60, 120, false);
    expect(new Date(r.response).getTime() - new Date("2026-01-05T10:00:00").getTime()).toBe(
      60 * 60_000,
    );
    expect(new Date(r.resolution).getTime() - new Date("2026-01-05T10:00:00").getTime()).toBe(
      120 * 60_000,
    );
  });

  it("en horario hábil salta el fin de semana", () => {
    // viernes 2026-01-09 17:00 + 120 min => lunes 2026-01-12 10:00 (local)
    const r = computeSlaTargets("2026-01-09T17:00:00", 120, 120, true);
    const d = new Date(r.response);
    expect(d.getDay()).toBe(1);
    expect(d.getHours()).toBe(10);
  });

  it("salta los feriados indicados", () => {
    const r = computeSlaTargets("2026-01-05T17:00:00", 120, 120, true, new Set(["2026-01-06"]));
    const d = new Date(r.response);
    expect(d.getDate()).toBe(7);
    expect(d.getHours()).toBe(10);
  });
});
