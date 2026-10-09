import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listTaskComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ taskId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: comments, error } = await supabase
      .from("task_comments")
      .select("id, body, author_id, client_author_email, created_at, is_client_visible")
      .eq("task_id", data.taskId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const ids = Array.from(
      new Set((comments ?? []).map((c) => c.author_id).filter((v): v is string => !!v)),
    );
    if (ids.length === 0) return (comments ?? []).map((c) => ({ ...c, author: null }));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .in("id", ids);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    return (comments ?? []).map((c) => ({ ...c, author: c.author_id ? byId.get(c.author_id) ?? null : null }));
  });

export const addTaskComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        taskId: z.string().uuid(),
        body: z.string().min(1).max(5000),
        isClientVisible: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("task_comments").insert({
      task_id: data.taskId,
      author_id: userId,
      body: data.body,
      is_client_visible: data.isClientVisible ?? false,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTaskComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ commentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("task_comments").delete().eq("id", data.commentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
