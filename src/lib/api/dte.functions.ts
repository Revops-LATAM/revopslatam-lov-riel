import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function extractOpenFacturaToken(pdfUrl: string | null | undefined) {
  if (!pdfUrl) return null;
  try {
    const parsed = new URL(pdfUrl);
    const token = parsed.searchParams.get("token");
    if (token) return token;
  } catch {
    // fall through to path-based extraction
  }
  return /\/dte\/document\/([^/]+)\/pdf/i.exec(pdfUrl)?.[1] ?? null;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

type MinimalSupabaseClient = import("@supabase/supabase-js").SupabaseClient;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function pickProviderString(source: JsonRecord | null | undefined, ...keys: string[]) {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (value != null && value !== "") return String(value);
  }
  return null;
}

function pickProviderFolio(source: JsonRecord | null | undefined) {
  const direct = pickProviderString(source, "FOLIO", "Folio", "folio");
  if (direct) return direct;

  const dteJson = asRecord(source?.json) ?? asRecord(source?.JSON);
  const encabezado = asRecord(dteJson?.Encabezado);
  const idDoc = asRecord(encabezado?.IdDoc);
  return pickProviderString(idDoc, "FOLIO", "Folio", "folio");
}

function providerPdfUrl(baseUrl: string, token: string | null | undefined) {
  return token ? `${baseUrl}/${encodeURIComponent(token)}/pdf` : null;
}

async function fetchOpenFacturaJson(baseUrl: string, token: string, apiKey: string) {
  const response = await fetch(`${baseUrl}/${encodeURIComponent(token)}/json`, {
    headers: { apikey: apiKey },
  });
  const text = await response.text();
  if (!response.ok) return { ok: false as const, text };
  try {
    return { ok: true as const, json: JSON.parse(text) as JsonRecord, text };
  } catch {
    return { ok: false as const, text };
  }
}

async function findIssuedOpenFacturaDuplicate(params: {
  baseUrl: string;
  apiKey: string;
  tipoDte: number;
  fechaEmision: string;
  rutRecep: string;
  neto: number;
  total: number;
}) {
  const rutParts = params.rutRecep.replace(/\./g, "").replace(/\s/g, "").split("-");
  const rutNumber = rutParts[0]?.replace(/\D/g, "");
  if (!rutNumber) return null;

  const response = await fetch(`${params.baseUrl}/issued`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: params.apiKey,
    },
    body: JSON.stringify({
      Page: "1",
      TipoDTE: { eq: String(params.tipoDte) },
      FchEmis: { eq: params.fechaEmision },
      RUTRecep: { eq: rutNumber },
    }),
  });
  const text = await response.text();
  if (!response.ok) return null;

  try {
    const json = JSON.parse(text) as { data?: Array<JsonRecord> };
    return (
      json.data?.find((row) => {
        const neto = Number(row.MntNeto ?? row.mntNeto ?? row.monto_neto ?? 0);
        const total = Number(row.MntTotal ?? row.mntTotal ?? row.monto_total ?? 0);
        const folio = pickProviderString(row, "Folio", "FOLIO", "folio");
        const token = pickProviderString(row, "Token", "TOKEN", "token");
        return !!folio && !!token && Math.abs(neto - params.neto) <= 1 && Math.abs(total - params.total) <= 1;
      }) ?? null
    );
  } catch {
    return null;
  }
}

/**
 * Trae la UF de una fecha puntual desde mindicador.cl y la guarda en
 * currency_rates. Devuelve el valor o null si no se pudo obtener.
 */
async function fetchAndStoreUf(
  supabase: MinimalSupabaseClient,
  workspaceId: string,
  dateISO: string,
): Promise<number | null> {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateISO);
  if (!m) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`https://mindicador.cl/api/uf/${m[3]}-${m[2]}-${m[1]}`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const json = (await res.json()) as { serie?: Array<{ fecha: string; valor: number }> };
    const hit = json.serie?.[0];
    const valor = Number(hit?.valor);
    if (!hit || !Number.isFinite(valor) || valor <= 0) return null;
    const fecha = String(hit.fecha).slice(0, 10);
    await supabase.from("currency_rates").upsert(
      {
        workspace_id: workspaceId,
        currency: "UF",
        base_currency: "CLP",
        rate_to_base: valor,
        rate_date: fecha,
      } as never,
      { onConflict: "workspace_id,currency,rate_date" },
    );
    return valor;
  } catch {
    return null;
  }
}

async function resolveClpAmount(
  supabase: MinimalSupabaseClient,
  workspaceId: string,
  currency: string | null | undefined,
  amount: number,
  dateISO: string,
) {
  if ((currency ?? "CLP") === "CLP") return Math.round(amount);
  if ((currency ?? "").toUpperCase() !== "UF") return Math.round(amount);

  const day = dateISO.slice(0, 10);

  // 1) Valor exacto del día ya almacenado.
  const { data: exact } = await supabase
    .from("currency_rates")
    .select("rate_to_base")
    .eq("workspace_id", workspaceId)
    .eq("currency", "UF")
    .eq("base_currency", "CLP")
    .eq("rate_date", day)
    .maybeSingle();
  if (exact?.rate_to_base) return Math.round(amount * Number(exact.rate_to_base));

  // 2) Consultar mindicador.cl para la fecha exacta (y guardarla).
  const fetched = await fetchAndStoreUf(supabase, workspaceId, day);
  if (fetched) return Math.round(amount * fetched);

  // 3) Último valor anterior o disponible como respaldo.
  const { data: previous } = await supabase
    .from("currency_rates")
    .select("rate_to_base")
    .eq("workspace_id", workspaceId)
    .eq("currency", "UF")
    .eq("base_currency", "CLP")
    .lte("rate_date", day)
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previous?.rate_to_base) return Math.round(amount * Number(previous.rate_to_base));

  const { data: latest } = await supabase
    .from("currency_rates")
    .select("rate_to_base")
    .eq("workspace_id", workspaceId)
    .eq("currency", "UF")
    .eq("base_currency", "CLP")
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return Math.round(amount * Number(latest?.rate_to_base ?? 38500));
}


