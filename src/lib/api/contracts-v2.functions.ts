import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const frequencyEnum = z.enum(["mensual", "trimestral", "semestral", "anual", "unica", "hitos"]);
const currencyEnum = z.enum(["USD", "CLP", "UF"]);
const modeEnum = z.enum(["simple", "multiservicio"]);
const typeEnum = z.enum(["implementation", "recurrente"]);
const duracionTipoEnum = z.enum(["meses", "indefinido", "manual"]);
const statusEnum = z.enum(["borrador", "activo"]);

const milestoneInput = z.object({
  numeroHito: z.number().int().min(1),
  nombre: z.string().min(1).max(160),
  descripcion: z.string().max(2000).nullable().optional(),
  monto: z.number().min(0).nullable().optional(),
  moneda: currencyEnum.default("CLP"),
  fechaEstimada: z.string().nullable().optional(),
  orden: z.number().int().min(0).default(0),
});

const lineInput = z.object({
  serviceTypeId: z.string().uuid().nullable().optional(),
  tipoServicio: z.string().min(1).max(120),
  descripcion: z.string().max(2000).optional().nullable(),
  frecuencia: frequencyEnum,
  numeroCuotas: z.number().int().min(1).max(120).optional().nullable(),
  monto: z.number().min(0).optional().nullable(),
  moneda: currencyEnum.default("CLP"),
  esBono: z.boolean().default(false),
  fechaPrimerPago: z.string().optional().nullable(),
  orden: z.number().int().min(0).default(0),
  hitos: z.array(milestoneInput).optional().default([]),
});

/**
 * Crea un contrato. Por defecto `proyectado` (pipeline de Finanzas).
 * Si `status === "active"` se dispara el trigger de handoff de inmediato.
 */
