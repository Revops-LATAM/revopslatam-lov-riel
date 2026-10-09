
CREATE TABLE public.project_share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL DEFAULT 'gantt',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_project_share_tokens_project ON public.project_share_tokens(project_id);
CREATE INDEX idx_project_share_tokens_token ON public.project_share_tokens(token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_share_tokens TO authenticated;
GRANT ALL ON public.project_share_tokens TO service_role;

ALTER TABLE public.project_share_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "share tokens select by project members"
ON public.project_share_tokens FOR SELECT TO authenticated
USING (public.can_access_project(project_id, auth.uid()));

CREATE POLICY "share tokens insert by project editors"
ON public.project_share_tokens FOR INSERT TO authenticated
WITH CHECK (public.can_edit_project(project_id, auth.uid()) AND created_by = auth.uid());

CREATE POLICY "share tokens delete by project editors"
ON public.project_share_tokens FOR DELETE TO authenticated
USING (public.can_edit_project(project_id, auth.uid()));

CREATE POLICY "share tokens update by project editors"
ON public.project_share_tokens FOR UPDATE TO authenticated
USING (public.can_edit_project(project_id, auth.uid()))
WITH CHECK (public.can_edit_project(project_id, auth.uid()));
