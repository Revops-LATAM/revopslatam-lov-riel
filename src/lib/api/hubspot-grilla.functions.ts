// HubSpot Social ↔ Grilla integration (thin RPC wrappers).
// Business logic lives in ./hubspot-grilla.server.ts to keep this file
// safe under the tss-serverfn-split transform.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hubspotFetch, syncPieceCore, unsyncPieceCore } from "./hubspot-grilla.server";

type HubspotChannel = { channelGuid: string; name: string; type: string };

// HubSpot Social soporta Facebook, Instagram, LinkedIn y X. TikTok NO
// está disponible en HubSpot. Solo exponemos los tipos que el usuario
// quiere usar en la grilla.
const ALLOWED_HS_TYPES = ["INSTAGRAM", "LINKEDIN", "FACEBOOK"] as const;

function normalizeType(raw: string): string {
  const t = raw.toUpperCase();
  if (t.includes("INSTAGRAM")) return "INSTAGRAM";
  if (t.includes("LINKEDIN")) return "LINKEDIN";
  if (t.includes("FACEBOOK") || t.includes("FB_")) return "FACEBOOK";
  if (t.includes("TWITTER") || t === "X") return "TWITTER";
  return t;
}

export const listHubspotSocialChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<HubspotChannel[]> => {
    const raw = await hubspotFetch(`/broadcast/v1/channels/setting/publish/current`);
    const arr = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
    return arr
      .map((c) => ({
        channelGuid: String(c.channelGuid ?? c.channel_guid ?? ""),
        name: String(c.name ?? c.accountName ?? c.channelKey ?? "Canal"),
        type: normalizeType(String(c.type ?? c.channelType ?? "")),
      }))
      .filter((c) => (ALLOWED_HS_TYPES as readonly string[]).includes(c.type));
  });

export const setChannelHubspotId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        channelId: z.string().uuid(),
        hubspotChannelId: z.string().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("marketing_channels")
      .update({ hubspot_channel_id: data.hubspotChannelId })
      .eq("id", data.channelId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMarketingChannelsWithHubspot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ workspaceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("marketing_channels")
      .select("id, key, label, color, hubspot_channel_id, is_active")
      .eq("workspace_id", data.workspaceId)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const syncPieceToHubspot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ pieceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => syncPieceCore(context.supabase, data.pieceId));

export const unsyncPieceFromHubspot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ pieceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await unsyncPieceCore(context.supabase, data.pieceId);
    return { ok: true };
  });

export const syncMonthToHubspot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const start = new Date(Date.UTC(data.year, data.month - 1, 1)).toISOString();
    const end = new Date(Date.UTC(data.year, data.month, 1)).toISOString();
    const { data: pieces, error } = await context.supabase
      .from("content_pieces_v2")
      .select("id, status, publish_at")
      .eq("workspace_id", data.workspaceId)
      .gte("publish_at", start)
      .lt("publish_at", end);
    if (error) throw new Error(error.message);

    const targets = (pieces ?? []).filter(
      (p) =>
        p.status !== "publicada" && p.publish_at && new Date(p.publish_at).getTime() > Date.now(),
    );

    let ok = 0;
    let failed = 0;
    for (const p of targets) {
      try {
        await syncPieceCore(context.supabase, p.id);
        ok++;
      } catch {
        failed++;
      }
    }
    return { ok, failed, total: targets.length };
  });
