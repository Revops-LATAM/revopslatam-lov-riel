import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugify } from "./_shared.server";

// ============ ACCOUNTS ============

const ACCOUNT_COLS =
  "id, name, slug, status, owner_id, website, notes, created_at, workspace_id, legal_name, tax_id, business_activity, billing_email, address, commune, primary_contact_name, primary_contact_email, secondary_contacts";

/**
 * Clientes (accounts) is a shared module between Finanzas and Operaciones.
 * Accounts physically live in the operations workspace, but Finanzas needs
 * to list/create them while staying inside its own workspace shell. This
 * helper resolves the operations workspace id that owns the accounts for
 * the given workspace (same owner_id). Operations workspaces resolve to
 * themselves.
 */
async function resolveAccountsWorkspaceId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  currentWsId: string,
): Promise<string> {
  const { data: cur, error } = await supabase
    .from("workspaces")
    .select("id, kind, owner_id")
    .eq("id", currentWsId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!cur) throw new Error("Workspace no encontrado");
  if (cur.kind === "operations") return cur.id as string;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: ops, error: opsErr } = await supabaseAdmin
    .from("workspaces")
    .select("id")
    .eq("owner_id", cur.owner_id)
    .eq("kind", "operations")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (opsErr) throw new Error(opsErr.message);
  if (!ops)
    throw new Error("No hay un workspace de Operaciones asociado para el módulo de Clientes");
  return ops.id as string;
}

const secondaryContactsSchema = z
  .array(
    z.object({
      nombre: z.string().min(1).max(120),
      email: z.string().email().max(200),
    }),
  )
  .max(50);

export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        // Área desde la que se consulta. En Operaciones un cliente solo
        // aparece cuando existe al menos un handoff en estado 'completado'
        // (la data recién importada vive en Finanzas hasta que se hace el
        // handoff). En Finanzas se ven todos.
        area: z.enum(["operations", "finance"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Clientes is shared between Finanzas and Operaciones: regardless of
    // which workspace the user is in, list accounts that live in the
    // related operations workspace.
    const targetWs = await resolveAccountsWorkspaceId(context.supabase, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("accounts")
      .select(ACCOUNT_COLS)
      .eq("workspace_id", targetWs)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const accounts = rows ?? [];
    if (accounts.length === 0) return accounts;

    const { data: cRows } = await supabaseAdmin
      .from("contracts")
      .select("id, account_id, status")
      .eq("workspace_id", targetWs);
    const contracts = cRows ?? [];
    const activeSet = new Set(
      contracts
        .filter((c) => ["activo", "borrador", "en_renovacion"].includes(c.status as string))
        .map((c: { account_id: string }) => c.account_id),
    );

    let visibleIds: Set<string> | null = null;
    if (data.area === "operations") {
      const contractIds = contracts.map((c) => c.id);
      if (contractIds.length === 0) {
        visibleIds = new Set();
      } else {
        const { data: hRows } = await supabaseAdmin
          .from("contract_handoffs")
          .select("contract_id, state")
          .in("contract_id", contractIds)
          .eq("state", "completado");
        const contractToAccount = new Map(contracts.map((c) => [c.id, c.account_id]));
        visibleIds = new Set(
          (hRows ?? [])
            .map((h: { contract_id: string }) => contractToAccount.get(h.contract_id))
            .filter((v): v is string => !!v),
        );
      }
    }

    const decorated = accounts.map((a) => ({
      ...a,
      status: activeSet.has(a.id) ? "activo" : "inactivo",
    }));
    return visibleIds ? decorated.filter((a) => visibleIds!.has(a.id)) : decorated;
  });

export const getAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ accountId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("accounts")
      .select(ACCOUNT_COLS)
      .eq("id", data.accountId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Cuenta no encontrada");
    const { count } = await context.supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("account_id", data.accountId)
      .eq("status", "activo");
    return { ...row, status: (count ?? 0) > 0 ? "activo" : "inactivo" };
  });

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        name: z.string().min(1).max(120),
        website: z.string().max(200).optional(),
        notes: z.string().max(2000).optional(),
        ownerId: z.string().uuid().nullable().optional(),
        legalName: z.string().max(200).optional(),
        taxId: z.string().max(40).optional(),
        businessActivity: z.string().max(200).optional(),
        billingEmail: z.string().email().max(200).optional().or(z.literal("")),
        address: z.string().max(300).optional(),
        commune: z.string().max(120).optional(),
        primaryContactName: z.string().max(120).optional(),
        primaryContactEmail: z.string().email().max(200).optional().or(z.literal("")),
        secondaryContacts: secondaryContactsSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Accounts always live in the operations workspace.
    const targetWs = await resolveAccountsWorkspaceId(context.supabase, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const base = slugify(data.name);
    let slug = base;
    let attempt = 0;
    while (attempt < 5) {
      const { data: row, error } = await supabaseAdmin
        .from("accounts")
        .insert({
          workspace_id: targetWs,
          name: data.name,
          slug,
          website: data.website || null,
          notes: data.notes || null,
          owner_id: data.ownerId ?? null,
          created_by: context.userId,
          legal_name: data.legalName || null,
          tax_id: data.taxId || null,
          business_activity: data.businessActivity || null,
          billing_email: data.billingEmail || null,
          address: data.address || null,
          commune: data.commune || null,
          primary_contact_name: data.primaryContactName || null,
          primary_contact_email: data.primaryContactEmail || null,
          secondary_contacts: data.secondaryContacts ?? [],
        })
        .select()
        .single();
      if (!error && row) return row;
      if (error && !error.message.toLowerCase().includes("duplicate")) {
        throw new Error(error.message);
      }
      attempt += 1;
      slug = `${base}-${Math.random().toString(36).slice(2, 5)}`;
    }
    throw new Error("No se pudo crear la cuenta");
  });

