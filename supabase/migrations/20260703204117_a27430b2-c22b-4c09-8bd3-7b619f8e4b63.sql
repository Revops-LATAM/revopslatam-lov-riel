
ALTER TABLE public.content_pieces_v2
  ADD COLUMN IF NOT EXISTS hubspot_broadcast_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS hubspot_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS hubspot_last_error text;

ALTER TABLE public.marketing_channels
  ADD COLUMN IF NOT EXISTS hubspot_channel_id text;
