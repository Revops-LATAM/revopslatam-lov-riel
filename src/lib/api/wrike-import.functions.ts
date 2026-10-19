import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Importador Wrike genérico (multi-contrato).
 *
 * Estrategia:
 *  - Los "sprints" se descubren desde el propio export: filas top-level con
 *    Title tipo `/... Sprint I Jun/` (Parent task vacío o null y Title
 *    envuelto en `/.../`).
 *  - `Horas contratadas` (formato "HH:MM") de cada folder-sprint alimenta
 *    `sprints.contracted_hours`.
 *  - Tareas se enlazan a su sprint por match difuso del campo `Folder`.
 *  - Task type se infiere del título: "Weekly", "Reunión", "Reu " → reunion,
 *    resto → tarea.
 *  - Idempotente por `(project_id, external_ref = wrike:<Key>)` para tasks y
 *    por `(contract_id, sprint_number)` para sprints.
 */

const STATUS_MAP_TAREA: Record<string, string> = {
  COMPLETED: "completada",
  COMPLETADA: "completada",
  REALIZADA: "completada", // Wrike custom "Realizada" en tareas = completada en Riel
  NEW: "nueva",
  NUEVA: "nueva",
  "POR AGENDAR": "nueva",
  PLANIFICADO: "planificada",
  PLANIFICADA: "planificada",
  "IN PROGRESS": "en_curso",
  "EN CURSO": "en_curso",
  ACTIVE: "en_curso",
  "EN PAUSA": "en_pausa",
  SUSPENDIDA: "en_pausa",
  "EN REVISION CLIENTE": "revision_cliente",
  "EN REVISIÓN CLIENTE": "revision_cliente",
  "REVISION CLIENTE": "revision_cliente",
  "EN REVISION INTERNA": "revision_interna",
  "EN CORRECCION": "en_correccion",
  "EN CORRECCIÓN": "en_correccion",
  DEMORADA: "demorada",
  CANCELLED: "cancelada",
  CANCELADA: "cancelada",
};

const STATUS_MAP_REUNION: Record<string, string> = {
  REALIZADA: "realizada",
  COMPLETED: "realizada",
  COMPLETADA: "realizada",
  AGENDADA: "agendada",
  NEW: "agendada",
  PLANIFICADO: "agendada",
  PLANIFICADA: "agendada",
  CONFIRMADA: "confirmada",
  "NO REALIZADA": "no_realizada",
  CANCELLED: "cancelada",
  CANCELADA: "cancelada",
};

function normUpper(s: string | null | undefined): string {
  return (s ?? "").toString().trim().toUpperCase();
}

function mapStatus(
  taskType: "tarea" | "reunion",
  customStatus: string | null,
  wrikeStatus: string | null,
): string {
  const k = normUpper(customStatus) || normUpper(wrikeStatus);
  const map = taskType === "reunion" ? STATUS_MAP_REUNION : STATUS_MAP_TAREA;
  return map[k] ?? (taskType === "reunion" ? "agendada" : "nueva");
}

function detectTaskType(title: string): "tarea" | "reunion" {
  const t = title.trim().toLowerCase();
  // acepta con o sin prefijo "[cliente] "
  const stripped = t.replace(/^\[[^\]]+\]\s*/, "");
  if (
    stripped.startsWith("weekly") ||
    stripped.startsWith("reunion") ||
    stripped.startsWith("reunión") ||
    stripped.startsWith("reu ")
  )
    return "reunion";
  if (/\breuni[oó]n\b/.test(stripped)) return "reunion";
  return "tarea";
}

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
        return {
          name: m[1].trim(),
          email: email && email !== "null" ? email.toLowerCase() : null,
        };
      }
      return { name: chunk, email: null };
    });
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

/**
 * Wrike exporta duraciones "HH:MM" (Horas contratadas) y "H:MM:SS"
 * (Effort / Time Spent). SheetJS con `cellDates:true` las envuelve como Date
 * con epoch 1899-12-30 UTC.
 */
function toHours(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
    const ms = v.getTime() - EXCEL_EPOCH_MS;
    if (!isFinite(ms)) return null;
    const hours = ms / 3_600_000;
    return hours >= 0 ? hours : null;
  }
  if (typeof v === "number") return v;
  const s = v.toString().trim();
  if (!s) return null;
  if (s.includes(":")) {
    const [h, m, sec] = s.split(":").map((x) => Number(x));
    if (isFinite(h)) return h + (isFinite(m) ? m / 60 : 0) + (isFinite(sec) ? sec / 3600 : 0);
  }
  const n = Number(s);
  return isFinite(n) ? n : null;
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