export const updateAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        accountId: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        website: z.string().max(200).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
        ownerId: z.string().uuid().nullable().optional(),
        status: z.enum(["active", "paused", "archived"]).optional(),
        legalName: z.string().max(200).nullable().optional(),
        taxId: z.string().max(40).nullable().optional(),
        businessActivity: z.string().max(200).nullable().optional(),
        billingEmail: z.string().max(200).nullable().optional(),
        address: z.string().max(300).nullable().optional(),
        commune: z.string().max(120).nullable().optional(),
        primaryContactName: z.string().max(120).nullable().optional(),
        primaryContactEmail: z.string().max(200).nullable().optional(),
        secondaryContacts: secondaryContactsSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const {
      accountId,
      ownerId,
      legalName,
      taxId,
      businessActivity,
      billingEmail,
      primaryContactName,
      primaryContactEmail,
      secondaryContacts,
      ...rest
    } = data;
    const patch: Record<string, unknown> = { ...rest };
    if (ownerId !== undefined) patch.owner_id = ownerId;
    if (legalName !== undefined) patch.legal_name = legalName;
    if (taxId !== undefined) patch.tax_id = taxId;
    if (businessActivity !== undefined) patch.business_activity = businessActivity;
    if (billingEmail !== undefined) patch.billing_email = billingEmail;
    if (primaryContactName !== undefined) patch.primary_contact_name = primaryContactName;
    if (primaryContactEmail !== undefined) patch.primary_contact_email = primaryContactEmail;
    if (secondaryContacts !== undefined) patch.secondary_contacts = secondaryContacts;
    const { error } = await context.supabase
      .from("accounts")
      .update(patch as never)
      .eq("id", accountId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ accountId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { count, error: countErr } = await supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("account_id", data.accountId);
    if (countErr) throw new Error(countErr.message);
    if ((count ?? 0) > 0) {
      throw new Error(
        `No se puede eliminar: el cliente tiene ${count} contrato(s) asociado(s). Elimina o desvincula los contratos y proyectos primero.`,
      );
    }
    const { error } = await supabase.from("accounts").delete().eq("id", data.accountId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ CONTRACTS ============

export const listContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        accountId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // When listing the contracts for a specific account (shared Clientes
    // module), resolve to the operations workspace so finance users see
    // them too.
    const wsId = data.accountId
      ? await resolveAccountsWorkspaceId(context.supabase, data.workspaceId)
      : data.workspaceId;
    const supabaseRead = data.accountId
      ? (await import("@/integrations/supabase/client.server")).supabaseAdmin
      : context.supabase;
    let q = supabaseRead
      .from("contracts")
      .select(
        "id, name, code, type, billing_model, status, currency, start_date, end_date, owner_consultant_id, sprint_duration_days, payment_schedule_type, account_id, workspace_id, created_at",
      )
      .eq("workspace_id", wsId)
      .eq("is_partner", false)
      .order("created_at", { ascending: false });
    if (data.accountId) q = q.eq("account_id", data.accountId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const contracts = rows ?? [];
    if (contracts.length === 0)
      return [] as Array<
        (typeof contracts)[number] & {
          sprints_count: number;
          open_tasks_count: number;
          fee_total: number | null;
        }
      >;
    const ids = contracts.map((c) => c.id);

    const [sprintsRes, tasksRes, finRes] = await Promise.all([
      context.supabase.from("sprints").select("contract_id").in("contract_id", ids),
      context.supabase
        .from("tasks")
        .select("contract_id, status")
        .in("contract_id", ids)
        .neq("status", "completada"),
      context.supabase
        .from("contract_financials")
        .select("contract_id, fee_total")
        .in("contract_id", ids),
    ]);
    if (sprintsRes.error) throw new Error(sprintsRes.error.message);
    if (tasksRes.error) throw new Error(tasksRes.error.message);
    if (finRes.error) throw new Error(finRes.error.message);

    const sprintsByC = new Map<string, number>();
    for (const r of sprintsRes.data ?? []) {
      sprintsByC.set(r.contract_id, (sprintsByC.get(r.contract_id) ?? 0) + 1);
    }
    const tasksByC = new Map<string, number>();
    for (const r of tasksRes.data ?? []) {
      if (!r.contract_id) continue;
      tasksByC.set(r.contract_id, (tasksByC.get(r.contract_id) ?? 0) + 1);
    }
    const feeByC = new Map<string, number | null>();
    for (const r of finRes.data ?? []) {
      feeByC.set(r.contract_id, r.fee_total != null ? Number(r.fee_total) : null);
    }

    return contracts.map((c) => ({
      ...c,
      sprints_count: sprintsByC.get(c.id) ?? 0,
      open_tasks_count: tasksByC.get(c.id) ?? 0,
      fee_total: feeByC.get(c.id) ?? null,
    }));
  });

export const getContract = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ contractId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("contracts")
      .select(
        "id, name, code, type, billing_model, status, currency, start_date, end_date, owner_consultant_id, sprint_duration_days, sprint_cadence, hours_per_sprint, payment_schedule_type, payment_schedule_config, account_id, workspace_id, notes, descripcion_factura, created_at, requires_client_tickets, sla_id",
      )
      .eq("id", data.contractId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Contrato no encontrado");
    return row;
  });

export const createContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        accountId: z.string().uuid(),
        name: z.string().min(1).max(160),
        code: z.string().max(40).optional(),
        type: z.enum(["implementation", "recurrente"]),
        billingModel: z.enum(["fixed", "monthly", "mixed"]).default("fixed"),
        currency: z.string().min(2).max(8).default("USD"),
        startDate: z.string(),
        endDate: z.string().nullable().optional(),
        ownerConsultantId: z.string().uuid().nullable().optional(),
        sprintDurationDays: z.number().int().min(1).max(120).nullable().optional(),
        sprintCadence: z.enum(["monthly", "biweekly"]).nullable().optional(),
        hoursPerSprint: z.number().min(0).nullable().optional(),
        paymentScheduleType: z
          .enum(["monthly_fixed", "per_milestone", "mixed", "none"])
          .default("none"),
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
        code: data.code ?? null,
        type: data.type,
        billing_model: data.billingModel,
        currency: data.currency,
        start_date: data.startDate,
        end_date: data.endDate ?? null,
        owner_consultant_id: data.ownerConsultantId ?? null,
        sprint_duration_days:
          data.type === "implementation" ? null : (data.sprintDurationDays ?? 14),
        sprint_cadence: data.type === "implementation" ? null : (data.sprintCadence ?? null),
        hours_per_sprint: data.type === "implementation" ? null : (data.hoursPerSprint ?? null),
        payment_schedule_type: data.paymentScheduleType,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Auto-create a default project so the contract has a board for tasks/sprints
    const { data: projectRow } = await context.supabase
      .from("projects")
      .insert({
        workspace_id: data.workspaceId,
        contract_id: row.id,
        name: data.name,
        color: "#8b5cf6",
        icon: "folder",
        created_by: context.userId,
      })
      .select("id")
      .single();

    return { ...row, project_id: projectRow?.id ?? null };
  });

