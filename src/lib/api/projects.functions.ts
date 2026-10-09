import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        area: z.enum(["operations", "marketing", "finance", "internal"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("projects")
      .select(
        "id, name, description, color, icon, archived, created_at, workspace_id, area, internal_category_id",
      )
      .eq("workspace_id", data.workspaceId)
      .eq("archived", false)
      .order("created_at", { ascending: false });
    if (data.area) q = q.eq("area", data.area);
    const { data: projects, error } = await q;
    if (error) throw new Error(error.message);
    return projects ?? [];
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        name: z.string().min(1).max(80),
        description: z.string().max(500).optional(),
        color: z.string().optional(),
        icon: z.string().optional(),
        area: z.enum(["operations", "marketing", "finance", "internal"]).optional(),
        internalCategoryId: z.string().uuid().optional(),
        billingMode: z.enum(["internal", "partner", "internal_no_contract"]).optional(),
        partnerId: z.string().uuid().optional(),
        asanaProjectGid: z.string().max(64).optional(),
        partnerDeliveryType: z.enum(["proyecto", "raas"]).optional(),
        sprintDurationDays: z.number().int().positive().max(90).optional(),
        sprintCadence: z.enum(["weekly", "biweekly", "monthly"]).optional(),
        hoursPerSprint: z.number().nonnegative().max(10000).optional(),
        sprintCount: z.number().int().positive().max(52).optional(),
        firstSprintStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let contractId: string | null = null;

    // For partner projects, auto-create a hidden contract linked to the partner's account
    if (data.billingMode === "partner") {
      if (!data.partnerId) throw new Error("partnerId requerido para proyectos de partner");
      const deliveryType = data.partnerDeliveryType ?? "proyecto";

      const { data: partner, error: pErr } = await supabase
        .from("partners")
        .select("partner_account_id, name")
        .eq("id", data.partnerId)
        .maybeSingle();
      if (pErr) throw new Error(pErr.message);
      if (!partner?.partner_account_id) {
        throw new Error("Partner sin cliente asociado — recarga la página e intenta de nuevo");
      }

      const contractType = deliveryType === "raas" ? "recurrente" : "implementation";
      const isRaas = contractType === "recurrente";
      const sprintDays = isRaas ? (data.sprintDurationDays ?? 14) : null;
      const hoursPerSprint = isRaas ? (data.hoursPerSprint ?? 0) : null;
      const sprintCount = isRaas ? (data.sprintCount ?? 0) : 0;
      const startDate = (isRaas ? data.firstSprintStart : null) ?? new Date().toISOString().slice(0, 10);
      const endDate = isRaas && sprintCount > 0 && sprintDays
        ? new Date(new Date(startDate).getTime() + sprintCount * sprintDays * 86400000 - 86400000)
            .toISOString()
            .slice(0, 10)
        : null;

      const { data: contract, error: cErr } = await supabase
        .from("contracts")
        .insert({
          workspace_id: data.workspaceId,
          account_id: partner.partner_account_id,
          name: data.name,
          type: contractType,
          status: "activo",
          start_date: startDate,
          end_date: endDate,
          currency: "USD",
          billing_model: "fixed",
          payment_schedule_type: "none",
          created_by: userId,
          is_partner: true,
          sprint_duration_days: sprintDays,
          sprint_cadence: isRaas ? ((data.sprintCadence ?? null) as never) : null,
          hours_per_sprint: hoursPerSprint,
        })
        .select("id")
        .single();
      if (cErr) throw new Error(`No se pudo crear contrato interno: ${cErr.message}`);
      contractId = contract.id;

      if (isRaas && sprintCount > 0 && sprintDays) {
        const { error: sErr } = await supabase.rpc("generate_contract_sprints", {
          _contract_id: contract.id,
          _sprint_days: sprintDays,
          _hours_per_sprint: hoursPerSprint ?? 0,
        });
        if (sErr) throw new Error(`No se pudieron generar los sprints: ${sErr.message}`);
      }
    }

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        workspace_id: data.workspaceId,
        name: data.name,
        description: data.description ?? null,
        color: data.color ?? "#8b5cf6",
        icon: data.icon ?? "folder",
        created_by: userId,
        area: data.area ?? "operations",
        internal_category_id: data.internalCategoryId ?? null,
        billing_mode: data.billingMode ?? "internal",
        partner_id: data.partnerId ?? null,
        asana_project_gid: data.asanaProjectGid ?? null,
        contract_id: contractId,
        delivery_type: data.partnerDeliveryType ?? null,
        first_sprint_start_date: data.firstSprintStart ?? null,
        fecha_inicio_delivery: data.startDate ?? data.firstSprintStart ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return project;
  });