// ============ DTE CONFIG ============

export const getDteConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("workspace_dte_config")
      .select("workspace_id, provider, ambiente, rut_emisor, resolucion_sii, fecha_resolucion, activo, updated_at")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;

    // api_key column is revoked from authenticated; read masked preview via admin
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: keyRow } = await supabaseAdmin
      .from("workspace_dte_config")
      .select("api_key")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    const k = keyRow?.api_key ?? null;
    return {
      ...row,
      api_key: null as string | null,
      api_key_preview: k ? (k.length > 4 ? `••••${k.slice(-4)}` : "••••") : null,
      has_api_key: !!k,
    };
  });

export const upsertDteConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        provider: z.string().max(50).default("openfactura"),
        ambiente: z.enum(["sandbox", "production"]),
        api_key: z.string().max(2048).nullable().optional(), // null/undefined = no change
        rut_emisor: z.string().max(20).nullable().optional(),
        resolucion_sii: z.string().max(100).nullable().optional(),
        fecha_resolucion: z.string().nullable().optional(),
        activo: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { workspaceId, api_key, ...rest } = data;

    const patch = {
      workspace_id: workspaceId,
      ...rest,
      ...(api_key && api_key.trim().length > 0 ? { api_key: api_key.trim() } : {}),
    };

    const { data: existing } = await context.supabase
      .from("workspace_dte_config")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (existing) {
      const { error } = await context.supabase
        .from("workspace_dte_config")
        .update(patch)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("workspace_dte_config")
        .insert(patch);
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });

// ============ INVOICES ============

export const listInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        estado: z.enum(["draft", "scheduled", "emitted", "paid", "cancelled"]).optional(),
        contractId: z.string().uuid().optional(),
        accountId: z.string().uuid().optional(),
        anio: z.number().int().optional(),
        mes: z.number().int().min(1).max(12).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("invoices")
      .select(
        "id, account_id, contract_id, numero_interno, tipo_dte, descripcion, fecha_emision, mes, anio, currency, monto_neto, monto_iva, monto_total, monto_clp, estado, folio_sii, pdf_url, emitido_at, pagada_at, accounts(name), contracts(name, code)",
      )
      .eq("workspace_id", data.workspaceId)
      .order("fecha_emision", { ascending: false });
    if (data.estado) q = q.eq("estado", data.estado);
    if (data.contractId) q = q.eq("contract_id", data.contractId);
    if (data.accountId) q = q.eq("account_id", data.accountId);
    if (data.anio) q = q.eq("anio", data.anio);
    if (data.mes) q = q.eq("mes", data.mes);
    const { data: rows, error } = await q.limit(1000);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      ...r,
      account_name: (r.accounts as { name?: string } | null)?.name ?? null,
      contract_name: (r.contracts as { name?: string } | null)?.name ?? null,
      contract_code: (r.contracts as { code?: string } | null)?.code ?? null,
    }));
  });

export const getInvoice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ invoiceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: inv, error } = await context.supabase
      .from("invoices")
      .select(
        "id, workspace_id, account_id, contract_id, numero_interno, tipo_dte, descripcion, fecha_emision, fecha_vencimiento, mes, anio, currency, monto_neto, monto_iva, monto_total, monto_clp, estado, folio_sii, pdf_url, xml_url, emitido_at, pagada_at, cancelada_at, motivo_cancelacion, dtes_asociados, notas, created_by, created_at, updated_at, billing_entity_id, accounts(name, tax_id, legal_name, business_activity, address, commune, billing_email), billing_entity:account_billing_entities!invoices_billing_entity_id_fkey(rut, razon_social, giro, direccion, comuna, email_facturacion, cc_emails), contracts(name, code, currency), invoice_lines(*)",
      )
      .eq("id", data.invoiceId)
      .single();
    if (error) throw new Error(error.message);
    if (inv.estado === "draft") {
      const existingLines = ((inv.invoice_lines as Array<{
        id: string;
        invoice_id: string;
        descripcion: string;
        cantidad: number;
        monto_unitario: number;
        monto: number;
        currency: string;
        contract_payment_id: string | null;
        orden: number;
        created_at: string;
      }> | null) ?? []).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
      const { data: linkedPayment } = await context.supabase
        .from("contract_payments")
        .select("id, amount, currency, notes, period_label, kind, contracts(name, descripcion_factura)")
        .eq("invoice_id", data.invoiceId)
        .limit(1)
        .maybeSingle();

      const fallbackAmount = linkedPayment
        ? await resolveClpAmount(
            context.supabase,
            inv.workspace_id,
            linkedPayment.currency,
            Number(linkedPayment.amount ?? 0),
            new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" }),
          )
        : Number(inv.monto_clp ?? inv.monto_neto ?? inv.monto_total ?? 0);
      const contract = Array.isArray(linkedPayment?.contracts)
        ? linkedPayment?.contracts[0]
        : linkedPayment?.contracts;
      const fallbackDescription =
        existingLines[0]?.descripcion ??
        inv.descripcion ??
        contract?.descripcion_factura ??
        contract?.name ??
        linkedPayment?.notes ??
        (linkedPayment?.period_label ? `${linkedPayment.kind} · ${linkedPayment.period_label}` : "Servicio");

      if (fallbackAmount > 0) {
        const iva = inv.tipo_dte === 33 ? Math.round(fallbackAmount * 0.19) : 0;
        return {
          ...inv,
          currency: "CLP",
          monto_neto: fallbackAmount,
          monto_iva: iva,
          monto_total: fallbackAmount + iva,
          monto_clp: fallbackAmount,
          invoice_lines: [
            existingLines.length > 0 ? {
              ...existingLines[0],
              descripcion: fallbackDescription,
              cantidad: 1,
              monto_unitario: fallbackAmount,
              monto: fallbackAmount,
              currency: "CLP",
              contract_payment_id: existingLines[0].contract_payment_id ?? linkedPayment?.id ?? null,
            } : {
              id: "fallback-line",
              invoice_id: inv.id,
              descripcion: fallbackDescription,
              cantidad: 1,
              monto_unitario: fallbackAmount,
              monto: fallbackAmount,
              currency: "CLP",
              contract_payment_id: linkedPayment?.id ?? null,
              orden: 0,
              created_at: inv.created_at,
            },
          ],
        };
      }
    }
    return inv;
  });

