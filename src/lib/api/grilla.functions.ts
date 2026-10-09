import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

// ============ Constants ============
export const PIECE_FORMATS = ["carrusel", "reel", "post", "encuesta", "demo", "video"] as const;
export const PIECE_STATUSES = [
  "idea",
  "copy",
  "diseno",
  "revision",
  "programada",
  "publicada",
] as const;
export const PIECE_CHANNELS = ["instagram", "tiktok", "linkedin", "youtube"] as const;

const FormatSchema = z.enum(PIECE_FORMATS);
const StatusSchema = z.enum(PIECE_STATUSES);
const ChannelSchema = z.enum(PIECE_CHANNELS);

// ============ Pillars ============
export const listPillars = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ workspaceId: z.string().uuid(), onlyActive: z.boolean().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("content_pillars")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("sort_order", { ascending: true });
    if (data.onlyActive) q = q.eq("is_active", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertPillar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid().optional(),
        workspaceId: z.string().uuid(),
        key: z.string().min(1).max(80),
        label: z.string().min(1).max(120),
        color: z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const patch = {
      workspace_id: data.workspaceId,
      key: data.key,
      label: data.label,
      color: data.color ?? null,
      sort_order: data.sortOrder ?? 0,
      is_active: data.isActive ?? true,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("content_pillars")
        .update(patch)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("content_pillars")
      .insert(patch)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deletePillar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("content_pillars").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Cadence Templates ============
export const listCadenceTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ workspaceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("cadence_templates")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getCadenceTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ templateId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: tpl, error } = await context.supabase
      .from("cadence_templates")
      .select("*")
      .eq("id", data.templateId)
      .single();
    if (error) throw new Error(error.message);
    const { data: slots, error: sErr } = await context.supabase
      .from("cadence_template_slots")
      .select("*")
      .eq("template_id", data.templateId)
      .order("weekday", { ascending: true })
      .order("sort_order", { ascending: true });
    if (sErr) throw new Error(sErr.message);
    return { template: tpl, slots: slots ?? [] };
  });

export const upsertCadenceTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid().optional(),
        workspaceId: z.string().uuid(),
        name: z.string().min(1).max(120),
        description: z.string().nullable().optional(),
        isDefault: z.boolean().optional(),
        isActive: z.boolean().optional(),
        slots: z
          .array(
            z.object({
              weekday: z.number().int().min(0).max(6),
              timeOfDay: z.string().nullable().optional(),
              format: FormatSchema,
              channels: z.array(ChannelSchema),
              pillarId: z.string().uuid().nullable().optional(),
              sortOrder: z.number().int().optional(),
            }),
          )
          .default([]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let templateId = data.id;

    // If setting as default, unset others
    if (data.isDefault) {
      await supabase
        .from("cadence_templates")
        .update({ is_default: false })
        .eq("workspace_id", data.workspaceId);
    }

    if (templateId) {
      const { error } = await supabase
        .from("cadence_templates")
        .update({
          name: data.name,
          description: data.description ?? null,
          is_default: data.isDefault ?? false,
          is_active: data.isActive ?? true,
        })
        .eq("id", templateId);
      if (error) throw new Error(error.message);
    } else {
      const { data: row, error } = await supabase
        .from("cadence_templates")
        .insert({
          workspace_id: data.workspaceId,
          name: data.name,
          description: data.description ?? null,
          is_default: data.isDefault ?? false,
          is_active: data.isActive ?? true,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      templateId = row.id;
    }

    // Replace slots
    await supabase.from("cadence_template_slots").delete().eq("template_id", templateId);
    if (data.slots.length > 0) {
      const { error: iErr } = await supabase.from("cadence_template_slots").insert(
        data.slots.map((s, idx) => ({
          template_id: templateId!,
          weekday: s.weekday,
          time_of_day: s.timeOfDay ?? null,
          format: s.format,
          channels: s.channels,
          pillar_id: s.pillarId ?? null,
          sort_order: s.sortOrder ?? idx,
        })),
      );
      if (iErr) throw new Error(iErr.message);
    }

    return { id: templateId };
  });

export const deleteCadenceTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ templateId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("cadence_templates")
      .delete()
      .eq("id", data.templateId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Grids ============
export const getGrid = createServerFn({ method: "GET" })
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
    const { supabase } = context;
    // fetch grid metadata (may be null)
    const { data: grid } = await supabase
      .from("content_grids")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .eq("year", data.year)
      .eq("month", data.month)
      .maybeSingle();

    // fetch pieces for that month by publish_at range
    const start = new Date(Date.UTC(data.year, data.month - 1, 1)).toISOString();
    const end = new Date(Date.UTC(data.year, data.month, 1)).toISOString();

    const { data: pieces, error: pErr } = await supabase
      .from("content_pieces_v2")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .gte("publish_at", start)
      .lt("publish_at", end)
      .order("publish_at", { ascending: true });
    if (pErr) throw new Error(pErr.message);

    const pieceIds = (pieces ?? []).map((p) => p.id);
    let copies: { piece_id: string; channel: string; body: string; hashtags: string[] }[] = [];
    if (pieceIds.length > 0) {
      const { data: cs, error: cErr } = await supabase
        .from("piece_channel_copies")
        .select("piece_id, channel, body, hashtags")
        .in("piece_id", pieceIds);
      if (cErr) throw new Error(cErr.message);
      copies = (cs ?? []) as typeof copies;
    }

    return { grid: grid ?? null, pieces: pieces ?? [], copies };
  });

