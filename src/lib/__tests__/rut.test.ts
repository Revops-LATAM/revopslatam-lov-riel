import { describe, expect, it } from "vitest";
import { cleanRut, computeDv, formatRut, isValidRut } from "../rut";

describe("rut", () => {
  it("limpia puntos, guiones y espacios", () => {
    expect(cleanRut("12.345.678-5")).toBe("123456785");
    expect(cleanRut(" 7.654.321-k ")).toBe("7654321K");
  });

  it("formatea con puntos y guion", () => {
    expect(formatRut("123456785")).toBe("12.345.678-5");
  });

  it("calcula el dígito verificador", () => {
    expect(computeDv("12345678")).toBe("5");
    expect(computeDv("7654321")).toBe("6");
  });

  it("valida RUT correctos e incorrectos", () => {
    expect(isValidRut("12.345.678-5")).toBe(true);
    expect(isValidRut("12.345.678-9")).toBe(false);
    expect(isValidRut("")).toBe(false);
    expect(isValidRut("a")).toBe(false);
  });
});