/** Normaliza título/folder de sprint quitando prefijo cliente y slashes. */
function normSprintKey(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/^\/|\/$/g, "")
    .replace(/^[A-Z0-9]{1,6}\s*[-·:]\s*/i, "") // quita "A21 - ", "ESC - "
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const normName = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Genera la grilla de sprints [start,end] según cadencia. */
function buildSprintGrid(
  startISO: string,
  endISO: string,
  cadence: "weekly" | "biweekly" | "monthly",
): Array<{ start: string; end: string }> {
  const out: Array<{ start: string; end: string }> = [];
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const limit = new Date(`${endISO}T00:00:00Z`);
  let cursor = new Date(`${startISO}T00:00:00Z`);
  let guard = 0;
  while (cursor <= limit && guard < 400) {
    guard += 1;
    let end: Date;
    let next: Date;
    if (cadence === "monthly") {
      next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
      end = new Date(next.getTime() - 86_400_000);
    } else {
      const days = cadence === "weekly" ? 7 : 14;
      next = new Date(cursor.getTime() + days * 86_400_000);
      end = new Date(next.getTime() - 86_400_000);
    }
    if (end > limit) end = limit;
    out.push({ start: iso(cursor), end: iso(end) });
    cursor = next;
  }
  return out;
}

// ============================================================
// Server fn: importWrikeContract
// ============================================================

