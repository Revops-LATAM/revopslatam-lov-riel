import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * ESC (Escuela de Comercio) — importador one-shot desde export de Wrike.
 *
 * Dos operaciones:
 *  1) setupEscContractAndProject
 *     - Actualiza el contrato "RaaS" para dejarlo recurrente, quincenal, 25 h/sprint.
 *     - Crea 14 sprints (Ene ST I ... Jul ST II) con fechas fijas 1-15 / 16-EOM.
 *     - Crea el proyecto `ESC - RaaS 2026`.
 *  2) importEscTasksFromXlsx
 *     - Parsea xlsx exportado desde Wrike y crea/actualiza tareas del proyecto.
 *     - Idempotente por (project_id, external_ref = wrike:<Key>).
 */

const CONTRACT_ID_DEFAULT = "86dada37-50a4-42ab-a67a-8e85961149bd";
const ACCOUNT_ID_DEFAULT = "14f6f0f4-9925-4184-b6c6-d1c6d2e48f52";
const WORKSPACE_ID_DEFAULT = "d90e7950-0e6f-497e-a4c7-4b73a29a69c2";

// Sprints 2026 — ST I = día 1-15, ST II = día 16-EOM.
type SprintDef = { number: number; folder: string; start: string; end: string; monthLabel: string };

function eom(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1..12
}

const MONTHS = [
  { key: "ENE", num: 1, label: "Ene" },
  { key: "FEB", num: 2, label: "Feb" },
  { key: "MAR", num: 3, label: "Mar" },
  { key: "ABR", num: 4, label: "Abr" },
  { key: "MAY", num: 5, label: "May" },
  { key: "JUN", num: 6, label: "Jun" },
  { key: "JUL", num: 7, label: "Jul" },
  { key: "AGO", num: 8, label: "Ago" },
  { key: "SEP", num: 9, label: "Sep" },
  { key: "OCT", num: 10, label: "Oct" },
  { key: "NOV", num: 11, label: "Nov" },
  { key: "DIC", num: 12, label: "Dic" },
];

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function buildSprints2026(): SprintDef[] {
  const out: SprintDef[] = [];
  let n = 1;
  for (const m of MONTHS) {
    const last = eom(2026, m.num);
    out.push({
      number: n++,
      folder: `ESC - ${m.label} ST I`,
      start: `2026-${pad(m.num)}-01`,
      end: `2026-${pad(m.num)}-15`,
      monthLabel: m.label,
    });
    out.push({
      number: n++,
      folder: `ESC - ${m.label} ST II`,
      start: `2026-${pad(m.num)}-16`,
      end: `2026-${pad(m.num)}-${pad(last)}`,
      monthLabel: m.label,
    });
  }
  return out;
}

