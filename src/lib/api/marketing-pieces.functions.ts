import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PIECE_STATUSES = [
  "idea",
  "draft",
  "in_review",
  "approved",
  "scheduled",
  "published",
  "archived",
] as const;

export const listPiecesByCampaign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ campaignId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("content_pieces")
      .select(
        "id, title, channel, format, publish_at, status_editorial, owner_id, url_published, color, campaign_id, workspace_id",
      )
      .eq("campaign_id", data.campaignId)
      .order("publish_at", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listPiecesInRange = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        from: z.string(),
        to: z.string(),
        channels: z.array(z.string()).optional(),
        campaignId: z.string().uuid().nullable().optional(),
        ownerId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("content_pieces")
      .select(
        "id, title, channel, format, publish_at, status_editorial, owner_id, url_published, color, campaign_id, workspace_id",
      )
      .eq("workspace_id", data.workspaceId)
      .gte("publish_at", data.from)
      .lte("publish_at", data.to)
      .order("publish_at", { ascending: true });
    if (data.channels && data.channels.length > 0) q = q.in("channel", data.channels);
    if (data.campaignId !== undefined && data.campaignId !== null) {
      q = q.eq("campaign_id", data.campaignId);
    }
    if (data.ownerId) q = q.eq("owner_id", data.ownerId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listUnscheduledPieces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("content_pieces")
      .select(
        "id, title, channel, format, status_editorial, owner_id, campaign_id, color, created_at",
      )
      .eq("workspace_id", data.workspaceId)
      .is("publish_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getPiece = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ pieceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("content_pieces")
      .select("*")
      .eq("id", data.pieceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Pieza no encontrada");
    return row;
  });

export const createPiece = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        campaignId: z.string().uuid().nullable().optional(),
        title: z.string().min(1).max(160),
        bodyMd: z.string().max(50000).optional(),
        channel: z.string().min(1).max(40),
        format: z.string().max(40).optional(),
        publishAt: z.string().datetime().nullable().optional(),
        statusEditorial: z.enum(PIECE_STATUSES).optional(),
        ownerId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("content_pieces")
      .insert({
        workspace_id: data.workspaceId,
        campaign_id: data.campaignId ?? null,
        title: data.title,
        body_md: data.bodyMd ?? null,
        channel: data.channel,
        format: data.format ?? null,
        publish_at: data.publishAt ?? null,
        status_editorial: data.statusEditorial ?? "idea",
        owner_id: data.ownerId ?? userId,
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updatePiece = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        pieceId: z.string().uuid(),
        campaignId: z.string().uuid().nullable().optional(),
        title: z.string().min(1).max(160).optional(),
        bodyMd: z.string().max(50000).nullable().optional(),
        channel: z.string().min(1).max(40).optional(),
        format: z.string().max(40).nullable().optional(),
        publishAt: z.string().datetime().nullable().optional(),
        statusEditorial: z.enum(PIECE_STATUSES).optional(),
        ownerId: z.string().uuid().nullable().optional(),
        urlPublished: z.string().url().nullable().optional(),
        color: z.string().max(20).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    type Patch = {
      campaign_id?: string | null;
      title?: string;
      body_md?: string | null;
      channel?: string;
      format?: string | null;
      publish_at?: string | null;
      status_editorial?:
        "idea" | "draft" | "in_review" | "approved" | "scheduled" | "published" | "archived";
      owner_id?: string | null;
      url_published?: string | null;
      color?: string | null;
    };
    const patch: Patch = {};
    if (data.campaignId !== undefined) patch.campaign_id = data.campaignId;
    if (data.title !== undefined) patch.title = data.title;
    if (data.bodyMd !== undefined) patch.body_md = data.bodyMd;
    if (data.channel !== undefined) patch.channel = data.channel;
    if (data.format !== undefined) patch.format = data.format;
    if (data.publishAt !== undefined) patch.publish_at = data.publishAt;
    if (data.statusEditorial !== undefined) patch.status_editorial = data.statusEditorial;
    if (data.ownerId !== undefined) patch.owner_id = data.ownerId;
    if (data.urlPublished !== undefined) patch.url_published = data.urlPublished;
    if (data.color !== undefined) patch.color = data.color;
    const { error } = await supabase.from("content_pieces").update(patch).eq("id", data.pieceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePiece = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ pieceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("content_pieces").delete().eq("id", data.pieceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
