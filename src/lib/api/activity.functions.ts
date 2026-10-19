import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ActivityItem =
  | {
      kind: "comment";
      id: string;
      created_at: string;
      author_id: string | null;
      client_author_email: string | null;
      author: {
        id: string;
        full_name: string | null;
        email: string | null;
        avatar_url: string | null;
      } | null;
      body: string;
      is_client_visible: boolean;
    }
  | {
      kind: "event";
      id: string;
      created_at: string;
      actor_id: string | null;
      actor: {
        id: string;
        full_name: string | null;
        email: string | null;
        avatar_url: string | null;
      } | null;
      event_kind: string;
      from_value: string | null;
      to_value: string | null;
    };

export const listTaskActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ taskId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ActivityItem[]> => {
    const { supabase } = context;
    const [commentsRes, eventsRes] = await Promise.all([
      supabase
        .from("task_comments")
        .select("id, body, author_id, client_author_email, created_at, is_client_visible")
        .eq("task_id", data.taskId),
      supabase
        .from("task_activity")
        .select("id, actor_id, kind, from_value, to_value, created_at")
        .eq("task_id", data.taskId),
    ]);
    if (commentsRes.error) throw new Error(commentsRes.error.message);
    if (eventsRes.error) throw new Error(eventsRes.error.message);

    const comments = commentsRes.data ?? [];
    const events = eventsRes.data ?? [];

    const ids = Array.from(
      new Set(
        [...comments.map((c) => c.author_id), ...events.map((e) => e.actor_id)].filter(
          (v): v is string => !!v,
        ),
      ),
    );

    const profilesById = new Map<
      string,
      { id: string; full_name: string | null; email: string | null; avatar_url: string | null }
    >();
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", ids);
      for (const p of profiles ?? []) profilesById.set(p.id, p);
    }

    const merged: ActivityItem[] = [
      ...comments.map((c): ActivityItem => ({
        kind: "comment",
        id: c.id,
        created_at: c.created_at,
        author_id: c.author_id,
        client_author_email: c.client_author_email ?? null,
        author: c.author_id ? (profilesById.get(c.author_id) ?? null) : null,
        body: c.body,
        is_client_visible: !!(c as { is_client_visible?: boolean | null }).is_client_visible,
      })),
      ...events.map((e): ActivityItem => ({
        kind: "event",
        id: e.id,
        created_at: e.created_at,
        actor_id: e.actor_id,
        actor: e.actor_id ? (profilesById.get(e.actor_id) ?? null) : null,
        event_kind: e.kind as string,
        from_value: e.from_value,
        to_value: e.to_value,
      })),
    ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    return merged;
  });
