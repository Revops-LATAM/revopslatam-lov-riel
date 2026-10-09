import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listTaskAttachments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ taskId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("task_attachments")
      .select("id, file_name, file_path, size, mime_type, uploader_id, created_at")
      .eq("task_id", data.taskId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const withUrls = await Promise.all(
      (rows ?? []).map(async (r) => {
        const [{ data: signed }, { data: signedDownload }] = await Promise.all([
          supabase.storage
            .from("task-attachments")
            .createSignedUrl(r.file_path, 60 * 60),
          supabase.storage
            .from("task-attachments")
            .createSignedUrl(r.file_path, 60 * 60, { download: r.file_name }),
        ]);
        return {
          ...r,
          url: signed?.signedUrl ?? null,
          downloadUrl: signedDownload?.signedUrl ?? signed?.signedUrl ?? null,
        };
      }),
    );

    return withUrls;
  });

export const registerTaskAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        taskId: z.string().uuid(),
        filePath: z.string().min(1).max(500),
        fileName: z.string().min(1).max(255),
        size: z.number().int().nonnegative().optional(),
        mimeType: z.string().max(100).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("task_attachments").insert({
      task_id: data.taskId,
      uploader_id: userId,
      file_path: data.filePath,
      file_name: data.fileName,
      size: data.size ?? null,
      mime_type: data.mimeType ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTaskAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ attachmentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("task_attachments")
      .select("file_path")
      .eq("id", data.attachmentId)
      .maybeSingle();
    if (row?.file_path) {
      await supabase.storage.from("task-attachments").remove([row.file_path]);
    }
    const { error } = await supabase
      .from("task_attachments")
      .delete()
      .eq("id", data.attachmentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
