
CREATE TABLE public.client_portal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.client_ticket_forms(id) ON DELETE CASCADE,
  email text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('magic', 'session')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX client_portal_tokens_lookup_idx
  ON public.client_portal_tokens (form_id, email, kind);

GRANT ALL ON public.client_portal_tokens TO service_role;
ALTER TABLE public.client_portal_tokens ENABLE ROW LEVEL SECURITY;

-- No policies: only service_role (bypasses RLS) may access.

ALTER TABLE public.task_comments
  ADD COLUMN IF NOT EXISTS client_author_email text;
