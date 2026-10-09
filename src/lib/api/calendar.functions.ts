import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createHmac } from "crypto";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];

function signState(payload: object): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString("base64url");
  const sig = createHmac("sha256", secret).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export const startGoogleCalendarOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        redirectUri: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    if (!clientId) throw new Error("GOOGLE_CALENDAR_CLIENT_ID no configurado");

    const state = signState({
      uid: context.userId,
      ws: data.workspaceId,
      ru: data.redirectUri,
      n: crypto.randomUUID(),
      exp: Date.now() + 10 * 60 * 1000,
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: data.redirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });

    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
  });

export const getMyCalendarConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("user_calendar_connections")
      .select(
        "id, google_account_email, status, last_synced_at, scopes, created_at",
      )
      .eq("user_id", userId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const disconnectGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_calendar_connections")
      .delete()
      .eq("user_id", userId)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Sync + Inbox ----------------

type GoogleEvent = {
  id: string;
  iCalUID?: string;
  recurringEventId?: string;
  status?: string;
  summary?: string;
  visibility?: string;
  transparency?: string;
  eventType?: string;
  htmlLink?: string;
  organizer?: { email?: string; self?: boolean };
  attendees?: Array<{ email?: string; self?: boolean; responseStatus?: string }>;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
};

async function refreshAccessTokenIfNeeded(conn: {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
}): Promise<{ accessToken: string; newExpiresAt: string | null }> {
  const now = Date.now();
  const exp = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (conn.access_token && exp - 30_000 > now) {
    return { accessToken: conn.access_token, newExpiresAt: conn.token_expires_at };
  }
  if (!conn.refresh_token) throw new Error("Conexión sin refresh token; reconecta tu calendario.");
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET!;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`No se pudo refrescar token: ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: json.access_token,
    newExpiresAt: new Date(Date.now() + (json.expires_in - 60) * 1000).toISOString(),
  };
}

export const syncMyCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Token columns are revoked from authenticated; read/write via admin client.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conn, error: connErr } = await supabaseAdmin
      .from("user_calendar_connections")
      .select("id, access_token, refresh_token, token_expires_at, status")
      .eq("user_id", userId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (connErr) throw new Error(connErr.message);
    if (!conn) throw new Error("No tienes una conexión de calendario en este workspace.");

    let accessToken: string;
    let newExpiresAt: string | null;
    try {
      const r = await refreshAccessTokenIfNeeded(conn);
      accessToken = r.accessToken;
      newExpiresAt = r.newExpiresAt;
    } catch (e) {
      await supabaseAdmin
        .from("user_calendar_connections")
        .update({ status: "needs_reauth" })
        .eq("id", conn.id);
      throw e;
    }

    if (accessToken !== conn.access_token || newExpiresAt !== conn.token_expires_at) {
      await supabaseAdmin
        .from("user_calendar_connections")
        .update({ access_token: accessToken, token_expires_at: newExpiresAt, status: "active" })
        .eq("id", conn.id);
    }

    const timeMin = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const timeMax = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

    const all: GoogleEvent[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        singleEvents: "true",
        showDeleted: "false",
        maxResults: "250",
        timeMin,
        timeMax,
        orderBy: "startTime",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) {
        const txt = await res.text();
        if (res.status === 401) {
          await supabase
            .from("user_calendar_connections")
            .update({ status: "needs_reauth" })
            .eq("id", conn.id);
        }
        throw new Error(`Google Calendar: ${res.status} ${txt.slice(0, 200)}`);
      }
      const j = (await res.json()) as { items?: GoogleEvent[]; nextPageToken?: string };
      if (j.items) all.push(...j.items);
      pageToken = j.nextPageToken;
    } while (pageToken);

    let upserted = 0;
    let skippedExisting = 0;
    for (const ev of all) {
      if (!ev.id || !ev.start || !ev.end) continue;
      if (ev.status === "cancelled") continue;

      const isAllDay = !!ev.start.date && !ev.start.dateTime;
      const startAt = ev.start.dateTime ?? (ev.start.date ? `${ev.start.date}T00:00:00Z` : null);
      const endAt = ev.end.dateTime ?? (ev.end.date ? `${ev.end.date}T00:00:00Z` : null);
      if (!startAt || !endAt) continue;

      const attendees = ev.attendees ?? [];
      const isPrivate = ev.visibility === "private" || ev.visibility === "confidential";
      const isOoo = ev.eventType === "outOfOffice" || ev.eventType === "focusTime";
      const isTransparent = ev.transparency === "transparent";

      const inboxStatus = isPrivate
        ? "private"
        : isOoo || isTransparent
          ? "ignored"
          : "pending";

      // Check existing row to avoid overwriting user classification
      const { data: existing } = await supabase
        .from("calendar_events")
        .select("id, inbox_status")
        .eq("connection_id", conn.id)
        .eq("google_event_id", ev.id)
        .maybeSingle();

      if (existing && existing.inbox_status === "classified") {
        skippedExisting += 1;
        // Still update timing/title in case event was moved
        await supabase
          .from("calendar_events")
          .update({
            title: isPrivate ? null : (ev.summary ?? null),
            start_at: startAt,
            end_at: endAt,
            is_all_day: isAllDay,
            attendees_count: attendees.length,
            organizer_email: ev.organizer?.email ?? null,
            html_link: ev.htmlLink ?? null,
            google_status: ev.status ?? null,
          })
          .eq("id", existing.id);
        continue;
      }

      const row = {
        workspace_id: data.workspaceId,
        user_id: userId,
        connection_id: conn.id,
        google_event_id: ev.id,
        google_recurring_event_id: ev.recurringEventId ?? null,
        google_ical_uid: ev.iCalUID ?? null,
        start_at: startAt,
        end_at: endAt,
        is_all_day: isAllDay,
        title: isPrivate ? null : (ev.summary ?? null),
        attendees_count: attendees.length,
        organizer_email: ev.organizer?.email ?? null,
        is_private: isPrivate,
        is_ooo: isOoo,
        google_status: ev.status ?? null,
        html_link: ev.htmlLink ?? null,
        inbox_status: existing ? existing.inbox_status : inboxStatus,
      };

      const { error: upErr } = await supabase
        .from("calendar_events")
        .upsert(row, { onConflict: "connection_id,google_event_id" });
      if (upErr) throw new Error(upErr.message);
      upserted += 1;
    }

    await supabase
      .from("user_calendar_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", conn.id);

    return { ok: true, total: all.length, upserted, skippedExisting };
  });

export const listInboxEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("calendar_events")
      .select(
        "id, title, start_at, end_at, is_all_day, attendees_count, organizer_email, html_link, google_recurring_event_id, inbox_status",
      )
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", userId)
      .eq("inbox_status", "pending")
      .order("start_at", { ascending: true });
    if (error) throw new Error(error.message);

    const events = rows ?? [];
    const seriesIds = Array.from(
      new Set(
        events
          .map((e) => e.google_recurring_event_id)
          .filter((x): x is string => !!x),
      ),
    );

    const classMap = new Map<
      string,
      {
        project_id: string | null;
        sprint_id: string | null;
        phase_id: string | null;
        classified_by: string | null;
        classified_by_name: string | null;
      }
    >();

    if (seriesIds.length > 0) {
      const { data: classes } = await supabase
        .from("calendar_recurring_classifications")
        .select(
          "google_recurring_event_id, project_id, sprint_id, phase_id, classified_by",
        )
        .eq("workspace_id", data.workspaceId)
        .in("google_recurring_event_id", seriesIds);

      const classifierIds = Array.from(
        new Set(
          (classes ?? [])
            .map((c) => c.classified_by)
            .filter((x): x is string => !!x),
        ),
      );
      const nameMap = new Map<string, string>();
      if (classifierIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", classifierIds);
        for (const p of profs ?? []) {
          nameMap.set(p.id, p.full_name ?? p.email ?? "");
        }
      }

      for (const c of classes ?? []) {
        classMap.set(c.google_recurring_event_id, {
          project_id: c.project_id,
          sprint_id: c.sprint_id,
          phase_id: c.phase_id,
          classified_by: c.classified_by,
          classified_by_name: c.classified_by
            ? (nameMap.get(c.classified_by) ?? null)
            : null,
        });
      }
    }

    return events.map((e) => ({
      ...e,
      preclassified: e.google_recurring_event_id
        ? (classMap.get(e.google_recurring_event_id) ?? null)
        : null,
    }));
  });

export const inboxPendingCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { count, error } = await supabase
      .from("calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", userId)
      .eq("inbox_status", "pending");
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

// Projects across every workspace the user belongs to, so calendar meetings
// can be classified into operations, marketing, finance or internal spaces.
export const listMyCalendarProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: memberships, error: mErr } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId);
    if (mErr) throw new Error(mErr.message);
    const wsIds = (memberships ?? []).map((m) => m.workspace_id);
    if (wsIds.length === 0) return [];

    const [{ data: workspaces, error: wErr }, { data: projects, error: pErr }] =
      await Promise.all([
        supabase
          .from("workspaces")
          .select("id, name, kind, color")
          .in("id", wsIds),
        supabase
          .from("projects")
          .select("id, name, color, area, workspace_id")
          .in("workspace_id", wsIds)
          .eq("archived", false)
          .order("name", { ascending: true }),
      ]);
    if (wErr) throw new Error(wErr.message);
    if (pErr) throw new Error(pErr.message);

    const wsMap = new Map(
      (workspaces ?? []).map((w) => [
        w.id,
        { name: w.name, kind: w.kind, color: w.color },
      ]),
    );
    return (projects ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      area: p.area,
      workspace_id: p.workspace_id,
      workspace_name: wsMap.get(p.workspace_id)?.name ?? "",
      workspace_kind: wsMap.get(p.workspace_id)?.kind ?? null,
    }));
  });

export const confirmCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        eventId: z.string().uuid(),
        projectId: z.string().uuid(),
        sprintId: z.string().uuid().nullable().optional(),
        phaseId: z.string().uuid().nullable().optional(),
        durationMinutes: z.number().int().min(1).max(24 * 60),
        assigneeIds: z.array(z.string().uuid()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const params = {
      _event_id: data.eventId,
      _project_id: data.projectId,
      _sprint_id: data.sprintId ?? null,
      _phase_id: data.phaseId ?? null,
      _duration_minutes: data.durationMinutes,
    } as unknown as {
      _event_id: string;
      _project_id: string;
      _sprint_id: string;
      _phase_id: string;
      _duration_minutes: number;
    };
    const { data: result, error } = await supabase.rpc(
      "confirm_calendar_meeting",
      params,
    );
    if (error) throw new Error(error.message);
    const typed = result as { task_id: string; minutes: number };

    // Reflejar multi-asignados en la tarea creada
    if (data.assigneeIds && data.assigneeIds.length > 0 && typed?.task_id) {
      const unique = Array.from(new Set(data.assigneeIds));
      const rows = unique.map((u) => ({ task_id: typed.task_id, user_id: u, is_primary: false }));
      await supabase
        .from("task_assignees")
        .upsert(rows as never, { onConflict: "task_id,user_id", ignoreDuplicates: true });
      // Persistir también sobre el evento
      await supabase
        .from("calendar_event_assignees")
        .upsert(
          unique.map((u) => ({ event_id: data.eventId, user_id: u })) as never,
          { onConflict: "event_id,user_id", ignoreDuplicates: true },
        );
    }
    return typed;
  });


export const ignoreInboxEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ eventId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("calendar_events")
      .update({
        inbox_status: "ignored",
        classified_at: new Date().toISOString(),
        classified_by: userId,
      })
      .eq("id", data.eventId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getProjectAnchors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("id, contract_id, contract:contract_id(type)")
      .eq("id", data.projectId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!project) throw new Error("Proyecto no encontrado");

    const contractType =
      (project.contract as { type?: string } | null)?.type ?? null;

    let sprints: Array<{ id: string; sprint_number: number; start_date: string; end_date: string; status: string }> = [];
    if (contractType === "recurrente" && project.contract_id) {
      const { data: sRows, error: sErr } = await supabase
        .from("sprints")
        .select("id, sprint_number, start_date, end_date, status")
        .eq("contract_id", project.contract_id)
        .order("sprint_number", { ascending: true });
      if (sErr) throw new Error(sErr.message);
      sprints = sRows ?? [];
    }

    let phases: Array<{ id: string; name: string; order_index: number | null }> = [];
    if (contractType !== "recurrente") {
      const { data: phRows, error: phErr } = await supabase
        .from("phases")
        .select("id, name, order_index")
        .eq("project_id", data.projectId)
        .order("order_index", { ascending: true });
      if (phErr) throw new Error(phErr.message);
      phases = phRows ?? [];
    }

    return { contractType, sprints, phases };
  });

// ============================================================
// Task-driven meeting sync: create/update/delete Google Calendar event
// for tasks of type "reunion" using the CREATOR's calendar connection.
// ============================================================

type GoogleTaskEventConn = {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  status: string | null;
};

async function getFreshTokenForConn(conn: GoogleTaskEventConn): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const r = await refreshAccessTokenIfNeeded(conn);
  if (r.accessToken !== conn.access_token || r.newExpiresAt !== conn.token_expires_at) {
    await supabaseAdmin
      .from("user_calendar_connections")
      .update({
        access_token: r.accessToken,
        token_expires_at: r.newExpiresAt,
        status: "active",
      })
      .eq("id", conn.id);
  }
  return r.accessToken;
}

export const upsertTaskCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ taskId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // 1) Load task + type + assignees + workspace
    const { data: task, error: tErr } = await supabase
      .from("tasks")
      .select(
        "id, title, description, due_date, created_by, meeting_start_time, meeting_duration_minutes, meeting_timezone, google_event_id, google_calendar_connection_id, project_id, task_type_id, projects:projects(workspace_id), task_types:task_types(key)",
      )
      .eq("id", data.taskId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!task) throw new Error("Tarea no encontrada");

    const t = task as unknown as {
      id: string;
      title: string;
      description: string | null;
      due_date: string | null;
      created_by: string | null;
      meeting_start_time: string | null;
      meeting_duration_minutes: number | null;
      meeting_timezone: string | null;
      google_event_id: string | null;
      google_calendar_connection_id: string | null;
      projects: { workspace_id: string } | null;
      task_types: { key: string } | null;
    };

    if (t.task_types?.key !== "reunion") return { ok: false, reason: "not_meeting" as const };
    if (!t.due_date || !t.meeting_start_time || !t.meeting_duration_minutes)
      return { ok: false, reason: "missing_time" as const };
    if (!t.created_by) return { ok: false, reason: "no_creator" as const };
    if (!t.projects?.workspace_id) return { ok: false, reason: "no_workspace" as const };

    // 2) Creator's calendar connection for this workspace
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conn, error: cErr } = await supabaseAdmin
      .from("user_calendar_connections")
      .select("id, access_token, refresh_token, token_expires_at, status")
      .eq("user_id", t.created_by)
      .eq("workspace_id", t.projects.workspace_id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!conn) return { ok: false, reason: "no_connection" as const };
    if (conn.status === "needs_reauth") return { ok: false, reason: "needs_reauth" as const };

    let accessToken: string;
    try {
      accessToken = await getFreshTokenForConn(conn as GoogleTaskEventConn);
    } catch {
      await supabaseAdmin
        .from("user_calendar_connections")
        .update({ status: "needs_reauth" })
        .eq("id", conn.id);
      return { ok: false, reason: "needs_reauth" as const };
    }

    // 3) Assignee emails
    const { data: rows } = await supabase
      .from("task_assignees")
      .select("user_id, profiles:profiles(email)")
      .eq("task_id", t.id);
    const attendees = (rows ?? [])
      .map((r) => (r as unknown as { profiles: { email: string | null } | null }).profiles?.email)
      .filter((e): e is string => !!e && /@/.test(e))
      .map((email) => ({ email }));

    // 4) Build event body
    const tz = t.meeting_timezone || "America/Santiago";
    const startLocal = `${t.due_date}T${t.meeting_start_time.length === 5 ? t.meeting_start_time + ":00" : t.meeting_start_time}`;
    // Compute end from duration; we send local time + timezone, so add minutes as string math
    const [h, m] = t.meeting_start_time.split(":").map((x) => parseInt(x, 10));
    const totalStart = h * 60 + m;
    const totalEnd = totalStart + t.meeting_duration_minutes;
    const endH = Math.floor((totalEnd / 60) % 24).toString().padStart(2, "0");
    const endM = (totalEnd % 60).toString().padStart(2, "0");
    // If crosses midnight, roll date
    const dayShift = Math.floor(totalEnd / (60 * 24));
    let endDate = t.due_date;
    if (dayShift > 0) {
      const d = new Date(`${t.due_date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + dayShift);
      endDate = d.toISOString().slice(0, 10);
    }
    const endLocal = `${endDate}T${endH}:${endM}:00`;

    const body = {
      summary: t.title,
      description: t.description ?? undefined,
      start: { dateTime: startLocal, timeZone: tz },
      end: { dateTime: endLocal, timeZone: tz },
      attendees,
    };

    const isUpdate = !!t.google_event_id;
    const url = isUpdate
      ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(t.google_event_id!)}?sendUpdates=all`
      : `https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all`;

    const res = await fetch(url, {
      method: isUpdate ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 404 && isUpdate) {
        // Event was deleted in Google → clear and retry as create
        await supabase
          .from("tasks")
          .update({ google_event_id: null, google_event_html_link: null })
          .eq("id", t.id);
        return { ok: false, reason: "event_missing" as const, retry: true };
      }
      console.error("[calendar upsert] fail", res.status, txt);
      throw new Error(`Google Calendar: ${res.status} ${txt.slice(0, 200)}`);
    }
    const evt = (await res.json()) as { id: string; htmlLink?: string };

    await supabase
      .from("tasks")
      .update({
        google_event_id: evt.id,
        google_event_html_link: evt.htmlLink ?? null,
        google_calendar_connection_id: conn.id,
      })
      .eq("id", t.id);

    return { ok: true, eventId: evt.id, htmlLink: evt.htmlLink ?? null };
  });

export const deleteTaskCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ taskId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: task } = await supabase
      .from("tasks")
      .select("id, google_event_id, google_calendar_connection_id")
      .eq("id", data.taskId)
      .maybeSingle();
    const t = task as { id: string; google_event_id: string | null; google_calendar_connection_id: string | null } | null;
    if (!t?.google_event_id || !t.google_calendar_connection_id) return { ok: true, noop: true };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conn } = await supabaseAdmin
      .from("user_calendar_connections")
      .select("id, access_token, refresh_token, token_expires_at, status")
      .eq("id", t.google_calendar_connection_id)
      .maybeSingle();
    if (conn) {
      try {
        const token = await getFreshTokenForConn(conn as GoogleTaskEventConn);
        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(t.google_event_id)}?sendUpdates=all`,
          { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
        );
      } catch (e) {
        console.error("[calendar delete] fail", e);
      }
    }
    await supabase
      .from("tasks")
      .update({ google_event_id: null, google_event_html_link: null, google_calendar_connection_id: null })
      .eq("id", t.id);
    return { ok: true };
  });

