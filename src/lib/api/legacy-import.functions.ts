import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LEGACY_ENDPOINT = "https://vdsckstviqqqlkahrpmb.supabase.co/functions/v1/export-legacy";

type LegacyCliente = {
  id: string;
  nombre: string;
  razon_social?: string | null;
  rut?: string | null;
  giro?: string | null;
  direccion?: string | null;
  comuna?: string | null;
  ciudad?: string | null;
  // Nombres reales que devuelve export-legacy del sistema comercial:
  email_envio_dte?: string | null;
  contacto_principal?: string | null;
  contacto_principal_email?: string | null;
  contactos_secundarios?: unknown; // jsonb array [{nombre, email}, ...]
  notas?: string | null;
  // Aliases opcionales (por si en el futuro cambian los nombres):
  email_facturacion?: string | null;
  contacto_nombre?: string | null;
  contacto_email?: string | null;
  contactos_adicionales?: unknown;
  sitio_web?: string | null;
};

type LegacyContrato = {
  id: string;
  cliente: string;
  cliente_id?: string | null;
  descripcion: string | null;
  fecha_inicio: string;
  monto_uf: number | null;
  monto_clp: number | null;
  moneda: "UF" | "CLP" | string;
};

type LegacyFactura = {
  id: string;
  contrato_id: string | null;
  cliente: string;
  cliente_id?: string | null;
  descripcion: string | null;
  fecha_facturacion: string;
  mes: string | null;
  anio: number | null;
  monto_uf: number | null;
  monto_clp: number | null;
  moneda: string;
  estado: string | null;
  openfactura_folio: number | null;
  dte_emitido_at: string | null;
  dte_pdf_url: string | null;
  observaciones: string | null;
};

type LegacyHito = {
  id: string;
  contrato_id: string;
  numero_hito: number;
  nombre: string;
  descripcion: string | null;
  monto_uf: number | null;
  monto_clp: number | null;
  moneda: string;
  fecha_estimada: string;
  fecha_cumplimiento: string | null;
  estado: string;
  factura_id: string | null;
};

type LegacyUF = { fecha: string; valor: number };

/**
 * Lookup UF value for a given ISO date (YYYY-MM-DD), replicating the commercial
 * system logic: exact day → nearest previous day within 30 days → last known.
 */
function buildUfLookup(valores: LegacyUF[]) {
  const byDate = new Map<string, number>();
  let lastKnown: { fecha: string; valor: number } | null = null;
  for (const v of valores) {
    const key = v.fecha.slice(0, 10);
    byDate.set(key, v.valor);
    if (!lastKnown || key > lastKnown.fecha) lastKnown = { fecha: key, valor: v.valor };
  }
  return (isoDate: string): number => {
    const key = isoDate.slice(0, 10);
    if (byDate.has(key)) return byDate.get(key)!;
    const d = new Date(`${key}T00:00:00Z`);
    for (let i = 1; i <= 30; i++) {
      const prev = new Date(d);
      prev.setUTCDate(prev.getUTCDate() - i);
      const k = prev.toISOString().slice(0, 10);
      if (byDate.has(k)) return byDate.get(k)!;
    }
    return lastKnown?.valor ?? 38500;
  };
}

function latestUfDate(valores: LegacyUF[]): string | null {
  return (
    valores
      .map((v) => v.fecha.slice(0, 10))
      .filter(Boolean)
      .sort()
      .slice(-1)[0] ?? null
  );
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "cliente"
  );
}

const MES_TO_NUM: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