export const getPieceDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ pieceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [pieceR, slidesR, sectionsR, pollR, copiesR] = await Promise.all([
      supabase.from("content_pieces_v2").select("*").eq("id", data.pieceId).single(),
      supabase
        .from("piece_carousel_slides")
        .select("*")
        .eq("piece_id", data.pieceId)
        .order("slide_index"),
      supabase.from("piece_video_sections").select("*").eq("piece_id", data.pieceId),
      supabase.from("piece_poll").select("*").eq("piece_id", data.pieceId).maybeSingle(),
      supabase.from("piece_channel_copies").select("*").eq("piece_id", data.pieceId),
    ]);
    if (pieceR.error) throw new Error(pieceR.error.message);
    return {
      piece: pieceR.data,
      slides: slidesR.data ?? [],
      sections: sectionsR.data ?? [],
      poll: pollR.data ?? null,
      copies: copiesR.data ?? [],
    };
  });

// ============ Generate Monthly Grid ============
const GenerateModeSchema = z.enum(["additive", "replace_drafts", "block_if_exists"]);

export const generateMonthlyGrid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
        templateId: z.string().uuid(),
        mode: GenerateModeSchema.default("additive"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load template + slots
    const { data: tpl, error: tErr } = await supabase
      .from("cadence_templates")
      .select("id, workspace_id")
      .eq("id", data.templateId)
      .single();
    if (tErr) throw new Error(tErr.message);
    if (tpl.workspace_id !== data.workspaceId)
      throw new Error("Template does not belong to workspace");

    const { data: slots, error: sErr } = await supabase
      .from("cadence_template_slots")
      .select("*")
      .eq("template_id", data.templateId);
    if (sErr) throw new Error(sErr.message);
    if (!slots || slots.length === 0) throw new Error("La plantilla no tiene slots");

    // Fetch existing pieces of the month
    const start = new Date(Date.UTC(data.year, data.month - 1, 1)).toISOString();
    const end = new Date(Date.UTC(data.year, data.month, 1)).toISOString();
    const { data: existing } = await supabase
      .from("content_pieces_v2")
      .select("id, publish_at, format, status")
      .eq("workspace_id", data.workspaceId)
      .gte("publish_at", start)
      .lt("publish_at", end);

    if (data.mode === "block_if_exists" && existing && existing.length > 0) {
      throw new Error(`Ya existen ${existing.length} piezas en ese mes`);
    }

    let replaced = 0;
    if (data.mode === "replace_drafts" && existing && existing.length > 0) {
      const toDelete = existing
        .filter((p) => p.status === "idea" || p.status === "copy")
        .map((p) => p.id);
      if (toDelete.length > 0) {
        await supabase.from("content_pieces_v2").delete().in("id", toDelete);
        replaced = toDelete.length;
      }
    }

    // Re-fetch existing after potential deletes
    const { data: stillExisting } = await supabase
      .from("content_pieces_v2")
      .select("publish_at, format")
      .eq("workspace_id", data.workspaceId)
      .gte("publish_at", start)
      .lt("publish_at", end);

    const existingKeys = new Set((stillExisting ?? []).map((p) => `${p.publish_at}|${p.format}`));

    // Upsert/create grid
    let gridId: string;
    const { data: gridExisting } = await supabase
      .from("content_grids")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .eq("year", data.year)
      .eq("month", data.month)
      .maybeSingle();
    if (gridExisting) {
      gridId = gridExisting.id;
      await supabase
        .from("content_grids")
        .update({
          template_id: data.templateId,
          generated_at: new Date().toISOString(),
          generated_by: userId,
        })
        .eq("id", gridId);
    } else {
      const { data: g, error: gErr } = await supabase
        .from("content_grids")
        .insert({
          workspace_id: data.workspaceId,
          year: data.year,
          month: data.month,
          template_id: data.templateId,
          generated_at: new Date().toISOString(),
          generated_by: userId,
        })
        .select("id")
        .single();
      if (gErr) throw new Error(gErr.message);
      gridId = g.id;
    }

    // Build pieces: for each day of month, for each slot matching weekday
    const daysInMonth = new Date(data.year, data.month, 0).getDate();
    const toInsert: {
      workspace_id: string;
      grid_id: string;
      pillar_id: string | null;
      title: string;
      publish_at: string;
      format: (typeof PIECE_FORMATS)[number];
      channels: (typeof PIECE_CHANNELS)[number][];
      status: "idea";
      created_by: string | null;
    }[] = [];
    let skipped = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(data.year, data.month - 1, day);
      // JS: 0=Sun..6=Sat  →  our weekday: 0=Mon..6=Sun
      const weekday = (date.getDay() + 6) % 7;
      const daySlots = slots.filter((s) => s.weekday === weekday);
      for (const slot of daySlots) {
        // Compose publish_at (local time_of_day, fallback 09:00)
        const [hh, mm] = (slot.time_of_day ?? "09:00")
          .split(":")
          .map((x: string) => parseInt(x, 10));
        const publish = new Date(data.year, data.month - 1, day, hh || 9, mm || 0, 0, 0);
        const iso = publish.toISOString();
        const key = `${iso}|${slot.format}`;
        if (existingKeys.has(key)) {
          skipped++;
          continue;
        }
        existingKeys.add(key);
        toInsert.push({
          workspace_id: data.workspaceId,
          grid_id: gridId,
          pillar_id: slot.pillar_id,
          title: "",
          publish_at: iso,
          format: slot.format,
          channels: slot.channels ?? [],
          status: "idea",
          created_by: userId,
        });
      }
    }

    let created = 0;
    if (toInsert.length > 0) {
      const { error: iErr } = await supabase.from("content_pieces_v2").insert(toInsert);
      if (iErr) throw new Error(iErr.message);
      created = toInsert.length;
    }

    return { created, skipped, replaced, gridId };
  });

