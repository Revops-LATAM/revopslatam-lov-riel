// Server-only helpers for HubSpot Grilla sync.
// Kept in a .server.ts file because sibling helpers inside .functions.ts
// can trigger ReferenceError under the tss-serverfn-split transform.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const GATEWAY = "https://connector-gateway.lovable.dev/hubspot";

function authHeaders() {
  const lovable = process.env.LOVABLE_API_KEY;
  const hs = process.env.HUBSPOT_API_KEY;
  if (!lovable) throw new Error("LOVABLE_API_KEY no está configurado");
  if (!hs) throw new Error("HubSpot no está conectado. Conectá HubSpot desde Integraciones.");
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": hs,
    "Content-Type": "application/json",
  } as Record<string, string>;
}

export async function hubspotFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers as Record<string, string> | undefined) },
  });
  const text = await res.text();
  const body = text
    ? (() => {
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      })()
    : null;
  if (!res.ok) {
    const msg =
      typeof body === "string" ? body : (body as { message?: string })?.message ?? res.statusText;
    throw new Error(`HubSpot ${res.status}: ${msg}`);
  }
  return body;
}

export async function syncPieceCore(
  supabase: SupabaseClient<Database>,
  pieceId: string,
): Promise<{ ok: number; errors: string[] }> {
  const { data: piece, error: pErr } = await supabase
    .from("content_pieces_v2")
    .select("*")
    .eq("id", pieceId)
    .single();
  if (pErr) throw new Error(pErr.message);
  if (!piece.publish_at) throw new Error("La pieza no tiene fecha de publicación");
  if (new Date(piece.publish_at).getTime() <= Date.now())
    throw new Error("La fecha de publicación debe ser futura");

  const channelKeys = (piece.channels ?? []) as string[];
  if (channelKeys.length === 0) throw new Error("La pieza no tiene canales seleccionados");

  const { data: chRows } = await supabase
    .from("marketing_channels")
    .select("key, hubspot_channel_id")
    .eq("workspace_id", piece.workspace_id)
    .in("key", channelKeys);

  const mapByKey = new Map<string, string>();
  (chRows ?? []).forEach((r) => {
    if (r.hubspot_channel_id) mapByKey.set(r.key, r.hubspot_channel_id);
  });

  const { data: copies } = await supabase
    .from("piece_channel_copies")
    .select("channel, body, hashtags")
    .eq("piece_id", pieceId);

  const existingIds = (piece.hubspot_broadcast_ids ?? {}) as Record<string, string>;
  const nextIds: Record<string, string> = { ...existingIds };
  const errors: string[] = [];
  let ok = 0;

  const channelAssets =
    ((piece as unknown as { channel_assets?: Record<string, string | null> }).channel_assets ??
      {}) as Record<string, string | null>;

  const resolveAssetUrl = async (raw: string | null | undefined): Promise<string | null> => {
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    const { data, error } = await supabase.storage
      .from("marketing-assets")
      .createSignedUrl(raw, 60 * 60 * 24 * 365);
    if (error) return null;
    return data.signedUrl;
  };

  for (const key of channelKeys) {
    const guid = mapByKey.get(key);
    if (!guid) continue;

    const copy = (copies ?? []).find((c) => c.channel === key);
    const body = [
      (copy?.body ?? "").trim() || piece.content || piece.title || "",
      ((copy?.hashtags as string[] | null) ?? []).join(" "),
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim();

    const rawAsset = channelAssets[key] ?? piece.asset_url ?? null;
    const assetUrl = await resolveAssetUrl(rawAsset);

    const payload: Record<string, unknown> = {
      channelGuid: guid,
      triggerAt: new Date(piece.publish_at).getTime(),
      content: { body },
    };
    if (assetUrl) {
      (payload.content as Record<string, unknown>).photoUrl = assetUrl;
    }


    try {
      const existing = existingIds[key];
      if (existing) {
        await hubspotFetch(`/broadcast/v1/broadcasts/${encodeURIComponent(existing)}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        nextIds[key] = existing;
      } else {
        const created = (await hubspotFetch(`/broadcast/v1/broadcasts`, {
          method: "POST",
          body: JSON.stringify(payload),
        })) as { broadcastGuid?: string; id?: string };
        const id = String(created.broadcastGuid ?? created.id ?? "");
        if (id) nextIds[key] = id;
      }
      ok++;
    } catch (e) {
      errors.push(`${key}: ${(e as Error).message}`);
    }
  }

  await supabase
    .from("content_pieces_v2")
    .update({
      hubspot_broadcast_ids: nextIds,
      hubspot_synced_at: new Date().toISOString(),
      hubspot_last_error: errors.length ? errors.join(" | ") : null,
    })
    .eq("id", pieceId);

  if (ok === 0 && errors.length === 0) {
    throw new Error("Ningún canal de esta pieza está mapeado a HubSpot");
  }
  if (errors.length && ok === 0) throw new Error(errors.join(" | "));
  return { ok, errors };
}

export async function unsyncPieceCore(
  supabase: SupabaseClient<Database>,
  pieceId: string,
): Promise<void> {
  const { data: piece, error: pErr } = await supabase
    .from("content_pieces_v2")
    .select("id, hubspot_broadcast_ids")
    .eq("id", pieceId)
    .single();
  if (pErr) throw new Error(pErr.message);
  const ids = (piece.hubspot_broadcast_ids ?? {}) as Record<string, string>;
  for (const id of Object.values(ids)) {
    try {
      await hubspotFetch(`/broadcast/v1/broadcasts/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    } catch {
      // ignore individual failures
    }
  }
  await supabase
    .from("content_pieces_v2")
    .update({ hubspot_broadcast_ids: {}, hubspot_synced_at: null, hubspot_last_error: null })
    .eq("id", pieceId);
}