export const listPartnerProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ partnerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("projects")
      .select("id, name, description, color, archived, asana_project_gid, created_at, workspace_id, delivery_type, first_sprint_start_date, fecha_inicio_delivery, contract_id, contract:contract_id(sprint_cadence, sprint_duration_days, start_date, hours_per_sprint)")
      .eq("partner_id", data.partnerId)
      .eq("billing_mode", "partner")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: project, error } = await supabase
      .from("projects")
      .select(
        "id, name, description, color, icon, workspace_id, archived, contract_id, first_sprint_start_date, lead_id, delivery_type, margen_objetivo_pct, fecha_inicio_delivery, fecha_entrega_objetivo, state, asana_project_gid, contract:contract_id(type, sprint_cadence, hours_per_sprint, start_date, end_date)",
      )
      .eq("id", data.projectId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!project) throw new Error("Proyecto no encontrado");
    return project;
  });

export const getProjectHoursSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: proj, error: pErr } = await supabase
      .from("projects")
      .select("contract_id, delivery_type, contract:contract_id(hours_per_sprint)")
      .eq("id", data.projectId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);

    let contractedHoursTotal: number | null = null;
    let sprintDurationDays: number | null = null;
    let contractStart: string | null = null;
    let hoursPerSprint: number | null = null;
    if (proj?.contract_id) {
      const { data: fin } = await supabase
        .from("contract_financials")
        .select("contracted_hours_total")
        .eq("contract_id", proj.contract_id)
        .maybeSingle();
      contractedHoursTotal = fin?.contracted_hours_total ?? null;
      const { data: cRow } = await supabase
        .from("contracts")
        .select("sprint_duration_days, start_date, hours_per_sprint")
        .eq("id", proj.contract_id)
        .maybeSingle();
      sprintDurationDays = cRow?.sprint_duration_days ?? null;
      contractStart = cRow?.start_date ?? null;
      hoursPerSprint = cRow?.hours_per_sprint ?? null;
    }

    const { data: budget } = await supabase
      .from("project_hour_budget")
      .select("horas_estimadas")
      .eq("project_id", data.projectId);
    const rows = budget ?? [];
    const estimatedHoursTotal = rows.reduce((s, r) => s + Number(r.horas_estimadas ?? 0), 0);

    let sprintCount = 0;
    if (proj?.contract_id) {
      const { count } = await supabase
        .from("sprints")
        .select("id", { count: "exact", head: true })
        .eq("contract_id", proj.contract_id);
      sprintCount = count ?? 0;
    }

    return {
      hoursPerSprint,
      contractedHoursTotal,
      estimatedHoursTotal,
      hourBudgetRowCount: rows.length,
      sprintCount,
      sprintDurationDays,
      contractStart,
    };
  });