// ============ Pieces CRUD ============
export const createPiece = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        title: z.string().default(""),
        publishAt: z.string().nullable().optional(),
        format: FormatSchema.default("post"),
        channels: z.array(ChannelSchema).default([]),
        pillarId: z.string().uuid().nullable().optional(),
        ownerId: z.string().uuid().nullable().optional(),
        gridId: z.string().uuid().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("content_pieces_v2")
      .insert({
        workspace_id: data.workspaceId,
        title: data.title,
        publish_at: data.publishAt ?? null,
        format: data.format,
        channels: data.channels,
        pillar_id: data.pillarId ?? null,
        owner_id: data.ownerId ?? null,
        grid_id: data.gridId ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updatePiece = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        pieceId: z.string().uuid(),
        title: z.string().optional(),
        publishAt: z.string().nullable().optional(),
        format: FormatSchema.optional(),
        channels: z.array(ChannelSchema).optional(),
        pillarId: z.string().uuid().nullable().optional(),
        ownerId: z.string().uuid().nullable().optional(),
        status: StatusSchema.optional(),
        assetUrl: z.string().nullable().optional(),
        channelAssets: z.record(z.string(), z.string().nullable()).optional(),
        cta: z.string().nullable().optional(),
        content: z.string().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const patch: Database["public"]["Tables"]["content_pieces_v2"]["Update"] = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.publishAt !== undefined) patch.publish_at = data.publishAt;
    if (data.format !== undefined) patch.format = data.format;
    if (data.channels !== undefined) patch.channels = data.channels;
    if (data.pillarId !== undefined) patch.pillar_id = data.pillarId;
    if (data.ownerId !== undefined) patch.owner_id = data.ownerId;
    if (data.status !== undefined) patch.status = data.status;
    if (data.assetUrl !== undefined) patch.asset_url = data.assetUrl;
    if (data.channelAssets !== undefined) {
      // Merge with existing channel_assets so partial updates don't wipe others.
      const { data: existing } = await context.supabase
        .from("content_pieces_v2")
        .select("channel_assets")
        .eq("id", data.pieceId)
        .single();
      const current = ((existing as { channel_assets?: Record<string, string | null> } | null)
        ?.channel_assets ?? {}) as Record<string, string | null>;
      const merged: Record<string, string> = { ...current } as Record<string, string>;
      for (const [k, v] of Object.entries(data.channelAssets)) {
        if (v === null) delete merged[k];
        else merged[k] = v;
      }
      (patch as unknown as { channel_assets: Record<string, string> }).channel_assets = merged;
    }
    if (data.cta !== undefined) patch.cta = data.cta;
    if (data.content !== undefined) patch.content = data.content;

    const { error } = await context.supabase
      .from("content_pieces_v2")
      .update(patch)
      .eq("id", data.pieceId);
    if (error) throw new Error(error.message);

    // When channels change, add missing copy rows for newly-added channels.
    // (We do NOT delete copies for removed channels to preserve user data.)
    if (data.channels) {
      const { data: existing } = await context.supabase
        .from("piece_channel_copies")
        .select("channel")
        .eq("piece_id", data.pieceId);
      const existingSet = new Set((existing ?? []).map((r) => r.channel));
      const missing = data.channels.filter((c) => !existingSet.has(c));
      if (missing.length > 0) {
        await context.supabase
          .from("piece_channel_copies")
          .insert(missing.map((ch) => ({ piece_id: data.pieceId, channel: ch, body: "" })));
      }
    }

    return { ok: true };
  });

