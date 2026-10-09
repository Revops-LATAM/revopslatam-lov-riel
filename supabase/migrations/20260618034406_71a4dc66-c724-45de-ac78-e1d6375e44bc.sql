ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS sla_id uuid REFERENCES public.slas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projects_sla_id ON public.projects(sla_id);