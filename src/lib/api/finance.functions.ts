import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const currencyEnum = z.enum(["USD", "CLP", "UF"]);

// ============ MY ROLE ============

export const getMyWorkspaceRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row?.role ?? null;
  });

// ============ SPRINT GENERATION ============

export const generateContractSprints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        contractId: z.string().uuid(),
        sprintDays: z.number().int().min(1).max(120),
        hoursPerSprint: z.number().min(0).max(10000).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: count, error } = await context.supabase.rpc("generate_contract_sprints", {
      _contract_id: data.contractId,
      _sprint_days: data.sprintDays,
      _hours_per_sprint: data.hoursPerSprint,
    });
    if (error) throw new Error(error.message);
    return { created: count ?? 0 };
  });

// ============ WORKSPACE-WIDE PAYMENTS (finance dashboard) ============

export const listWorkspacePayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        status: z.enum(["scheduled", "invoiced", "paid", "overdue", "cancelled"]).optional(),
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Single RPC replaces contracts fetch + payments query + currency_rates
    // fetch + Node-side UF resolution loop. UF resolution now runs inline in
    // SQL via a LATERAL join (migration: list_workspace_payments).
    const args: {
      _workspace_id: string;
      _status?: string;
      _from_date?: string;
      _to_date?: string;
    } = { _workspace_id: data.workspaceId };
    if (data.status) args._status = data.status;
    if (data.fromDate) args._from_date = data.fromDate;
    if (data.toDate) args._to_date = data.toDate;
    const { data: rows, error } = await context.supabase.rpc("list_workspace_payments", args);
    if (error) throw new Error(error.message);
    // PostgREST serializes numeric as string; cast the fields the UI reads as numbers.
    // Cast the whole row through unknown so downstream consumers keep every field
    // returned by the RPC (contract_name, description, folio_sii, etc.).
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
    const mapped: PaymentRow[] = ((rows ?? []) as unknown as RawRow[]).map((r) => ({
      ...r,
      amount: r.amount == null ? 0 : Number(r.amount),
      monto_clp: r.monto_clp == null ? null : Number(r.monto_clp),
      uf_usada: r.uf_usada == null ? null : Number(r.uf_usada),
    }));
    return mapped;
  });

export const getFinanceDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Single SQL aggregate replaces a contracts fetch + a scan of up to 5000
    // contract_payments rows in Node. See migration: get_finance_dashboard.
    const { data: row, error } = await context.supabase.rpc("get_finance_dashboard", {
      _workspace_id: data.workspaceId,
    });
    if (error) throw new Error(error.message);
    const j = (row ?? {}) as {
      byStatus?: Record<string, number>;
      byCurrency?: Record<
        string,
        { scheduled: number | string; paid: number | string; overdue: number | string }
      >;
      overdueCount?: number;
      upcomingCount?: number;
    };
    // Normalize numerics (jsonb keeps them as numbers, but numeric aggregates can serialize as strings).
    const byCurrency: Record<string, { scheduled: number; paid: number; overdue: number }> = {};
    for (const [cur, v] of Object.entries(j.byCurrency ?? {})) {
      byCurrency[cur] = {
        scheduled: Number(v.scheduled ?? 0),
        paid: Number(v.paid ?? 0),
        overdue: Number(v.overdue ?? 0),
      };
    }
    return {
      byStatus: j.byStatus ?? {},
      byCurrency,
      overdueCount: Number(j.overdueCount ?? 0),
      upcomingCount: Number(j.upcomingCount ?? 0),
    };
  });

// ============ CURRENCY RATES ============

export const listCurrencyRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("currency_rates")
      .select("id, currency, base_currency, rate_to_base, rate_date, notes, updated_at")
      .eq("workspace_id", data.workspaceId)
      .order("rate_date", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertCurrencyRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        currency: currencyEnum,
        baseCurrency: currencyEnum.default("USD"),
        rateToBase: z.number().positive(),
        rateDate: z.string(),
        notes: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("currency_rates").upsert(
      {
        workspace_id: data.workspaceId,
        currency: data.currency,
        base_currency: data.baseCurrency,
        rate_to_base: data.rateToBase,
        rate_date: data.rateDate,
        notes: data.notes ?? null,
        created_by: context.userId,
      },
      { onConflict: "workspace_id,currency,rate_date" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCurrencyRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ rateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("currency_rates").delete().eq("id", data.rateId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ UF INDICATOR / REFRESH ============
// Replica el comportamiento del Sistema Comercial: lee el último valor UF
// almacenado y, opcionalmente, lo refresca desde mindicador.cl.

export const getLatestUfRate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("currency_rates")
      .select("rate_to_base, rate_date, updated_at")
      .eq("workspace_id", data.workspaceId)
      .eq("currency", "UF")
      .eq("base_currency", "CLP")
      .order("rate_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return {
      valor: Number(row.rate_to_base),
      fecha: String(row.rate_date).slice(0, 10),
      updatedAt: row.updated_at,
    };
  });

export const refreshUfRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const year = new Date().getFullYear();
    const url = "https://mindicador.cl/api/uf";
    let series: Array<{ fecha: string; valor: number }> = [];
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { Accept: "application/json", "User-Agent": "Riel-UF/1.0" },
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`mindicador.cl ${res.status}`);
      const json = (await res.json()) as { serie?: Array<{ fecha: string; valor: number }> };
      if (Array.isArray(json.serie)) {
        series = json.serie
          .map((s) => ({ fecha: String(s.fecha).split("T")[0], valor: Number(s.valor) }))
          .filter((s) => s.fecha.startsWith(`${year}-`) && Number.isFinite(s.valor) && s.valor > 0);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, count: 0, error: `No se pudo consultar mindicador.cl: ${msg}` };
    }

    if (series.length === 0) {
      return { ok: false, count: 0, error: "Respuesta vacía de mindicador.cl" };
    }

    const rows = series.map((s) => ({
      workspace_id: data.workspaceId,
      currency: "UF" as const,
      base_currency: "CLP" as const,
      rate_to_base: s.valor,
      rate_date: s.fecha,
      created_by: context.userId,
    }));
    const { error } = await context.supabase
      .from("currency_rates")
      .upsert(rows, { onConflict: "workspace_id,currency,rate_date" });
    if (error) throw new Error(error.message);

    const latest = series.reduce((a, b) => (a.fecha > b.fecha ? a : b));
    return { ok: true, count: rows.length, latest };
  });