export const deletePiece = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ pieceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("content_pieces_v2")
      .delete()
      .eq("id", data.pieceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Sub-structure ============
export const upsertCarouselSlide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ slideId: z.string().uuid(), text: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("piece_carousel_slides")
      .update({ text: data.text })
      .eq("id", data.slideId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertVideoSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        sectionId: z.string().uuid(),
        script: z.string().optional(),
        startTs: z.string().nullable().optional(),
        endTs: z.string().nullable().optional(),
        recordingNotes: z.string().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      script?: string;
      start_ts?: string | null;
      end_ts?: string | null;
      recording_notes?: string | null;
    } = {};
    if (data.script !== undefined) patch.script = data.script;
    if (data.startTs !== undefined) patch.start_ts = data.startTs;
    if (data.endTs !== undefined) patch.end_ts = data.endTs;
    if (data.recordingNotes !== undefined) patch.recording_notes = data.recordingNotes;
    const { error } = await context.supabase
      .from("piece_video_sections")
      .update(patch)
      .eq("id", data.sectionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertPoll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        pieceId: z.string().uuid(),
        question: z.string(),
        options: z.array(z.string()),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("piece_poll")
      .upsert(
        { piece_id: data.pieceId, question: data.question, options: data.options },
        { onConflict: "piece_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertChannelCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        pieceId: z.string().uuid(),
        channel: ChannelSchema,
        body: z.string(),
        hashtags: z.array(z.string()).default([]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("piece_channel_copies").upsert(
      {
        piece_id: data.pieceId,
        channel: data.channel,
        body: data.body,
        hashtags: data.hashtags,
      },
      { onConflict: "piece_id,channel" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
