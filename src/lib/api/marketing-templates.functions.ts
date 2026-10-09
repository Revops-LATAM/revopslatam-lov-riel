import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type TemplatePiece = {
  title: string;
  channel: string;
  format?: string;
  offset_days: number;
  status_editorial?: string;
};

export const listCampaignTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("campaign_templates")
      .select(
        "id, workspace_id, name, description, default_channels, default_status, default_duration_days, pieces_json, is_system, sort_order",
      )
      .or(`workspace_id.is.null,workspace_id.eq.${data.workspaceId}`)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Applies a campaign template: creates the campaign + all pieces with
 * publish_at = launchDate + piece.offset_days.
 */
export const applyCampaignTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        templateId: z.string().uuid(),
        name: z.string().min(1).max(120),
        launchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        objective: z.string().max(500).optional(),
        ownerId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load template
    const { data: tpl, error: tplErr } = await supabase
      .from("campaign_templates")
      .select(
        "name, description, default_channels, default_status, default_duration_days, pieces_json",
      )
      .eq("id", data.templateId)
      .maybeSingle();
    if (tplErr) throw new Error(tplErr.message);
    if (!tpl) throw new Error("Template no encontrado");

    const launch = new Date(`${data.launchDate}T12:00:00Z`);
    const end = new Date(launch.getTime() + tpl.default_duration_days * 86400000);

    // Create campaign
    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .insert({
        workspace_id: data.workspaceId,
        name: data.name,
        objective: data.objective ?? null,
        brief_md: tpl.description ?? null,
        launch_date: data.launchDate,
        end_date: end.toISOString().slice(0, 10),
        channels: tpl.default_channels ?? [],
        status: tpl.default_status,
        owner_id: data.ownerId ?? userId,
        created_by: userId,
      })
      .select("id")
      .single();
    if (cErr) throw new Error(cErr.message);

    // Create pieces from template
    const pieces = (tpl.pieces_json as TemplatePiece[]) ?? [];
    if (pieces.length > 0) {
      const rows = pieces.map((p) => {
        const publishAt = new Date(launch.getTime() + p.offset_days * 86400000);
        return {
          workspace_id: data.workspaceId,
          campaign_id: campaign.id,
          title: p.title,
          channel: p.channel,
          format: p.format ?? null,
          publish_at: publishAt.toISOString(),
          status_editorial: (p.status_editorial ?? "idea") as
            | "idea"
            | "draft"
            | "in_review"
            | "approved"
            | "scheduled"
            | "published"
            | "archived",
          owner_id: data.ownerId ?? userId,
          created_by: userId,
        };
      });
      const { error: pErr } = await supabase.from("content_pieces").insert(rows);
      if (pErr) throw new Error(pErr.message);
    }

    return { campaignId: campaign.id };
  });
