ALTER TABLE public.client_ticket_authorized_emails
  ADD COLUMN IF NOT EXISTS portal_role text NOT NULL DEFAULT 'member';

ALTER TABLE public.client_ticket_authorized_emails
  DROP CONSTRAINT IF EXISTS client_ticket_authorized_emails_portal_role_check;

ALTER TABLE public.client_ticket_authorized_emails
  ADD CONSTRAINT client_ticket_authorized_emails_portal_role_check
  CHECK (portal_role IN ('member','leader'));