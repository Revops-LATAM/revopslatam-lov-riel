import { createFileRoute } from "@tanstack/react-router";
import { verifySvixSignature } from "@/lib/email/svix";

// Webhook de Resend (firmado con Svix). Registra rebotes permanentes y quejas de spam en la
// lista de supresión para no volver a escribirle a esas direcciones.
// Configurar en Resend → Webhooks con los eventos email.bounced y email.complained, y guardar el
// secreto de firma como RESEND_WEBHOOK_SECRET.
type ResendEvent = {
  type?: string;
  data?: {
    email_id?: string;
    to?: string[];
    bounce?: { type?: string; message?: string };
  };
};

export const Route = createFileRoute("/api/public/webhooks/resend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.RESEND_WEBHOOK_SECRET;
        if (!secret) return new Response("Webhook no configurado", { status: 500 });

        const body = await request.text();
        const valid = await verifySvixSignature({
          secret,
          id: request.headers.get("svix-id"),
          timestamp: request.headers.get("svix-timestamp"),
          signatureHeader: request.headers.get("svix-signature"),
          body,
        });
        if (!valid) return new Response("Firma inválida", { status: 401 });

        let event: ResendEvent;
        try {
          event = JSON.parse(body);
        } catch {
          return new Response("JSON inválido", { status: 400 });
        }

        const isComplaint = event.type === "email.complained";
        // Solo los rebotes permanentes suprimen; los temporales se reintentan solos.
        const isHardBounce =
          event.type === "email.bounced" && event.data?.bounce?.type === "Permanent";
        if (!isComplaint && !isHardBounce) return Response.json({ ok: true, ignored: true });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const reason = isComplaint ? "complaint" : "bounce";
        for (const raw of event.data?.to ?? []) {
          const email = raw.toLowerCase();
          const { error } = await supabaseAdmin.from("suppressed_emails").upsert(
            {
              email,
              reason,
              metadata: { provider: "resend", email_id: event.data?.email_id ?? null },
            },
            { onConflict: "email" },
          );
          if (error) {
            console.error("[resend-webhook] no se pudo suprimir", error.message);
            return new Response("Error al registrar la supresión", { status: 500 });
          }
          await supabaseAdmin.from("email_send_log").insert({
            message_id: event.data?.email_id ?? null,
            template_name: "system",
            recipient_email: email,
            status: isComplaint ? "complained" : "bounced",
            error_message: isComplaint
              ? "Queja de spam: el destinatario marcó el correo como spam"
              : (event.data?.bounce?.message ?? "Rebote permanente"),
          });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