export const createProjectedContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        accountId: z.string().uuid(),
        name: z.string().min(1).max(160),
        type: typeEnum,
        modo: modeEnum.default("simple"),
        currency: currencyEnum.default("CLP"),
        startDate: z.string(),
        endDate: z.string().nullable().optional(),
        duracionTipo: duracionTipoEnum.default("meses"),
        diaFacturacion: z.number().int().min(1).max(31).nullable().optional(),
        fechaPrimeraFacturacion: z.string().nullable().optional(),
        sprintDurationDays: z.number().int().min(1).max(120).nullable().optional(),
        sprintCadence: z.enum(["monthly", "biweekly"]).nullable().optional(),
        hoursPerSprint: z.number().min(0).max(10000).nullable().optional(),
        vendedorId: z.string().uuid().nullable().optional(),
        puedeRenovarse: z.boolean().default(false),
        anticipacionRenovacionDias: z.number().int().min(0).max(365).nullable().optional(),
        notasComerciales: z.string().max(4000).nullable().optional(),
        observaciones: z.string().max(4000).nullable().optional(),
        contratoPadreId: z.string().uuid().nullable().optional(),
        status: statusEnum.default("borrador"),
        lines: z.array(lineInput).min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("contracts")
      .insert({
        workspace_id: data.workspaceId,
        account_id: data.accountId,
        name: data.name,
        type: data.type,
        currency: data.currency,
        start_date: data.startDate,
        end_date: data.endDate ?? null,
        duracion_tipo: data.duracionTipo,
        dia_facturacion: data.diaFacturacion ?? null,
        fecha_primera_facturacion: data.fechaPrimeraFacturacion ?? null,
        sprint_duration_days:
          data.type === "implementation" ? null : (data.sprintDurationDays ?? 14),
        sprint_cadence: data.type === "recurrente" ? (data.sprintCadence ?? null) : null,
        hours_per_sprint: data.type === "recurrente" ? (data.hoursPerSprint ?? null) : null,
        status: data.status,
        modo: data.modo,
        vendedor_id: data.vendedorId ?? null,
        comision_pct: 6,
        puede_renovarse: data.puedeRenovarse,
        anticipacion_renovacion_dias: data.anticipacionRenovacionDias ?? null,
        notas_comerciales: data.notasComerciales ?? null,
        observaciones: data.observaciones ?? null,
        contrato_padre_id: data.contratoPadreId ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const linesPayload = data.lines.map((l, idx) => ({
      contract_id: row.id,
      service_type_id: l.serviceTypeId ?? null,
      tipo_servicio: l.tipoServicio,
      descripcion: l.descripcion ?? null,
      frecuencia: l.frecuencia,
      numero_cuotas: l.numeroCuotas ?? null,
      monto: l.monto ?? null,
      moneda: l.moneda,
      es_bono: l.esBono,
      fecha_primer_pago: l.fechaPrimerPago ?? null,
      orden: l.orden ?? idx,
    }));
    const { data: insertedLines, error: lerr } = await context.supabase
      .from("contract_service_lines")
      .insert(linesPayload)
      .select("id");
    if (lerr) throw new Error(lerr.message);

    // Insert milestones for lines with frecuencia="hitos"
    const milestoneRows: Array<{
      service_line_id: string;
      numero_hito: number;
      nombre: string;
      descripcion: string | null;
      monto: number | null;
      moneda: string;
      fecha_estimada: string | null;
      orden: number;
    }> = [];

    (insertedLines ?? []).forEach((ins, idx) => {
      const src = data.lines[idx];
      if (src.frecuencia === "hitos" && src.hitos && src.hitos.length > 0) {
        src.hitos.forEach((h, hi) => {
          milestoneRows.push({
            service_line_id: ins.id,
            numero_hito: h.numeroHito,
            nombre: h.nombre,
            descripcion: h.descripcion ?? null,
            monto: h.monto ?? null,
            moneda: h.moneda,
            fecha_estimada: h.fechaEstimada ?? null,
            orden: h.orden ?? hi,
          });
        });
      }
    });
    if (milestoneRows.length > 0) {
      const { error: merr } = await context.supabase
        .from("contract_service_milestones")
        .insert(milestoneRows);
      if (merr) throw new Error(merr.message);
    }

    // ─── Derive payment schedule + financials so the calendar of invoices
    // is created automatically (evita el caso "creé el contrato pero no
    // veo las cuotas en Gestión de facturas"). Sin esto, el trigger
    // `handle_contract_payment_schedule` no crea nada porque el contrato
    // queda con payment_schedule_type='none' y sin monthly_fee.
    const monthlyDivisor: Record<string, number> = {
      mensual: 1,
      trimestral: 3,
      semestral: 6,
      anual: 12,
    };
    let monthlyFee = 0;
    let recurringTotal = 0;
    let oneTimeTotal = 0;
    let milestoneTotal = 0;
    let hasRecurring = false;
    let hasMilestones = false;

    const durationMonthsForTotal = (() => {
      if (!data.endDate) return 0;
      const s = new Date(data.startDate);
      const e = new Date(data.endDate);
      return Math.max(
        0,
        (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1,
      );
    })();

    for (const l of data.lines) {
      if (l.frecuencia === "hitos") {
        hasMilestones = true;
        for (const h of l.hitos ?? []) {
          if (h.moneda === data.currency && h.monto) milestoneTotal += Number(h.monto);
        }
        continue;
      }
      if (l.moneda !== data.currency) continue; // solo agregamos en moneda del contrato
      const amt = Number(l.monto ?? 0);
      if (!amt) continue;
      if (l.frecuencia === "unica") {
        oneTimeTotal += amt;
      } else {
        hasRecurring = true;
        const div = monthlyDivisor[l.frecuencia] ?? 1;
        monthlyFee += amt / div;
        const cuotas = l.numeroCuotas ?? Math.max(1, Math.round(durationMonthsForTotal / div));
        recurringTotal += amt * cuotas;
      }
    }

    const scheduleType: "monthly_fixed" | "per_milestone" | "mixed" | "none" = hasRecurring
      ? hasMilestones
        ? "mixed"
        : "monthly_fixed"
      : hasMilestones
        ? "per_milestone"
        : "none";

    const feeTotal = recurringTotal + oneTimeTotal + milestoneTotal;
    if (monthlyFee > 0 || feeTotal > 0) {
      const { error: fnerr } = await context.supabase.from("contract_financials").upsert(
        {
          contract_id: row.id,
          monthly_fee: monthlyFee > 0 ? Number(monthlyFee.toFixed(2)) : null,
          fee_total: feeTotal > 0 ? Number(feeTotal.toFixed(2)) : null,
        },
        { onConflict: "contract_id" },
      );
      if (fnerr) throw new Error(fnerr.message);
    }

    if (scheduleType !== "none") {
      const { error: uerr } = await context.supabase
        .from("contracts")
        .update({ payment_schedule_type: scheduleType })
        .eq("id", row.id);
      if (uerr) throw new Error(uerr.message);
    }

    return { id: row.id };
  });

/**
 * Activa un contrato (proyectado → active). Dispara el trigger
 * `handle_contract_activation` que crea el handoff pendiente.
 */
export const activateContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ contractId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("contracts")
      .update({ status: "activo" })
      .eq("id", data.contractId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Regenera el calendario de cuotas (contract_payments) a partir de las líneas
 * de servicio del contrato. Sólo borra cuotas en estado `scheduled` sin
 * factura asociada: lo ya facturado o pagado se conserva.
 */
export const regenerateContractPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ contractId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: contract, error: cerr } = await sb
      .from("contracts")
      .select("id, currency, start_date, end_date, dia_facturacion, fecha_primera_facturacion")
      .eq("id", data.contractId)
      .maybeSingle();
    if (cerr) throw new Error(cerr.message);
    if (!contract) throw new Error("Contrato no encontrado");

    const { data: lines, error: lerr } = await sb
      .from("contract_service_lines")
      .select(
        "id, tipo_servicio, frecuencia, numero_cuotas, monto, moneda, es_bono, fecha_primer_pago, orden",
      )
      .eq("contract_id", data.contractId)
      .order("orden", { ascending: true });
    if (lerr) throw new Error(lerr.message);

    const monthsStep: Record<string, number> = {
      mensual: 1,
      trimestral: 3,
      semestral: 6,
      anual: 12,
    };

    const baseDate = contract.fecha_primera_facturacion ?? contract.start_date ?? null;
    if (!baseDate) throw new Error("El contrato no tiene fecha de inicio");

    const addMonths = (iso: string, n: number) => {
      const d = new Date(`${iso}T00:00:00Z`);
      const day = contract.dia_facturacion ?? d.getUTCDate();
      const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
      const lastDay = new Date(
        Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
      ).getUTCDate();
      target.setUTCDate(Math.min(day, lastDay));
      return target.toISOString().slice(0, 10);
    };

    const monthsBetween = () => {
      if (!contract.end_date || !contract.start_date) return 1;
      const s = new Date(`${contract.start_date}T00:00:00Z`);
      const e = new Date(`${contract.end_date}T00:00:00Z`);
      return Math.max(
        1,
        (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth()) + 1,
      );
    };

    const rows: Array<{
      contract_id: string;
      service_line_id: string;
      kind: "monthly" | "custom";
      amount: number;
      currency: string;
      due_date: string;
      status: "scheduled";
      period_label: string;
      notes: string | null;
    }> = [];

    for (const l of lines ?? []) {
      if (l.frecuencia === "hitos" || l.es_bono) continue;
      const amount = Number(l.monto ?? 0);
      if (!amount) continue;
      const first = l.fecha_primer_pago ?? baseDate;
      if (l.frecuencia === "unica") {
        rows.push({
          contract_id: data.contractId,
          service_line_id: l.id,
          kind: "custom",
          amount,
          currency: l.moneda ?? contract.currency,
          due_date: first,
          status: "scheduled",
          period_label: "Pago único",
          notes: l.tipo_servicio,
        });
        continue;
      }
      const step = monthsStep[l.frecuencia] ?? 1;
      const count = l.numero_cuotas ?? Math.max(1, Math.round(monthsBetween() / step));
      for (let i = 0; i < count; i++) {
        rows.push({
          contract_id: data.contractId,
          service_line_id: l.id,
          kind: "monthly",
          amount,
          currency: l.moneda ?? contract.currency,
          due_date: addMonths(first, i * step),
          status: "scheduled",
          period_label: `Cuota ${i + 1}/${count}`,
          notes: l.tipo_servicio,
        });
      }
    }

    // Borra sólo cuotas programadas sin factura asociada.
    const { error: derr } = await sb
      .from("contract_payments")
      .delete()
      .eq("contract_id", data.contractId)
      .eq("status", "scheduled")
      .is("invoice_id", null);
    if (derr) throw new Error(derr.message);

    // Cuotas que sobrevivieron (facturadas / pagadas / con factura asociada):
    // no las volvemos a generar para evitar duplicados.
    const { data: kept, error: kerr } = await sb
      .from("contract_payments")
      .select("service_line_id, due_date, kind")
      .eq("contract_id", data.contractId);
    if (kerr) throw new Error(kerr.message);

    const keptKeys = new Set((kept ?? []).map((k) => `${k.service_line_id ?? ""}|${k.due_date}`));
    // Además, contamos cuántas cuotas conservadas hay por línea para no
    // regenerar los primeros períodos ya facturados aunque la fecha se
    // haya movido (p. ej. cambio de día de facturación).
    const keptCountByLine = new Map<string, number>();
    for (const k of kept ?? []) {
      if (!k.service_line_id) continue;
      keptCountByLine.set(k.service_line_id, (keptCountByLine.get(k.service_line_id) ?? 0) + 1);
    }

    const skipByLine = new Map<string, number>();
    const finalRows = rows.filter((r) => {
      if (keptKeys.has(`${r.service_line_id}|${r.due_date}`)) return false;
      const remaining = keptCountByLine.get(r.service_line_id) ?? 0;
      const used = skipByLine.get(r.service_line_id) ?? 0;
      if (used < remaining) {
        skipByLine.set(r.service_line_id, used + 1);
        return false;
      }
      return true;
    });

    if (finalRows.length > 0) {
      const { error: ierr } = await sb.from("contract_payments").insert(finalRows);
      if (ierr) throw new Error(ierr.message);
    }

    await sb.rpc("apply_contract_billing_splits", { _contract_id: data.contractId });
    return { created: finalRows.length, skipped: rows.length - finalRows.length };
  });
