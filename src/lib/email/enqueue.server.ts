import * as React from "react";
import { render } from "@react-email/components";
import { TEMPLATES } from "@/lib/email-templates/registry";

const SENDER_DOMAIN = "noti.revopslatam.com";
const FROM_DOMAIN = "revopslatam.com";

// Default (finanzas) sender identity — used for invoices, reminders, etc.
const DEFAULT_FROM_NAME = "Finanzas Grupo Revenue";
const DEFAULT_FROM_LOCAL = "finanzas";
const DEFAULT_REPLY_TO = "finanzas@gruporevenue.com";
const DEFAULT_BCC = "finanzas@gruporevenue.com";

// Tickets sender identity — separate mailbox so soporte respond directly.
const TICKETS_FROM_NAME = "Soporte Revops LATAM";
const TICKETS_FROM_LOCAL = "soporte";
const TICKETS_FALLBACK_REPLY_TO = "soporte@revopslatam.com";

interface EnqueueArgs {
  templateName: keyof typeof TEMPLATES | string;
  to: string;
  templateData: Record<string, unknown>;
  idempotencyKey?: string;
  fromName?: string;
  /** Overrides Reply-To (e.g. assignee email for tickets). */
  replyTo?: string;
}

/**
 * Server-only: render an app email template and enqueue it via supabaseAdmin.
 * Use from server routes/server fns where there is no user JWT (e.g. public form submissions).
 */
export async function enqueueTransactionalEmailServer({
  templateName,
  to,
  templateData,
  idempotencyKey,
  fromName,
  replyTo,
}: EnqueueArgs) {
  const entry = TEMPLATES[templateName as string];
  if (!entry) throw new Error(`Unknown email template: ${templateName}`);

  // Route ticket-*, portal-* and notification-* templates through the soporte mailbox with no finanzas BCC.
  const tn = String(templateName);
  const isTicket =
    tn.startsWith("ticket-") || tn.startsWith("portal-") || tn.startsWith("notification-");
  const fromLocal = isTicket ? TICKETS_FROM_LOCAL : DEFAULT_FROM_LOCAL;
  const effectiveFromName = fromName ?? (isTicket ? TICKETS_FROM_NAME : DEFAULT_FROM_NAME);
  const effectiveReplyTo = replyTo ?? (isTicket ? TICKETS_FALLBACK_REPLY_TO : DEFAULT_REPLY_TO);
  const bccAddress = isTicket ? null : DEFAULT_BCC;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Suppression check
  const { data: suppressed } = await supabaseAdmin
    .from("suppressed_emails")
    .select("email")
    .eq("email", to.toLowerCase())
    .maybeSingle();
  if (suppressed) return { skipped: true as const, reason: "suppressed" };

  const element = React.createElement(entry.component, templateData);
  const html = await render(element);
  const text = await render(element, { plainText: true });
  const subject = typeof entry.subject === "function" ? entry.subject(templateData) : entry.subject;

  const messageId = crypto.randomUUID();
  await supabaseAdmin.from("email_send_log").insert({
    message_id: messageId,
    template_name: templateName as string,
    recipient_email: to,
    status: "pending",
  });

  await supabaseAdmin.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId,
      to,
      from: `${effectiveFromName} <${fromLocal}@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: "transactional",
      reply_to: effectiveReplyTo,
      label: templateName,
      idempotency_key: idempotencyKey,
      queued_at: new Date().toISOString(),
    },
  });

  // Hidden BCC copy (only for non-ticket templates; skip if recipient IS the BCC address)
  if (bccAddress && to.toLowerCase() !== bccAddress.toLowerCase()) {
    const bccMessageId = crypto.randomUUID();
    await supabaseAdmin.from("email_send_log").insert({
      message_id: bccMessageId,
      template_name: `${templateName as string}-bcc`,
      recipient_email: bccAddress,
      status: "pending",
    });
    await supabaseAdmin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: bccMessageId,
        to: bccAddress,
        from: `${effectiveFromName} <${fromLocal}@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: `[Copia] ${subject} → ${to}`,
        html,
        text,
        purpose: "transactional",
        reply_to: effectiveReplyTo,
        label: `${templateName as string}-bcc`,
        idempotency_key: idempotencyKey ? `${idempotencyKey}-bcc` : undefined,
        queued_at: new Date().toISOString(),
      },
    });
  }

  return { skipped: false as const, messageId };
}
