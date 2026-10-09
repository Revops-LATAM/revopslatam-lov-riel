// Server-only helpers for Asana bidirectional sync.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const ASANA_API = "https://app.asana.com/api/1.0";
const ECHO_WINDOW_MS = 5_000;

type AsanaTask = {
  gid: string;
  name: string;
  completed: boolean;
  due_on: string | null;
  notes: string | null;
  modified_at?: string | null;
  assignee?: { gid: string } | null;
  memberships?: { section?: { gid: string; name: string } | null }[];
  custom_fields?: {
    gid: string;
    enum_value?: { gid: string; name: string } | null;
  }[];
};

type AsanaStory = {
  gid: string;
  created_at: string;
  text?: string;
  html_text?: string;
  type: string;
  resource_subtype?: string;
  created_by?: { gid: string } | null;
};

function pat() {
  const t = process.env.ASANA_PAT;
  if (!t) throw new Error("ASANA_PAT no configurado");
  return t;
}

export async function asanaApi<T = unknown>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${ASANA_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${pat()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify({ data: body }) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (!res.ok) {
    const msg = json.errors?.[0]?.message ?? `Asana ${res.status}`;
    throw new Error(`Asana: ${msg}`);
  }
  return json.data as T;
}

// ---------- PULL: Asana -> Riel (full project sync) ----------
export async function syncProjectFromAsana(
  supabase: SupabaseClient<Database>,
  projectId: string,
  opts: { createdBy?: string | null; force?: boolean } = {},
) {
  const { data: project, error: pErr } = await supabase
    .from("projects")
    .select("id, workspace_id, area, billing_mode, asana_project_gid, contract_id")
    .eq("id", projectId)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  if (!project) throw new Error("Proyecto no encontrado");
  if (!project.asana_project_gid)
    throw new Error("Este proyecto no tiene Asana GID vinculado");

  const { data: ttype } = await supabase
    .from("task_types")
    .select("id")
    .eq("workspace_id", project.workspace_id)
    .eq("key", "tarea")
    .maybeSingle();
  if (!ttype) throw new Error("Tipo de tarea no encontrado");

  const { data: statuses } = await supabase
    .from("task_statuses")
    .select("id, category, is_default, sort_order")
    .eq("task_type_id", ttype.id);
  const pickDefaultStatus = (completed: boolean) => {
    const target = completed ? "completada" : "abierta";
    const list = (statuses ?? [])
      .filter((s) => s.category === target)
      .sort(
        (a, b) =>
          Number(b.is_default) - Number(a.is_default) || a.sort_order - b.sort_order,
      );
    return list[0]?.id;
  };

  // Load sync config + status mapping
  const { data: cfg } = await supabase
    .from("asana_project_sync_config")
    .select("status_mode, asana_status_field_gid")
    .eq("project_id", projectId)
    .maybeSingle();
  const statusMode = (cfg as { status_mode?: string } | null)?.status_mode ?? "completed_only";

  const { data: statusMaps } = await supabase
    .from("asana_status_map")
    .select("asana_value, status_id, kind")
    .eq("workspace_id", project.workspace_id)
    .eq("asana_project_gid", project.asana_project_gid);
  const statusByAsanaValue = new Map(
    (statusMaps ?? []).map((m) => [(m as { asana_value: string }).asana_value, (m as { status_id: string }).status_id]),
  );

  const pickStatus = (t: AsanaTask): string | undefined => {
    if (statusMode === "sections") {
      const sectionGid = t.memberships?.find((m) => m.section)?.section?.gid;
      if (sectionGid && statusByAsanaValue.has(sectionGid))
        return statusByAsanaValue.get(sectionGid);
    } else if (statusMode === "custom_field") {
      const fieldGid = (cfg as { asana_status_field_gid?: string } | null)?.asana_status_field_gid;
      const enumGid = t.custom_fields?.find((f) => f.gid === fieldGid)?.enum_value?.gid;
      if (enumGid && statusByAsanaValue.has(enumGid))
        return statusByAsanaValue.get(enumGid);
    }
    return pickDefaultStatus(t.completed);
  };

  // Load user map for assignee resolution
  const { data: userMaps } = await supabase
    .from("asana_user_map")
    .select("asana_user_gid, user_id")
    .eq("workspace_id", project.workspace_id);
  const userByAsanaGid = new Map(
    (userMaps ?? []).map((u) => [(u as { asana_user_gid: string }).asana_user_gid, (u as { user_id: string }).user_id]),
  );

  const opt =
    "name,completed,due_on,notes,modified_at,assignee.gid,memberships.section.gid,memberships.section.name,custom_fields.gid,custom_fields.enum_value.gid,custom_fields.enum_value.name";
  const rows = await asanaApi<AsanaTask[]>(
    "GET",
    `/projects/${encodeURIComponent(project.asana_project_gid)}/tasks?limit=100&opt_fields=${opt}`,
  );

  const { data: existing } = await supabase
    .from("asana_task_map")
    .select("asana_task_gid, task_id, last_synced_at, last_source, asana_modified_at")
    .eq("workspace_id", project.workspace_id)
    .eq("asana_project_gid", project.asana_project_gid);
  type ExistingRow = {
    asana_task_gid: string;
    task_id: string;
    last_synced_at: string | null;
    last_source: string;
    asana_modified_at: string | null;
  };
  const existingMap = new Map<string, ExistingRow>(
    ((existing ?? []) as ExistingRow[]).map((r) => [r.asana_task_gid, r]),
  );

  // Sprints (only for recurrente)
  let sprints: Array<{ id: string; start_date: string; end_date: string }> = [];
  if (project.contract_id) {
    const { data: contract } = await supabase
      .from("contracts")
      .select("type")
      .eq("id", project.contract_id)
      .maybeSingle();
    if ((contract as { type?: string } | null)?.type === "recurrente") {
      const { data: sps } = await supabase
        .from("sprints")
        .select("id, start_date, end_date")
        .eq("contract_id", project.contract_id)
        .order("start_date", { ascending: true });
      sprints = (sps ?? []) as typeof sprints;
    }
  }
  const sprintForDate = (due: string | null): string | null => {
    if (!due || sprints.length === 0) return null;
    const s = sprints.find((sp) => due >= sp.start_date && due <= sp.end_date);
    return s?.id ?? null;
  };

  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const t of rows) {
    const statusId = pickStatus(t);
    if (!statusId) continue;
    const existingRow = existingMap.get(t.gid);
    const sprintId = sprintForDate(t.due_on);
    const assigneeId = t.assignee?.gid ? (userByAsanaGid.get(t.assignee.gid) ?? null) : null;

    if (existingRow) {
      // Conflict resolution: echo skip (we just pushed to Asana)
      if (
        existingRow.last_source === "riel" &&
        existingRow.last_synced_at &&
        new Date().getTime() - new Date(existingRow.last_synced_at).getTime() < ECHO_WINDOW_MS
      ) {
        skipped++;
        continue;
      }
      // If Asana's modified_at is not newer than what we stored, skip
      if (
        !opts.force &&
        t.modified_at &&
        existingRow.asana_modified_at &&
        new Date(t.modified_at).getTime() <= new Date(existingRow.asana_modified_at).getTime()
      ) {
        skipped++;
        continue;
      }

      const patch: Record<string, unknown> = {
        title: t.name || "(Sin título)",
        description: t.notes ?? null,
        due_date: t.due_on ?? null,
        status_id: statusId,
        assignee_id: assigneeId,
      };
      if (sprintId) patch.sprint_id = sprintId;
      const { error } = await supabase.from("tasks").update(patch as never).eq("id", existingRow.task_id);
      if (!error) {
        await syncTaskAssigneesFromAsana(supabase, existingRow.task_id, assigneeId);
        await supabase
          .from("asana_task_map")
          .update({
            asana_modified_at: t.modified_at ?? null,
            last_synced_at: new Date().toISOString(),
            last_source: "asana",
          } as never)
          .eq("task_id", existingRow.task_id);
        updated++;
      }
    } else {
      const { data: newTask, error } = await supabase
        .from("tasks")
        .insert({
          project_id: project.id,
          title: t.name || "(Sin título)",
          description: t.notes ?? null,
          due_date: t.due_on ?? null,
          task_type_id: ttype.id,
          status_id: statusId,
          created_by: opts.createdBy ?? null,
          area: project.area,
          contract_id: project.contract_id ?? null,
          sprint_id: sprintId,
          assignee_id: assigneeId,
          priority: "medium",
          effort_mode: "basic",
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      if (newTask) {
        await syncTaskAssigneesFromAsana(supabase, (newTask as { id: string }).id, assigneeId);
        await supabase.from("asana_task_map").insert({
          workspace_id: project.workspace_id,
          task_id: (newTask as { id: string }).id,
          asana_task_gid: t.gid,
          asana_project_gid: project.asana_project_gid,
          last_synced_at: new Date().toISOString(),
          last_source: "asana",
          asana_modified_at: t.modified_at ?? null,
        } as never);
        created++;

        // Pull comments for new tasks
        await pullCommentsForTask(supabase, project.workspace_id, t.gid, (newTask as { id: string }).id, userByAsanaGid);
      }
    }
  }

  return { created, updated, skipped, total: rows.length };
}

async function syncTaskAssigneesFromAsana(
  supabase: SupabaseClient<Database>,
  taskId: string,
  assigneeId: string | null,
) {
  // Preserve any extra Riel-only assignees. Only ensure that the Asana
  // assignee (if any) exists and is marked as primary; demote others.
  if (!assigneeId) {
    // No Asana assignee: just clear the primary flag on existing rows.
    // Do NOT delete rows — extra Riel assignees must remain.
    const { error } = await supabase
      .from("task_assignees")
      .update({ is_primary: false } as never)
      .eq("task_id", taskId);
    if (error) throw new Error(error.message);
    return;
  }
  // Ensure the Asana assignee row exists and is primary.
  const { error: upErr } = await supabase.from("task_assignees").upsert(
    { task_id: taskId, user_id: assigneeId, is_primary: true } as never,
    { onConflict: "task_id,user_id" },
  );
  if (upErr) throw new Error(upErr.message);
  // Demote any other rows so exactly one primary remains.
  const { error: demErr } = await supabase
    .from("task_assignees")
    .update({ is_primary: false } as never)
    .eq("task_id", taskId)
    .neq("user_id", assigneeId);
  if (demErr) throw new Error(demErr.message);
}

// ---------- PUSH: Riel -> Asana (single task) ----------
export async function pushTaskToAsana(
  supabase: SupabaseClient<Database>,
  taskId: string,
): Promise<{ ok: boolean; skipped?: string }> {
  const { data: map } = await supabase
    .from("asana_task_map")
    .select("asana_task_gid, asana_project_gid, workspace_id, last_source, last_synced_at")
    .eq("task_id", taskId)
    .maybeSingle();
  if (!map) return { ok: false, skipped: "no_map" };

  type MapRow = {
    asana_task_gid: string;
    asana_project_gid: string;
    workspace_id: string;
    last_source: string;
    last_synced_at: string | null;
  };
  const m = map as MapRow;

  // Skip echo (we just pulled)
  if (
    m.last_source === "asana" &&
    m.last_synced_at &&
    Date.now() - new Date(m.last_synced_at).getTime() < ECHO_WINDOW_MS
  ) {
    return { ok: false, skipped: "echo" };
  }

  const { data: task } = await supabase
    .from("tasks")
    .select("id, title, description, due_date, status_id, assignee_id, project_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { ok: false, skipped: "no_task" };
  const t = task as {
    title: string;
    description: string | null;
    due_date: string | null;
    status_id: string | null;
    assignee_id: string | null;
    project_id: string;
  };

  const { data: status } = t.status_id
    ? await supabase.from("task_statuses").select("category").eq("id", t.status_id).maybeSingle()
    : { data: null };
  const completed = (status as { category?: string } | null)?.category === "completada";

  // Reverse-lookup asana value (section/custom_field enum) from status_id
  const { data: cfg } = await supabase
    .from("asana_project_sync_config")
    .select("status_mode, asana_status_field_gid")
    .eq("project_id", t.project_id)
    .maybeSingle();
  const statusMode = (cfg as { status_mode?: string } | null)?.status_mode ?? "completed_only";
  const fieldGid = (cfg as { asana_status_field_gid?: string } | null)?.asana_status_field_gid;

  let targetSectionGid: string | null = null;
  let customFieldEnumGid: string | null = null;
  if (t.status_id && statusMode !== "completed_only") {
    const { data: stMap } = await supabase
      .from("asana_status_map")
      .select("asana_value, kind")
      .eq("workspace_id", m.workspace_id)
      .eq("asana_project_gid", m.asana_project_gid)
      .eq("status_id", t.status_id)
      .maybeSingle();
    const sm = stMap as { asana_value?: string; kind?: string } | null;
    if (sm) {
      if (statusMode === "sections" && sm.kind === "section") targetSectionGid = sm.asana_value ?? null;
      if (statusMode === "custom_field" && sm.kind === "custom_field_enum") customFieldEnumGid = sm.asana_value ?? null;
    }
  }

  // Resolve assignee
  let asanaAssigneeGid: string | null = null;
  if (t.assignee_id) {
    const { data: um } = await supabase
      .from("asana_user_map")
      .select("asana_user_gid")
      .eq("workspace_id", m.workspace_id)
      .eq("user_id", t.assignee_id)
      .maybeSingle();
    asanaAssigneeGid = (um as { asana_user_gid?: string } | null)?.asana_user_gid ?? null;
  }

  const body: Record<string, unknown> = {
    name: t.title,
    notes: t.description ?? "",
    completed,
    due_on: t.due_date,
  };
  if (asanaAssigneeGid) body.assignee = asanaAssigneeGid;
  if (customFieldEnumGid && fieldGid) {
    body.custom_fields = { [fieldGid]: customFieldEnumGid };
  }

  const updated = await asanaApi<AsanaTask>("PUT", `/tasks/${m.asana_task_gid}?opt_fields=modified_at`, body);

  if (targetSectionGid) {
    await asanaApi("POST", `/sections/${targetSectionGid}/addTask`, { task: m.asana_task_gid });
  }

  await supabase
    .from("asana_task_map")
    .update({
      last_synced_at: new Date().toISOString(),
      last_source: "riel",
      asana_modified_at: updated.modified_at ?? null,
    } as never)
    .eq("task_id", taskId);

  return { ok: true };
}

// ---------- PUSH: Riel comment -> Asana story ----------
export async function pushCommentToAsana(
  supabase: SupabaseClient<Database>,
  commentId: string,
): Promise<{ ok: boolean; skipped?: string }> {
  // Skip if comment already mapped (from Asana)
  const { data: existing } = await supabase
    .from("asana_comment_map")
    .select("id, source")
    .eq("comment_id", commentId)
    .maybeSingle();
  if (existing) return { ok: false, skipped: "already_mapped" };

  const { data: comment } = await supabase
    .from("task_comments")
    .select("id, task_id, body, author_id")
    .eq("id", commentId)
    .maybeSingle();
  if (!comment) return { ok: false, skipped: "no_comment" };
  const c = comment as { task_id: string; body: string; author_id: string | null };

  const { data: map } = await supabase
    .from("asana_task_map")
    .select("asana_task_gid, workspace_id")
    .eq("task_id", c.task_id)
    .maybeSingle();
  if (!map) return { ok: false, skipped: "no_map" };
  const m = map as { asana_task_gid: string; workspace_id: string };

  // Author label
  let authorLabel = "Riel";
  if (c.author_id) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", c.author_id)
      .maybeSingle();
    const p = prof as { full_name?: string; email?: string } | null;
    authorLabel = p?.full_name ?? p?.email ?? "Riel";
  }

  const story = await asanaApi<AsanaStory>("POST", `/tasks/${m.asana_task_gid}/stories`, {
    text: `[${authorLabel}] ${c.body}`,
  });

  await supabase.from("asana_comment_map").insert({
    workspace_id: m.workspace_id,
    comment_id: commentId,
    asana_story_gid: story.gid,
    asana_task_gid: m.asana_task_gid,
    source: "riel",
  } as never);

  return { ok: true };
}

// ---------- PULL: Asana stories -> Riel comments ----------
export async function pullCommentsForTask(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  asanaTaskGid: string,
  rielTaskId: string,
  userByAsanaGid?: Map<string, string>,
) {
  const stories = await asanaApi<AsanaStory[]>(
    "GET",
    `/tasks/${asanaTaskGid}/stories?opt_fields=text,html_text,type,resource_subtype,created_at,created_by`,
  );
  const comments = stories.filter(
    (s) => s.type === "comment" || s.resource_subtype === "comment_added",
  );
  if (!comments.length) return { created: 0 };

  const { data: existingMaps } = await supabase
    .from("asana_comment_map")
    .select("asana_story_gid")
    .eq("workspace_id", workspaceId)
    .in(
      "asana_story_gid",
      comments.map((c) => c.gid),
    );
  const known = new Set((existingMaps ?? []).map((r) => (r as { asana_story_gid: string }).asana_story_gid));

  let created = 0;
  for (const s of comments) {
    if (known.has(s.gid)) continue;
    const authorId = s.created_by?.gid ? (userByAsanaGid?.get(s.created_by.gid) ?? null) : null;
    const body = s.text ?? s.html_text ?? "";
    const { data: ins, error } = await supabase
      .from("task_comments")
      .insert({
        task_id: rielTaskId,
        author_id: authorId,
        body: `[Asana] ${body}`,
        is_client_visible: false,
      } as never)
      .select("id")
      .single();
    if (error || !ins) continue;
    await supabase.from("asana_comment_map").insert({
      workspace_id: workspaceId,
      comment_id: (ins as { id: string }).id,
      asana_story_gid: s.gid,
      asana_task_gid: asanaTaskGid,
      source: "asana",
    } as never);
    created++;
  }
  return { created };
}

// ---------- PUSH: Create new Asana task from Riel ----------
export async function createAsanaTaskFromRiel(
  supabase: SupabaseClient<Database>,
  taskId: string,
): Promise<{ ok: boolean; skipped?: string }> {
  const { data: existing } = await supabase
    .from("asana_task_map")
    .select("id")
    .eq("task_id", taskId)
    .maybeSingle();
  if (existing) return { ok: false, skipped: "already_mapped" };

  const { data: task } = await supabase
    .from("tasks")
    .select("id, title, description, due_date, project_id, assignee_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { ok: false, skipped: "no_task" };
  const t = task as {
    title: string;
    description: string | null;
    due_date: string | null;
    project_id: string;
    assignee_id: string | null;
  };

  const { data: project } = await supabase
    .from("projects")
    .select("workspace_id, asana_project_gid")
    .eq("id", t.project_id)
    .maybeSingle();
  const p = project as { workspace_id: string; asana_project_gid: string | null } | null;
  if (!p?.asana_project_gid) return { ok: false, skipped: "no_asana_project" };

  let asanaAssigneeGid: string | null = null;
  if (t.assignee_id) {
    const { data: um } = await supabase
      .from("asana_user_map")
      .select("asana_user_gid")
      .eq("workspace_id", p.workspace_id)
      .eq("user_id", t.assignee_id)
      .maybeSingle();
    asanaAssigneeGid = (um as { asana_user_gid?: string } | null)?.asana_user_gid ?? null;
  }

  const body: Record<string, unknown> = {
    name: t.title,
    notes: t.description ?? "",
    due_on: t.due_date,
    projects: [p.asana_project_gid],
  };
  if (asanaAssigneeGid) body.assignee = asanaAssigneeGid;

  const created = await asanaApi<AsanaTask>("POST", `/tasks?opt_fields=modified_at`, body);

  await supabase.from("asana_task_map").insert({
    workspace_id: p.workspace_id,
    task_id: taskId,
    asana_task_gid: created.gid,
    asana_project_gid: p.asana_project_gid,
    last_synced_at: new Date().toISOString(),
    last_source: "riel",
    asana_modified_at: created.modified_at ?? null,
  } as never);

  return { ok: true };
}

// ---------- WEBHOOK: handle single event ----------
export async function handleAsanaWebhookEvent(
  supabase: SupabaseClient<Database>,
  event: {
    resource?: { gid: string; resource_type?: string };
    action?: string;
    parent?: { gid: string; resource_type?: string } | null;
  },
) {
  const resource = event.resource;
  if (!resource) return;

  // task changed
  if (resource.resource_type === "task" && (event.action === "changed" || event.action === "added")) {
    const { data: map } = await supabase
      .from("asana_task_map")
      .select("task_id, workspace_id, asana_project_gid")
      .eq("asana_task_gid", resource.gid)
      .maybeSingle();
    if (!map) return;
    const m = map as { task_id: string; workspace_id: string; asana_project_gid: string };
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("workspace_id", m.workspace_id)
      .eq("asana_project_gid", m.asana_project_gid)
      .maybeSingle();
    if (project) {
      await syncProjectFromAsana(supabase, (project as { id: string }).id, { createdBy: null });
    }
  }

  // story (comment) added
  if (resource.resource_type === "story" && event.action === "added" && event.parent?.gid) {
    const { data: map } = await supabase
      .from("asana_task_map")
      .select("task_id, workspace_id")
      .eq("asana_task_gid", event.parent.gid)
      .maybeSingle();
    if (!map) return;
    const m = map as { task_id: string; workspace_id: string };
    const { data: userMaps } = await supabase
      .from("asana_user_map")
      .select("asana_user_gid, user_id")
      .eq("workspace_id", m.workspace_id);
    const userByAsanaGid = new Map(
      (userMaps ?? []).map((u) => [(u as { asana_user_gid: string }).asana_user_gid, (u as { user_id: string }).user_id]),
    );
    await pullCommentsForTask(supabase, m.workspace_id, event.parent.gid, m.task_id, userByAsanaGid);
  }
}
