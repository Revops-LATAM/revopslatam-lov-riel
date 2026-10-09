import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const listContractDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), contractId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const prefix = `${data.workspaceId}/${data.contractId}`;
    const { data: items, error } = await context.supabase.storage
      .from("contract-documents")
      .list(prefix, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
    if (error) throw new Error(error.message);
    return (items ?? []).map((it) => ({
      name: it.name,
      path: `${prefix}/${it.name}`,
      size: it.metadata?.size ?? 0,
      createdAt: it.created_at ?? null,
    }));
  });

export const getContractDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ path: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    // Storage paths follow `${workspaceId}/${contractId}/${filename}`. Verify
    // the caller can actually read that contract with their RLS-scoped client
    // before minting a signed URL with the service-role client. Otherwise any
    // authenticated user who guesses workspace/contract UUIDs could fetch
    // another workspace's confidential contract documents.
    const uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
    const match = new RegExp(`^(${uuid})/(${uuid})/[^/]+$`).exec(data.path);
    if (!match) throw new Error("Invalid document path");
    const [, workspaceId, contractId] = match;
    const { data: contract, error: cErr } = await context.supabase
      .from("contracts")
      .select("id")
      .eq("id", contractId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!contract) throw new Error("Not found");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("contract-documents")
      .createSignedUrl(data.path, 60 * 10);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });


export const deleteContractDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ path: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.storage
      .from("contract-documents")
      .remove([data.path]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
