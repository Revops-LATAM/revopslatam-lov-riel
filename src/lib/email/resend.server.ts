// Cliente mínimo de la API de Resend (https://resend.com/docs/api-reference/emails/send-email).
// Solo servidor. Lee RESEND_API_KEY en cada llamada (en Cloudflare Workers el entorno se enlaza
// por petición, no al cargar el módulo).

const RESEND_URL = "https://api.resend.com/emails";
const MAX_ATTEMPTS = 3;

export interface ResendEmail {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  cc?: string[];
  bcc?: string[];
  reply_to?: string;
  headers?: Record<string, string>;
  attachments?: Array<{ filename: string; content: string }>;
}

export class ResendError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ResendError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Envía un correo. Reintenta ante 429, 5xx y errores de red (hasta 3 intentos, con espera
 * creciente). La `idempotencyKey` evita duplicados si un reintento llega después de un éxito
 * que no alcanzamos a ver.
 */
export async function sendViaResend(
  email: ResendEmail,
  opts: { idempotencyKey?: string; fetchImpl?: typeof fetch; backoffMs?: number } = {},
): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new ResendError("RESEND_API_KEY no está configurada", 500, false);
  const doFetch = opts.fetchImpl ?? fetch;
  const backoff = opts.backoffMs ?? 1000;

  let lastError: ResendError | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const resp = await doFetch(RESEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
        },
        body: JSON.stringify(email),
      });
      const raw = await resp.text();
      if (resp.ok) {
        const parsed = JSON.parse(raw || "{}") as { id?: string };
        if (!parsed.id) throw new ResendError("Resend no devolvió un id", resp.status, false);
        return { id: parsed.id };
      }
      const retryable = resp.status === 429 || resp.status >= 500;
      lastError = new ResendError(
        `Resend ${resp.status}: ${raw.slice(0, 300)}`,
        resp.status,
        retryable,
      );
      if (!retryable) throw lastError;
    } catch (e) {
      if (e instanceof ResendError && !e.retryable) throw e;
      lastError =
        e instanceof ResendError ? e : new ResendError(`Error de red: ${String(e)}`, 0, true);
    }
    if (attempt < MAX_ATTEMPTS) await sleep(backoff * attempt);
  }
  throw lastError ?? new ResendError("No se pudo enviar el correo", 0, true);
}