export const importWrikeContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        contractId: z.string().uuid(),
        projectName: z.string().min(1),
        projectColor: z.string().default("#6366f1"),
        /** Proyecto interno destino (contratos con varias líneas). */
        targetProjectId: z.string().uuid().optional(),
        sprintCadence: z.enum(["weekly", "biweekly", "monthly"]).default("biweekly"),
        /**
         * Línea de negocio: cada export de Wrike puede caer en una fase
         * distinta del mismo proyecto/contrato (caso eClass).
         */
        phaseName: z.string().trim().min(1).max(120).optional(),
        phaseColor: z.string().optional(),
        /**
         * `folders` = descubre sprints desde los folders `/... Sprint .../`.
         * `by_date`  = usa la grilla de sprints del contrato (existente o
         * generada por cadencia) y ubica cada tarea suelta por su fecha.
         */
        sprintMode: z.enum(["folders", "by_date"]).default("folders"),
        sprintStartDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        sprintEndDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        hoursPerSprint: z.number().min(0).max(10000).optional(),
        fileBase64: z.string().min(1),
        dryRun: z.boolean().default(false),
      })
      .parse(input),
  )

  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Autorización: super_admin, owner o admin.
    const [{ data: isSuper }, { data: isAdmin }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    ]);
    if (!isSuper && !isAdmin) {
      throw new Error("Forbidden: requires admin/super_admin");
    }

    // 1) Contrato y workspace
    const { data: contract, error: cErr } = await supabase
      .from("contracts")
      .select(
        "id, workspace_id, account_id, name, start_date, end_date, sprint_cadence, hours_per_sprint",
      )
      .eq("id", data.contractId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!contract) throw new Error(`Contrato ${data.contractId} no encontrado`);
    const workspaceId = contract.workspace_id as string;

    // 2) Parse XLSX
    const XLSX = await import("xlsx");
    const wb = XLSX.read(data.fileBase64, { type: "base64", cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error("Excel sin hojas");
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: true,
    });

    // 3) Detectar folders-sprint (filas top-level tipo `/... Sprint .../`)
    type SprintFolder = {
      folderTitle: string; // "/A21 - Sprint I Jun/"
      key: string; // normSprintKey del title
      startDate: string | null;
      endDate: string | null;
      contractedHours: number | null;
      wrikeStatus: string | null;
      dbNumber?: number | null; // número real cuando el sprint ya existe en Riel
    };

    const detectedFolders: SprintFolder[] = raw
      .filter((r) => {
        const title = (r["Title"] ?? "").toString();
        const parent = r["Parent task"];
        const isTopLevel = parent === null || parent === undefined || parent === "";
        return isTopLevel && /^\/.*\/$/.test(title) && /sprint/i.test(title);
      })
      .map((r) => ({
        folderTitle: (r["Title"] as string).trim(),
        key: normSprintKey(r["Title"] as string),
        startDate: toISODate(r["Start Date"]),
        endDate: toISODate(r["End Date"]),
        contractedHours: toHours(r["Horas contratadas"]),
        wrikeStatus: (r["Status"] as string | null) ?? null,
      }))
      // Deduplica por key preservando primero
      .filter((s, i, arr) => arr.findIndex((x) => x.key === s.key) === i)
      // Ordena cronológicamente
      .sort((a, b) => {
        if (!a.startDate) return 1;
        if (!b.startDate) return -1;
        return a.startDate.localeCompare(b.startDate);
      });

    // 3.b) Grilla de sprints por fecha (modo `by_date` o export sin folders).
    // Reutiliza los sprints ya creados en el contrato — clave cuando se
    // importan varias líneas de negocio al mismo contrato.
    let sprintGridQuery = supabase
      .from("sprints")
      .select("sprint_number, start_date, end_date, contracted_hours")
      .eq("contract_id", data.contractId);
    if (data.targetProjectId) {
      sprintGridQuery = sprintGridQuery.eq("project_id", data.targetProjectId);
    }
    const { data: existingSprints } = await sprintGridQuery.order("sprint_number", {
      ascending: true,
    });

    const useByDate = data.sprintMode === "by_date" || detectedFolders.length === 0;
    let sprintFolders: SprintFolder[] = detectedFolders;
    let gridFromDb = false;

    if (useByDate) {
      if ((existingSprints ?? []).length > 0) {
        gridFromDb = true;
        sprintFolders = (existingSprints ?? [])
          .filter((s) => s.start_date && s.end_date)
          .map((s) => ({
            dbNumber: s.sprint_number as number,

            folderTitle: `Sprint ${s.sprint_number}`,
            key: `SPRINT ${s.sprint_number}`,
            startDate: s.start_date as string,
            endDate: s.end_date as string,
            contractedHours: data.hoursPerSprint ?? (s.contracted_hours as number | null) ?? null,
            wrikeStatus: null,
          }));
      } else {
        const gridStart = data.sprintStartDate ?? (contract.start_date as string | null);
        const gridEnd = data.sprintEndDate ?? (contract.end_date as string | null);
        if (!gridStart || !gridEnd)
          throw new Error(
            "Sin sprints en el contrato y sin fechas para generar la grilla (sprintStartDate/sprintEndDate)",
          );
        sprintFolders = buildSprintGrid(gridStart, gridEnd, data.sprintCadence).map((g, i) => ({
          folderTitle: `Sprint ${i + 1}`,
          key: `SPRINT ${i + 1}`,
          startDate: g.start,
          endDate: g.end,
          contractedHours:
            data.hoursPerSprint ?? (contract.hours_per_sprint as number | null) ?? null,
          wrikeStatus: null,
        }));
      }
    }

    // 4) Filas de tarea (todo lo que tiene Title y Key y no es folder)
    type TaskRow = {
      key: string;
      folder: string | null;
      title: string;
      assigneesRaw: string | null;
      wrikeStatus: string | null;
      customStatus: string | null;
      startDate: unknown;
      endDate: unknown;
      effort: unknown;
      duration: unknown;
      timeSpent: unknown;
      description: string;
    };
    const taskRows: TaskRow[] = raw
      .filter((r) => r["Title"] && r["Key"] && !/^\/.*\/$/.test((r["Title"] as string) ?? ""))
      .map((r) => ({
        key: String(r["Key"]),
        folder: (r["Folder"] ?? null) as string | null,
        title: String(r["Title"]).trim(),
        assigneesRaw: (r["Assigned To"] ?? null) as string | null,
        wrikeStatus: (r["Status"] ?? null) as string | null,
        customStatus: (r["Custom status"] ?? null) as string | null,
        startDate: r["Start Date"],
        endDate: r["End Date"],
        effort: r["Effort"],
        duration: r["Duration (Hours)"],
        timeSpent: r["Time Spent (Hours)"],
        description: buildDescription(r),
      }));

    // 5) Task types y statuses del workspace
    const { data: typeRows } = await supabase
      .from("task_types")
      .select("id, key")
      .eq("workspace_id", workspaceId);
    const typeByKey = new Map<string, string>();
    (typeRows ?? []).forEach((t) => typeByKey.set(t.key, t.id));
    const taskTypeIdTarea = typeByKey.get("tarea");
    const taskTypeIdReunion = typeByKey.get("reunion");
    if (!taskTypeIdTarea) throw new Error("Task type 'tarea' no configurado");
    if (!taskTypeIdReunion) throw new Error("Task type 'reunion' no configurado");

    const { data: statusRows } = await supabase
      .from("task_statuses")
      .select("id, key, task_type_id")
      .eq("workspace_id", workspaceId)
      .in("task_type_id", [taskTypeIdTarea, taskTypeIdReunion]);
    const statusByTypeKey = new Map<string, string>();
    (statusRows ?? []).forEach((s) => statusByTypeKey.set(`${s.task_type_id}:${s.key}`, s.id));

    // 6) Miembros y matcher por nombre/email
    const { data: memberRows } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId);
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
    const profileByFirstName = new Map<string, string>();
    profilesData.forEach((prof) => {
      const uid = prof.id;
      if (!uid) return;
      if (prof.email) {
        profileByEmail.set(prof.email.toLowerCase(), uid);
        const local = prof.email.split("@")[0]?.toLowerCase();
        if (local) profileByLocalPart.set(local, uid);
      }
      if (prof.full_name) {
        const n = normName(prof.full_name);
        profileByName.set(n, uid);
        const first = n.split(" ")[0];
        if (first && !profileByFirstName.has(first)) profileByFirstName.set(first, uid);
      }
    });

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
        if (tokens[0]) {
          const byLocal = profileByLocalPart.get(tokens[0]);
          if (byLocal) return byLocal;
          const byFirst = profileByFirstName.get(tokens[0]);
          if (byFirst) return byFirst;
        }
      }
      return null;
    }

    // 7) Plan: sprints (upsert) + tasks
    const sprintPlan = sprintFolders.map((f, idx) => ({
      folder: f,
      sprintNumber: f.dbNumber ?? idx + 1, // orden cronológico si es nuevo
    }));
    const sprintKeyToNumber = new Map<string, number>();
    sprintPlan.forEach((s) => sprintKeyToNumber.set(s.folder.key, s.sprintNumber));

    /** Ubica una tarea suelta en el sprint cuyo rango contiene su fecha. */
    function sprintNumberForDate(date: string | null): number | null {
      if (!date || sprintPlan.length === 0) return null;
      const hit = sprintPlan.find(
        (s) =>
          s.folder.startDate &&
          s.folder.endDate &&
          date >= s.folder.startDate &&
          date <= s.folder.endDate,
      );
      if (hit) return hit.sprintNumber;
      const first = sprintPlan[0];
      const last = sprintPlan[sprintPlan.length - 1];
      if (first.folder.startDate && date < first.folder.startDate) return first.sprintNumber;
      if (last.folder.endDate && date > last.folder.endDate) return last.sprintNumber;
      return null;
    }

    type TaskPlan = {
      row: TaskRow;
      sprintNumber: number | null;
      taskTypeKey: "tarea" | "reunion";
      statusKey: string;
      assignees: Array<{ name: string; email: string | null; userId: string | null }>;
      primaryUserId: string | null;
      unmatched: string[];
      effortHours: number | null;
      timeSpentHours: number | null;
      startDate: string | null;
      dueDate: string | null;
      externalRef: string;
      description: string;
    };
    const taskPlan: TaskPlan[] = taskRows.map((r) => {
      const startDate = toISODate(r.startDate);
      const dueDate = toISODate(r.endDate);
      const folderKey = normSprintKey(r.folder);
      const byFolder = !useByDate && folderKey ? (sprintKeyToNumber.get(folderKey) ?? null) : null;
      const sprintNumber = useByDate ? sprintNumberForDate(startDate ?? dueDate) : byFolder;
      const taskTypeKey = detectTaskType(r.title);
      const statusKey = mapStatus(taskTypeKey, r.customStatus, r.wrikeStatus);

      const parsed = parseAssignees(r.assigneesRaw);
      const assignees = parsed.map((a) => ({ ...a, userId: resolveUser(a) }));
      const primaryUserId = assignees.find((a) => a.userId)?.userId ?? null;
      const unmatched = assignees.filter((a) => !a.userId).map((a) => a.name);
      const baseDesc = r.description;
      const description = unmatched.length
        ? `${baseDesc}${baseDesc ? "\n\n" : ""}_Sin usuario en Riel: ${unmatched.join(", ")}_`
        : baseDesc;
      return {
        row: r,
        sprintNumber,
        taskTypeKey,
        statusKey,
        assignees,
        primaryUserId,
        unmatched,
        effortHours: toHours(r.effort) ?? toHours(r.duration) ?? null,
        timeSpentHours: toHours(r.timeSpent),
        startDate,
        dueDate,

        externalRef: `wrike:${r.key}`,
        description,
      };
    });

    // 8) Resumen para dry-run
    const summary = {
      contract: {
        id: contract.id,
        name: contract.name,
        currentCadence: contract.sprint_cadence,
        currentHoursPerSprint: contract.hours_per_sprint,
      },
      sprintMode: useByDate
        ? gridFromDb
          ? "by_date (grilla existente)"
          : "by_date (grilla nueva)"
        : "folders",
      phaseName: data.phaseName ?? null,
      workspaceId,

      sprints: sprintPlan.map((s) => ({
        number: s.sprintNumber,
        folder: s.folder.folderTitle,
        start: s.folder.startDate,
        end: s.folder.endDate,
        contractedHours: s.folder.contractedHours,
        wrikeStatus: s.folder.wrikeStatus,
      })),
      totalSprints: sprintPlan.length,
      totalTaskRows: taskRows.length,
      byType: taskPlan.reduce<Record<string, number>>((acc, p) => {
        acc[p.taskTypeKey] = (acc[p.taskTypeKey] ?? 0) + 1;
        return acc;
      }, {}),
      byStatus: taskPlan.reduce<Record<string, number>>((acc, p) => {
        acc[`${p.taskTypeKey}:${p.statusKey}`] = (acc[`${p.taskTypeKey}:${p.statusKey}`] ?? 0) + 1;
        return acc;
      }, {}),
      bySprint: taskPlan.reduce<Record<string, number>>((acc, p) => {
        const label = p.sprintNumber ? `sprint_${p.sprintNumber}` : "backlog";
        acc[label] = (acc[label] ?? 0) + 1;
        return acc;
      }, {}),
      unmatchedAssignees: Array.from(new Set(taskPlan.flatMap((p) => p.unmatched))).sort(),
      withPrimaryAssignee: taskPlan.filter((p) => p.primaryUserId).length,
      withMultiAssignees: taskPlan.filter((p) => p.assignees.filter((a) => a.userId).length > 1)
        .length,
      withTimeSpent: taskPlan.filter((p) => (p.timeSpentHours ?? 0) > 0).length,
      totalEffortHours: taskPlan.reduce((s, p) => s + (p.effortHours ?? 0), 0),
      totalTimeSpentHours: taskPlan.reduce((s, p) => s + (p.timeSpentHours ?? 0), 0),
    };

    if (data.dryRun) {
      const sample = taskPlan.slice(0, 8).map((p) => ({
        key: p.row.key,
        title: p.row.title,
        type: p.taskTypeKey,
        status: p.statusKey,
        sprint: p.sprintNumber,
        assignees: p.assignees.map((a) => ({ name: a.name, matched: !!a.userId })),
        effortHours: p.effortHours,
        timeSpentHours: p.timeSpentHours,
        start: p.startDate,
        due: p.dueDate,
      }));
      return { dryRun: true as const, summary, sample };
    }

    // 9) Ejecución real
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 9.a Update contract cadence si viene distinta
    if (contract.sprint_cadence !== data.sprintCadence) {
      const { error: uErr } = await supabaseAdmin
        .from("contracts")
        .update({ sprint_cadence: data.sprintCadence })
        .eq("id", data.contractId);
      if (uErr) throw new Error(`update contract cadence: ${uErr.message}`);
    }

    // 9.b Upsert sprints por (contract_id, sprint_number) via RPC (skip working-day check)
    const sprintIdByNumber = new Map<number, string>();
    let sprintsCreated = 0;
    let sprintsUpdated = 0;
    for (const s of sprintPlan) {
      if (!s.folder.startDate || !s.folder.endDate) {
        throw new Error(`Sprint ${s.sprintNumber} (${s.folder.folderTitle}) sin fechas`);
      }
      let existingQuery = supabaseAdmin
        .from("sprints")
        .select("id")
        .eq("contract_id", data.contractId)
        .eq("sprint_number", s.sprintNumber);
      if (data.targetProjectId) {
        existingQuery = existingQuery.eq("project_id", data.targetProjectId);
      }
      const { data: existing } = await existingQuery.maybeSingle();
      // Grilla tomada de sprints ya existentes: no los pisamos, solo los usamos.
      if (gridFromDb && existing?.id) {
        sprintIdByNumber.set(s.sprintNumber, existing.id);
        sprintsUpdated += 1;
        continue;
      }
      const { data: sid, error } = await supabaseAdmin.rpc("upsert_sprint_raw", {
        _contract_id: data.contractId,
        _sprint_number: s.sprintNumber,
        _start_date: s.folder.startDate,
        _end_date: s.folder.endDate,
        _contracted_hours: s.folder.contractedHours ?? 0,
        _notes: `Wrike: ${s.folder.folderTitle}`,
        _project_id: data.targetProjectId ?? null,
      });
      if (error || !sid)
        throw new Error(`upsert sprint ${s.sprintNumber}: ${error?.message ?? "no id"}`);
      sprintIdByNumber.set(s.sprintNumber, sid as string);
      if (existing?.id) sprintsUpdated += 1;
      else sprintsCreated += 1;
    }

    // 9.b.2 Ensure contract handoff is 'completado' so the account appears in Operaciones
    await supabaseAdmin.from("contract_handoffs").upsert(
      {
        contract_id: data.contractId,
        workspace_id: workspaceId,
        state: "completado",
        completado_at: new Date().toISOString(),
        notas: "Handoff automático tras import Wrike",
      } as never,
      { onConflict: "contract_id" },
    );

    // 9.c Reuse/create project.
    // Un contrato = un proyecto: si ya existe uno para el contrato lo
    // reutilizamos aunque el nombre no calce (varias líneas de negocio).
    const { data: contractProjects } = await supabase
      .from("projects")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .eq("contract_id", data.contractId);
    const existingProject =
      (data.targetProjectId
        ? (contractProjects ?? []).find((p) => p.id === data.targetProjectId)
        : null) ??
      (contractProjects ?? []).find((p) => p.name === data.projectName) ??
      (contractProjects ?? [])[0] ??
      null;
    let projectId: string;
    if (existingProject?.id) {
      projectId = existingProject.id;
    } else {
      const startDate = sprintPlan[0]?.folder.startDate ?? contract.start_date;
      const endDate = sprintPlan[sprintPlan.length - 1]?.folder.endDate ?? contract.end_date;
      const budgetHours = sprintPlan.reduce((s, p) => s + (p.folder.contractedHours ?? 0), 0);
      const { data: created, error: pErr } = await supabase
        .from("projects")
        .insert({
          workspace_id: workspaceId,
          contract_id: data.contractId,
          name: data.projectName,
          description: "[Migrado desde Wrike]",
          color: data.projectColor,
          icon: "folder",
          area: "operations",
          state: "en_curso",
          fecha_inicio_delivery: startDate,
          fecha_entrega_objetivo: endDate,
          first_sprint_start_date: startDate,
          horas_presupuestadas_total: budgetHours || null,
          created_by: userId,
        })
        .select("id")
        .single();
      if (pErr) throw new Error(`insert project: ${pErr.message}`);
      projectId = created.id;
    }

    // 9.c.2 Fase = línea de negocio (opcional)
    let phaseId: string | null = null;
    if (data.phaseName) {
      const { data: existingPhases } = await supabaseAdmin
        .from("phases")
        .select("id, name, order_index")
        .eq("project_id", projectId);
      const found = (existingPhases ?? []).find(
        (p) => p.name.trim().toLowerCase() === data.phaseName!.trim().toLowerCase(),
      );
      if (found) {
        phaseId = found.id;
      } else {
        const orderIndex = (existingPhases ?? []).reduce(
          (m, p) => Math.max(m, (p.order_index ?? 0) + 1),
          0,
        );
        const taskStarts = taskPlan.map((p) => p.startDate).filter(Boolean) as string[];
        const taskEnds = taskPlan.map((p) => p.dueDate).filter(Boolean) as string[];
        const { data: newPhase, error: phErr } = await supabaseAdmin
          .from("phases")
          .insert({
            project_id: projectId,
            name: data.phaseName,
            order_index: orderIndex,
            status: "en_curso",
            color: data.phaseColor ?? null,
            start_date: taskStarts.length ? taskStarts.sort()[0] : null,
            end_date: taskEnds.length ? taskEnds.sort()[taskEnds.length - 1] : null,
          } as never)
          .select("id")
          .single();
        if (phErr) throw new Error(`insert phase: ${phErr.message}`);
        phaseId = newPhase.id;
      }
    }

    // 9.d Insert/update tasks
    let inserted = 0;
    let updated = 0;
    let timeEntries = 0;
    const errors: Array<{ key: string; error: string }> = [];

    for (const p of taskPlan) {
      try {
        const taskTypeId = p.taskTypeKey === "reunion" ? taskTypeIdReunion : taskTypeIdTarea;
        const statusId =
          statusByTypeKey.get(`${taskTypeId}:${p.statusKey}`) ??
          statusByTypeKey.get(
            `${taskTypeId}:${p.taskTypeKey === "reunion" ? "agendada" : "nueva"}`,
          );
        if (!statusId) throw new Error(`Sin status fallback para tipo ${p.taskTypeKey}`);

        const sprintId = p.sprintNumber ? (sprintIdByNumber.get(p.sprintNumber) ?? null) : null;

        const { data: existing } = await supabaseAdmin
          .from("tasks")
          .select("id")
          .eq("project_id", projectId)
          .eq("external_ref", p.externalRef)
          .maybeSingle();

        const basePayload = {
          project_id: projectId,
          contract_id: data.contractId,
          sprint_id: sprintId,
          phase_id: phaseId,
          task_type_id: taskTypeId,
          status_id: statusId,
          title: p.row.title.slice(0, 200),
          description: p.description || null,
          assignee_id: p.primaryUserId,
          start_date: p.startDate ?? undefined,
          due_date: p.dueDate ?? undefined,
          total_effort_hours: p.effortHours,
          external_ref: p.externalRef,
        };

        let taskId: string;
        if (existing?.id) {
          const { error } = await supabaseAdmin
            .from("tasks")
            .update({
              sprint_id: basePayload.sprint_id,
              phase_id: basePayload.phase_id,
              task_type_id: basePayload.task_type_id,
              status_id: basePayload.status_id,
              title: basePayload.title,
              description: basePayload.description,
              assignee_id: basePayload.assignee_id,
              start_date: basePayload.start_date,
              due_date: basePayload.due_date,
              total_effort_hours: basePayload.total_effort_hours,
            })
            .eq("id", existing.id);
          if (error) throw error;
          taskId = existing.id;
          updated += 1;
        } else {
          const { data: row, error } = await supabaseAdmin
            .from("tasks")
            .insert({ ...basePayload, created_by: userId })
            .select("id")
            .single();
          if (error) throw error;
          taskId = row.id;
          inserted += 1;
        }

        // Multi-assignees
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

        // Time entry (idempotente por note "Wrike import")
        if ((p.timeSpentHours ?? 0) > 0 && p.primaryUserId) {
          const hours = p.timeSpentHours!;
          const { data: teExisting } = await supabaseAdmin
            .from("time_entries")
            .select("id")
            .eq("task_id", taskId)
            .eq("note", "Wrike import")
            .maybeSingle();
          if (!teExisting) {
            const ended = new Date(
              `${p.dueDate ?? p.startDate ?? new Date().toISOString().slice(0, 10)}T12:00:00Z`,
            );
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
      projectId,
      phaseId,
      sprintsCreated,
      sprintsUpdated,
      tasksInserted: inserted,
      tasksUpdated: updated,
      timeEntries,
      errors,
    };
  });

// ============================================================
// Lookup helper para la UI: contratos del workspace
// ============================================================

export const listContractsForImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("contracts")
      .select(
        "id, name, status, start_date, end_date, sprint_cadence, hours_per_sprint, account_id, accounts:account_id(name)",
      )
      .eq("workspace_id", data.workspaceId)
      .order("start_date", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      startDate: r.start_date,
      endDate: r.end_date,
      sprintCadence: r.sprint_cadence,
      hoursPerSprint: r.hours_per_sprint,
      accountName: (r.accounts as { name: string } | null)?.name ?? null,
    }));
  });
