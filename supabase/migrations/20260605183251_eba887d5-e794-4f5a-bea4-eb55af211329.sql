
-- 1) service_types catalog
CREATE TABLE public.service_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  descripcion text,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_types TO authenticated;
GRANT ALL ON public.service_types TO service_role;
ALTER TABLE public.service_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_types_select" ON public.service_types FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "service_types_write" ON public.service_types FOR ALL TO authenticated
USING (
  public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
  OR public.has_permission(workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission)
)
WITH CHECK (
  public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
  OR public.has_permission(workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission)
);

CREATE TRIGGER trg_service_types_updated BEFORE UPDATE ON public.service_types
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Add service_type_id to contract_service_lines
ALTER TABLE public.contract_service_lines
  ADD COLUMN service_type_id uuid REFERENCES public.service_types(id) ON DELETE SET NULL;

-- 3) contract_service_milestones
CREATE TABLE public.contract_service_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_line_id uuid NOT NULL REFERENCES public.contract_service_lines(id) ON DELETE CASCADE,
  numero_hito integer NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  monto numeric(14,2),
  moneda text NOT NULL DEFAULT 'CLP',
  fecha_estimada date,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_csm_service_line ON public.contract_service_milestones(service_line_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_service_milestones TO authenticated;
GRANT ALL ON public.contract_service_milestones TO service_role;
ALTER TABLE public.contract_service_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "csm_select" ON public.contract_service_milestones FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.contract_service_lines csl
  JOIN public.contracts c ON c.id = csl.contract_id
  WHERE csl.id = contract_service_milestones.service_line_id
    AND public.is_workspace_member(c.workspace_id, auth.uid())
));

CREATE POLICY "csm_write" ON public.contract_service_milestones FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.contract_service_lines csl
  JOIN public.contracts c ON c.id = csl.contract_id
  WHERE csl.id = contract_service_milestones.service_line_id
    AND (
      public.has_workspace_role(c.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
      OR public.has_permission(c.workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission)
    )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.contract_service_lines csl
  JOIN public.contracts c ON c.id = csl.contract_id
  WHERE csl.id = contract_service_milestones.service_line_id
    AND (
      public.has_workspace_role(c.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
      OR public.has_permission(c.workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission)
    )
));

CREATE TRIGGER trg_csm_updated BEFORE UPDATE ON public.contract_service_milestones
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) New columns on contracts
ALTER TABLE public.contracts
  ADD COLUMN dia_facturacion integer CHECK (dia_facturacion IS NULL OR (dia_facturacion BETWEEN 1 AND 31)),
  ADD COLUMN fecha_primera_facturacion date,
  ADD COLUMN observaciones text,
  ADD COLUMN duracion_tipo text NOT NULL DEFAULT 'meses' CHECK (duracion_tipo IN ('meses','indefinido','manual'));
