import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function formatCLP(n: number, currency: string) {
  if (currency === "CLP") return `$${Math.round(n).toLocaleString("es-CL")}`;
  return `${currency} ${n.toLocaleString("es-CL")}`;
}

export const getInvoiceEmailData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ invoiceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: inv, error } = await context.supabase
      .from("invoices")
      .select(
        "id, workspace_id, folio_sii, pdf_url, descripcion, monto_total, currency, accounts(name, billing_email, primary_contact_email, secondary_contacts), billing_entity:account_billing_entities!invoices_billing_entity_id_fkey(razon_social, email_facturacion, cc_emails)",
      )
      .eq("id", data.invoiceId)
      .single();
    if (error) throw new Error(error.message);

    const { data: emisor } = await context.supabase
      .from("workspace_emisor")
      .select("*")
      .eq("workspace_id", inv.workspace_id)
      .maybeSingle();

    const e = (emisor ?? {}) as Record<string, string | null | undefined>;
    const account = inv.accounts as {
      name?: string;
      billing_email?: string | null;
      primary_contact_email?: string | null;
      secondary_contacts?: unknown;
    } | null;

    const be = (inv as unknown as {
      billing_entity?: { razon_social?: string | null; email_facturacion?: string | null; cc_emails?: string[] | null } | null;
    }).billing_entity;
    const principal = ((be ? be.email_facturacion : account?.billing_email) ?? "").trim();
    const secondary = be
      ? (be.cc_emails ?? []).map((x) => String(x ?? "").trim())
      : Array.isArray(account?.secondary_contacts)
      ? (account!.secondary_contacts as Array<{ email?: string | null }>).map((c) =>
          String(c?.email ?? "").trim(),
        )
      : [];
    const emisorCc = ((e.cobranza_cc_emails as unknown as string[] | null) ?? []) as string[];

    const seen = new Set<string>();
    if (principal) seen.add(principal.toLowerCase());
    const defaultCc: string[] = [];
    for (const raw of [be ? "" : (account?.primary_contact_email ?? ""), ...secondary, ...emisorCc]) {
      const email = String(raw ?? "").trim();
      if (!email || !email.includes("@")) continue;
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      defaultCc.push(email);
    }

    return {
      defaultRecipient: principal,
      defaultCc,
      templateData: {
        folio: inv.folio_sii ?? "—",
        descripcion: inv.descripcion ?? "los servicios contratados",
        monto_formatted: formatCLP(Number(inv.monto_total), inv.currency),
        pdf_url: inv.pdf_url ?? undefined,
        cliente_nombre: account?.name ?? "",
        emisor_nombre: "Grupo Revenue SpA",
        emisor_banco: "Santander",
        emisor_tipo_cuenta: "Cuenta corriente",
        emisor_cuenta: "69837271",
        emisor_rut: "76.181.981-K",
        emisor_email: "finanzas@gruporevenue.com",
      },
    };
  });

export const reconcileDte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        invoiceId: z.string().uuid(),
        folio: z.string().min(1).max(40),
        pdfUrl: z.string().url().nullable().optional(),
        fechaEmision: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("invoices")
      .update({
        estado: "emitted",
        folio_sii: data.folio,
        pdf_url: data.pdfUrl ?? null,
        emitido_at: new Date().toISOString(),
        ...(data.fechaEmision ? { fecha_emision: data.fechaEmision } : {}),
      })
      .eq("id", data.invoiceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