const lineInput = z.object({
  descripcion: z.string().min(1).max(500),
  cantidad: z.number().min(0).default(1),
  monto_unitario: z.number().min(0),
  monto: z.number().min(0),
  currency: z.string().max(10).default("CLP"),
  contract_payment_id: z.string().uuid().nullable().optional(),
  orden: z.number().int().default(0),
});

export const createInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        accountId: z.string().uuid().nullable().optional(),
        contractId: z.string().uuid().nullable().optional(),
        tipo_dte: z.number().int().default(33),
        descripcion: z.string().max(500).nullable().optional(),
        fecha_emision: z.string(),
        currency: z.string().max(10).default("CLP"),
        notas: z.string().max(2000).nullable().optional(),
        lines: z.array(lineInput).min(1).max(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const neto = data.lines.reduce((s, l) => s + Number(l.monto), 0);
    const iva = data.tipo_dte === 33 ? Math.round(neto * 0.19) : 0;
    const total = neto + iva;
    const d = new Date(data.fecha_emision);

    const { data: inv, error } = await context.supabase
      .from("invoices")
      .insert({
        workspace_id: data.workspaceId,
        account_id: data.accountId ?? null,
        contract_id: data.contractId ?? null,
        tipo_dte: data.tipo_dte,
        descripcion: data.descripcion ?? null,
        fecha_emision: data.fecha_emision,
        mes: d.getUTCMonth() + 1,
        anio: d.getUTCFullYear(),
        currency: data.currency,
        monto_neto: neto,
        monto_iva: iva,
        monto_total: total,
        estado: "draft",
        notas: data.notas ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const lineRows = data.lines.map((l, idx) => ({
      invoice_id: inv.id,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      monto_unitario: l.monto_unitario,
      monto: l.monto,
      currency: l.currency,
      contract_payment_id: l.contract_payment_id ?? null,
      orden: l.orden ?? idx,
    }));
    const { error: lerr } = await context.supabase.from("invoice_lines").insert(lineRows);
    if (lerr) throw new Error(lerr.message);
    return { id: inv.id };
  });

const receptorOverride = z.object({
  rut: z.string().max(20),
  razon_social: z.string().max(255),
  giro: z.string().max(255),
  direccion: z.string().max(500),
  comuna: z.string().max(120),
  email: z.string().max(255).nullable().optional(),
});

const lineOverride = z.object({
  descripcion: z.string().min(1).max(500),
  cantidad: z.number().min(0),
  monto_unitario: z.number().min(0),
});

const referenciaOC = z.object({
  folio: z.string().min(1).max(50),
  fecha: z.string(),
});

export const emitDte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        invoiceId: z.string().uuid(),
        overrides: z
          .object({
            receptor: receptorOverride.optional(),
            fecha_emision: z.string().optional(),
            fecha_vencimiento: z.string().nullable().optional(),
            lineas: z.array(lineOverride).min(1).max(50).optional(),
            referencia_oc: referenciaOC.nullable().optional(),
          })
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let ov = data.overrides ?? {};

    // El SII rechaza DTE con fecha de emisión futura (OF-10 "Fecha Incorrecta").
    // Las cuotas programadas guardan fecha_emision a futuro, así que la topamos a hoy (CL).
    const hoyCL = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
    if (ov.fecha_emision && ov.fecha_emision > hoyCL) {
      ov = { ...ov, fecha_emision: hoyCL };
    }


    const { data: initialInv, error: initialErr } = await context.supabase
      .from("invoices")
      .select("id, estado, folio_sii, workspace_id")
      .eq("id", data.invoiceId)
      .single();
    if (initialErr) throw new Error(initialErr.message);

    // AUTHZ: emitting a DTE is a write action — finance_view is not enough.
    // Require finance_invoice or finance_manage, matching the invoices write RLS policy.
    const [{ data: canInvoice }, { data: canManage }] = await Promise.all([
      context.supabase.rpc("has_permission", {
        _workspace_id: initialInv.workspace_id,
        _user_id: context.userId,
        _perm: "finance_invoice",
      }),
      context.supabase.rpc("has_permission", {
        _workspace_id: initialInv.workspace_id,
        _user_id: context.userId,
        _perm: "finance_manage",
      }),
    ]);
    if (!canInvoice && !canManage) {
      throw new Error("No tienes permiso para emitir facturas (requiere finance_invoice o finance_manage).");
    }

    if (initialInv.estado === "emitted" || initialInv.estado === "paid") {
      throw new Error("La factura ya fue emitida");
    }
    if (initialInv.estado === "cancelled") {
      throw new Error("La factura está cancelada y no puede emitirse");
    }
    if (initialInv.estado === "scheduled") {
      // Existe una emisión en verificación: nunca reescribimos el borrador ni
      // reenviamos el DTE. Sólo intentaremos recuperar/conciliar el folio.
      ov = {};
    }


    // If overrides include new lines, replace invoice_lines and recompute totals first.
    if (ov.lineas && ov.lineas.length > 0) {
      const { data: invBase, error: baseErr } = await context.supabase
        .from("invoices")
        .select("id, tipo_dte")
        .eq("id", data.invoiceId)
        .single();
      if (baseErr) throw new Error(baseErr.message);

      // Preservar el link contract_payment_id de las líneas existentes: si el
      // usuario editó las líneas en el diálogo de emisión, no queremos romper
      // el vínculo cuota→factura (se usa después para marcar el pago
      // "invoiced" y para que la UI muestre un solo registro).
      const { data: prevLines } = await context.supabase
        .from("invoice_lines")
        .select("contract_payment_id")
        .eq("invoice_id", data.invoiceId);
      const preservedPaymentId =
        (prevLines ?? []).map((l) => l.contract_payment_id).find((x) => !!x) ?? null;
      let linkedPaymentId = preservedPaymentId;
      if (!linkedPaymentId) {
        const { data: linkedPayment } = await context.supabase
          .from("contract_payments")
          .select("id")
          .eq("invoice_id", data.invoiceId)
          .limit(1)
          .maybeSingle();
        linkedPaymentId = linkedPayment?.id ?? null;
      }

      const neto = ov.lineas.reduce(
        (s, l) => s + Math.round(Number(l.cantidad) * Number(l.monto_unitario)),
        0,
      );
      const iva = invBase.tipo_dte === 33 ? Math.round(neto * 0.19) : 0;
      const total = neto + iva;

      const { error: delErr } = await context.supabase
        .from("invoice_lines")
        .delete()
        .eq("invoice_id", data.invoiceId);
      if (delErr) throw new Error(delErr.message);

      const rows = ov.lineas.map((l, idx) => ({
        invoice_id: data.invoiceId,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        monto_unitario: l.monto_unitario,
        monto: Math.round(l.cantidad * l.monto_unitario),
        currency: "CLP",
        orden: idx,
        // Solo la primera línea conserva el vínculo a la cuota original.
        contract_payment_id: idx === 0 ? linkedPaymentId : null,
      }));
      const { error: insErr } = await context.supabase
        .from("invoice_lines")
        .insert(rows);
      if (insErr) throw new Error(insErr.message);

      const invoicePatch: Record<string, unknown> = {
        monto_neto: neto,
        monto_iva: iva,
        monto_total: total,
        monto_clp: neto,
      };
      if (ov.fecha_emision) {
        invoicePatch.fecha_emision = ov.fecha_emision;
        const d = new Date(ov.fecha_emision);
        invoicePatch.mes = d.getUTCMonth() + 1;
        invoicePatch.anio = d.getUTCFullYear();
      }
      if (ov.fecha_vencimiento !== undefined) {
        invoicePatch.fecha_vencimiento = ov.fecha_vencimiento;
      }
      const { error: upErr } = await context.supabase
        .from("invoices")
        .update(invoicePatch as never)
        .eq("id", data.invoiceId);
      if (upErr) throw new Error(upErr.message);
    } else if (ov.fecha_emision || ov.fecha_vencimiento !== undefined) {
      const invoicePatch: Record<string, unknown> = {};
      if (ov.fecha_emision) {
        invoicePatch.fecha_emision = ov.fecha_emision;
        const d = new Date(ov.fecha_emision);
        invoicePatch.mes = d.getUTCMonth() + 1;
        invoicePatch.anio = d.getUTCFullYear();
      }
      if (ov.fecha_vencimiento !== undefined) {
        invoicePatch.fecha_vencimiento = ov.fecha_vencimiento;
      }
      const { error: upErr } = await context.supabase
        .from("invoices")
        .update(invoicePatch as never)
        .eq("id", data.invoiceId);
      if (upErr) throw new Error(upErr.message);
    }

    const { data: inv, error } = await context.supabase
      .from("invoices")
      .select("*, invoice_lines(*), accounts(tax_id, legal_name, name, business_activity, address, commune, billing_email)")
      .eq("id", data.invoiceId)
      .single();
    if (error) throw new Error(error.message);
    if (inv.estado === "emitted" || inv.estado === "paid")
      throw new Error("La factura ya fue emitida");
    if (inv.estado === "cancelled")
      throw new Error("La factura está cancelada y no puede emitirse");

    const detailLines = ([...(inv.invoice_lines as Array<{
      orden: number;
      descripcion: string;
      cantidad: number;
      monto_unitario: number;
      monto: number;
      contract_payment_id?: string | null;
    }> ?? [])]).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    const detailNeto = detailLines.reduce((sum, l) => sum + Math.round(Number(l.monto)), 0);
    if (detailLines.length === 0 || detailNeto <= 0) {
      throw new Error("La factura no tiene líneas de detalle o monto para emitir.");
    }
    const headerNeto = Number(inv.monto_neto ?? 0) > 0 ? Number(inv.monto_neto) : detailNeto;
    const netoDte = Math.abs(headerNeto - detailNeto) > 1 ? detailNeto : headerNeto;
    const ivaDte = inv.tipo_dte === 33 ? Math.round(netoDte * 0.19) : 0;
    const totalDte = netoDte + ivaDte;

    // Use service-role client to read api_key — caller may not have SELECT on workspace_dte_config
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cfg, error: cerr } = await supabaseAdmin
      .from("workspace_dte_config")
      .select("api_key, ambiente, provider, activo, rut_emisor")
      .eq("workspace_id", inv.workspace_id)
      .maybeSingle();
    if (cerr) throw new Error(cerr.message);
    if (!cfg || !cfg.api_key || !cfg.activo) {
      throw new Error(
        "Configuración DTE inactiva. Configura el API key en Ajustes → Facturación electrónica.",
      );
    }

    const { data: emisor, error: eerr } = await supabaseAdmin
      .from("workspace_emisor")
      .select("direccion, comuna, razon_social, giro, acteco, email_contacto, email_finanzas, telefono")
      .eq("workspace_id", inv.workspace_id)
      .maybeSingle();
    if (eerr) throw new Error(eerr.message);
    const acteco = emisor?.acteco ?? Number((emisor?.giro ?? "").match(/^\s*(\d{5,6})\b/)?.[1]);
    if (!emisor?.razon_social || !emisor?.giro || !emisor?.direccion || !emisor?.comuna || !Number.isFinite(acteco)) {
      const missingEmisor: string[] = [];
      if (!emisor?.razon_social) missingEmisor.push("razón social");
      if (!emisor?.giro) missingEmisor.push("giro");
      if (!Number.isFinite(acteco)) missingEmisor.push("código de actividad económica");
      if (!emisor?.direccion) missingEmisor.push("dirección");
      if (!emisor?.comuna) missingEmisor.push("comuna");
      throw new Error(
        `Faltan datos del emisor: ${missingEmisor.join(", ")}. Complétalos en Ajustes → Emisor.`,
      );
    }


    const endpoint =
      cfg.ambiente === "production"
        ? "https://api.haulmer.com/v2/dte/document"
        : "https://dev-api.haulmer.com/v2/dte/document";

    const existingToken = ((inv as { token_sii?: string | null }).token_sii ?? "").trim();
    const existingFolio = ((inv as { folio_sii?: string | null }).folio_sii ?? "").trim();
    if (existingToken && !existingFolio) {
      const lookup = await fetchOpenFacturaJson(endpoint, existingToken, cfg.api_key);
      if (lookup.ok) {
        const recoveredFolio = pickProviderFolio(lookup.json);
        if (recoveredFolio) {
          const recoveredPdfUrl = providerPdfUrl(endpoint, existingToken);
          const { error: recoverErr } = await supabaseAdmin
            .from("invoices")
            .update({
              estado: "emitted",
              folio_sii: recoveredFolio,
              pdf_url: recoveredPdfUrl,
              emitido_at: new Date().toISOString(),
            })
            .eq("id", data.invoiceId);
          if (recoverErr) throw new Error(recoverErr.message);

          const paymentIds = detailLines
            .map((l) => l.contract_payment_id)
            .filter((x): x is string => !!x);
          if (paymentIds.length > 0) {
            await context.supabase
              .from("contract_payments")
              .update({ status: "invoiced" })
              .in("id", paymentIds);
          }
          return { ok: true, folio: recoveredFolio, pdfUrl: recoveredPdfUrl };
        }
      }
    }

    const cliente = inv.accounts as {
      tax_id?: string;
      legal_name?: string;
      name?: string;
      business_activity?: string;
      address?: string;
      commune?: string;
      billing_email?: string;
    } | null;

    // SII requires RUT without dots, with hyphen and uppercase check digit.
    const normalizeRut = (r?: string | null) =>
      (r ?? "").replace(/\./g, "").replace(/\s/g, "").toUpperCase() || undefined;

    // Prefer overrides, fall back to account data.
    const recRut = ov.receptor?.rut ?? cliente?.tax_id;
    const recRazon = ov.receptor?.razon_social ?? cliente?.legal_name ?? cliente?.name;
    const recGiro = ov.receptor?.giro ?? cliente?.business_activity;
    const recDir = ov.receptor?.direccion ?? cliente?.address;
    const recCmna = ov.receptor?.comuna ?? cliente?.commune;
    const recEmail = ov.receptor?.email ?? cliente?.billing_email;

    const missing: string[] = [];
    if (!recRut) missing.push("RUT");
    if (!recRazon) missing.push("razón social");
    if (!recGiro) missing.push("giro");
    if (!recDir) missing.push("dirección");
    if (!recCmna) missing.push("comuna");
    if (missing.length > 0) {
      throw new Error(
        `Faltan datos del receptor: ${missing.join(", ")}.`,
      );
    }

    // Última barrera: nunca enviar una fecha de emisión futura al SII.
    const fchEmis =
      inv.fecha_emision && String(inv.fecha_emision) > hoyCL
        ? hoyCL
        : String(inv.fecha_emision ?? hoyCL);
    if (String(inv.fecha_emision ?? "") !== fchEmis) {
      const d = new Date(fchEmis);
      await context.supabase
        .from("invoices")
        .update({
          fecha_emision: fchEmis,
          mes: d.getUTCMonth() + 1,
          anio: d.getUTCFullYear(),
        } as never)
        .eq("id", data.invoiceId);
    }

    const duplicate = await findIssuedOpenFacturaDuplicate({
      baseUrl: endpoint,
      apiKey: cfg.api_key,
      tipoDte: inv.tipo_dte,
      fechaEmision: fchEmis,
      rutRecep: recRut!,
      neto: netoDte,
      total: totalDte,
    });

    if (duplicate) {
      const duplicateFolio = pickProviderString(duplicate, "Folio", "FOLIO", "folio");
      const duplicateToken = pickProviderString(duplicate, "Token", "TOKEN", "token");
      const duplicatePdfUrl = providerPdfUrl(endpoint, duplicateToken);
      const { error: duplicateErr } = await supabaseAdmin
        .from("invoices")
        .update({
          estado: "emitted",
          folio_sii: duplicateFolio,
          token_sii: duplicateToken,
          pdf_url: duplicatePdfUrl,
          emitido_at: new Date().toISOString(),
        })
        .eq("id", data.invoiceId);
      if (duplicateErr) throw new Error(duplicateErr.message);

      const paymentIds = detailLines
        .map((l) => l.contract_payment_id)
        .filter((x): x is string => !!x);
      if (paymentIds.length > 0) {
        await context.supabase
          .from("contract_payments")
          .update({ status: "invoiced" })
          .in("id", paymentIds);
      }
      return { ok: true, folio: duplicateFolio, pdfUrl: duplicatePdfUrl };
    }

    if (existingToken && !existingFolio) {
      throw new Error(
        "El proveedor ya recibió este DTE y aún no entrega folio. No se reenvió para evitar duplicados; vuelve a intentar más tarde para recuperar el folio o concílialo manualmente.",
      );
    }

    const encabezado: Record<string, unknown> = {
      IdDoc: {
        TipoDTE: inv.tipo_dte,
        Folio: 0,
        FchEmis: fchEmis,
        TpoTranCompra: "1",
        TpoTranVenta: "1",
        FmaPago: "2",
        ...((inv as { fecha_vencimiento?: string | null }).fecha_vencimiento ? { FchVenc: (inv as { fecha_vencimiento?: string | null }).fecha_vencimiento } : {}),
      },
      Emisor: {
        RUTEmisor: normalizeRut(cfg.rut_emisor),
        RznSoc: emisor.razon_social,
        GiroEmis: emisor.giro,
        ...(emisor.telefono ? { Telefono: emisor.telefono } : {}),
        ...((emisor.email_contacto ?? emisor.email_finanzas) ? { CorreoEmisor: emisor.email_contacto ?? emisor.email_finanzas } : {}),
        Acteco: acteco,
        DirOrigen: emisor.direccion,
        CmnaOrigen: emisor.comuna,
      },
      Receptor: {
        RUTRecep: normalizeRut(recRut),
        RznSocRecep: recRazon,
        GiroRecep: recGiro,
        ...(recEmail ? { CorreoRecep: recEmail } : {}),
        DirRecep: recDir,
        CmnaRecep: recCmna,
      },
      Totales: {
        MntNeto: netoDte,
        TasaIVA: 19,
        IVA: ivaDte,
        MntTotal: totalDte,
        MontoPeriodo: totalDte,
        VlrPagar: totalDte,
      },
    };

    const dtePayload: Record<string, unknown> = {
      Encabezado: encabezado,
      Detalle: detailLines.map((l, i) => ({
        NroLinDet: i + 1,
        NmbItem: l.descripcion,
        QtyItem: Number(l.cantidad),
        PrcItem: Number(l.monto_unitario),
        MontoItem: Number(l.monto),
      })),
    };

    if (ov.referencia_oc) {
      dtePayload.Referencia = [
        {
          NroLinRef: 1,
          TpoDocRef: "801",
          FolioRef: ov.referencia_oc.folio,
          FchRef: ov.referencia_oc.fecha,
        },
      ];
    }

    const body = {
      response: ["PDF", "FOLIO"],
      dte: dtePayload,
    };

    const { data: lockRow, error: lockErr } = await supabaseAdmin
      .from("invoices")
      .update({
        estado: "scheduled",
        notas: `${(inv.notas ?? "").trim()}${inv.notas ? "\n" : ""}Emisión DTE iniciada ${new Date().toISOString()}; bloqueada contra reenvíos automáticos.`.slice(0, 2000),
      })
      .eq("id", data.invoiceId)
      .eq("estado", "draft")
      .is("folio_sii", null)
      .is("token_sii", null)
      .select("id")
      .maybeSingle();
    if (lockErr) throw new Error(lockErr.message);
    if (!lockRow) {
      const { data: current } = await supabaseAdmin
        .from("invoices")
        .select("estado, folio_sii, token_sii")
        .eq("id", data.invoiceId)
        .maybeSingle();
      if (current?.folio_sii || current?.estado === "emitted" || current?.estado === "paid") {
        throw new Error("La factura ya fue emitida");
      }
      throw new Error(
        "La factura ya está en proceso de emisión. No se reenvió al SII para evitar duplicados; espera unos segundos y vuelve a abrirla para recuperar el folio.",
      );
    }

    let folio: string | null = null;
    let pdfUrl: string | null = null;
    let token: string | null = null;
    let providerError: string | null = null;
    let releaseEmissionLockOnError = false;
    let pendingWithoutFolio = false;

    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: cfg.api_key,
          "Idempotency-Key": data.invoiceId,
        },
        body: JSON.stringify(body),
      });
      const text = await resp.text();
      if (!resp.ok) {
        providerError = `HTTP ${resp.status}: ${text.slice(0, 500)}`;
        releaseEmissionLockOnError = resp.status >= 400 && resp.status < 500;
      } else {
        try {
          const json = JSON.parse(text) as Record<string, unknown>;
          // Haulmer/OpenFactura V2 puede devolver campos en varias formas.
          folio = pickProviderFolio(json);
          token = pickProviderString(json, "TOKEN", "token", "Token");
          pdfUrl = pickProviderString(json, "urlPdf", "UrlPdf", "url_pdf", "pdfUrl") ?? providerPdfUrl(endpoint, token);
          if (!folio && token) {
            const lookup = await fetchOpenFacturaJson(endpoint, token, cfg.api_key);
            if (lookup.ok) {
              folio = pickProviderFolio(lookup.json);
              pdfUrl = pdfUrl ?? providerPdfUrl(endpoint, token);
            }
          }
          if (!folio) {
            if (token) {
              const pendingPdfUrl = providerPdfUrl(endpoint, token);
              await supabaseAdmin
                .from("invoices")
                .update({ token_sii: token, pdf_url: pendingPdfUrl })
                .eq("id", data.invoiceId);
              pdfUrl = pendingPdfUrl;
              pendingWithoutFolio = true;
            } else {
              providerError = `Respuesta sin folio del proveedor: ${text.slice(0, 500)}`;
            }
          }
        } catch {
          providerError = "Respuesta del proveedor no es JSON válido";
        }
      }
    } catch (e) {
      providerError = e instanceof Error ? e.message : "Error de red";
    }

    if (providerError) {
      if (releaseEmissionLockOnError) {
        await supabaseAdmin
          .from("invoices")
          .update({ estado: "draft" })
          .eq("id", data.invoiceId)
          .eq("estado", "scheduled")
          .is("folio_sii", null)
          .is("token_sii", null);
      }
      throw new Error(`Error emitiendo DTE: ${providerError}`);
    }

    if (pendingWithoutFolio) {
      return { ok: true, folio: null, pdfUrl, pending: true };
    }


    // CRÍTICO: usamos supabaseAdmin para el update post-emisión.
    // Si esta escritura falla (RLS, error transitorio), el DTE ya fue aceptado
    // por el SII y quedaría como "ghost invoice" (emitida en SII, sin folio
    // localmente). supabaseAdmin bypassa RLS y minimiza esa ventana.
    const { error: uerr } = await supabaseAdmin
      .from("invoices")
      .update({
        estado: "emitted",
        folio_sii: folio,
        token_sii: token,
        pdf_url: pdfUrl,
        emitido_at: new Date().toISOString(),
      })
      .eq("id", data.invoiceId);
    if (uerr) throw new Error(uerr.message);

    // Marcar los pagos ligados a esta factura como "invoiced" (solo tras emisión real).
    const paymentIds = detailLines
      .map((l) => l.contract_payment_id)
      .filter((x): x is string => !!x);
    if (paymentIds.length > 0) {
      await supabaseAdmin
        .from("contract_payments")
        .update({ status: "invoiced" })
        .in("id", paymentIds);
    }


    return { ok: true, folio, pdfUrl };
  });

