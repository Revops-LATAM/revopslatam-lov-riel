import * as React from "react";
import { render } from "@react-email/components";
import { TEMPLATES } from "@/lib/email-templates/registry";
import { sendViaResend } from "./resend.server";

// Los dominios de envío deben estar verificados en Resend. Se pueden cambiar por entorno.
function fromDomain() {
  return process.env.EMAIL_FROM_DOMAIN || "revopslatam.com";
}
function appBaseUrl() {
  return process.env.PUBLIC_APP_URL || "https://riel.revopslatam.com";
}

// Identidad por defecto (finanzas): facturas, recordatorios, etc.
const DEFAULT_FROM_NAME = "Finanzas Grupo Revenue";
const DEFAULT_FROM_LOCAL = "finanzas";
const DEFAULT_REPLY_TO = "finanzas@gruporevenue.com";
const DEFAULT_BCC = "finanzas@gruporevenue.com";

// Identidad de tickets: buzón separado para que soporte responda directamente.
const TICKETS_FROM_NAME = "Soporte Revops LATAM";
const TICKETS_FROM_LOCAL = "soporte";
const TICKETS_FALLBACK_REPLY_TO = "soporte@revopslatam.com";

interface SendArgs {
  templateName: keyof typeof TEMPLATES | string;
  to: string;
  templateData: Record<string, unknown>;
  idempotencyKey?: string;
  fromName?: string;
  /** Reemplaza Reply-To (p. ej. el correo del responsable de un ticket). */
  replyTo?: string;
  /** No enviar la copia oculta a finanzas (p. ej. recordatorios masivos). */
  skipBcc?: boolean;
}

export type SendResult =
  | { skipped: true; reason: "suppressed" }
  | { skipped: false; messageId: string; providerId: string };

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Un token de baja por dirección (se reutiliza el existente). */
async function getOrCreateUnsubscribeToken(
  admin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  email: string,
): Promise<string> {
  const normalized = email.toLowerCase();
  const { data: existing } = await admin
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalized)
    .maybeSingle();
  if (existing?.token) return existing.token;
  await admin
    .from("email_unsubscribe_tokens")
    .upsert(
      { token: generateToken(), email: normalized },
      { onConflict: "email", ignoreDuplicates: true },
    );
  const { data: stored, error } = await admin
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalized)
    .maybeSingle();
  if (error || !stored?.token) throw new Error("No se pudo crear el token de baja");
  return stored.token;
}

/**
 * Solo servidor. Renderiza una plantilla y la envía por Resend, dejando registro en
 * `email_send_log` (pending → sent / failed). Lanza un error si el envío falla.
 */
export async function sendTransactionalEmailServer({
  templateName,
  to,
  templateData,
  idempotencyKey,
  fromName,
  replyTo,
  skipBcc,
}: SendArgs): Promise<SendResult> {
  const entry = TEMPLATES[templateName as string];
  if (!entry) throw new Error(`Unknown email template: ${templateName}`);

  // ticket-*, portal-* y notification-* salen por el buzón de soporte y sin copia a finanzas.
  const tn = String(templateName);
  const isTicket =
    tn.startsWith("ticket-") || tn.startsWith("portal-") || tn.startsWith("notification-");
  const fromLocal = isTicket ? TICKETS_FROM_LOCAL : DEFAULT_FROM_LOCAL;
  const from = `${fromName ?? (isTicket ? TICKETS_FROM_NAME : DEFAULT_FROM_NAME)} <${fromLocal}@${fromDomain()}>`;
  const effectiveReplyTo = replyTo ?? (isTicket ? TICKETS_FALLBACK_REPLY_TO : DEFAULT_REPLY_TO);
  const bccAddress = isTicket || skipBcc ? null : DEFAULT_BCC;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Lista de supresión. Si no se puede verificar, no se envía.
  const { data: suppressed, error: suppressionError } = await supabaseAdmin
    .from("suppressed_emails")
    .select("email")
    .eq("email", to.toLowerCase())
    .maybeSingle();
  if (suppressionError) throw new Error("No se pudo verificar la lista de supresión");
  if (suppressed) return { skipped: true, reason: "suppressed" };

  const element = React.createElement(entry.component, templateData);
  const html = await render(element);
  const text = await render(element, { plainText: true });
  const subject = typeof entry.subject === "function" ? entry.subject(templateData) : entry.subject;

  const unsubscribeUrl = `${appBaseUrl()}/email/unsubscribe?token=${await getOrCreateUnsubscribeToken(supabaseAdmin, to)}`;
  const headers = {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };

  const deliver = async (args: {
    label: string;
    recipient: string;
    subject: string;
    key?: string;
  }) => {
    const messageId = crypto.randomUUID();
    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: args.label,
      recipient_email: args.recipient,
      status: "pending",
    });
    try {
      const { id } = await sendViaResend(
        {
          from,
          to: args.recipient,
          subject: args.subject,
          html,
          text,
          reply_to: effectiveReplyTo,
          headers,
        },
        { idempotencyKey: args.key },
      );
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: args.label,
        recipient_email: args.recipient,
        status: "sent",
        metadata: { provider_id: id },
      });
      return { messageId, providerId: id };
    } catch (e) {
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: args.label,
        recipient_email: args.recipient,
        status: "failed",
        error_message: (e instanceof Error ? e.message : String(e)).slice(0, 1000),
      });
      throw e;
    }
  };

  const sent = await deliver({
    label: tn,
    recipient: to,
    subject,
    key: idempotencyKey,
  });

  // Copia oculta a finanzas (no se repite si el destinatario ya es esa casilla). Si falla, no
  // afecta al envío principal.
  if (bccAddress && to.toLowerCase() !== bccAddress.toLowerCase()) {
    try {
      await deliver({
        label: `${tn}-bcc`,
        recipient: bccAddress,
        subject: `[Copia] ${subject} → ${to}`,
        key: idempotencyKey ? `${idempotencyKey}-bcc` : undefined,
      });
    } catch (e) {
      console.error("[email] la copia a finanzas falló", e);
    }
  }

  return { skipped: false, ...sent };
}