export const updateProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        description: z.string().max(500).nullable().optional(),
        color: z.string().optional(),
        archived: z.boolean().optional(),
        firstSprintStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        fechaInicioDelivery: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        sprintCadence: z.enum(["weekly", "biweekly", "monthly"]).optional(),
        hoursPerSprint: z.number().nonnegative().max(100000).optional(),
        contractedHoursTotal: z.number().nonnegative().max(1000000).nullable().optional(),
        estimatedHoursTotal: z.number().nonnegative().max(1000000).optional(),
        sprintCount: z.number().int().positive().max(200).optional(),

      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const {
      projectId,
      firstSprintStartDate,
      fechaInicioDelivery,
      sprintCadence,
      hoursPerSprint,
      contractedHoursTotal,
      estimatedHoursTotal,
      sprintCount,
      ...rest
    } = data;

    const patch: Record<string, unknown> = { ...rest };
    if (firstSprintStartDate !== undefined) patch.first_sprint_start_date = firstSprintStartDate;
    if (fechaInicioDelivery !== undefined) patch.fecha_inicio_delivery = fechaInicioDelivery;
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from("projects").update(patch as never).eq("id", projectId);
      if (error) throw new Error(error.message);
    }

    const needsContractUpdate =
      firstSprintStartDate !== undefined ||
      sprintCadence !== undefined ||
      hoursPerSprint !== undefined ||
      contractedHoursTotal !== undefined;
    if (needsContractUpdate) {
      const { data: proj } = await supabase
        .from("projects")
        .select("contract_id")
        .eq("id", projectId)
        .maybeSingle();
      if (proj?.contract_id) {
        const cPatch: Record<string, unknown> = {};
        if (firstSprintStartDate !== undefined && firstSprintStartDate !== null)
          cPatch.start_date = firstSprintStartDate;
        if (sprintCadence !== undefined) {
          cPatch.sprint_cadence = sprintCadence;
          cPatch.sprint_duration_days =
            sprintCadence === "weekly" ? 7 : sprintCadence === "biweekly" ? 14 : 30;
        }
        if (hoursPerSprint !== undefined) cPatch.hours_per_sprint = hoursPerSprint;
        if (Object.keys(cPatch).length > 0) {
          const { error: cErr } = await supabase
            .from("contracts")
            .update(cPatch as never)
            .eq("id", proj.contract_id);
          if (cErr) throw new Error(cErr.message);
        }
        if (contractedHoursTotal !== undefined) {
          const { error: fErr } = await supabase
            .from("contract_financials")
            .upsert(
              {
                contract_id: proj.contract_id,
                contracted_hours_total: contractedHoursTotal,
              } as never,
              { onConflict: "contract_id" },
            );
          if (fErr) throw new Error(fErr.message);
        }
      }
    }

    if (estimatedHoursTotal !== undefined) {
      const { error: dErr } = await supabase
        .from("project_hour_budget")
        .delete()
        .eq("project_id", projectId);
      if (dErr) throw new Error(dErr.message);
      if (estimatedHoursTotal > 0) {
        const { error: iErr } = await supabase.from("project_hour_budget").insert({
          project_id: projectId,
          rol: "Total",
          horas_estimadas: estimatedHoursTotal,
          orden: 0,
        } as never);
        if (iErr) throw new Error(iErr.message);
      }
    }

    // Sprint count adjustment + auto-distribute total hours across sprints
    if (sprintCount !== undefined || contractedHoursTotal !== undefined) {
      const { data: proj } = await supabase
        .from("projects")
        .select("contract_id")
        .eq("id", projectId)
        .maybeSingle();
      if (proj?.contract_id) {
        const { data: c } = await supabase
          .from("contracts")
          .select("start_date, sprint_duration_days, hours_per_sprint")
          .eq("id", proj.contract_id)
          .maybeSingle();
        const days = c?.sprint_duration_days ?? 14;
        const startStr = c?.start_date;
        if (!startStr) throw new Error("El contrato no tiene fecha de inicio");

        const { data: existing } = await supabase
          .from("sprints")
          .select("id, sprint_number, status")
          .eq("contract_id", proj.contract_id)
          .order("sprint_number", { ascending: true });
        const rows = existing ?? [];
        const currentCount = rows.length;
        const targetCount = sprintCount ?? currentCount;

        // Derive hours_per_sprint from total when total is provided
        let effectiveHps = Number(c?.hours_per_sprint ?? 0);
        if (hoursPerSprint !== undefined) effectiveHps = hoursPerSprint;
        if (contractedHoursTotal !== undefined && contractedHoursTotal !== null && targetCount > 0) {
          effectiveHps = Math.round((contractedHoursTotal / targetCount) * 100) / 100;
          const { error: hErr } = await supabase
            .from("contracts")
            .update({ hours_per_sprint: effectiveHps } as never)
            .eq("id", proj.contract_id);
          if (hErr) throw new Error(hErr.message);
        }

        if (sprintCount !== undefined && sprintCount < currentCount) {
          const toRemove = rows.filter((r) => r.sprint_number > sprintCount);
          const blocked = toRemove.find((r) => r.status === "cerrado");
          if (blocked)
            throw new Error(
              `No se puede reducir: el sprint ${blocked.sprint_number} ya está cerrado`,
            );
          const ids = toRemove.map((r) => r.id);
          if (ids.length > 0) {
            const { error: delErr } = await supabase.from("sprints").delete().in("id", ids);
            if (delErr) throw new Error(delErr.message);
          }
        } else if (sprintCount !== undefined && sprintCount > currentCount) {
          const { error: insErr } = await supabase.rpc("insert_sprints_bulk", {
            _contract_id: proj.contract_id,
            _first_start: startStr,
            _sprint_days: days,
            _from_number: currentCount + 1,
            _to_number: sprintCount,
            _hours: effectiveHps,
          } as never);
          if (insErr) throw new Error(insErr.message);
        }

        // Apply contracted_hours to ALL sprints (not just por_planificar)
        if (contractedHoursTotal !== undefined || hoursPerSprint !== undefined) {
          const { error: upSErr } = await supabase
            .from("sprints")
            .update({ contracted_hours: effectiveHps } as never)
            .eq("contract_id", proj.contract_id);
          if (upSErr) throw new Error(upSErr.message);
        }

        // Regenerate dates on ALL sprints when start_date, cadence, or count changed
        // Preserves sprint_id, tasks, status; only shifts start/end dates by sprint_number.
        // Uses SECURITY DEFINER RPC to bypass the working-day validation trigger.
        if (
          sprintCadence !== undefined ||
          firstSprintStartDate !== undefined ||
          sprintCount !== undefined
        ) {
          const { error: rErr } = await supabase.rpc("regenerate_sprint_dates", {
            _contract_id: proj.contract_id,
            _first_start: startStr,
            _sprint_days: days,
          } as never);
          if (rErr) throw new Error(rErr.message);
        }

        // Sync contract end_date
        {
          const finalCount = sprintCount ?? currentCount;
          if (finalCount > 0) {
            const [y, m, d] = startStr.split("-").map(Number);
            const endMs = Date.UTC(y, m - 1, d) + (finalCount * days - 1) * 86400000;
            const endStr = new Date(endMs).toISOString().slice(0, 10);
            const { error: cuErr } = await supabase
              .from("contracts")
              .update({ end_date: endStr } as never)
              .eq("id", proj.contract_id);
            if (cuErr) throw new Error(cuErr.message);
          }
        }
      }
    }

    return { ok: true };
  });


export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("projects").delete().eq("id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