// Normaliza el nombre de carpeta del xlsx a la key comparable.
function normalizeFolder(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw
    .replace(/^\/|\/$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const STATUS_MAP: Record<
  string,
  "nueva" | "planificada" | "en_curso" | "en_pausa" | "completada" | "cancelada"
> = {
  COMPLETED: "completada",
  REALIZADA: "completada",
  NEW: "nueva",
  NUEVA: "nueva",
  AGENDADA: "nueva",
  "POR AGENDAR": "nueva",
  PLANIFICADA: "planificada",
  PLANIFICADO: "planificada",
  "IN PROGRESS": "en_curso",
  "EN PAUSA": "en_pausa",
  SUSPENDIDA: "en_pausa",
  CANCELLED: "cancelada",
  CANCELADA: "cancelada",
};

function mapStatus(customStatus: string | null, wrikeStatus: string | null): string {
  const k = (customStatus ?? wrikeStatus ?? "").toString().trim().toUpperCase();
  return STATUS_MAP[k] ?? "nueva";
}

// Parsea "Nombre <email>, Otro <email2>" → [{name,email}, ...]
function parseAssignees(
  raw: string | null | undefined,
): Array<{ name: string; email: string | null }> {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((chunk) => {
      const m = chunk.match(/^(.*?)\s*<([^>]*)>$/);
      if (m) {
        const email = m[2]?.trim();
        return { name: m[1].trim(), email: email && email !== "null" ? email.toLowerCase() : null };
      }
      return { name: chunk, email: null };
    });
}

function buildDescription(row: Record<string, unknown>): string {
  const parts: string[] = [];
  const push = (label: string, val: unknown) => {
    const s = (val ?? "").toString().trim();
    if (s) parts.push(`**${label}:** ${s}`);
  };
  const desc = (row["Description"] ?? "").toString().trim();
  if (desc) parts.push(desc);
  push("Solicitud", row["Solicitud"]);
  push("Impacto", row["Impacto"]);
  push("Acceso Drive", row["Acceso Directo Drive"]);
  push("Contacto principal", row["Punto de contacto Principal"]);
  push("Contacto secundario", row["Punto de contacto Secundario"]);
  push("Especialista (Wrike)", row["Especialista"]);
  return parts.join("\n\n");
}

function toISODate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = v.toString().trim();
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Convierte a horas decimales lo que venga de un xlsx (Wrike, Activo, etc.).
// Acepta: number (horas), string "H:MM" / "HH:MM:SS" / decimal, o Date (SheetJS
// con cellDates:true envuelve duraciones "hh:mm:ss" como Date con epoch
// 1899-12-30 UTC — hay que restar ese epoch y dividir por 3.6e6).
function toHours(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
    const ms = v.getTime() - EXCEL_EPOCH_MS;
    if (!isFinite(ms)) return null;
    const hours = ms / 3_600_000;
    return hours >= 0 ? hours : null;
  }
  if (typeof v === "number") {
    // Heurística: valores <2 casi siempre son fracción-de-día (Excel duration).
    // Los headers "(Hours)" en Wrike ya vienen como Date con cellDates:true,
    // así que este camino cubre exports raw con celdas numéricas.
    return v;
  }
  const s = v.toString().trim();
  if (!s) return null;
  // "25:00" → 25 h ; "1:30" → 1.5 ; "1:30:00" → 1.5
  if (s.includes(":")) {
    const [h, m, sec] = s.split(":").map((x) => Number(x));
    if (isFinite(h)) return h + (isFinite(m) ? m / 60 : 0) + (isFinite(sec) ? sec / 3600 : 0);
  }
  const n = Number(s);
  return isFinite(n) ? n : null;
}

// ============================================================
// 1) SETUP: contrato + proyecto
// ============================================================

export const setupEscContractAndProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        dryRun: z.boolean().default(false),
        contractId: z.string().uuid().default(CONTRACT_ID_DEFAULT),
        workspaceId: z.string().uuid().default(WORKSPACE_ID_DEFAULT),
        projectName: z.string().default("ESC - RaaS 2026"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // AUTHZ: solo super_admin / admin de plataforma pueden correr importadores.
    const [{ data: isSuper }, { data: isAdmin }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    ]);
    if (!isSuper && !isAdmin) {
      throw new Error("Forbidden: requires admin/super_admin");
    }

    // Verify contract exists and belongs to workspace
    const { data: contract, error: cErr } = await supabase
      .from("contracts")
      .select(
        "id, workspace_id, account_id, name, type, currency, start_date, end_date, hours_per_sprint, sprint_cadence",
      )
      .eq("id", data.contractId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!contract) throw new Error(`Contrato ${data.contractId} no encontrado`);
    if (contract.workspace_id !== data.workspaceId) {
      throw new Error("Contrato no pertenece al workspace destino");
    }

    const sprints = buildSprints2026();

    if (data.dryRun) {
      return {
        dryRun: true as const,
        contract,
        plannedContractUpdate: {
          sprint_cadence: "biweekly",
          hours_per_sprint: 25,
          end_date: "2026-12-31",
        },
        plannedSprints: sprints.length,
        plannedProjectName: data.projectName,
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Update contract
    const { error: uErr } = await supabaseAdmin
      .from("contracts")
      .update({
        sprint_cadence: "biweekly",
        hours_per_sprint: 25,
        sprint_duration_days: 15,
        end_date: "2026-12-31",
      })
      .eq("id", data.contractId);
    if (uErr) throw new Error(`update contract: ${uErr.message}`);

    // Create sprints (idempotent by sprint_number)
    let createdSprints = 0;
    for (const s of sprints) {
      const { data: existing } = await supabaseAdmin
        .from("sprints")
        .select("id")
        .eq("contract_id", data.contractId)
        .eq("sprint_number", s.number)
        .maybeSingle();
      if (existing) {
        await supabaseAdmin
          .from("sprints")
          .update({ start_date: s.start, end_date: s.end, contracted_hours: 25 })
          .eq("id", existing.id);
      } else {
        const { error: sErr } = await supabaseAdmin.from("sprints").insert({
          contract_id: data.contractId,
          sprint_number: s.number,
          start_date: s.start,
          end_date: s.end,
          contracted_hours: 25,
          status: "por_planificar",
        });
        if (sErr) throw new Error(`insert sprint ${s.number}: ${sErr.message}`);
        createdSprints += 1;
      }
    }

    // Create/reuse project
    const { data: existingProject } = await supabase
      .from("projects")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .eq("contract_id", data.contractId)
      .eq("name", data.projectName)
      .maybeSingle();

    let projectId: string;
    if (existingProject?.id) {
      projectId = existingProject.id;
    } else {
      const { data: projectRow, error: pErr } = await supabase
        .from("projects")
        .insert({
          workspace_id: data.workspaceId,
          contract_id: contract.id,
          name: data.projectName,
          description: "[Migrado desde Wrike] Proyecto operativo Escuela de Comercio 2026.",
          color: "#f97316",
          icon: "folder",
          area: "operations",
          state: "en_curso",
          fecha_inicio_delivery: "2026-01-01",
          fecha_entrega_objetivo: "2026-12-31",
          horas_presupuestadas_total: 25 * 24,
          margen_objetivo_pct: 40,
          created_by: userId,
        })
        .select("id")
        .single();
      if (pErr) throw new Error(`insert project: ${pErr.message}`);
      projectId = projectRow.id;
    }

    return {
      dryRun: false as const,
      contractId: contract.id,
      projectId,
      createdSprints,
      totalSprints: sprints.length,
    };
  });

// ============================================================
// 2) IMPORT TASKS FROM XLSX (base64)
// ============================================================

type ImportRow = {
  key: string;
  folder: string | null;
  title: string;
  parentTask: string | null;
  wrikeStatus: string | null;
  customStatus: string | null;
  priority: string | null;
  assigneesRaw: string | null;
  startDate: unknown;
  endDate: unknown;
  effort: unknown;
  duration: unknown;
  timeSpent: unknown;
  description: string;
  full: Record<string, unknown>;
};

export const importEscTasksFromXlsx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        workspaceId: z.string().uuid().default(WORKSPACE_ID_DEFAULT),
        contractId: z.string().uuid().default(CONTRACT_ID_DEFAULT),
        fileBase64: z.string().min(1),
        dryRun: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // AUTHZ: solo super_admin / admin de plataforma pueden correr importadores.
    const [{ data: isSuper }, { data: isAdmin }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    ]);
    if (!isSuper && !isAdmin) {
      throw new Error("Forbidden: requires admin/super_admin");
    }

    const XLSX = await import("xlsx");

    // 1) Parse XLSX
    const wb = XLSX.read(data.fileBase64, { type: "base64", cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error("Excel sin hojas");
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: true,
    });

    const rows: ImportRow[] = raw
      .filter((r) => r["Title"] && r["Key"])
      .map((r) => ({
        key: String(r["Key"]),
        folder: (r["Folder"] ?? null) as string | null,
        title: String(r["Title"]).trim(),
        parentTask: (r["Parent task"] ?? null) as string | null,
        wrikeStatus: (r["Status"] ?? null) as string | null,
        customStatus: (r["Custom status"] ?? null) as string | null,
        priority: (r["Priority"] ?? null) as string | null,
        assigneesRaw: (r["Assigned To"] ?? null) as string | null,
        startDate: r["Start Date"],
        endDate: r["End Date"],
        effort: r["Effort"],
        duration: r["Duration (Hours)"],
        timeSpent: r["Time Spent (Hours)"],
        description: buildDescription(r),
        full: r,
      }))
      // Skip carpeta-metadata rows (folder rows have Title like "/Foo/")
      .filter((r) => !/^\/.*\/$/.test(r.title));

    // 2) Sprint lookup for this contract
    const { data: sprintRows } = await supabase
      .from("sprints")
      .select("id, sprint_number")
      .eq("contract_id", data.contractId);
    const sprintByNumber = new Map<number, string>();
    (sprintRows ?? []).forEach((s) => sprintByNumber.set(s.sprint_number, s.id));

    const sprints = buildSprints2026();
    const folderToSprintNumber = new Map<string, number>();
    for (const s of sprints) folderToSprintNumber.set(s.folder.toUpperCase(), s.number);

    // 3) Task type + statuses for the workspace
    const { data: taskTypeRow } = await supabase
      .from("task_types")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .eq("key", "tarea")
      .maybeSingle();
    if (!taskTypeRow) throw new Error("Task type 'tarea' no encontrado en workspace");
    const taskTypeId = taskTypeRow.id as string;

    const { data: statusRows } = await supabase
      .from("task_statuses")
      .select("id, key")
      .eq("workspace_id", data.workspaceId)
      .eq("task_type_id", taskTypeId);
    const statusByKey = new Map<string, string>();
    (statusRows ?? []).forEach((s) => statusByKey.set(s.key, s.id));

    // 4) Member profiles (dos queries porque RLS puede filtrar el embed profile:profiles(...))
    const { data: memberRows } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", data.workspaceId);
    const memberIds = (memberRows ?? []).map((m) => m.user_id).filter(Boolean) as string[];
    let profilesData: Array<{ id: string; email: string | null; full_name: string | null }> = [];
    if (memberIds.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, email, full_name")
        .in("id", memberIds);
      profilesData = (profs ?? []) as typeof profilesData;
    }

    const profileByEmail = new Map<string, string>();
    const profileByLocalPart = new Map<string, string>();
    const profileByName = new Map<string, string>();
    const normName = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    profilesData.forEach((prof) => {
      const uid = prof.id;
      if (!uid) return;
      if (prof.email) {
        profileByEmail.set(prof.email.toLowerCase(), uid);
        const local = prof.email.split("@")[0]?.toLowerCase();
        if (local) profileByLocalPart.set(local, uid);
      }
      if (prof.full_name) profileByName.set(normName(prof.full_name), uid);
    });

    // Alias explícito Wrike → local-part del email en Riel (para nombres que no matchean directo).
    const WRIKE_NAME_ALIASES: Record<string, string> = {
      "pablo moena": "pablo",
      "victor carrillo luna": "victor",
      "victor carrillo": "victor",
      "ariel vargas": "ariel",
      "gabriel espoz": "gabriel",
      "matias sanhueza": "matias",
      "francisca yevenes": "francisca",
      // Ex-empleada — ghost user creado para preservar historial:
      "dominique oyarce diaz": "dominique.ghost",
      "dominique oyarce": "dominique.ghost",
      // Sin cuenta en Riel todavía — quedan en unmatched hasta invitarlos:
      // "belen galaz", "miguel yanez"
    };

    function resolveUser(a: { name: string; email: string | null }): string | null {
      if (a.email) {
        const direct = profileByEmail.get(a.email);
        if (direct) return direct;
        const local = a.email.split("@")[0]?.toLowerCase();
        if (local) {
          const byLocal = profileByLocalPart.get(local);
          if (byLocal) return byLocal;
        }
      }
      if (a.name) {
        const norm = normName(a.name);
        const byName = profileByName.get(norm);
        if (byName) return byName;
        const tokens = norm.split(" ").filter(Boolean);
        if (tokens.length >= 2) {
          const short = `${tokens[0]} ${tokens[1]}`;
          const byShort = profileByName.get(short);
          if (byShort) return byShort;
        }
        const alias = WRIKE_NAME_ALIASES[norm];
        if (alias) {
          const byAlias = profileByLocalPart.get(alias);
          if (byAlias) return byAlias;
        }
        // Fallback: primer nombre solo (ariel, gabriel, matias suelen estar así en Riel)
        if (tokens[0]) {
          const byFirst = profileByLocalPart.get(tokens[0]) ?? profileByName.get(tokens[0]);
          if (byFirst) return byFirst;
        }
      }
      return null;
    }

    // 5) Build task plans
    type Plan = {
      row: ImportRow;
      sprintId: string | null;
      statusKey: string;
      statusId: string | null;
      assignees: Array<{ name: string; email: string | null; userId: string | null }>;
      primaryUserId: string | null;
      unmatched: string[];
      description: string;
      effortHours: number | null;
      timeSpentHours: number | null;
      startDate: string | null;
      dueDate: string | null;
      externalRef: string;
    };

    const plans: Plan[] = rows.map((r) => {
      const folderKey = normalizeFolder(r.folder);
      let sprintNumber: number | null = null;
      if (folderKey) {
        const n = folderToSprintNumber.get(folderKey);
        if (n) sprintNumber = n;
      }
      const sprintId = sprintNumber ? (sprintByNumber.get(sprintNumber) ?? null) : null;
      const statusKey = mapStatus(r.customStatus, r.wrikeStatus);
      const statusId = statusByKey.get(statusKey) ?? null;

      const parsed = parseAssignees(r.assigneesRaw);
      const assignees = parsed.map((a) => ({
        ...a,
        userId: resolveUser(a),
      }));
      const primaryUserId = assignees.find((a) => a.userId)?.userId ?? null;
      const unmatched = assignees.filter((a) => !a.userId).map((a) => a.name);

      const desc = unmatched.length
        ? `${r.description}${r.description ? "\n\n" : ""}_Sin usuario en Riel: ${unmatched.join(", ")}_`
        : r.description;

      return {
        row: r,
        sprintId,
        statusKey,
        statusId,
        assignees,
        primaryUserId,
        unmatched,
        description: desc,
        effortHours: toHours(r.effort) ?? toHours(r.duration) ?? null,
        timeSpentHours: toHours(r.timeSpent),
        startDate: toISODate(r.startDate),
        dueDate: toISODate(r.endDate),
        externalRef: `wrike:${r.key}`,
      };
    });

    // Summary counts
    const summary = {
      totalRowsInSheet: raw.length,
      taskRows: rows.length,
      byStatus: plans.reduce<Record<string, number>>((acc, p) => {
        acc[p.statusKey] = (acc[p.statusKey] ?? 0) + 1;
        return acc;
      }, {}),
      bySprint: plans.reduce<Record<string, number>>((acc, p) => {
        const label = p.sprintId ? String(p.sprintId).slice(0, 8) : "backlog";
        acc[label] = (acc[label] ?? 0) + 1;
        return acc;
      }, {}),
      withPrimaryAssignee: plans.filter((p) => p.primaryUserId).length,
      unmatchedAssignees: Array.from(new Set(plans.flatMap((p) => p.unmatched))).sort(),
      withTimeSpent: plans.filter((p) => (p.timeSpentHours ?? 0) > 0).length,
    };

    if (data.dryRun) {
      const sample = plans.slice(0, 5).map((p) => ({
        key: p.row.key,
        folder: p.row.folder,
        title: p.row.title,
        sprintId: p.sprintId,
        statusKey: p.statusKey,
        primaryUserId: p.primaryUserId,
        assigneesRaw: p.row.assigneesRaw,
        unmatched: p.unmatched,
        effortHours: p.effortHours,
        timeSpentHours: p.timeSpentHours,
        startDate: p.startDate,
        dueDate: p.dueDate,
      }));
      return { dryRun: true as const, summary, sample };
    }

    // 6) Insert / update tasks
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const fallbackStatusId = statusByKey.get("nueva") ?? Array.from(statusByKey.values())[0];
    if (!fallbackStatusId) throw new Error("No hay estados configurados para 'tarea'");

    let inserted = 0;
    let updated = 0;
    let timeEntries = 0;
    const errors: Array<{ key: string; error: string }> = [];

    for (const p of plans) {
      try {
        // Match existing task by (project_id, external_ref)
        const { data: existing } = await supabaseAdmin
          .from("tasks")
          .select("id")
          .eq("project_id", data.projectId)
          .eq("external_ref", p.externalRef)
          .maybeSingle();

        const payload = {
          project_id: data.projectId,
          contract_id: data.contractId,
          sprint_id: p.sprintId,
          task_type_id: taskTypeId,
          status_id: p.statusId ?? fallbackStatusId,
          title: p.row.title.slice(0, 200),
          description: p.description || null,
          assignee_id: p.primaryUserId,
          start_date: p.startDate ?? undefined,
          due_date: p.dueDate ?? undefined,
          total_effort_hours: p.effortHours,
          external_ref: p.externalRef,
          created_by: userId,
        };

        let taskId: string;
        if (existing?.id) {
          const { error } = await supabaseAdmin
            .from("tasks")
            .update({
              sprint_id: payload.sprint_id,
              status_id: payload.status_id,
              title: payload.title,
              description: payload.description,
              assignee_id: payload.assignee_id,
              start_date: payload.start_date,
              due_date: payload.due_date,
              total_effort_hours: payload.total_effort_hours,
            })
            .eq("id", existing.id);
          if (error) throw error;
          taskId = existing.id;
          updated += 1;
        } else {
          const { data: row, error } = await supabaseAdmin
            .from("tasks")
            .insert(payload)
            .select("id")
            .single();
          if (error) throw error;
          taskId = row.id;
          inserted += 1;
        }

        // Multi-assignees (only matched)
        const matched = p.assignees.filter((a) => a.userId) as Array<{ userId: string }>;
        if (matched.length > 0) {
          await supabaseAdmin.from("task_assignees").delete().eq("task_id", taskId);
          const rows = matched.map((a, idx) => ({
            task_id: taskId,
            user_id: a.userId,
            is_primary: idx === 0,
          }));
          const { error } = await supabaseAdmin.from("task_assignees").insert(rows);
          if (error) throw error;
        }

        // Time entry (only first time — skip if any wrike-import note already exists)
        if ((p.timeSpentHours ?? 0) > 0 && p.primaryUserId) {
          const hours = p.timeSpentHours!;
          const { data: teExisting } = await supabaseAdmin
            .from("time_entries")
            .select("id")
            .eq("task_id", taskId)
            .eq("note", "Wrike import")
            .maybeSingle();
          if (!teExisting) {
            const ended = new Date(`${p.dueDate ?? p.startDate ?? "2026-01-01"}T12:00:00Z`);
            const started = new Date(ended.getTime() - hours * 60 * 60 * 1000);
            const { error } = await supabaseAdmin.from("time_entries").insert({
              task_id: taskId,
              user_id: p.primaryUserId,
              started_at: started.toISOString(),
              ended_at: ended.toISOString(),
              duration_minutes: Math.round(hours * 60),
              note: "Wrike import",
              is_billable: true,
              source: "manual",
            });
            if (error) throw error;
            timeEntries += 1;
          }
        }
      } catch (e) {
        errors.push({
          key: p.row.key,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return {
      dryRun: false as const,
      summary,
      inserted,
      updated,
      timeEntries,
      errors,
    };
  });

// ============================================================
// Ghost user para ex-empleados (preservar historial de asignaciones)
// ============================================================

export const createEscGhostUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email(),
        fullName: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Sólo super_admin puede crear ghosts.
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isAdmin) throw new Error("Forbidden: requires super_admin");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Buscar si ya existe por email en profiles (idempotente).
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .eq("email", data.email)
      .maybeSingle();

    let userId: string;
    if (existing?.id) {
      userId = existing.id as string;
    } else {
      // El trigger handle_new_user exige invitación pre-existente. Insertamos una para el ghost.
      await supabaseAdmin.from("workspace_invitations").upsert(
        {
          workspace_id: WORKSPACE_ID_DEFAULT,
          email: data.email,
          role: "member",
          invited_by: context.userId,
        },
        { onConflict: "workspace_id,email" },
      );

      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        email_confirm: true,
        user_metadata: {
          full_name: data.fullName,
          ghost: true,
          note: "Ex-empleado — cuenta ficticia para preservar historial",
        },
      });
      if (createErr) throw new Error(`No se pudo crear el ghost: ${createErr.message}`);
      userId = created.user!.id;
      // El trigger on_auth_user_created inserta el profile; forzamos full_name.
      await supabaseAdmin.from("profiles").update({ full_name: data.fullName }).eq("id", userId);
    }

    // 2) Asegurar membresía en el workspace ESC (Revops LATAM operations).
    const { error: memberErr } = await supabaseAdmin
      .from("workspace_members")
      .upsert(
        { workspace_id: WORKSPACE_ID_DEFAULT, user_id: userId, role: "member" },
        { onConflict: "workspace_id,user_id" },
      );
    if (memberErr) throw new Error(`No se pudo agregar al workspace: ${memberErr.message}`);

    return { ok: true, userId, email: data.email, fullName: data.fullName };
  });