export const importLegacyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ workspaceId: z.string().uuid(), dryRun: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { workspaceId, dryRun } = data;
    const { supabase, userId } = context;

    // Authorize caller (must have admin_settings)
    const { data: allowed, error: permErr } = await supabase.rpc("has_permission", {
      _workspace_id: workspaceId,
      _user_id: userId,
      _perm: "admin_settings",
    });
    if (permErr) throw new Error(permErr.message);
    if (!allowed) throw new Error("Solo administradores pueden importar datos legacy.");

    const token = process.env.LEGACY_EXPORT_TOKEN;
    if (!token) throw new Error("LEGACY_EXPORT_TOKEN no está configurado en el servidor.");

    // Fetch legacy payload
    const res = await fetch(LEGACY_ENDPOINT, {
      method: "GET",
      headers: { "X-Export-Token": token },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Legacy endpoint respondió ${res.status}: ${body.slice(0, 200)}`);
    }
    const payload = (await res.json()) as {
      clientes?: LegacyCliente[];
      contratos?: LegacyContrato[];
      facturas?: LegacyFactura[];
      hitos?: LegacyHito[];
      valores_uf?: LegacyUF[];
    };
    const clientesLegacy = payload.clientes ?? [];
    const contratos = payload.contratos ?? [];
    const facturas = payload.facturas ?? [];
    const hitos = payload.hitos ?? [];
    const valoresUf = payload.valores_uf ?? [];
    const ufValor = buildUfLookup(payload.valores_uf ?? []);
    const todayISO = new Date().toISOString().slice(0, 10);
    const ufHoy = ufValor(todayISO);

    if (dryRun) {
      const clientes = new Set(contratos.map((c) => c.cliente?.trim()).filter(Boolean));
      const maxISO = (arr: string[]) =>
        arr
          .filter(Boolean)
          .map((s) => s.slice(0, 10))
          .sort()
          .slice(-1)[0] ?? null;
      const ultimaFactura = maxISO(facturas.map((f) => f.fecha_facturacion));
      const ultimoDteEmitido = maxISO(facturas.map((f) => f.dte_emitido_at ?? "").filter(Boolean));
      const ultimoContratoInicio = maxISO(contratos.map((c) => c.fecha_inicio));
      const ultimoHito = maxISO(hitos.map((h) => h.fecha_cumplimiento ?? h.fecha_estimada ?? ""));
      const ultimaUf = latestUfDate(valoresUf);
      return {
        dryRun: true,
        clientes: clientesLegacy.length,
        clientesConRut: clientesLegacy.filter((c) => !!c.rut?.trim()).length,
        contratos: contratos.length,
        facturas: facturas.length,
        hitos: hitos.length,
        clientesUnicos: clientes.size,
        hoy: todayISO,
        frescura: {
          ultimaFactura,
          ultimoDteEmitido,
          ultimoContratoInicio,
          ultimoHito,
          ultimaUf,
          ufHoy,
        },
      };
    }

    // Use admin client to bypass RLS for bulk import (caller already authorized)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const errors: string[] = [];

    const latestUf = valoresUf.reduce<LegacyUF | null>((latest, item) => {
      const currentDate = item.fecha.slice(0, 10);
      return !latest || currentDate > latest.fecha.slice(0, 10) ? item : latest;
    }, null);
    if (latestUf) {
      const { error: rateErr } = await supabaseAdmin.from("currency_rates").upsert(
        {
          workspace_id: workspaceId,
          currency: "UF",
          base_currency: "CLP",
          rate_to_base: latestUf.valor,
          rate_date: latestUf.fecha.slice(0, 10),
          notes: "Importado desde sistema comercial",
          created_by: userId,
        },
        { onConflict: "workspace_id,currency,rate_date" },
      );
      if (rateErr) errors.push(`currency_rates UF: ${rateErr.message}`);
    }

    let accountsCreated = 0;
    let contractsCreated = 0;
    let contractsUpdated = 0;
    let invoicesCreated = 0;
    let invoicesUpdated = 0;

    // ---- 1) Build/load accounts. Prefer `clientes[]` payload (rich fields
    //         matched by tax_id/name). Fall back to name-only accounts derived
    //         from contratos/facturas when no rich record exists.
    let accountsUpdated = 0;

    const { data: existingAccounts, error: accErr } = await supabaseAdmin
      .from("accounts")
      .select("id, name, tax_id, notes")
      .eq("workspace_id", workspaceId);
    if (accErr) throw new Error(`accounts select: ${accErr.message}`);

    const accountByName = new Map<string, string>();
    const accountByTaxId = new Map<string, string>();
    const accountByLegacyId = new Map<string, string>();
    const LEGACY_ID_TAG = "legacy_cliente_id:";
    for (const a of existingAccounts ?? []) {
      accountByName.set(a.name.trim().toLowerCase(), a.id);
      if (a.tax_id) accountByTaxId.set(a.tax_id.trim().toLowerCase(), a.id);
      const match = a.notes?.match(/legacy_cliente_id:([^\s]+)/);
      if (match) accountByLegacyId.set(match[1], a.id);
    }

    async function pickUniqueSlug(name: string): Promise<string> {
      const base = slugify(name);
      let slug = base;
      let n = 1;
      while (true) {
        const { data: clash } = await supabaseAdmin
          .from("accounts")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("slug", slug)
          .maybeSingle();
        if (!clash) return slug;
        n += 1;
        slug = `${base}-${n}`;
      }
    }

    // 1a) Upsert rich clientes from legacy payload
    for (const cli of clientesLegacy) {
      const name = (cli.nombre || cli.razon_social || "").trim();
      if (!name) continue;
      const rutKey = cli.rut?.trim().toLowerCase();
      const existingId =
        accountByLegacyId.get(cli.id) ??
        (rutKey ? accountByTaxId.get(rutKey) : undefined) ??
        accountByName.get(name.toLowerCase());

      const notesTag = `${LEGACY_ID_TAG}${cli.id}`;
      const contactosSec =
        (Array.isArray(cli.contactos_secundarios) && cli.contactos_secundarios) ||
        (Array.isArray(cli.contactos_adicionales) && cli.contactos_adicionales) ||
        [];
      const fields = {
        name,
        legal_name: cli.razon_social?.trim() || null,
        tax_id: cli.rut?.trim() || null,
        business_activity: cli.giro?.trim() || null,
        billing_email: cli.email_envio_dte?.trim() || cli.email_facturacion?.trim() || null,
        address: [cli.direccion, cli.ciudad].filter(Boolean).join(", ") || null,
        commune: cli.comuna?.trim() || null,
        primary_contact_name: cli.contacto_principal?.trim() || cli.contacto_nombre?.trim() || null,
        primary_contact_email:
          cli.contacto_principal_email?.trim() || cli.contacto_email?.trim() || null,
        secondary_contacts: contactosSec as never,
        website: cli.sitio_web?.trim() || null,
        notes: [cli.notas?.trim(), notesTag].filter(Boolean).join("\n"),
      };

      if (existingId) {
        const { error: upErr } = await supabaseAdmin
          .from("accounts")
          .update(fields)
          .eq("id", existingId);
        if (upErr) {
          errors.push(`cliente ${cli.id} update: ${upErr.message}`);
          continue;
        }
        accountsUpdated += 1;
        accountByLegacyId.set(cli.id, existingId);
        if (rutKey) accountByTaxId.set(rutKey, existingId);
        accountByName.set(name.toLowerCase(), existingId);
      } else {
        const slug = await pickUniqueSlug(name);
        const { data: inserted, error: insErr } = await supabaseAdmin
          .from("accounts")
          .insert({
            ...fields,
            workspace_id: workspaceId,
            slug,
            created_by: userId,
          })
          .select("id")
          .single();
        if (insErr) {
          errors.push(`cliente ${cli.id} insert: ${insErr.message}`);
          continue;
        }
        accountByLegacyId.set(cli.id, inserted.id);
        if (rutKey) accountByTaxId.set(rutKey, inserted.id);
        accountByName.set(name.toLowerCase(), inserted.id);
        accountsCreated += 1;
      }
    }

    // 1b) Ensure name-only accounts exist for any cliente referenced by
    //     contratos/facturas that didn't come in the clientes[] payload.
    const clienteNames = Array.from(
      new Set(
        [...contratos, ...facturas].map((c) => c.cliente?.trim()).filter((s): s is string => !!s),
      ),
    );
    for (const name of clienteNames) {
      const key = name.toLowerCase();
      if (accountByName.has(key)) continue;
      const slug = await pickUniqueSlug(name);
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("accounts")
        .insert({
          workspace_id: workspaceId,
          name,
          slug,
          created_by: userId,
        })
        .select("id")
        .single();
      if (insErr) {
        errors.push(`account ${name}: ${insErr.message}`);
        continue;
      }
      accountByName.set(key, inserted.id);
      accountsCreated += 1;
    }

    function resolveAccountId(
      legacyClienteId: string | null | undefined,
      clienteName: string | null | undefined,
    ): string | undefined {
      if (legacyClienteId) {
        const byId = accountByLegacyId.get(legacyClienteId);
        if (byId) return byId;
      }
      const key = clienteName?.trim().toLowerCase();
      return key ? accountByName.get(key) : undefined;
    }

    // ---- 2) Upsert contracts (idempotent by code = legacy id) ----
    const { data: existingContracts, error: cErr } = await supabaseAdmin
      .from("contracts")
      .select("id, code")
      .eq("workspace_id", workspaceId)
      .not("code", "is", null);
    if (cErr) throw new Error(`contracts select: ${cErr.message}`);

    const contractByLegacyId = new Map<string, string>();
    for (const c of existingContracts ?? []) {
      if (c.code) contractByLegacyId.set(c.code, c.id);
    }

    for (const cont of contratos) {
      const accountId = resolveAccountId(cont.cliente_id ?? null, cont.cliente);
      if (!accountId) {
        errors.push(`contrato ${cont.id}: cliente no encontrado (${cont.cliente})`);
        continue;
      }

      const currency = cont.moneda === "UF" ? "UF" : cont.moneda === "CLP" ? "CLP" : "CLP";
      const name = cont.descripcion?.trim() || `Contrato ${cont.id.slice(0, 8)}`;
      const fields = {
        workspace_id: workspaceId,
        account_id: accountId,
        name,
        code: cont.id,
        type: "recurrente" as const,
        billing_model: "fixed" as const,
        status: "activo" as const,
        currency,
        start_date: cont.fecha_inicio,
        sprint_duration_days: 30,
        sprint_cadence: "monthly" as const,
        created_by: userId,
        observaciones: `Importado desde sistema comercial (id legacy: ${cont.id})`,
      };

      const existingId = contractByLegacyId.get(cont.id);
      if (existingId) {
        const { error: upErr } = await supabaseAdmin
          .from("contracts")
          .update({
            account_id: fields.account_id,
            name: fields.name,
            currency: fields.currency,
            start_date: fields.start_date,
          })
          .eq("id", existingId);
        if (upErr) {
          errors.push(`contrato ${cont.id} update: ${upErr.message}`);
          continue;
        }
        contractsUpdated += 1;
      } else {
        const { data: inserted, error: insErr } = await supabaseAdmin
          .from("contracts")
          .insert(fields)
          .select("id")
          .single();
        if (insErr) {
          errors.push(`contrato ${cont.id} insert: ${insErr.message}`);
          continue;
        }
        contractByLegacyId.set(cont.id, inserted.id);
        contractsCreated += 1;
      }

      // Set monthly fee in contract_financials if monto present
      const monthlyFee = currency === "UF" ? (cont.monto_uf ?? 0) : (cont.monto_clp ?? 0);
      if (monthlyFee > 0) {
        const ourContractId = contractByLegacyId.get(cont.id)!;
        const { error: finErr } = await supabaseAdmin.from("contract_financials").upsert(
          {
            contract_id: ourContractId,
            monthly_fee: monthlyFee,
            fee_total: monthlyFee,
          },
          { onConflict: "contract_id" },
        );
        if (finErr) errors.push(`financials ${cont.id}: ${finErr.message}`);
      }
    }

    // ---- 3) Upsert invoices (idempotent by numero_interno = legacy id) ----
    const { data: existingInvoices, error: iErr } = await supabaseAdmin
      .from("invoices")
      .select("id, numero_interno")
      .eq("workspace_id", workspaceId)
      .not("numero_interno", "is", null);
    if (iErr) throw new Error(`invoices select: ${iErr.message}`);

    const invoiceByLegacyId = new Map<string, string>();
    for (const inv of existingInvoices ?? []) {
      if (inv.numero_interno) invoiceByLegacyId.set(inv.numero_interno, inv.id);
    }

    for (const fac of facturas) {
      const cliente = fac.cliente?.trim();
      const accountId = resolveAccountId(fac.cliente_id ?? null, cliente) ?? null;
      let contractId = fac.contrato_id ? (contractByLegacyId.get(fac.contrato_id) ?? null) : null;

      if (!contractId && accountId) {
        const syntheticCode = `legacy-invoices:${cliente?.toLowerCase()}`;
        contractId = contractByLegacyId.get(syntheticCode) ?? null;
        if (!contractId) {
          const { data: insertedSynthetic, error: syntheticErr } = await supabaseAdmin
            .from("contracts")
            .insert({
              workspace_id: workspaceId,
              account_id: accountId,
              name: "Facturas sin contrato legacy",
              code: syntheticCode,
              type: "recurrente" as const,
              billing_model: "fixed" as const,
              status: "activo" as const,
              currency: fac.moneda === "UF" ? "UF" : "CLP",
              start_date: fac.fecha_facturacion,
              sprint_duration_days: 30,
              sprint_cadence: "monthly" as const,
              created_by: userId,
              observaciones: "Contrato auxiliar para facturas legacy sin contrato_id",
            })
            .select("id")
            .single();
          if (syntheticErr) {
            errors.push(`contrato auxiliar ${fac.id}: ${syntheticErr.message}`);
          } else {
            contractId = insertedSynthetic.id;
            contractByLegacyId.set(syntheticCode, insertedSynthetic.id);
            contractsCreated += 1;
          }
        }
      }

      const currency = fac.moneda === "UF" ? "UF" : "CLP";
      const isEmitted = fac.estado?.toLowerCase() === "facturado";
      const estado: "emitted" | "draft" = isEmitted ? "emitted" : "draft";
      const mesNum = fac.mes ? (MES_TO_NUM[fac.mes.toLowerCase()] ?? null) : null;

      // Amount in the invoice's own currency (UF or CLP).
      const amountInCurrency = currency === "UF" ? (fac.monto_uf ?? 0) : (fac.monto_clp ?? 0);
      // monto_clp mirrors the commercial system's GestionFacturas rule:
      //  - CLP invoices: stored monto_clp.
      //  - UF "Facturado": stored monto_clp (fixed value at emission time);
      //    fallback to fecha_facturacion UF if missing.
      //  - UF "Por facturar": convert monto_uf with UF DEL DÍA (today), not
      //    fecha_facturacion — that's how the commercial billing view shows it.
      const montoClp =
        currency === "CLP"
          ? (fac.monto_clp ?? 0)
          : isEmitted
            ? (fac.monto_clp ?? Math.round((fac.monto_uf ?? 0) * ufValor(fac.fecha_facturacion)))
            : Math.round((fac.monto_uf ?? 0) * ufHoy);
      // fecha_emision = actual emission date. Only populated when the invoice was
      // really emitted ("Facturado"); drafts/scheduled keep it null and use due_date.
      const fechaEmisionReal = isEmitted
        ? (fac.dte_emitido_at?.slice(0, 10) ?? fac.fecha_facturacion)
        : null;

      const fields = {
        workspace_id: workspaceId,
        account_id: accountId,
        contract_id: contractId,
        numero_interno: fac.id,
        descripcion: fac.descripcion,
        fecha_emision: fechaEmisionReal,
        mes: mesNum,
        anio: fac.anio,
        currency,
        monto_neto: amountInCurrency,
        monto_iva: 0,
        monto_total: amountInCurrency,
        monto_clp: montoClp,
        estado,
        folio_sii: fac.openfactura_folio?.toString() ?? null,
        pdf_url: fac.dte_pdf_url,
        emitido_at: fac.dte_emitido_at,
        notas: fac.observaciones,
        created_by: userId,
      };

      const existingId = invoiceByLegacyId.get(fac.id);
      if (existingId) {
        const { error: upErr } = await supabaseAdmin
          .from("invoices")
          .update(fields)
          .eq("id", existingId);
        if (upErr) {
          errors.push(`factura ${fac.id} update: ${upErr.message}`);
          continue;
        }
        invoicesUpdated += 1;
      } else {
        const { data: inserted, error: insErr } = await supabaseAdmin
          .from("invoices")
          .insert(fields)
          .select("id")
          .single();
        if (insErr) {
          errors.push(`factura ${fac.id} insert: ${insErr.message}`);
          continue;
        }
        invoiceByLegacyId.set(fac.id, inserted.id);
        invoicesCreated += 1;
      }
    }

    // ---- 4) Rebuild monthly contract_payments from legacy invoices only ----
    // The finance module reads contract_payments. To mirror the commercial system faithfully,
    // every legacy invoice becomes one monthly payment row linked to its invoice. We do not
    // invent projections here because the commercial system already exports future drafts.
    let paymentsCreated = 0;
    let paymentsDeleted = 0;

    const ourContractIds = Array.from(contractByLegacyId.values());
    if (ourContractIds.length > 0) {
      // Idempotent: clear legacy-imported monthly + milestone rows before regenerating.
      // Marker: notes contains "sistema comercial" / "Hito legacy".
      const { data: deleted, error: delErr } = await supabaseAdmin
        .from("contract_payments")
        .delete()
        .in("contract_id", ourContractIds)
        .in("kind", ["monthly", "milestone"])
        .or("notes.ilike.%sistema comercial%,notes.ilike.%Hito legacy%")
        .select("id");
      if (delErr) errors.push(`delete scheduled payments: ${delErr.message}`);
      paymentsDeleted = deleted?.length ?? 0;

      type PaymentInsert = {
        contract_id: string;
        kind: "monthly" | "milestone";
        amount: number;
        currency: string;
        due_date: string;
        status: "scheduled" | "invoiced";
        period_label: string;
        invoice_id?: string | null;
        notes: string;
      };
      const toInsert: PaymentInsert[] = [];

      // 4a) Strict 1:1 mirror — one row per legacy invoice (history + drafts).
      // We do NOT invent projections; if a row is missing in June it's because the
      // legacy export does not have it yet (e.g. future milestones not created).
      for (const fac of facturas) {
        const contractId = fac.contrato_id
          ? contractByLegacyId.get(fac.contrato_id)
          : contractByLegacyId.get(`legacy-invoices:${fac.cliente?.trim().toLowerCase()}`);
        if (!contractId) continue;
        const invoiceId = invoiceByLegacyId.get(fac.id) ?? null;
        const currency = fac.moneda === "UF" ? "UF" : "CLP";
        const amount = currency === "UF" ? (fac.monto_uf ?? 0) : (fac.monto_clp ?? 0);
        if (amount <= 0) continue;
        const mesNum = fac.mes ? (MES_TO_NUM[fac.mes.toLowerCase()] ?? null) : null;
        const period =
          fac.anio && mesNum
            ? `${fac.anio}-${String(mesNum).padStart(2, "0")}`
            : fac.fecha_facturacion.slice(0, 7);
        toInsert.push({
          contract_id: contractId,
          kind: "monthly",
          amount,
          currency,
          due_date: fac.fecha_facturacion,
          status: fac.estado?.toLowerCase() === "facturado" ? "invoiced" : "scheduled",
          period_label: period,
          invoice_id: invoiceId,
          notes: "Importado desde sistema comercial",
        });
      }

      // 4b) Pending milestones (hitos_contrato with factura_id IS NULL).
      // In the commercial system these show in the billing view as "Por facturar"
      // with fecha_facturacion = fecha_estimada. Once a hito gets invoiced it
      // already appears as a factura (handled in 4a), so we skip those here.
      for (const hito of hitos) {
        if (hito.factura_id) continue; // already represented as a factura
        const contractId = contractByLegacyId.get(hito.contrato_id);
        if (!contractId) continue;
        const currency = hito.moneda === "UF" ? "UF" : "CLP";
        const amount = currency === "UF" ? (hito.monto_uf ?? 0) : (hito.monto_clp ?? 0);
        if (amount <= 0) continue;
        const period = hito.fecha_estimada.slice(0, 7);
        toInsert.push({
          contract_id: contractId,
          kind: "milestone",
          amount,
          currency,
          due_date: hito.fecha_estimada,
          status: "scheduled",
          period_label: period,
          invoice_id: null,
          notes: `Hito legacy ${hito.numero_hito}: ${hito.nombre}`,
        });
      }

      for (let i = 0; i < toInsert.length; i += 200) {
        const chunk = toInsert.slice(i, i + 200);
        const { error: insErr } = await supabaseAdmin.from("contract_payments").insert(chunk);
        if (insErr) errors.push(`payments insert chunk ${i}: ${insErr.message}`);
        else paymentsCreated += chunk.length;
      }
    }

    // ---- 5) Clean up operational side-effects from contract activation ----
    // The DB trigger `handle_contract_activation` auto-creates a contract_handoffs
    // row when a contract flips to 'activo'. For legacy imports we only want the
    // contract + billing history — NO handoffs, projects, sprints, phases or tasks.
    let handoffsRemoved = 0;
    const ourContractIdsForCleanup = Array.from(contractByLegacyId.values());
    if (ourContractIdsForCleanup.length > 0) {
      const { data: removed, error: hErr } = await supabaseAdmin
        .from("contract_handoffs")
        .delete()
        .in("contract_id", ourContractIdsForCleanup)
        .in("state", ["pendiente", "en_planificacion"])
        .select("id");
      if (hErr) errors.push(`handoffs cleanup: ${hErr.message}`);
      else handoffsRemoved = removed?.length ?? 0;
    }

    return {
      dryRun: false,
      totals: {
        clientes: clientesLegacy.length,
        contratos: contratos.length,
        facturas: facturas.length,
        hitos: hitos.length,
      },
      results: {
        accountsCreated,
        accountsUpdated,
        contractsCreated,
        contractsUpdated,
        invoicesCreated,
        invoicesUpdated,
        paymentsCreated,
        paymentsDeleted,
        handoffsRemoved,
      },

      errors: errors.slice(0, 50),
      errorCount: errors.length,
    };
  });
