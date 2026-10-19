import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type NotificationKind =
  | "mention"
  | "assignment_added"
  | "assignment_removed"
  | "status_change"
  | "due_soon"
  | "overdue"
  | "ticket_new"
  | "ticket_client_reply";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
  actor_id: string | null;
}

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notifications")
      .select("id,kind,title,body,entity_type,entity_id,url,read_at,created_at,actor_id")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as AppNotification[];
  });

export const countUnreadNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count, error } = await context.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------- Preferences -------

const NOTIFICATION_KINDS: { kind: NotificationKind; label: string }[] = [
  { kind: "mention", label: "Menciones (@)" },
  { kind: "assignment_added", label: "Te asignan una tarea" },
  { kind: "assignment_removed", label: "Te quitan de una tarea" },
  { kind: "status_change", label: "Cambia el estado de una tarea tuya" },
  { kind: "due_soon", label: "Tarea vence en 24 horas" },
  { kind: "overdue", label: "Tarea vencida" },
  { kind: "ticket_new", label: "Nuevo ticket asignado" },
  { kind: "ticket_client_reply", label: "Respuesta del cliente en un ticket" },
];

function defaultsFor(kind: NotificationKind) {
  return {
    desktop: ["mention", "assignment_added", "ticket_new", "ticket_client_reply"].includes(kind),
    in_app: true,
    email: false,
    slack: false,
  };
}

export const getNotificationPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notification_preferences")
      .select("kind,desktop,in_app,email,slack")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const map = new Map((data ?? []).map((r) => [r.kind, r]));
    return NOTIFICATION_KINDS.map(({ kind, label }) => {
      const row = map.get(kind);
      const d = defaultsFor(kind);
      return {
        kind,
        label,
        desktop: row?.desktop ?? d.desktop,
        in_app: row?.in_app ?? d.in_app,
        email: row?.email ?? d.email,
        slack: row?.slack ?? d.slack,
      };
    });
  });

export const saveNotificationPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      kind: NotificationKind;
      desktop: boolean;
      in_app: boolean;
      email: boolean;
      slack: boolean;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("notification_preferences").upsert(
      {
        user_id: context.userId,
        kind: data.kind,
        desktop: data.desktop,
        in_app: data.in_app,
        email: data.email,
        slack: data.slack,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,kind" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------- Profile: handle + slack_user_id -------

export const getMyNotificationProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("handle,slack_user_id,email,full_name")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const updateMyNotificationProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { handle?: string | null; slack_user_id?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const payload: { handle?: string; slack_user_id?: string | null } = {};
    if (data.handle !== undefined) {
      const clean = (data.handle ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 32);
      if (!clean) throw new Error("El handle debe tener al menos un carácter alfanumérico");
      payload.handle = clean;
    }
    if (data.slack_user_id !== undefined) {
      payload.slack_user_id = data.slack_user_id?.trim() || null;
    }
    const { error } = await context.supabase
      .from("profiles")
      .update(payload)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