export const getInvoicePdf = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ invoiceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Verify caller has access to the invoice (RLS-checked via authenticated client)
    const { data: invMeta, error: metaErr } = await context.supabase
      .from("invoices")
      .select("id, workspace_id")
      .eq("id", data.invoiceId)
      .single();
    if (metaErr) throw new Error(metaErr.message);

    // Read token_sii server-side only (column is revoked from authenticated)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv, error } = await supabaseAdmin
      .from("invoices")
      .select("id, workspace_id, folio_sii, token_sii, pdf_url, accounts(name)")
      .eq("id", invMeta.id)
      .single();
    if (error) throw new Error(error.message);
    const clientName = ((inv as unknown as { accounts?: { name?: string } | null }).accounts?.name ?? "").trim();

    const token = inv.token_sii ?? extractOpenFacturaToken(inv.pdf_url);
    if (!token) throw new Error("Esta factura no tiene token para recuperar el PDF.");

    const { data: cfg, error: cfgErr } = await supabaseAdmin
      .from("workspace_dte_config")
      .select("api_key, ambiente, activo")
      .eq("workspace_id", inv.workspace_id)
      .maybeSingle();
    if (cfgErr) throw new Error(cfgErr.message);

    const envApiKey = process.env.OPENFACTURA_API_KEY;
    const envAmbiente = process.env.OPENFACTURA_AMBIENTE;
    const apiKey = (cfg?.activo ? cfg.api_key : null) ?? envApiKey;
    if (!apiKey) {
      throw new Error("Configuración DTE inactiva. Configura el API key en Ajustes → Facturación electrónica.");
    }
    const ambiente = (cfg?.activo ? cfg.ambiente : null) ?? envAmbiente ?? "production";

    const isLegacyPdf = !!inv.pdf_url && /\/functions\/v1\/get-dte-pdf/i.test(inv.pdf_url);
    const baseUrl = ambiente === "production" || isLegacyPdf
      ? "https://api.haulmer.com/v2/dte/document"
      : "https://dev-api.haulmer.com/v2/dte/document";
    const response = await fetch(`${baseUrl}/${token}/pdf`, { headers: { apikey: apiKey } });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`OpenFactura respondió ${response.status}: ${text.slice(0, 200)}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    let pdfBytes = bytes;
    if (String.fromCharCode(bytes[0] ?? 0) === "{") {
      const json = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, string | undefined>;
      const pdfBase64 = json.PDF ?? json.pdf ?? json.DATA ?? json.data ?? json.content ?? json.Content;
      if (!pdfBase64) throw new Error("PDF no encontrado en la respuesta del proveedor.");
      const binary = atob(pdfBase64);
      pdfBytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) pdfBytes[i] = binary.charCodeAt(i);
    }

    const magic = String.fromCharCode(pdfBytes[0] ?? 0, pdfBytes[1] ?? 0, pdfBytes[2] ?? 0, pdfBytes[3] ?? 0);
    if (magic !== "%PDF") throw new Error("La respuesta del proveedor no es un PDF válido.");

    return {
      base64: bytesToBase64(pdfBytes),
      contentType: "application/pdf",
      filename: `FE ${inv.folio_sii ?? data.invoiceId}${clientName ? ` ${clientName}` : ""}.pdf`,
    };
  });

export const markInvoicePaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ invoiceId: z.string().uuid(), fechaPago: z.string().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("invoices")
      .update({ estado: "paid", pagada_at: (data.fechaPago ?? new Date().toISOString()) })
      .eq("id", data.invoiceId);
    if (error) throw new Error(error.message);

    // Cascade to linked contract_payments
    const { data: lines } = await context.supabase
      .from("invoice_lines")
      .select("contract_payment_id")
      .eq("invoice_id", data.invoiceId);
    const ids = (lines ?? []).map((l) => l.contract_payment_id).filter(Boolean) as string[];
    if (ids.length > 0) {
      await context.supabase
        .from("contract_payments")
        .update({ status: "paid", paid_at: data.fechaPago ?? new Date().toISOString().slice(0, 10) })
        .in("id", ids);
    }
    return { ok: true };
  });

export const cancelInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ invoiceId: z.string().uuid(), motivo: z.string().max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("invoices")
      .update({
        estado: "cancelled",
        cancelada_at: new Date().toISOString(),
        motivo_cancelacion: data.motivo,
      })
      .eq("id", data.invoiceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ AUTO-GENERATE INVOICES FROM SCHEDULED PAYMENTS ============

async function buildInvoiceFromPayment(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  paymentId: string,
) {
  const { data: p, error: perr } = await supabase
    .from("contract_payments")
    .select(
      "id, contract_id, kind, amount, currency, due_date, period_label, status, milestone_id, invoice_id, billing_entity_id, contracts(workspace_id, account_id, name, descripcion_factura, currency)",
    )
    .eq("id", paymentId)
    .single();
  if (perr) throw new Error(perr.message);
  if (!p) throw new Error("Pago no encontrado");
  if (p.status === "invoiced" || p.status === "paid" || p.status === "cancelled")
    throw new Error(`El pago ya está ${p.status}`);

  // Idempotencia: si el pago ya tiene una factura viva (borrador o emitida no
  // cancelada), reutilízala. Evita crear registros duplicados al reintentar.
  if (p.invoice_id) {
    const { data: existing, error: exErr } = await supabase
      .from("invoices")
      .select("id, estado")
      .eq("id", p.invoice_id)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (existing && existing.estado !== "cancelled") {
      return { invoiceId: existing.id as string };
    }
  }

  const c = (Array.isArray(p.contracts) ? p.contracts[0] : p.contracts) as {
    workspace_id: string;
    account_id: string | null;
    name: string;
    descripcion_factura: string | null;
    currency: string;
  };
  const currency = p.currency ?? c.currency ?? "CLP";
  const amount = Number(p.amount ?? 0);
  if (amount <= 0) throw new Error("El pago no tiene monto");
  const neto = await resolveClpAmount(supabase, c.workspace_id, currency, amount, new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" }));
  const iva = Math.round(neto * 0.19);
  const total = neto + iva;
  // fecha_emision = HOY (America/Santiago) para que la UF usada sea la del día
  // de emisión real, no la due_date programada del pago.
  const fecha = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  const d = new Date(fecha);

  // Glosa base: descripcion_factura (si el usuario la editó) o name del contrato.
  // Nunca usamos `code` (a menudo es UUID sucio en datos legacy).
  const baseDesc = (c.descripcion_factura?.trim() || c.name || "").trim();

  // Sufijo según tipo de pago (alineado con Sistema Comercial):
  //  - monthly con más de una cuota → " - N/Total"
  //  - milestone → " · Hito: <milestone.name>"
  //  - resto → sin sufijo
  let suffix = "";
  if (p.kind === "monthly") {
    const { count: total_cuotas } = await supabase
      .from("contract_payments")
      .select("id", { count: "exact", head: true })
      .eq("contract_id", p.contract_id)
      .eq("kind", "monthly")
      .filter("billing_entity_id", p.billing_entity_id ? "eq" : "is", p.billing_entity_id ?? "null");
    if ((total_cuotas ?? 0) > 1) {
      const { count: numero_cuota } = await supabase
        .from("contract_payments")
        .select("id", { count: "exact", head: true })
        .eq("contract_id", p.contract_id)
        .eq("kind", "monthly")
        .filter("billing_entity_id", p.billing_entity_id ? "eq" : "is", p.billing_entity_id ?? "null")
        .lte("due_date", p.due_date);
      suffix = ` - ${numero_cuota ?? 1}/${total_cuotas}`;
    }
  } else if (p.kind === "milestone" && p.milestone_id) {
    const { data: ms } = await supabase
      .from("milestones")
      .select("name")
      .eq("id", p.milestone_id)
      .single();
    suffix = ms?.name ? ` · Hito: ${ms.name}` : " · Hito";
  }

  const desc = `${baseDesc}${suffix}`;

  const { data: inv, error: ierr } = await supabase
    .from("invoices")
    .insert({
      workspace_id: c.workspace_id,
      account_id: c.account_id,
      contract_id: p.contract_id,
      billing_entity_id: (p as { billing_entity_id?: string | null }).billing_entity_id ?? null,
      tipo_dte: 33,
      descripcion: desc.slice(0, 500),
      fecha_emision: fecha,
      mes: d.getUTCMonth() + 1,
      anio: d.getUTCFullYear(),
      currency: "CLP",
      monto_neto: neto,
      monto_iva: iva,
      monto_total: total,
      monto_clp: neto,
      estado: "draft",
      created_by: userId,
    })
    .select("id")
    .single();
  if (ierr) throw new Error(ierr.message);

  const { error: lerr } = await supabase.from("invoice_lines").insert({
    invoice_id: inv.id,
    descripcion: desc.slice(0, 500),
    cantidad: 1,
    monto_unitario: neto,
    monto: neto,
    currency: "CLP",
    contract_payment_id: p.id,
    orden: 0,
  });
  if (lerr) throw new Error(lerr.message);

  // Vincula el borrador al pago: así la UI muestra UN solo registro (la cuota
  // pasa a badge "Borrador") y reintentos posteriores reutilizan esta factura.
  // El pago sigue "scheduled" hasta la emisión real al SII (ver emitDte).
  const { error: linkErr } = await supabase
    .from("contract_payments")
    .update({ invoice_id: inv.id })
    .eq("id", p.id);
  if (linkErr) throw new Error(linkErr.message);

  return { invoiceId: inv.id as string };
}

export const createInvoiceFromPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ paymentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    return buildInvoiceFromPayment(context.supabase, context.userId, data.paymentId);
  });

export const generatePendingInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        untilDate: z.string().optional(),
        paymentIds: z.array(z.string().uuid()).max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("contract_payments")
      .select("id, contracts!inner(workspace_id)")
      .eq("status", "scheduled")
      .eq("contracts.workspace_id", data.workspaceId)
      .order("due_date", { ascending: true })
      .limit(200);
    if (data.paymentIds && data.paymentIds.length > 0) {
      q = q.in("id", data.paymentIds);
    } else {
      const until = data.untilDate ?? new Date().toISOString().slice(0, 10);
      q = q.lte("due_date", until);
    }
    const { data: pays, error } = await q;
    if (error) throw new Error(error.message);

    let ok = 0;
    const errors: { paymentId: string; message: string }[] = [];
    // Bounded concurrency: procesa hasta 5 pagos en paralelo para reducir
    // latencia total sin saturar la DB ni provocar carreras en el trigger
    // que impide dos facturas activas por pago.
    const list = pays ?? [];
    const CONCURRENCY = 5;
    for (let i = 0; i < list.length; i += CONCURRENCY) {
      const chunk = list.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map((p) => buildInvoiceFromPayment(context.supabase, context.userId, p.id)),
      );
      results.forEach((r, idx) => {
        if (r.status === "fulfilled") ok += 1;
        else
          errors.push({
            paymentId: chunk[idx].id,
            message: r.reason instanceof Error ? r.reason.message : "Error",
          });
      });
    }
    return { created: ok, total: list.length, errors };
  });
