import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Payments-page bundle: runs the 4 fetches the /finance/payments loader
 * needs in parallel on the server so the client makes 1 HTTP round-trip
 * instead of 4. Mirrors the getProjectBundle pattern used for /projects/$id.
 *
 * The route loader calls this once, then hydrates each React Query cache key
 * via `queryClient.setQueryData` — so every component keeps using the same
 * `useSuspenseQuery(workspacePaymentsQO/invoicesQO/dteConfigQO/latestUfRateQO)`
 * with zero refactor.
 */
export const getFinancePaymentsBundle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = data.workspaceId;

    const paymentsPromise = context.supabase
      .rpc("list_workspace_payments", { _workspace_id: workspaceId })
      .then(({ data: rows, error }) => {
        if (error) throw new Error(error.message);
        type PaymentRow = {
          id: string;
          contract_id: string;
          milestone_id: string | null;
          service_line_id: string | null;
          kind: string;
          amount: number;
          currency: string;
          due_date: string;
          paid_at: string | null;
          status: string;
          period_label: string | null;
          notes: string | null;
          ready_to_invoice: boolean;
          invoice_id: string | null;
          created_at: string;
          contract_name: string | null;
          account_name: string | null;
          description: string | null;
          fecha_emision: string | null;
          emitido_at: string | null;
          monto_clp: number | null;
          uf_usada: number | null;
          uf_fecha: string | null;
          es_uf_estimada: boolean;
          folio_sii: string | null;
          has_pdf: boolean;
          pdf_url: string | null;
          invoice_estado: string | null;
        };
        type RawRow = Omit<PaymentRow, "amount" | "monto_clp" | "uf_usada"> & {
          amount: string | number | null;
          monto_clp: string | number | null;
          uf_usada: string | number | null;
        };
        return ((rows ?? []) as unknown as RawRow[]).map((r) => ({
          ...r,
          amount: r.amount == null ? 0 : Number(r.amount),
          monto_clp: r.monto_clp == null ? null : Number(r.monto_clp),
          uf_usada: r.uf_usada == null ? null : Number(r.uf_usada),
        }));
      });

    const invoicesPromise = context.supabase
      .from("invoices")
      .select(
        "id, account_id, contract_id, numero_interno, tipo_dte, descripcion, fecha_emision, mes, anio, currency, monto_neto, monto_iva, monto_total, monto_clp, estado, folio_sii, pdf_url, emitido_at, pagada_at, accounts(name), contracts(name, code)",
      )
      .eq("workspace_id", workspaceId)
      .order("fecha_emision", { ascending: false })
      .limit(1000)
      .then(({ data: rows, error }) => {
        if (error) throw new Error(error.message);
        return (rows ?? []).map((r) => ({
          ...r,
          account_name: (r.accounts as { name?: string } | null)?.name ?? null,
          contract_name: (r.contracts as { name?: string } | null)?.name ?? null,
          contract_code: (r.contracts as { code?: string } | null)?.code ?? null,
        }));
      });

    const dteConfigPromise = context.supabase
      .from("workspace_dte_config")
      .select(
        "workspace_id, provider, ambiente, rut_emisor, resolucion_sii, fecha_resolucion, activo, updated_at",
      )
      .eq("workspace_id", workspaceId)
      .maybeSingle()
      .then(async ({ data: row, error }) => {
        if (error) throw new Error(error.message);
        if (!row) return null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: keyRow } = await supabaseAdmin
          .from("workspace_dte_config")
          .select("api_key")
          .eq("workspace_id", workspaceId)
          .maybeSingle();
        const k = keyRow?.api_key ?? null;
        return {
          ...row,
          api_key: null as string | null,
          api_key_preview: (k ? (k.length > 4 ? `••••${k.slice(-4)}` : "••••") : null) as
            | `••••${string}`
            | null,
          has_api_key: !!k,
        };
      });

    const ufRatePromise = Promise.resolve(
      context.supabase
        .from("currency_rates")
        .select("rate_to_base, rate_date, updated_at")
        .eq("workspace_id", workspaceId)
        .eq("currency", "UF")
        .eq("base_currency", "CLP")
        .order("rate_date", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data: row, error }) => {
          if (error) throw new Error(error.message);
          if (!row) return null;
          return {
            valor: Number(row.rate_to_base),
            fecha: String(row.rate_date).slice(0, 10),
            updatedAt: row.updated_at,
          };
        }),
    ).catch(() => null);

    const [payments, invoices, dteConfig, ufRate] = await Promise.all([
      paymentsPromise,
      invoicesPromise,
      dteConfigPromise,
      ufRatePromise,
    ]);
    return { payments, invoices, dteConfig, ufRate };
  });
