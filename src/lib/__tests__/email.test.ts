import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResendError, sendViaResend } from "../email/resend.server";
import { verifySvixSignature } from "../email/svix";

const email = { from: "a@x.cl", to: "b@y.cl", subject: "Hola", html: "<p>Hola</p>" };
const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("sendViaResend", () => {
  beforeEach(() => vi.stubEnv("RESEND_API_KEY", "re_test"));
  afterEach(() => vi.unstubAllEnvs());

  it("envía con el token y la clave de idempotencia", async () => {
    const f = vi.fn().mockResolvedValue(res(200, { id: "abc" }));
    const out = await sendViaResend(email, { idempotencyKey: "k1", fetchImpl: f });
    expect(out.id).toBe("abc");
    const [, init] = f.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer re_test");
    expect(init.headers["Idempotency-Key"]).toBe("k1");
  });

  it("reintenta ante 429 y luego tiene éxito", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(res(429, { message: "rate" }))
      .mockResolvedValueOnce(res(200, { id: "ok" }));
    const out = await sendViaResend(email, { fetchImpl: f, backoffMs: 0 });
    expect(out.id).toBe("ok");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("no reintenta ante un 4xx permanente", async () => {
    const f = vi.fn().mockResolvedValue(res(422, { message: "bad" }));
    await expect(sendViaResend(email, { fetchImpl: f, backoffMs: 0 })).rejects.toMatchObject({
      status: 422,
      retryable: false,
    });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("falla tras 3 intentos con errores 5xx", async () => {
    const f = vi.fn().mockResolvedValue(res(503, { message: "down" }));
    await expect(sendViaResend(email, { fetchImpl: f, backoffMs: 0 })).rejects.toBeInstanceOf(
      ResendError,
    );
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("falla sin RESEND_API_KEY", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendViaResend(email, { fetchImpl: vi.fn() })).rejects.toThrow(/RESEND_API_KEY/);
  });
});

describe("verifySvixSignature", () => {
  const secret = "whsec_" + btoa("secreto-de-prueba");
  const sign = async (id: string, ts: string, body: string) => {
    const key = await crypto.subtle.importKey(
      "raw",
      Uint8Array.from(atob(btoa("secreto-de-prueba")), (c) => c.charCodeAt(0)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)),
    );
    return "v1," + btoa(String.fromCharCode(...sig));
  };
  const now = 1_800_000_000;

  it("acepta una firma válida", async () => {
    const sig = await sign("msg_1", String(now), "{}");
    expect(
      await verifySvixSignature({
        secret,
        id: "msg_1",
        timestamp: String(now),
        signatureHeader: sig,
        body: "{}",
        nowSeconds: now,
      }),
    ).toBe(true);
  });

  it("rechaza cuerpo alterado, firma ajena y marcas de tiempo viejas", async () => {
    const sig = await sign("msg_1", String(now), "{}");
    const base = { secret, id: "msg_1", timestamp: String(now), nowSeconds: now };
    expect(await verifySvixSignature({ ...base, signatureHeader: sig, body: '{"x":1}' })).toBe(
      false,
    );
    expect(await verifySvixSignature({ ...base, signatureHeader: "v1,AAAA", body: "{}" })).toBe(
      false,
    );
    expect(
      await verifySvixSignature({
        ...base,
        signatureHeader: sig,
        body: "{}",
        nowSeconds: now + 3600,
      }),
    ).toBe(false);
    expect(await verifySvixSignature({ ...base, id: null, signatureHeader: sig, body: "{}" })).toBe(
      false,
    );
  });
});
