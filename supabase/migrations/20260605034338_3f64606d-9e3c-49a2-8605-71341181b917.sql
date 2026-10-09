
-- ============================================================
-- CONTRACTS: nuevas columnas
-- ============================================================
ALTER TABLE public.contracts
  ADD COLUMN modo public.contract_mode NOT NULL DEFAULT 'simple',
  ADD COLUMN vendedor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN comision_pct numeric(5,2) NOT NULL DEFAULT 6,
  ADD COLUMN puede_renovarse boolean NOT NULL DEFAULT false,
  ADD COLUMN anticipacion_renovacion_dias integer,
  ADD COLUMN fecha_aviso_renovacion date,
  ADD COLUMN contrato_padre_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  ADD COLUMN notas_comerciales text,
  ADD COLUMN legacy_milestone_billing boolean NOT NULL DEFAULT false;

UPDATE public.contracts SET legacy_milestone_billing = true;

-- ============================================================
-- CONTRACT_SERVICE_LINES
-- ============================================================
CREATE TABLE public.contract_service_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  tipo_servicio text NOT NULL,
  descripcion text,
  frecuencia public.service_frequency NOT NULL,
  numero_cuotas integer,
  monto numeric(14,2),
  moneda text NOT NULL DEFAULT 'CLP',
  es_bono boolean NOT NULL DEFAULT false,
  fecha_primer_pago date,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_service_lines TO authenticated;
GRANT ALL ON public.contract_service_lines TO service_role;
ALTER TABLE public.contract_service_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "csl_select" ON public.contract_service_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = contract_id AND public.is_workspace_member(c.workspace_id, auth.uid())));
CREATE POLICY "csl_write" ON public.contract_service_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = contract_id
    AND (public.has_workspace_role(c.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
         OR public.has_permission(c.workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = contract_id
    AND (public.has_workspace_role(c.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
         OR public.has_permission(c.workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission))));
CREATE INDEX idx_csl_contract ON public.contract_service_lines(contract_id);
CREATE TRIGGER trg_csl_updated BEFORE UPDATE ON public.contract_service_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- CONTRACT_PAYMENTS: nuevas columnas
-- ============================================================
ALTER TABLE public.contract_payments
  ADD COLUMN service_line_id uuid REFERENCES public.contract_service_lines(id) ON DELETE SET NULL,
  ADD COLUMN ready_to_invoice boolean NOT NULL DEFAULT false;
CREATE INDEX idx_payments_service_line ON public.contract_payments(service_line_id);

-- ============================================================
-- PROJECTS: nuevas columnas
-- ============================================================
ALTER TABLE public.projects
  ADD COLUMN delivery_type public.project_delivery_type,
  ADD COLUMN state public.project_state NOT NULL DEFAULT 'planificacion',
  ADD COLUMN margen_objetivo_pct numeric(5,2) NOT NULL DEFAULT 40,
  ADD COLUMN horas_presupuestadas_total numeric(10,2),
  ADD COLUMN margen_estimado_pct numeric(6,2),
  ADD COLUMN alerta_margen boolean NOT NULL DEFAULT false,
  ADD COLUMN lead_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN fecha_inicio_delivery date,
  ADD COLUMN fecha_entrega_objetivo date;

-- ============================================================
-- PROJECT_SERVICE_LINES
-- ============================================================
CREATE TABLE public.project_service_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  service_line_id uuid NOT NULL REFERENCES public.contract_service_lines(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, service_line_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_service_lines TO authenticated;
GRANT ALL ON public.project_service_lines TO service_role;
ALTER TABLE public.project_service_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "psl_select" ON public.project_service_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.is_workspace_member(p.workspace_id, auth.uid())));
CREATE POLICY "psl_write" ON public.project_service_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id
    AND (public.has_workspace_role(p.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
         OR public.has_permission(p.workspace_id, auth.uid(), 'ops_manage'::public.workspace_permission))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id
    AND (public.has_workspace_role(p.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
         OR public.has_permission(p.workspace_id, auth.uid(), 'ops_manage'::public.workspace_permission))));

-- ============================================================
-- PROJECT_HOUR_BUDGET
-- ============================================================
CREATE TABLE public.project_hour_budget (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  rol text NOT NULL,
  horas_estimadas numeric(10,2) NOT NULL DEFAULT 0,
  costo_hora numeric(10,2),
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_hour_budget TO authenticated;
GRANT ALL ON public.project_hour_budget TO service_role;
ALTER TABLE public.project_hour_budget ENABLE ROW LEVEL SECURITY;
CREATE POLICY "phb_select" ON public.project_hour_budget FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.is_workspace_member(p.workspace_id, auth.uid())));
CREATE POLICY "phb_write" ON public.project_hour_budget FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id
    AND (public.has_workspace_role(p.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
         OR public.has_permission(p.workspace_id, auth.uid(), 'ops_manage'::public.workspace_permission))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id
    AND (public.has_workspace_role(p.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
         OR public.has_permission(p.workspace_id, auth.uid(), 'ops_manage'::public.workspace_permission))));
