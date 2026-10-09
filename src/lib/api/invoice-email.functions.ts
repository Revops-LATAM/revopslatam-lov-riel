import * as React from "react";
import { render } from "@react-email/components";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { template as invoiceSentTemplate } from "@/lib/email-templates/invoice-sent";

const RESEND_GATEWAY = "https://connector-gateway.lovable.dev/resend";
const FROM = "Finanzas Grupo Revenue <finanzas@gruporevenue.com>";
const REPLY_TO = "finanzas@gruporevenue.com";
const BCC = "finanzas@gruporevenue.com";

function formatCLP(n: number, currency: string) {
  if (currency === "CLP") return `$${Math.round(n).toLocaleString("es-CL")}`;
  return `${currency} ${n.toLocaleString("es-CL")}`;
}

function extractOpenFacturaToken(pdfUrl: string | null | undefined) {
  if (!pdfUrl) return null;
  try {
    const parsed = new URL(pdfUrl);
    const token = parsed.searchParams.get("token");
    if (token) return token;
  } catch {
    // fall through
  }
  return /\/dte\/document\/([^/]+)\/pdf/i.exec(pdfUrl)?.[1] ?? null;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchInvoicePdfBase64(params: {
  workspaceId: string;
  pdfUrl: string | null;
  tokenSii: string | null;
}): Promise<string> {
  const token = params.tokenSii ?? extractOpenFacturaToken(params.pdfUrl);
  if (!token) throw new Error("Esta factura no tiene token para recuperar el PDF.");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cfg, error: cfgErr } = await supabaseAdmin
    .from("workspace_dte_config")
    .select("api_key, ambiente, activo")
    .eq("workspace_id", params.workspaceId)
    .maybeSingle();
  if (cfgErr) throw new Error(cfgErr.message);

  const envApiKey = process.env.OPENFACTURA_API_KEY;
  const envAmbiente = process.env.OPENFACTURA_AMBIENTE;
  const apiKey = (cfg?.activo ? cfg.api_key : null) ?? envApiKey;
  if (!apiKey) {
    throw new Error(
      "Configuración DTE inactiva. Configura el API key en Ajustes → Facturación electrónica.",
    );
  }
  const ambiente = (cfg?.activo ? cfg.ambiente : null) ?? envAmbiente ?? "production";
  const isLegacyPdf = !!params.pdfUrl && /\/functions\/v1\/get-dte-pdf/i.test(params.pdfUrl);
  const baseUrl =
    ambiente === "production" || isLegacyPdf
      ? "https://api.haulmer.com/v2/dte/document"
      : "https://dev-api.haulmer.com/v2/dte/document";

  const response = await fetch(`${baseUrl}/${token}/pdf`, { headers: { apikey: apiKey } });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`No se pudo descargar el PDF (${response.status}): ${text.slice(0, 200)}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  let pdfBytes = bytes;
  if (String.fromCharCode(bytes[0] ?? 0) === "{") {
    const json = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, string | undefined>;
    const pdfBase64 =
      json.PDF ?? json.pdf ?? json.DATA ?? json.data ?? json.content ?? json.Content;
    if (!pdfBase64) throw new Error("PDF no encontrado en la respuesta del proveedor.");
    const binary = atob(pdfBase64);
    pdfBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) pdfBytes[i] = binary.charCodeAt(i);
  }
  const magic = String.fromCharCode(
    pdfBytes[0] ?? 0,
    pdfBytes[1] ?? 0,
    pdfBytes[2] ?? 0,
    pdfBytes[3] ?? 0,
  );
  if (magic !== "%PDF") throw new Error("La respuesta del proveedor no es un PDF válido.");
  return bytesToBase64(pdfBytes);
}

export const sendInvoiceEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        invoiceId: z.string().uuid(),
        to: z.string().email(),
        cc: z.array(z.string().email()).optional().default([]),
        ocReference: z.string().nullable().optional(),
        subjectOverride: z.string().min(1).max(300).nullable().optional(),
        bodyOverride: z.string().min(1).max(10000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    if (!lovableKey || !resendKey) {
      throw new Error("Resend no está configurado en el proyecto");
    }

    const { data: inv, error } = await context.supabase
      .from("invoices")
      .select(
        "id, workspace_id, folio_sii, pdf_url, descripcion, monto_total, currency, accounts(name)",
      )
      .eq("id", data.invoiceId)
      .single();
    if (error || !inv) throw new Error(error?.message ?? "Factura no encontrada");
    if (!inv.pdf_url) throw new Error("La factura no tiene PDF disponible");
    if (!inv.folio_sii) throw new Error("La factura no tiene folio SII");
    const clientName = (
      (inv as unknown as { accounts?: { name?: string } | null }).accounts?.name ?? ""
    ).trim();

    const templateData = {
      folio: inv.folio_sii,
      descripcion: inv.descripcion ?? "los servicios contratados",
      monto_formatted: formatCLP(Number(inv.monto_total), inv.currency),
      oc_reference: data.ocReference || null,
      body_override: data.bodyOverride || null,
      emisor_nombre: "Grupo Revenue SpA",
      emisor_banco: "Santander",
      emisor_tipo_cuenta: "Cuenta corriente",
      emisor_cuenta: "69837271",
      emisor_rut: "76.181.981-K",
      emisor_email: "finanzas@gruporevenue.com",
    };

    const element = React.createElement(invoiceSentTemplate.component, templateData);
    const html = await render(element);
    const text = await render(element, { plainText: true });
    const subject =
      data.subjectOverride?.trim() ||
      (typeof invoiceSentTemplate.subject === "function"
        ? invoiceSentTemplate.subject(templateData)
        : invoiceSentTemplate.subject);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invSecure, error: secureErr } = await supabaseAdmin
      .from("invoices")
      .select("token_sii")
      .eq("id", inv.id)
      .single();
    if (secureErr) throw new Error(secureErr.message);
    const pdfBase64 = await fetchInvoicePdfBase64({
      workspaceId: inv.workspace_id,
      pdfUrl: inv.pdf_url,
      tokenSii: invSecure?.token_sii ?? null,
    });
    const filename = `FE ${inv.folio_sii}${clientName ? ` ${clientName}` : ""}.pdf`;

    const payload = {
      from: FROM,
      to: [data.to],
      cc: data.cc.length ? data.cc : undefined,
      bcc: [BCC],
      reply_to: REPLY_TO,
      subject,
      html,
      text,
      attachments: [{ filename, content: pdfBase64 }],
    };

    const resp = await fetch(`${RESEND_GATEWAY}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
      body: JSON.stringify(payload),
    });
    const body = await resp.text();
    if (!resp.ok) {
      throw new Error(`Resend error ${resp.status}: ${body.slice(0, 500)}`);
    }
    let parsed: { id?: string } = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      /* ignore */
    }

    // Log to email_send_log for record
    try {
      await context.supabase.from("email_send_log").insert({
        message_id: parsed.id ?? crypto.randomUUID(),
        template_name: "invoice-sent",
        recipient_email: data.to,
        status: "sent",
      });
    } catch {
      /* non-fatal */
    }

    return { ok: true, id: parsed.id ?? null, recipients: [data.to, ...data.cc, BCC] };
  });