export const updateContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        contractId: z.string().uuid(),
        name: z.string().min(1).max(160).optional(),
        status: z
          .enum(["borrador", "activo", "en_renovacion", "finalizado", "cancelado"])
          .optional(),
        endDate: z.string().nullable().optional(),
        paymentScheduleType: z.enum(["monthly_fixed", "per_milestone", "mixed", "none"]).optional(),
        notes: z.string().max(5000).nullable().optional(),
        ownerConsultantId: z.string().uuid().nullable().optional(),
        descripcionFactura: z.string().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const {
      contractId,
      endDate,
      ownerConsultantId,
      paymentScheduleType,
      descripcionFactura,
      ...rest
    } = data;
    const patch = {
      ...rest,
      ...(endDate !== undefined ? { end_date: endDate } : {}),
      ...(ownerConsultantId !== undefined ? { owner_consultant_id: ownerConsultantId } : {}),
      ...(paymentScheduleType !== undefined ? { payment_schedule_type: paymentScheduleType } : {}),
      ...(descripcionFactura !== undefined
        ? { descripcion_factura: descripcionFactura?.trim() ? descripcionFactura.trim() : null }
        : {}),
    };
    const { error } = await context.supabase.from("contracts").update(patch).eq("id", contractId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ FINANCIALS ============

export const getContractFinancials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ contractId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("contract_financials")
      .select("*")
      .eq("contract_id", data.contractId)
      .maybeSingle();
    if (error) {
      // permission denied is expected for non-admins → return null
      if (error.code === "42501" || error.message.toLowerCase().includes("denied")) return null;
      throw new Error(error.message);
    }
    return row;
  });