CREATE INDEX idx_phb_project ON public.project_hour_budget(project_id);
CREATE TRIGGER trg_phb_updated BEFORE UPDATE ON public.project_hour_budget FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- MEMBER_COST_RATES
-- ============================================================
CREATE TABLE public.member_cost_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  costo_hora numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'CLP',
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id, effective_from)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_cost_rates TO authenticated;
GRANT ALL ON public.member_cost_rates TO service_role;
ALTER TABLE public.member_cost_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mcr_select" ON public.member_cost_rates FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid())
    AND (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
         OR public.has_permission(workspace_id, auth.uid(), 'finance_view'::public.workspace_permission)
         OR public.has_permission(workspace_id, auth.uid(), 'admin_capacity'::public.workspace_permission)));
CREATE POLICY "mcr_write" ON public.member_cost_rates FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
    OR public.has_permission(workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
    OR public.has_permission(workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission));
CREATE INDEX idx_mcr_ws_user ON public.member_cost_rates(workspace_id, user_id);
CREATE TRIGGER trg_mcr_updated BEFORE UPDATE ON public.member_cost_rates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- MILESTONE_HITO_LINKS
-- ============================================================
CREATE TABLE public.milestone_hito_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid NOT NULL REFERENCES public.milestones(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.contract_payments(id) ON DELETE CASCADE,
  tipo_vinculo public.milestone_link_type NOT NULL DEFAULT 'solo_referencia',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (milestone_id, payment_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.milestone_hito_links TO authenticated;
GRANT ALL ON public.milestone_hito_links TO service_role;
ALTER TABLE public.milestone_hito_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mhl_select" ON public.milestone_hito_links FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.milestones m JOIN public.projects p ON p.id = m.project_id
    WHERE m.id = milestone_id AND public.is_workspace_member(p.workspace_id, auth.uid())));
CREATE POLICY "mhl_write" ON public.milestone_hito_links FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.milestones m JOIN public.projects p ON p.id = m.project_id
    WHERE m.id = milestone_id
      AND (public.has_workspace_role(p.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
           OR public.has_permission(p.workspace_id, auth.uid(), 'ops_manage'::public.workspace_permission))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.milestones m JOIN public.projects p ON p.id = m.project_id
    WHERE m.id = milestone_id
      AND (public.has_workspace_role(p.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
           OR public.has_permission(p.workspace_id, auth.uid(), 'ops_manage'::public.workspace_permission))));
CREATE INDEX idx_mhl_milestone ON public.milestone_hito_links(milestone_id);
CREATE INDEX idx_mhl_payment ON public.milestone_hito_links(payment_id);

-- ============================================================
-- CONTRACT_HANDOFFS
-- ============================================================
CREATE TABLE public.contract_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  state public.handoff_state NOT NULL DEFAULT 'pendiente',
  margen_estimado_pct numeric(6,2),
  alerta_margen boolean NOT NULL DEFAULT false,
  asignado_a uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completado_at timestamptz,
  UNIQUE (contract_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_handoffs TO authenticated;
GRANT ALL ON public.contract_handoffs TO service_role;
ALTER TABLE public.contract_handoffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "handoff_select" ON public.contract_handoffs FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "handoff_write" ON public.contract_handoffs FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
    OR public.has_permission(workspace_id, auth.uid(), 'ops_manage'::public.workspace_permission)
    OR public.has_permission(workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[])
    OR public.has_permission(workspace_id, auth.uid(), 'ops_manage'::public.workspace_permission)
    OR public.has_permission(workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission));
CREATE INDEX idx_handoff_workspace_state ON public.contract_handoffs(workspace_id, state);
CREATE INDEX idx_handoff_contract ON public.contract_handoffs(contract_id);
CREATE TRIGGER trg_handoff_updated BEFORE UPDATE ON public.contract_handoffs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TRIGGERS / FUNCIONES
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_contract_activation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'active'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active')
     AND NEW.contrato_padre_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.contract_handoffs WHERE contract_id = NEW.id) THEN
    INSERT INTO public.contract_handoffs (contract_id, workspace_id, state)
    VALUES (NEW.id, NEW.workspace_id, 'pendiente');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_contract_activation AFTER INSERT OR UPDATE OF status ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.handle_contract_activation();

