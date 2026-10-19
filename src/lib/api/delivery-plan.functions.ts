import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const linkTypeEnum = z.enum(["solo_referencia", "gatilla_facturacion"]);

// ============ PROJECT HOUR BUDGET ============

const budgetRow = z.object({
  rol: z.string().min(1).max(120),
  horasEstimadas: z.number().min(0),
  costoHora: z.number().min(0).nullable().optional(),
  orden: z.number().int().min(0).default(0),
});

export const listProjectHourBudget = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("project_hour_budget")
      .select("id, project_id, rol, horas_estimadas, costo_hora, orden, created_at, updated_at")
      .eq("project_id", data.projectId)
      .order("orden", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertProjectHourBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        rows: z.array(budgetRow.extend({ id: z.string().uuid().optional() })),
        replaceAll: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.replaceAll) {
      const { error: derr } = await context.supabase
        .from("project_hour_budget")
        .delete()
        .eq("project_id", data.projectId);
      if (derr) throw new Error(derr.message);
    }
    if (data.rows.length > 0) {
      const payload = data.rows.map((r) => ({
        ...(r.id && !data.replaceAll ? { id: r.id } : {}),
        project_id: data.projectId,
        rol: r.rol,
        horas_estimadas: r.horasEstimadas,
        costo_hora: r.costoHora ?? null,
        orden: r.orden,
      }));
      const { error } = await context.supabase.from("project_hour_budget").upsert(payload);
      if (error) throw new Error(error.message);
    }
    // Recompute margin
    const { error: rpcErr } = await context.supabase.rpc("compute_project_margin", {
      _project_id: data.projectId,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    return { ok: true };
  });

export const deleteProjectHourBudgetRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ rowId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error: gerr } = await context.supabase
      .from("project_hour_budget")
      .select("project_id")
      .eq("id", data.rowId)
      .maybeSingle();
    if (gerr) throw new Error(gerr.message);
    const { error } = await context.supabase
      .from("project_hour_budget")
      .delete()
      .eq("id", data.rowId);
    if (error) throw new Error(error.message);
    if (row?.project_id) {
      await context.supabase.rpc("compute_project_margin", { _project_id: row.project_id });
    }
    return { ok: true };
  });

// ============ PROJECT SERVICE LINES (which lines map to which project) ============

export const listProjectServiceLines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("project_service_lines")
      .select(
        "id, project_id, service_line_id, contract_service_lines(id, tipo_servicio, frecuencia, monto, moneda, es_bono)",
      )
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const setProjectServiceLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        serviceLineIds: z.array(z.string().uuid()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error: derr } = await context.supabase
      .from("project_service_lines")
      .delete()
      .eq("project_id", data.projectId);
    if (derr) throw new Error(derr.message);

    if (data.serviceLineIds.length > 0) {
      const { error } = await context.supabase.from("project_service_lines").insert(
        data.serviceLineIds.map((sid) => ({
          project_id: data.projectId,
          service_line_id: sid,
        })),
      );
      if (error) throw new Error(error.message);
    }
    await context.supabase.rpc("compute_project_margin", { _project_id: data.projectId });
    return { ok: true };
  });

// ============ MARGIN ============

export const recomputeProjectMargin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: margin, error } = await context.supabase.rpc("compute_project_margin", {
      _project_id: data.projectId,
    });
    if (error) throw new Error(error.message);
    return { margin };
  });

// ============ MILESTONE ↔ PAYMENT LINKS ============