export const upsertContractFinancials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        contractId: z.string().uuid(),
        feeTotal: z.number().min(0).nullable().optional(),
        monthlyFee: z.number().min(0).nullable().optional(),
        contractedHoursTotal: z.number().min(0).nullable().optional(),
        hourlyRate: z.number().min(0).nullable().optional(),
        internalHourlyCost: z.number().min(0).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const payload = {
      contract_id: data.contractId,
      fee_total: data.feeTotal ?? null,
      monthly_fee: data.monthlyFee ?? null,
      contracted_hours_total: data.contractedHoursTotal ?? null,
      hourly_rate: data.hourlyRate ?? null,
      internal_hourly_cost: data.internalHourlyCost ?? null,
      notes: data.notes ?? null,
    };
    const { error } = await context.supabase
      .from("contract_financials")
      .upsert(payload, { onConflict: "contract_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ SPRINTS ============

export const listSprints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ contractId: z.string().uuid(), projectId: z.string().uuid().nullish() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("sprints").select("*").eq("contract_id", data.contractId);
    if (data.projectId) q = q.eq("project_id", data.projectId);
    const { data: rows, error } = await q.order("sprint_number", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createSprint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        contractId: z.string().uuid(),
        startDate: z.string(),
        endDate: z.string(),
        contractedHours: z.number().min(0).max(10000),
        notes: z.string().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("sprints")
      .select("sprint_number")
      .eq("contract_id", data.contractId)
      .order("sprint_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const next = (existing?.sprint_number ?? 0) + 1;
    const { data: row, error } = await context.supabase
      .from("sprints")
      .insert({
        contract_id: data.contractId,
        sprint_number: next,
        start_date: data.startDate,
        end_date: data.endDate,
        contracted_hours: data.contractedHours,
        notes: data.notes ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateSprintStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        sprintId: z.string().uuid(),
        status: z.enum(["por_planificar", "planificado", "en_curso", "cerrado"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sprints")
      .update({ status: data.status })
      .eq("id", data.sprintId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Métricas por sprint: capacidad contratada, capacidad real del equipo asignado,
// horas estimadas (suma de total_effort_hours de tareas del sprint) y horas
// reales (suma de time_entries.duration_minutes / 60 de esas tareas).
export const getSprintMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ contractId: z.string().uuid(), projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: sprints, error: sErr } = await supabase
      .from("sprints")
      .select("id, sprint_number, start_date, end_date, contracted_hours, contract_id")
      .eq("contract_id", data.contractId)
      .eq("project_id", data.projectId)

      .order("sprint_number", { ascending: true });
    if (sErr) throw new Error(sErr.message);
    if (!sprints || sprints.length === 0) return [];

    const { data: contract } = await supabase
      .from("contracts")
      .select("workspace_id")
      .eq("id", data.contractId)
      .maybeSingle();
    const workspaceId = contract?.workspace_id as string | undefined;

    const { data: tasks, error: tErr } = await supabase
      .from("tasks")
      .select("id, sprint_id, assignee_id, status, total_effort_hours")
      .eq("project_id", data.projectId)
      .not("sprint_id", "is", null);
    if (tErr) throw new Error(tErr.message);

    const taskIds = (tasks ?? []).map((t) => t.id);
    let entries: Array<{ task_id: string; duration_minutes: number | null }> = [];
    if (taskIds.length > 0) {
      const CHUNK = 200;
      for (let i = 0; i < taskIds.length; i += CHUNK) {
        const slice = taskIds.slice(i, i + CHUNK);
        const { data: te, error: eErr } = await supabase
          .from("time_entries")
          .select("task_id, duration_minutes")
          .in("task_id", slice);
        if (eErr) throw new Error(eErr.message);
        entries = entries.concat((te ?? []) as never);
      }
    }

    const realByTask = new Map<string, number>();
    for (const e of entries) {
      const mins = Number(e.duration_minutes ?? 0);
      realByTask.set(e.task_id, (realByTask.get(e.task_id) ?? 0) + mins);
    }

    const assigneesBySprint = new Map<string, Set<string>>();
    const allAssignees = new Set<string>();
    for (const t of tasks ?? []) {
      if (!t.sprint_id || !t.assignee_id) continue;
      const set = assigneesBySprint.get(t.sprint_id) ?? new Set<string>();
      set.add(t.assignee_id);
      assigneesBySprint.set(t.sprint_id, set);
      allAssignees.add(t.assignee_id);
    }

    type Cap = { user_id: string; daily_hours: number | null; weekly_pattern: number[] | null };
    let caps: Cap[] = [];
    if (workspaceId && allAssignees.size > 0) {
      const { data: capRows } = await supabase
        .from("user_capacity")
        .select("user_id, daily_hours, weekly_pattern")
        .eq("workspace_id", workspaceId)
        .in("user_id", Array.from(allAssignees));
      caps = (capRows ?? []) as never;
    }
    const capByUser = new Map<string, Cap>(caps.map((c) => [c.user_id, c]));

    const capacityForUserInRange = (userId: string, start: string, end: string): number => {
      const c = capByUser.get(userId);
      if (!c) return 0;
      const pattern: number[] =
        Array.isArray(c.weekly_pattern) && c.weekly_pattern.length === 7
          ? c.weekly_pattern.map((v) => Number(v) || 0)
          : [
              Number(c.daily_hours ?? 0),
              Number(c.daily_hours ?? 0),
              Number(c.daily_hours ?? 0),
              Number(c.daily_hours ?? 0),
              Number(c.daily_hours ?? 0),
              0,
              0,
            ];
      let total = 0;
      const d = new Date(start + "T00:00:00Z");
      const endD = new Date(end + "T00:00:00Z");
      while (d.getTime() <= endD.getTime()) {
        const js = d.getUTCDay();
        const idx = js === 0 ? 6 : js - 1;
        total += pattern[idx] ?? 0;
        d.setUTCDate(d.getUTCDate() + 1);
      }
      return total;
    };

    return sprints.map((s) => {
      const sprintTasks = (tasks ?? []).filter((t) => t.sprint_id === s.id);
      const estimated = sprintTasks.reduce((acc, t) => acc + Number(t.total_effort_hours ?? 0), 0);
      const realMin = sprintTasks.reduce((acc, t) => acc + (realByTask.get(t.id) ?? 0), 0);
      const real = realMin / 60;
      const pending = sprintTasks.filter(
        (t) => t.status !== "completada" && t.status !== "cancelada",
      ).length;
      const assignees = Array.from(assigneesBySprint.get(s.id) ?? []);
      const teamCapacity = assignees.reduce(
        (acc, uid) => acc + capacityForUserInRange(uid, s.start_date, s.end_date),
        0,
      );
      return {
        sprint_id: s.id,
        sprint_number: s.sprint_number,
        contracted_hours: Number(s.contracted_hours ?? 0),
        team_capacity_hours: Math.round(teamCapacity * 100) / 100,
        estimated_hours: Math.round(estimated * 100) / 100,
        real_hours: Math.round(real * 100) / 100,
        pending_tasks: pending,
      };
    });
  });

// Mueve todas las tareas no cerradas de un sprint al siguiente sprint del contrato.
export const moveSprintPendingTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        sprintId: z.string().uuid(),
        projectId: z.string().uuid(),
        targetSprintId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    let targetId = data.targetSprintId ?? null;
    if (!targetId) {
      const { data: src } = await supabase
        .from("sprints")
        .select("contract_id, sprint_number")
        .eq("id", data.sprintId)
        .maybeSingle();
      if (!src) throw new Error("Sprint no encontrado");
      const { data: next } = await supabase
        .from("sprints")
        .select("id")
        .eq("contract_id", src.contract_id)
        .gt("sprint_number", src.sprint_number)
        .order("sprint_number", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!next)
        throw new Error("No hay un sprint siguiente. Crea uno nuevo antes de mover tareas.");
      targetId = next.id;
    }

    const { data: pending, error: pErr } = await supabase
      .from("tasks")
      .select("id")
      .eq("project_id", data.projectId)
      .eq("sprint_id", data.sprintId)
      .not("status", "in", "(completada,cancelada)");
    if (pErr) throw new Error(pErr.message);
    const ids = (pending ?? []).map((t) => t.id);
    if (ids.length === 0) return { moved: 0, targetSprintId: targetId };

    const { error } = await supabase.from("tasks").update({ sprint_id: targetId }).in("id", ids);
    if (error) throw new Error(error.message);
    return { moved: ids.length, targetSprintId: targetId };
  });

// ============ PHASES ============

export const listPhases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("phases")
      .select("*")
      .eq("project_id", data.projectId)
      .order("order_index", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createPhase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        name: z.string().min(1).max(120),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("phases")
      .select("order_index")
      .eq("project_id", data.projectId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    const next = (existing?.order_index ?? -1) + 1;
    const { data: row, error } = await context.supabase.rpc("insert_phase_raw", {
      _project_id: data.projectId,
      _name: data.name,
      _order_index: next,
      _start_date: (data.startDate ?? null) as unknown as string,
      _end_date: (data.endDate ?? null) as unknown as string,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const updatePhaseStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        phaseId: z.string().uuid(),
        status: z.enum(["sin_iniciar", "en_curso", "demorada", "completada"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("phases")
      .update({ status: data.status })
      .eq("id", data.phaseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updatePhase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        phaseId: z.string().uuid(),
        name: z.string().min(1).optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        orderIndex: z.number().int().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("update_phase_raw", {
      _id: data.phaseId,
      _name: data.name ?? null,
      _start_date: data.startDate ?? null,
      _end_date: data.endDate ?? null,
      _order_index: data.orderIndex ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePhase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ phaseId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("phases").delete().eq("id", data.phaseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProjectPhases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("phases")
      .delete()
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProjectMilestones = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("milestones")
      .delete()
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ MILESTONES ============

export const listMilestones = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("milestones")
      .select("*")
      .eq("project_id", data.projectId)
      .order("due_date", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        phaseId: z.string().uuid().nullable().optional(),
        name: z.string().min(1).max(160),
        description: z.string().max(1000).optional(),
        dueDate: z.string().nullable().optional(),
        isBillableEvent: z.boolean().default(false),
        amount: z.number().min(0).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("milestones")
      .insert({
        project_id: data.projectId,
        phase_id: data.phaseId ?? null,
        name: data.name,
        description: data.description ?? null,
        due_date: data.dueDate ?? null,
        is_billable_event: data.isBillableEvent,
        amount: data.amount ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setMilestoneStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        milestoneId: z.string().uuid(),
        status: z.enum(["pending", "achieved", "invoiced"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("milestones")
      .update({ status: data.status })
      .eq("id", data.milestoneId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ PAYMENTS ============

export const listContractPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ contractId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("contract_payments")
      .select("*")
      .eq("contract_id", data.contractId)
      .order("due_date", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updatePaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        paymentId: z.string().uuid(),
        status: z.enum(["scheduled", "invoiced", "paid", "overdue", "cancelled"]),
        paidAt: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      status: typeof data.status;
      paid_at: string | null;
      ready_to_invoice?: boolean;
    } = {
      status: data.status,
      paid_at: data.status === "paid" ? (data.paidAt ?? new Date().toISOString()) : null,
    };
    if (data.status === "invoiced" || data.status === "paid" || data.status === "cancelled") {
      patch.ready_to_invoice = false;
    }
    const { error } = await context.supabase
      .from("contract_payments")
      .update(patch)
      .eq("id", data.paymentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ OPERATIONS TREE ============
// Returns accounts → active contracts → project_id + open task count.
// Used by the Tareas module sidebar tree.

export const listOperationsTree = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [accountsRes, contractsRes, projectsRes, phasesRes, tasksRes, handoffsRes] =
      await Promise.all([
        supabase
          .from("accounts")
          .select("id, name, status")
          .eq("workspace_id", data.workspaceId)
          .order("name", { ascending: true }),
        supabase
          .from("contracts")
          .select("id, name, type, status, start_date, end_date, account_id, is_partner")
          .eq("workspace_id", data.workspaceId)
          .order("created_at", { ascending: false }),
        supabase
          .from("projects")
          .select("id, contract_id, created_at")
          .eq("workspace_id", data.workspaceId)
          .not("contract_id", "is", null)
          .order("created_at", { ascending: true }),
        supabase
          .from("phases")
          .select("project_id, projects!inner(workspace_id)")
          .eq("projects.workspace_id", data.workspaceId),
        supabase
          .from("tasks")
          .select("contract_id, task_statuses(category)")
          .not("contract_id", "is", null),
        supabase.from("contract_handoffs").select("contract_id, state").eq("state", "completado"),
      ]);
    const fail = (
      label: string,
      err: { message: string; code?: string; details?: string; hint?: string } | null,
    ) => {
      if (!err) return;
      const parts = [
        `[listOperationsTree/${label}]`,
        err.message,
        err.code && `(code=${err.code})`,
        err.details && `details=${err.details}`,
        err.hint && `hint=${err.hint}`,
      ].filter(Boolean);
      throw new Error(parts.join(" "));
    };
    fail("accounts", accountsRes.error);
    fail("contracts", contractsRes.error);
    fail("projects", projectsRes.error);
    fail("phases", phasesRes.error);
    fail("tasks", tasksRes.error);
    fail("handoffs", handoffsRes.error);

    const completedHandoffContracts = new Set<string>(
      (handoffsRes.data ?? []).map((h) => h.contract_id).filter(Boolean) as string[],
    );

    const phaseCountByProject = new Map<string, number>();
    for (const phase of phasesRes.data ?? []) {
      if (!phase.project_id) continue;
      phaseCountByProject.set(
        phase.project_id,
        (phaseCountByProject.get(phase.project_id) ?? 0) + 1,
      );
    }
    const projectsByContract = new Map<string, NonNullable<typeof projectsRes.data>[number][]>();
    for (const p of projectsRes.data ?? []) {
      if (!p.contract_id) continue;
      const candidates = projectsByContract.get(p.contract_id) ?? [];
      candidates.push(p);
      projectsByContract.set(p.contract_id, candidates);
    }
    const projectByContract = new Map<string, string>();
    for (const [contractId, candidates] of projectsByContract) {
      const preferred =
        candidates.find((p) => (phaseCountByProject.get(p.id) ?? 0) > 0) ?? candidates[0];
      if (preferred) projectByContract.set(contractId, preferred.id);
    }
    const openByContract = new Map<string, number>();
    for (const t of (tasksRes.data ?? []) as Array<{
      contract_id: string | null;
      task_statuses: { category: string } | null;
    }>) {
      if (!t.contract_id) continue;
      const cat = t.task_statuses?.category;
      if (cat === "completada" || cat === "cancelada") continue;
      openByContract.set(t.contract_id, (openByContract.get(t.contract_id) ?? 0) + 1);
    }

    type ContractNode = {
      id: string;
      name: string;
      type: "implementation" | "recurrente";
      status: string;
      start_date: string;
      end_date: string | null;
      project_id: string | null;
      open_tasks: number;
      projects_count: number;
      is_partner: boolean;
    };
    const contractsByAccount = new Map<string, ContractNode[]>();
    for (const c of contractsRes.data ?? []) {
      if (c.status === "finalizado" || c.status === "cancelado") continue;
      // Visibilidad Operaciones: contratos con handoff completado.
      // Los contratos de partner (auto-generados) se muestran siempre.
      if (!c.is_partner && !completedHandoffContracts.has(c.id)) continue;
      const node: ContractNode = {
        id: c.id,
        name: c.name,
        type: c.type as ContractNode["type"],
        status: c.status,
        start_date: c.start_date,
        end_date: c.end_date,
        project_id: projectByContract.get(c.id) ?? null,
        open_tasks: openByContract.get(c.id) ?? 0,
        projects_count: (projectsByContract.get(c.id) ?? []).length,
        is_partner: !!c.is_partner,
      };
      const arr = contractsByAccount.get(c.account_id) ?? [];
      arr.push(node);
      contractsByAccount.set(c.account_id, arr);
    }

    return (accountsRes.data ?? [])
      .map((a) => ({
        id: a.id,
        name: a.name,
        status: a.status,
        contracts: contractsByAccount.get(a.id) ?? [],
      }))
      .filter((a) => a.contracts.length > 0);
  });

export const listContractChildren = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ contractId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: projects, error: projectsErr } = await supabase
      .from("projects")
      .select("id, name, color, is_primary, orden, hours_per_sprint, created_at")
      .eq("contract_id", data.contractId)
      .order("orden", { ascending: true })
      .order("created_at", { ascending: true });
    if (projectsErr) throw new Error(projectsErr.message);
    const projectIds = (projects ?? []).map((p) => p.id);
    const [sprintsRes, phasesRes, tasksRes] = await Promise.all([
      supabase
        .from("sprints")
        .select("id, project_id, sprint_number, start_date, end_date, status, contracted_hours")
        .eq("contract_id", data.contractId)
        .order("sprint_number", { ascending: true }),
      projectIds.length > 0
        ? supabase
            .from("phases")
            .select("id, project_id, name, status, start_date, end_date, order_index")
            .in("project_id", projectIds)
            .order("order_index", { ascending: true })
        : Promise.resolve({
            data: [] as Array<{
              id: string;
              project_id: string;
              name: string;
              status: string;
              start_date: string | null;
              end_date: string | null;
              order_index: number;
            }>,
            error: null,
          }),
      supabase
        .from("tasks")
        .select("sprint_id, phase_id, status")
        .eq("contract_id", data.contractId),
    ]);
    if (sprintsRes.error) throw new Error(sprintsRes.error.message);
    if (phasesRes.error) throw new Error(phasesRes.error.message);
    if (tasksRes.error) throw new Error(tasksRes.error.message);
    const phaseProjectIds = new Set((phasesRes.data ?? []).map((p) => p.project_id));
    const primary =
      (projects ?? []).find((p) => p.is_primary) ??
      (projects ?? []).find((p) => phaseProjectIds.has(p.id)) ??
      projects?.[0] ??
      null;

    const openBySprint = new Map<string, number>();
    const openByPhase = new Map<string, number>();
    for (const t of tasksRes.data ?? []) {
      if (t.status === "completada" || t.status === "cancelada") continue;
      if (t.sprint_id) openBySprint.set(t.sprint_id, (openBySprint.get(t.sprint_id) ?? 0) + 1);
      if (t.phase_id) openByPhase.set(t.phase_id, (openByPhase.get(t.phase_id) ?? 0) + 1);
    }

    const allSprints = (sprintsRes.data ?? []).map((s) => ({
      ...s,
      open_tasks: openBySprint.get(s.id) ?? 0,
    }));
    const allPhases = (phasesRes.data ?? []).map((p) => ({
      ...p,
      open_tasks: openByPhase.get(p.id) ?? 0,
    }));

    const projectNodes = (projects ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color ?? null,
      is_primary: !!p.is_primary,
      orden: p.orden ?? 0,
      hours_per_sprint: p.hours_per_sprint ?? null,
      sprints: allSprints.filter((s) => s.project_id === p.id),
      phases: allPhases.filter((ph) => ph.project_id === p.id),
    }));

    // Sprints legacy sin project_id se muestran bajo el proyecto principal.
    const orphanSprints = allSprints.filter((s) => !s.project_id);
    if (orphanSprints.length > 0 && primary) {
      const node = projectNodes.find((p) => p.id === primary.id);
      if (node) node.sprints = [...node.sprints, ...orphanSprints];
    }

    return {
      // Compatibilidad: nodo principal
      project_id: primary?.id ?? null,
      sprints: primary
        ? (projectNodes.find((p) => p.id === primary.id)?.sprints ?? [])
        : allSprints,
      phases: allPhases.filter((p) => p.project_id === primary?.id),
      projects: projectNodes,
    };
  });

// ============ MULTI-PROYECTO POR CONTRATO ============

export const listContractProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ contractId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("projects")
      .select("id, name, color, is_primary, orden, hours_per_sprint, state, created_at")
      .eq("contract_id", data.contractId)
      .order("orden", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r) => r.id);
    const { data: sprints } = ids.length
      ? await supabase.from("sprints").select("id, project_id").in("project_id", ids)
      : { data: [] as Array<{ id: string; project_id: string | null }> };
    const countByProject = new Map<string, number>();
    for (const s of sprints ?? []) {
      if (!s.project_id) continue;
      countByProject.set(s.project_id, (countByProject.get(s.project_id) ?? 0) + 1);
    }
    return (rows ?? []).map((r) => ({ ...r, sprint_count: countByProject.get(r.id) ?? 0 }));
  });

export const createContractProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        contractId: z.string().uuid(),
        name: z.string().min(1).max(120),
        color: z.string().max(20).nullable().optional(),
        hoursPerSprint: z.number().min(0).nullable().optional(),
        generateSprints: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: contract, error: cErr } = await supabase
      .from("contracts")
      .select("id, workspace_id, start_date, end_date, hours_per_sprint, type")
      .eq("id", data.contractId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!contract) throw new Error("Contrato no encontrado.");

    const { data: siblings } = await supabase
      .from("projects")
      .select("id, orden")
      .eq("contract_id", data.contractId);
    const maxOrden = (siblings ?? []).reduce((m, s) => Math.max(m, s.orden ?? 0), 0);

    const { data: row, error } = await supabase
      .from("projects")
      .insert({
        workspace_id: contract.workspace_id,
        contract_id: contract.id,
        name: data.name,
        color: data.color ?? null,
        orden: maxOrden + 1,
        is_primary: (siblings ?? []).length === 0,
        hours_per_sprint: data.hoursPerSprint ?? contract.hours_per_sprint ?? null,
        delivery_type: contract.type === "recurrente" ? "raas" : "proyecto",
        fecha_inicio_delivery: contract.start_date ?? null,
        fecha_entrega_objetivo: contract.end_date ?? null,
        created_by: userId,
      })
      .select("id, name")
      .single();
    if (error) throw new Error(error.message);

    let sprintsCreated = 0;
    if (data.generateSprints) {
      const { data: n, error: rpcErr } = await supabase.rpc("generate_project_sprints", {
        _project_id: row.id,
        _first_start: contract.start_date ?? undefined,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      sprintsCreated = Number(n ?? 0);
    }
    return { ...row, sprintsCreated };
  });

export const updateContractProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        patch: z.object({
          name: z.string().min(1).max(120).optional(),
          color: z.string().max(20).nullable().optional(),
          orden: z.number().int().min(0).optional(),
          hours_per_sprint: z.number().min(0).nullable().optional(),
          is_primary: z.boolean().optional(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.patch.is_primary) {
      const { data: p } = await supabase
        .from("projects")
        .select("contract_id")
        .eq("id", data.projectId)
        .maybeSingle();
      if (p?.contract_id) {
        await supabase
          .from("projects")
          .update({ is_primary: false })
          .eq("contract_id", p.contract_id);
      }
    }
    const { error } = await supabase.from("projects").update(data.patch).eq("id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const generateSprintsForProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        firstStart: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: n, error } = await supabase.rpc("generate_project_sprints", {
      _project_id: data.projectId,
      _first_start: data.firstStart ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { created: Number(n ?? 0) };
  });

// ============ MIGRATION (marcha blanca desde Wrike) ============

/**
 * Creates a project that is already in flight (e.g. migrated from Wrike),
 * skipping the normal projected-contract → handoff → delivery-plan flow.
 *
 * In a single call this can:
 *  - create or reuse an account
 *  - create or reuse a contract (marked status=activo, legacy flag on)
 *  - create the project with state/lead/dates/budget
 *  - create the current sprint (recurrente) or current milestone
 *  - record previously consumed hours via a placeholder task + time entry
 */
export const createOngoingProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        account: z.union([
          z.object({ kind: z.literal("existing"), accountId: z.string().uuid() }),
          z.object({ kind: z.literal("new"), name: z.string().min(1).max(120) }),
        ]),
        contract: z.union([
          z.object({ kind: z.literal("existing"), contractId: z.string().uuid() }),
          z.object({
            kind: z.literal("new"),
            name: z.string().min(1).max(160),
            type: z.enum(["implementation", "recurrente"]),
            currency: z.string().min(2).max(8).default("USD"),
            startDate: z.string(),
            endDate: z.string().nullable().optional(),
            sprintDurationDays: z.number().int().min(1).max(120).nullable().optional(),
            hoursPerSprint: z.number().min(0).nullable().optional(),
            ownerConsultantId: z.string().uuid().nullable().optional(),
            vendedorId: z.string().uuid().nullable().optional(),
            comisionPct: z.number().min(0).max(100).optional(),
          }),
        ]),
        project: z.object({
          name: z.string().min(1).max(120),
          description: z.string().max(2000).optional(),
          leadId: z.string().uuid().nullable().optional(),
          state: z.enum(["planificacion", "en_curso", "en_riesgo", "entregado", "cerrado"]),
          fechaInicioDelivery: z.string().nullable().optional(),
          fechaEntregaObjetivo: z.string().nullable().optional(),
          horasPresupuestadasTotal: z.number().min(0).nullable().optional(),
          margenObjetivoPct: z.number().min(0).max(100).optional(),
        }),
        sprint: z
          .object({
            number: z.number().int().min(1),
            startDate: z.string(),
            endDate: z.string(),
            contractedHours: z.number().min(0),
          })
          .nullable()
          .optional(),
        hito: z
          .object({
            name: z.string().min(1).max(160),
            dueDate: z.string().nullable().optional(),
          })
          .nullable()
          .optional(),
        horasConsumidasPrevias: z.number().min(0).max(100000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Account
    let accountId: string;
    if (data.account.kind === "existing") {
      accountId = data.account.accountId;
    } else {
      const targetWs = await resolveAccountsWorkspaceId(supabase, data.workspaceId);
      const base = slugify(data.account.name);
      let slug = base;
      let created: { id: string } | null = null;
      for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
        const { data: row, error } = await supabaseAdmin
          .from("accounts")
          .insert({
            workspace_id: targetWs,
            name: data.account.name,
            slug,
            created_by: userId,
          })
          .select("id")
          .single();
        if (!error && row) {
          created = row;
          break;
        }
        if (error && !error.message.toLowerCase().includes("duplicate")) {
          throw new Error(error.message);
        }
        slug = `${base}-${Math.random().toString(36).slice(2, 5)}`;
      }
      if (!created) throw new Error("No se pudo crear el cliente");
      accountId = created.id;
    }

    // 2) Contract
    let contractId: string;
    if (data.contract.kind === "existing") {
      contractId = data.contract.contractId;
    } else {
      const c = data.contract;
      const { data: row, error } = await supabase
        .from("contracts")
        .insert({
          workspace_id: data.workspaceId,
          account_id: accountId,
          name: c.name,
          type: c.type,
          billing_model: "fixed",
          status: "activo",
          currency: c.currency,
          start_date: c.startDate,
          end_date: c.endDate ?? null,
          owner_consultant_id: c.ownerConsultantId ?? null,
          vendedor_id: c.vendedorId ?? null,
          comision_pct: c.comisionPct ?? 6,
          sprint_duration_days: c.type === "implementation" ? null : (c.sprintDurationDays ?? 14),
          hours_per_sprint: c.type === "implementation" ? null : (c.hoursPerSprint ?? null),
          payment_schedule_type: "none",
          legacy_milestone_billing: true,
          notes: "Contrato migrado desde Wrike (marcha blanca)",
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      contractId = row.id;
    }

    // 3) Project
    const p = data.project;
    const wrikeNote = "[Migrado desde Wrike]";
    const description = p.description ? `${wrikeNote}\n\n${p.description}` : wrikeNote;
    const { data: projectRow, error: pErr } = await supabase
      .from("projects")
      .insert({
        workspace_id: data.workspaceId,
        contract_id: contractId,
        name: p.name,
        description,
        color: "#8b5cf6",
        icon: "folder",
        area: "operations",
        state: p.state,
        lead_id: p.leadId ?? null,
        fecha_inicio_delivery: p.fechaInicioDelivery ?? null,
        fecha_entrega_objetivo: p.fechaEntregaObjetivo ?? null,
        horas_presupuestadas_total: p.horasPresupuestadasTotal ?? null,
        margen_objetivo_pct: p.margenObjetivoPct ?? 40,
        created_by: userId,
      })
      .select("id")
      .single();
    if (pErr) throw new Error(pErr.message);
    const projectId = projectRow.id as string;

    // 4) Sprint
    if (data.sprint) {
      const s = data.sprint;
      const { error: sErr } = await supabaseAdmin.from("sprints").insert({
        contract_id: contractId,
        sprint_number: s.number,
        start_date: s.startDate,
        end_date: s.endDate,
        status: "en_curso",
        contracted_hours: s.contractedHours,
        notes: "Sprint actual al migrar desde Wrike",
      });
      if (sErr) throw new Error(sErr.message);
    }

    // 5) Milestone
    if (data.hito) {
      const { error: mErr } = await supabaseAdmin.from("milestones").insert({
        project_id: projectId,
        name: data.hito.name,
        due_date: data.hito.dueDate ?? null,
        status: "pending",
      });
      if (mErr) throw new Error(mErr.message);
    }

    // 6) Horas consumidas previas → placeholder task + time entry
    const horas = data.horasConsumidasPrevias ?? 0;
    if (horas > 0) {
      // pick any default status for the workspace
      const { data: defStatus } = await supabaseAdmin
        .from("task_statuses")
        .select("id")
        .eq("workspace_id", data.workspaceId)
        .eq("is_default", true)
        .limit(1)
        .maybeSingle();
      if (defStatus?.id) {
        const leadOrUser = p.leadId ?? userId;
        const { data: task, error: tErr } = await supabaseAdmin
          .from("tasks")
          .insert({
            project_id: projectId,
            title: "Migración Wrike — horas previas",
            description: "Registro de horas ya consumidas en Wrike antes de la marcha blanca.",
            status: "completada",
            priority: "none",
            assignee_id: leadOrUser,
            contract_id: contractId,
            status_id: defStatus.id,
            created_by: userId,
            completed_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (tErr) throw new Error(tErr.message);
        const now = new Date();
        const started = new Date(now.getTime() - horas * 60 * 60 * 1000);
        const { error: teErr } = await supabaseAdmin.from("time_entries").insert({
          task_id: task.id,
          user_id: leadOrUser,
          started_at: started.toISOString(),
          ended_at: now.toISOString(),
          duration_minutes: Math.round(horas * 60),
          note: "Migración Wrike — horas previas",
          is_billable: true,
          source: "manual",
        });
        if (teErr) throw new Error(teErr.message);
      }
    }

    return { projectId, contractId, accountId };
  });

/**
 * Resumen consolidado de sprints a nivel contrato.
 * Agrupa los sprints de todos los proyectos del contrato por número de sprint
 * (período) con totales de horas estimadas/reales y avance de tareas,
 * con desglose por proyecto. No devuelve tareas individuales.
 */
export const getContractSprintSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ contractId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: contract } = await supabase
      .from("contracts")
      .select("hours_per_sprint")
      .eq("id", data.contractId)
      .maybeSingle();
    const contractedPerPeriod = Number(contract?.hours_per_sprint ?? 0);

    const { data: rows, error } = await supabase.rpc("get_contract_sprint_summary", {
      _contract_id: data.contractId,
    });
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return { periods: [], contractedPerPeriod };

    type Row = (typeof rows)[number];
    type ProjectRow = {
      projectId: string | null;
      projectName: string;
      sprintId: string;
      status: string;
      estimatedHours: number;
      realHours: number;
      tasksTotal: number;
      tasksDone: number;
    };
    const periodsMap = new Map<
      number,
      {
        sprintNumber: number;
        startDate: string;
        endDate: string;
        contractedHours: number;
        estimatedHours: number;
        realHours: number;
        tasksTotal: number;
        tasksDone: number;
        byProject: ProjectRow[];
      }
    >();

    const round = (n: number) => Math.round(n * 100) / 100;

    for (const r of rows as Row[]) {
      const num = Number(r.sprint_number);
      const est = Number(r.estimated_hours ?? 0);
      const real = Number(r.real_hours ?? 0);
      const entry = periodsMap.get(num) ?? {
        sprintNumber: num,
        startDate: r.start_date as string,
        endDate: r.end_date as string,
        contractedHours: 0,
        estimatedHours: 0,
        realHours: 0,
        tasksTotal: 0,
        tasksDone: 0,
        byProject: [] as ProjectRow[],
      };
      if ((r.start_date as string) < entry.startDate) entry.startDate = r.start_date as string;
      if ((r.end_date as string) > entry.endDate) entry.endDate = r.end_date as string;
      entry.contractedHours = Math.max(entry.contractedHours, Number(r.contracted_hours ?? 0));
      entry.estimatedHours += est;
      entry.realHours += real;
      entry.tasksTotal += Number(r.tasks_total ?? 0);
      entry.tasksDone += Number(r.tasks_done ?? 0);
      entry.byProject.push({
        projectId: r.project_id ?? null,
        projectName: r.project_name ?? "Sin proyecto",
        sprintId: r.sprint_id as string,
        status: String(r.status ?? "planificado"),
        estimatedHours: round(est),
        realHours: round(real),
        tasksTotal: Number(r.tasks_total ?? 0),
        tasksDone: Number(r.tasks_done ?? 0),
      });
      periodsMap.set(num, entry);
    }

    const today = new Date().toISOString().slice(0, 10);
    const periods = Array.from(periodsMap.values())
      .sort((a, b) => a.sprintNumber - b.sprintNumber)
      .map((p) => ({
        sprintNumber: p.sprintNumber,
        startDate: p.startDate,
        endDate: p.endDate,
        status: today < p.startDate ? "planificado" : today > p.endDate ? "cerrado" : "en_curso",
        contractedHours: contractedPerPeriod > 0 ? contractedPerPeriod : p.contractedHours,
        estimatedHours: round(p.estimatedHours),
        realHours: round(p.realHours),
        tasksTotal: p.tasksTotal,
        tasksDone: p.tasksDone,
        byProject: p.byProject
          .filter((bp) => bp.tasksTotal > 0 || bp.realHours > 0)
          .sort((a, b) => b.realHours - a.realHours || a.projectName.localeCompare(b.projectName)),
      }));

    return { periods, contractedPerPeriod };
  });