CREATE OR REPLACE FUNCTION public.handle_milestone_link_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'achieved' AND (OLD.status IS DISTINCT FROM 'achieved') THEN
    UPDATE public.contract_payments cp
       SET ready_to_invoice = true
      FROM public.milestone_hito_links l
     WHERE l.milestone_id = NEW.id
       AND l.tipo_vinculo = 'gatilla_facturacion'
       AND cp.id = l.payment_id
       AND cp.status = 'scheduled';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_milestone_link_billing AFTER UPDATE OF status ON public.milestones
  FOR EACH ROW EXECUTE FUNCTION public.handle_milestone_link_trigger();

CREATE OR REPLACE FUNCTION public.compute_project_margin(_project_id uuid)
RETURNS numeric LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_contract uuid; v_workspace uuid; v_revenue numeric := 0; v_cost numeric := 0; v_margin numeric; v_target numeric;
BEGIN
  SELECT p.contract_id, p.workspace_id, p.margen_objetivo_pct INTO v_contract, v_workspace, v_target
    FROM public.projects p WHERE p.id = _project_id;
  IF v_contract IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM(csl.monto * COALESCE(csl.numero_cuotas, 1)), 0) INTO v_revenue
    FROM public.project_service_lines psl
    JOIN public.contract_service_lines csl ON csl.id = psl.service_line_id
   WHERE psl.project_id = _project_id;

  IF v_revenue = 0 THEN
    SELECT COALESCE(cf.fee_total, 0) INTO v_revenue FROM public.contract_financials cf WHERE cf.contract_id = v_contract;
  END IF;

  SELECT COALESCE(SUM(phb.horas_estimadas * COALESCE(
    phb.costo_hora,
    (SELECT mcr.costo_hora FROM public.member_cost_rates mcr WHERE mcr.workspace_id = v_workspace ORDER BY mcr.effective_from DESC LIMIT 1),
    0)), 0) INTO v_cost
    FROM public.project_hour_budget phb WHERE phb.project_id = _project_id;

  IF v_revenue = 0 THEN v_margin := NULL;
  ELSE v_margin := ROUND(((v_revenue - v_cost) / v_revenue) * 100, 2); END IF;

  UPDATE public.projects
     SET margen_estimado_pct = v_margin,
         alerta_margen = (v_margin IS NOT NULL AND v_margin < v_target),
         horas_presupuestadas_total = (SELECT COALESCE(SUM(horas_estimadas),0) FROM public.project_hour_budget WHERE project_id = _project_id)
   WHERE id = _project_id;
  RETURN v_margin;
END;
$$;

-- ============================================================
-- MIGRACIÓN DE DATOS EXISTENTES
-- ============================================================
UPDATE public.contracts SET status = 'proyectado' WHERE status = 'draft';

INSERT INTO public.contract_service_lines
  (contract_id, tipo_servicio, descripcion, frecuencia, numero_cuotas, monto, moneda, orden)
SELECT c.id,
  CASE WHEN c.type = 'implementation' THEN 'Proyecto' ELSE 'Recurrente' END,
  c.name,
  CASE
    WHEN c.payment_schedule_type = 'monthly_fixed' THEN 'mensual'::public.service_frequency
    WHEN c.payment_schedule_type = 'per_milestone' THEN 'hitos'::public.service_frequency
    WHEN c.payment_schedule_type = 'mixed' THEN 'mensual'::public.service_frequency
    ELSE 'unica'::public.service_frequency
  END,
  NULL,
  COALESCE(cf.fee_total, cf.monthly_fee, 0),
  c.currency, 0
FROM public.contracts c
LEFT JOIN public.contract_financials cf ON cf.contract_id = c.id
WHERE NOT EXISTS (SELECT 1 FROM public.contract_service_lines csl WHERE csl.contract_id = c.id);

UPDATE public.projects p
   SET delivery_type = CASE c.type WHEN 'implementation' THEN 'proyecto'::public.project_delivery_type ELSE 'raas'::public.project_delivery_type END,
       state = 'en_curso'
  FROM public.contracts c
 WHERE p.contract_id = c.id AND p.delivery_type IS NULL;

INSERT INTO public.contract_handoffs (contract_id, workspace_id, state, completado_at)
SELECT c.id, c.workspace_id, 'completado', now()
  FROM public.contracts c
 WHERE EXISTS (SELECT 1 FROM public.projects p WHERE p.contract_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM public.contract_handoffs h WHERE h.contract_id = c.id);

INSERT INTO public.contract_handoffs (contract_id, workspace_id, state)
SELECT c.id, c.workspace_id, 'pendiente'
  FROM public.contracts c
 WHERE c.status = 'active'
   AND NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.contract_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM public.contract_handoffs h WHERE h.contract_id = c.id);
