import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CAMPAIGN_STATUSES = [
  "idea",
  "planning",
  "in_execution",
  "live",
  "measuring",
  "closed",
] as const;

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        includeArchived: z.boolean().optional(),
        status: z.enum(CAMPAIGN_STATUSES).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("campaigns")
      .select(
        "id, name, slug, objective, kpi_label, kpi_target, kpi_actual, launch_date, end_date, budget, currency, channels, status, owner_id, color, hubspot_campaign_id, archived, created_at, updated_at",
      )
      .eq("workspace_id", data.workspaceId)
      .order("launch_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (!data.includeArchived) q = q.eq("archived", false);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getCampaign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ campaignId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Campaña no encontrada");
    return row;
  });

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        name: z.string().min(1).max(120),
        objective: z.string().max(500).optional(),
        briefMd: z.string().max(20000).optional(),
        kpiLabel: z.string().max(80).optional(),
        kpiTarget: z.number().optional(),
        launchDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        endDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        budget: z.number().nonnegative().optional(),
        currency: z.string().max(6).optional(),
        channels: z.array(z.string()).optional(),
        status: z.enum(CAMPAIGN_STATUSES).optional(),
        ownerId: z.string().uuid().optional(),
        color: z.string().max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("campaigns")
      .insert({
        workspace_id: data.workspaceId,
        name: data.name,
        objective: data.objective ?? null,
        brief_md: data.briefMd ?? null,
        kpi_label: data.kpiLabel ?? null,
        kpi_target: data.kpiTarget ?? null,
        launch_date: data.launchDate ?? null,
        end_date: data.endDate ?? null,
        budget: data.budget ?? null,
        currency: data.currency ?? "USD",
        channels: data.channels ?? [],
        status: data.status ?? "idea",
        owner_id: data.ownerId ?? userId,
        color: data.color ?? "#ec4899",
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        campaignId: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        objective: z.string().max(500).nullable().optional(),
        briefMd: z.string().max(20000).nullable().optional(),
        kpiLabel: z.string().max(80).nullable().optional(),
        kpiTarget: z.number().nullable().optional(),
        kpiActual: z.number().nullable().optional(),
        launchDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
        endDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
        budget: z.number().nonnegative().nullable().optional(),
        currency: z.string().max(6).optional(),
        channels: z.array(z.string()).optional(),
        status: z.enum(CAMPAIGN_STATUSES).optional(),
        ownerId: z.string().uuid().nullable().optional(),
        color: z.string().max(20).optional(),
        archived: z.boolean().optional(),
        hubspotCampaignId: z.string().max(64).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    type Patch = {
      name?: string;
      objective?: string | null;
      brief_md?: string | null;
      kpi_label?: string | null;
      kpi_target?: number | null;
      kpi_actual?: number | null;
      launch_date?: string | null;
      end_date?: string | null;
      budget?: number | null;
      currency?: string;
      channels?: string[];
      status?: "idea" | "planning" | "in_execution" | "live" | "measuring" | "closed";
      owner_id?: string | null;
      color?: string;
      archived?: boolean;
      hubspot_campaign_id?: string | null;
    };
    const patch: Patch = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.objective !== undefined) patch.objective = data.objective;
    if (data.briefMd !== undefined) patch.brief_md = data.briefMd;
    if (data.kpiLabel !== undefined) patch.kpi_label = data.kpiLabel;
    if (data.kpiTarget !== undefined) patch.kpi_target = data.kpiTarget;
    if (data.kpiActual !== undefined) patch.kpi_actual = data.kpiActual;
    if (data.launchDate !== undefined) patch.launch_date = data.launchDate;
    if (data.endDate !== undefined) patch.end_date = data.endDate;
    if (data.budget !== undefined) patch.budget = data.budget;
    if (data.currency !== undefined) patch.currency = data.currency;
    if (data.channels !== undefined) patch.channels = data.channels;
    if (data.status !== undefined) patch.status = data.status;
    if (data.ownerId !== undefined) patch.owner_id = data.ownerId;
    if (data.color !== undefined) patch.color = data.color;
    if (data.archived !== undefined) patch.archived = data.archived;
    if (data.hubspotCampaignId !== undefined) patch.hubspot_campaign_id = data.hubspotCampaignId;
    const { error } = await supabase.from("campaigns").update(patch).eq("id", data.campaignId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ campaignId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("campaigns").delete().eq("id", data.campaignId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Dashboard aggregate: active campaigns + pieces due this week + overdue pieces. */
export const getMarketingDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 86400000);

    const [campaignsRes, upcomingRes, overdueRes] = await Promise.all([
      supabase
        .from("campaigns")
        .select(
          "id, name, status, launch_date, end_date, color, kpi_label, kpi_target, kpi_actual, channels",
        )
        .eq("workspace_id", data.workspaceId)
        .eq("archived", false)
        .in("status", ["planning", "in_execution", "live", "measuring"])
        .order("launch_date", { ascending: true, nullsFirst: false })
        .limit(6),
      supabase
        .from("content_pieces")
        .select("id, title, channel, publish_at, status_editorial, campaign_id, color")
        .eq("workspace_id", data.workspaceId)
        .gte("publish_at", now.toISOString())
        .lte("publish_at", in7.toISOString())
        .neq("status_editorial", "published")
        .neq("status_editorial", "archived")
        .order("publish_at", { ascending: true })
        .limit(20),
      supabase
        .from("content_pieces")
        .select("id, title, channel, publish_at, status_editorial")
        .eq("workspace_id", data.workspaceId)
        .lt("publish_at", now.toISOString())
        .in("status_editorial", ["draft", "in_review", "approved", "scheduled"])
        .order("publish_at", { ascending: true })
        .limit(10),
    ]);

    return {
      activeCampaigns: campaignsRes.data ?? [],
      upcomingPieces: upcomingRes.data ?? [],
      overduePieces: overdueRes.data ?? [],
    };
  });
