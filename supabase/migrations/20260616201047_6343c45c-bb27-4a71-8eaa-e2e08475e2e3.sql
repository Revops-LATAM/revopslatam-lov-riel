ALTER TABLE public.workspace_emisor
  ADD COLUMN IF NOT EXISTS banco text,
  ADD COLUMN IF NOT EXISTS tipo_cuenta text,
  ADD COLUMN IF NOT EXISTS numero_cuenta text,
  ADD COLUMN IF NOT EXISTS email_finanzas text,
  ADD COLUMN IF NOT EXISTS cobranza_dias_recordatorio integer DEFAULT 7,
  ADD COLUMN IF NOT EXISTS cobranza_cc_emails text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS cobranza_activa boolean DEFAULT false;