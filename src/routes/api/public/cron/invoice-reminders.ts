import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { render } from "@react-email/components";
import { createClient } from "@supabase/supabase-js";
import { template as reminderTemplate } from "@/lib/email-templates/invoice-reminder";

const SENDER_DOMAIN = "noti.revopslatam.com";
const FROM_DOMAIN = "revopslatam.com";

function formatCLP(n: number, currency: string) {
  if (currency === "CLP") return `$${Math.round(n).toLocaleString("es-CL")}`;
  return `${currency} ${n.toLocaleString("es-CL")}`;
}

export const Route = createFileRoute("/api/public/cron/invoice-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Auth via server-only service-role key sent as Bearer token by pg_cron.
        // The previous check compared against SUPABASE_PUBLISHABLE_KEY, which
        // ships in the client bundle and is not a secret.
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const auth = request.headers.get("Authorization");
        if (!serviceKey || !auth?.startsWith("Bearer ") || auth.slice(7).trim() !== serviceKey) {
          return new Response("Unauthorized", { status: 401 });
        }

        const url = process.env.SUPABASE_URL!;
        const admin = createClient(url, serviceKey);


        // Workspaces with cobranza activa
        const { data: emisores, error: eErr } = await admin
          .from("workspace_emisor")
          .select("*")
          .eq("cobranza_activa", true);
        if (eErr) return Response.json({ error: eErr.message }, { status: 500 });

        const today = new Date().toISOString().slice(0, 10);
        let sent = 0;

        for (const emRaw of emisores ?? []) {
          const em = emRaw as Record<string, unknown>;
          const wsId = em.workspace_id as string;
          const dias = Number(em.cobranza_dias_recordatorio ?? 7);
          const ccList = (em.cobranza_cc_emails as string[] | null) ?? [];

          // Overdue, emitted, not paid
          const { data: invs } = await admin
            .from("invoices")
            .select(
              "id, workspace_id, folio_sii, pdf_url, monto_total, currency, fecha_vencimiento, accounts(billing_email)",
            )
            .eq("workspace_id", wsId)
            .eq("estado", "emitted")
            .not("fecha_vencimiento", "is", null)
            .lt("fecha_vencimiento", today);

          for (const inv of invs ?? []) {
            const account = (inv.accounts as { billing_email?: string } | null) ?? null;
            const to = account?.billing_email;
            if (!to) continue;

            // Last reminder check
            const { data: last } = await admin
              .from("invoice_reminders")
              .select("sent_at")
              .eq("invoice_id", inv.id)
              .order("sent_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (last?.sent_at) {
              const diffDays = (Date.now() - new Date(last.sent_at).getTime()) / 86400000;
              if (diffDays < dias) continue;
            }

            const dueDate = inv.fecha_vencimiento as string;
            const diasVencido = Math.floor(
              (new Date(today).getTime() - new Date(dueDate).getTime()) / 86400000,
            );

            const props = {
              folio: inv.folio_sii ?? "—",
              monto_formatted: formatCLP(Number(inv.monto_total), inv.currency),
              dias_vencido: diasVencido,
              fecha_vencimiento: dueDate,
              pdf_url: inv.pdf_url ?? undefined,
              emisor_nombre: (em.razon_social as string) ?? "Grupo Revenue SpA",
              emisor_email: (em.email_finanzas as string) ?? "finanzas@gruporevenue.com",
            };
            const element = React.createElement(reminderTemplate.component, props);
            const html = await render(element);
            const text = await render(element, { plainText: true });
            const subject = typeof reminderTemplate.subject === "function"
              ? reminderTemplate.subject(props)
              : reminderTemplate.subject;

            const recipients = [to, ...ccList];
            for (const r of recipients) {
              const messageId = crypto.randomUUID();
              await admin.from("email_send_log").insert({
                message_id: messageId,
                template_name: "invoice-reminder",
                recipient_email: r,
                status: "pending",
              });
              await admin.rpc("enqueue_email", {
                queue_name: "transactional_emails",
                payload: {
                  message_id: messageId,
                  to: r,
                  from: `${(em.razon_social as string) ?? "Riel"} <noreply@${FROM_DOMAIN}>`,
                  sender_domain: SENDER_DOMAIN,
                  subject,
                  html,
                  text,
                  purpose: "transactional",
                  label: "invoice-reminder",
                  idempotency_key: `reminder-${inv.id}-${today}-${r}`,
                  queued_at: new Date().toISOString(),
                },
              });
              sent++;
            }
            await admin.from("invoice_reminders").insert({
              workspace_id: wsId,
              invoice_id: inv.id,
              recipient_email: to,
              dias_vencido: diasVencido,
            });
          }
        }

        return Response.json({ ok: true, sent });
      },
    },
  },
});