export const listMilestoneLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: ms, error: merr } = await context.supabase
      .from("milestones")
      .select("id")
      .eq("project_id", data.projectId);
    if (merr) throw new Error(merr.message);
    const ids = (ms ?? []).map((m) => m.id);
    if (ids.length === 0) return [];
    const { data: rows, error } = await context.supabase
      .from("milestone_hito_links")
      .select("id, milestone_id, payment_id, tipo_vinculo, created_at")
      .in("milestone_id", ids);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertMilestoneLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        milestoneId: z.string().uuid(),
        paymentId: z.string().uuid(),
        tipoVinculo: linkTypeEnum.default("solo_referencia"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("milestone_hito_links").upsert(
      {
        milestone_id: data.milestoneId,
        payment_id: data.paymentId,
        tipo_vinculo: data.tipoVinculo,
      },
      { onConflict: "milestone_id,payment_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMilestoneLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ linkId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("milestone_hito_links")
      .delete()
      .eq("id", data.linkId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ FINALIZE HANDOFF (creates project from handoff) ============

export const createProjectFromHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        handoffId: z.string().uuid(),
        project: z.object({
          name: z.string().min(1).max(255),
          deliveryType: z.enum(["proyecto", "raas"]).default("proyecto"),
          margenObjetivoPct: z.number().min(0).max(100).default(40),
          leadId: z.string().uuid().nullable().optional(),
          fechaInicioDelivery: z.string().nullable().optional(),
          fechaEntregaObjetivo: z.string().nullable().optional(),
          firstSprintStartDate: z.string().nullable().optional(),
        }),
        extraProjects: z
          .array(
            z.object({
              name: z.string().min(1).max(120),
              hoursPerSprint: z.number().min(0).nullable().optional(),
            }),
          )
          .default([]),
        serviceLineIds: z.array(z.string().uuid()).default([]),
        requiresClientTickets: z.boolean().optional(),
        slaId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: handoff, error: herr } = await context.supabase
      .from("contract_handoffs")
      .select("id, contract_id, workspace_id, state")
      .eq("id", data.handoffId)
      .maybeSingle();
    if (herr) throw new Error(herr.message);
    if (!handoff) throw new Error("Handoff no encontrado");

    const { data: existingProjects, error: existingErr } = await context.supabase
      .from("projects")
      .select("id, created_at")
      .eq("contract_id", handoff.contract_id)
      .order("created_at", { ascending: true });
    if (existingErr) throw new Error(existingErr.message);

    let projectId = existingProjects?.[0]?.id ?? null;
    if (projectId) {
      const { error: uerr } = await context.supabase
        .from("projects")
        .update({
          name: data.project.name,
          delivery_type: data.project.deliveryType,
          state: "en_curso",
          margen_objetivo_pct: data.project.margenObjetivoPct,
          lead_id: data.project.leadId ?? null,
          fecha_inicio_delivery: data.project.fechaInicioDelivery ?? null,
          fecha_entrega_objetivo: data.project.fechaEntregaObjetivo ?? null,
          first_sprint_start_date: data.project.firstSprintStartDate ?? null,
          is_primary: true,
        })
        .eq("id", projectId);
      if (uerr) throw new Error(uerr.message);
    } else {
      const { data: proj, error: perr } = await context.supabase
        .from("projects")
        .insert({
          workspace_id: handoff.workspace_id,
          contract_id: handoff.contract_id,
          name: data.project.name,
          delivery_type: data.project.deliveryType,
          state: "en_curso",
          margen_objetivo_pct: data.project.margenObjetivoPct,
          lead_id: data.project.leadId ?? null,
          fecha_inicio_delivery: data.project.fechaInicioDelivery ?? null,
          fecha_entrega_objetivo: data.project.fechaEntregaObjetivo ?? null,
          first_sprint_start_date: data.project.firstSprintStartDate ?? null,
          is_primary: true,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (perr) throw new Error(perr.message);
      projectId = proj.id;
    }
    if (!projectId) throw new Error("No se pudo resolver el proyecto del contrato");

    // Auto-generate sprints for recurrente contracts. The RPC itself checks
    // sprint_cadence and falls back to contract.start_date when no explicit
    // first-sprint date is provided, so we always call it for recurrente.
    {
      const { data: ctr } = await context.supabase
        .from("contracts")
        .select("type, sprint_cadence")
        .eq("id", handoff.contract_id)
        .maybeSingle();
      if (ctr?.type === "recurrente" && ctr.sprint_cadence) {
        const startArg =
          data.project.firstSprintStartDate ?? data.project.fechaInicioDelivery ?? "";
        await context.supabase.rpc("generate_contract_sprints_from_cadence", {
          _contract_id: handoff.contract_id,
          _first_start: startArg || (null as unknown as string),
        });
      }
    }

    // Proyectos internos adicionales del contrato (líneas de negocio con su
    // propia grilla de sprints y fases).
    if (data.extraProjects.length > 0) {
      const { data: siblings } = await context.supabase
        .from("projects")
        .select("id, orden, name")
        .eq("contract_id", handoff.contract_id);
      let orden = (siblings ?? []).reduce((m, s) => Math.max(m, s.orden ?? 0), 0);
      const existingNames = new Set((siblings ?? []).map((s) => s.name.toLowerCase()));
      for (const extra of data.extraProjects) {
        if (existingNames.has(extra.name.toLowerCase())) continue;
        orden += 1;
        const { data: created, error: eerr } = await context.supabase
          .from("projects")
          .insert({
            workspace_id: handoff.workspace_id,
            contract_id: handoff.contract_id,
            name: extra.name,
            delivery_type: data.project.deliveryType,
            state: "en_curso",
            margen_objetivo_pct: data.project.margenObjetivoPct,
            lead_id: data.project.leadId ?? null,
            fecha_inicio_delivery: data.project.fechaInicioDelivery ?? null,
            fecha_entrega_objetivo: data.project.fechaEntregaObjetivo ?? null,
            first_sprint_start_date: data.project.firstSprintStartDate ?? null,
            hours_per_sprint: extra.hoursPerSprint ?? null,
            is_primary: false,
            orden,
            created_by: context.userId,
          })
          .select("id")
          .single();
        if (eerr) throw new Error(eerr.message);
        const firstStart =
          data.project.firstSprintStartDate ?? data.project.fechaInicioDelivery ?? null;
        await context.supabase.rpc("generate_project_sprints", {
          _project_id: created.id,
          _first_start: firstStart ?? undefined,
        });
      }
    }

    if (data.serviceLineIds.length > 0) {
      const { error: lerr } = await context.supabase.from("project_service_lines").upsert(
        data.serviceLineIds.map((sid) => ({ project_id: projectId, service_line_id: sid })),
        { onConflict: "project_id,service_line_id" },
      );
      if (lerr) throw new Error(lerr.message);
    }

    // Update contract with client-tickets settings and create form/inbox phase if needed
    if (data.requiresClientTickets !== undefined || data.slaId !== undefined) {
      const cPatch: { requires_client_tickets?: boolean; sla_id?: string | null } = {};
      if (data.requiresClientTickets !== undefined)
        cPatch.requires_client_tickets = data.requiresClientTickets;
      if (data.slaId !== undefined) cPatch.sla_id = data.slaId;
      await context.supabase.from("contracts").update(cPatch).eq("id", handoff.contract_id);
    }
    if (data.requiresClientTickets) {
      await context.supabase.rpc("ensure_client_ticket_form", { _project_id: projectId });
    }

    await context.supabase
      .from("contract_handoffs")
      .update({ state: "en_planificacion" })
      .eq("id", data.handoffId);

    return { projectId };
  });

export const completeHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ handoffId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("contract_handoffs")
      .update({ state: "completado", completado_at: new Date().toISOString() })
      .eq("id", data.handoffId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
