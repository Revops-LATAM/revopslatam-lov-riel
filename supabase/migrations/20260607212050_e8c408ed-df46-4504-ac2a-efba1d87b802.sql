DO $$ BEGIN
  CREATE TYPE public.commission_status AS ENUM ('pendiente','aprobada','pagada','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  vendedor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  comision_padre_id uuid REFERENCES public.commissions(id) ON DELETE SET NULL,
  porcentaje numeric(6,3) NOT NULL DEFAULT 0,
  base_amount numeric(14,2) NOT NULL DEFAULT 0,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'CLP',
  estado public.commission_status NOT NULL DEFAULT 'pendiente',
  fecha_generacion date NOT NULL DEFAULT CURRENT_DATE,
  fecha_pago date,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commissions_ws ON public.commissions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_commissions_contract ON public.commissions(contract_id);
CREATE INDEX IF NOT EXISTS idx_commissions_vendedor ON public.commissions(vendedor_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commissions TO authenticated;
GRANT ALL ON public.commissions TO service_role;

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commissions_select_workspace_members"
  ON public.commissions FOR SELECT
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (
      public.has_permission(workspace_id, auth.uid(), 'finance_view')
      OR public.has_permission(workspace_id, auth.uid(), 'finance_manage')
      OR public.has_permission(workspace_id, auth.uid(), 'finance_commission_manage')
    )
  );

CREATE POLICY "commissions_modify_managers"
  ON public.commissions FOR ALL
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (
      public.has_permission(workspace_id, auth.uid(), 'finance_manage')
      OR public.has_permission(workspace_id, auth.uid(), 'finance_commission_manage')
    )
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (
      public.has_permission(workspace_id, auth.uid(), 'finance_manage')
      OR public.has_permission(workspace_id, auth.uid(), 'finance_commission_manage')
    )
  );

CREATE TRIGGER trg_commissions_updated_at
  BEFORE UPDATE ON public.commissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.generate_commission_on_first_invoice()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_contract public.contracts%ROWTYPE;
  v_base numeric(14,2);
  v_pct numeric(6,3);
BEGIN
  IF NEW.status <> 'paid' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN RETURN NEW; END IF;

  SELECT * INTO v_contract FROM public.contracts WHERE id = NEW.contract_id;
  IF v_contract.vendedor_id IS NULL THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM public.commissions
     WHERE contract_id = NEW.contract_id
       AND vendedor_id = v_contract.vendedor_id
       AND comision_padre_id IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(cf.fee_total, NEW.amount) INTO v_base
    FROM public.contract_financials cf WHERE cf.contract_id = NEW.contract_id;
  v_base := COALESCE(v_base, NEW.amount);
  v_pct := 5.0;

  INSERT INTO public.commissions
    (workspace_id, contract_id, vendedor_id, porcentaje, base_amount, amount, currency, estado)
  VALUES
    (v_contract.workspace_id, NEW.contract_id, v_contract.vendedor_id,
     v_pct, v_base, ROUND(v_base * v_pct / 100.0, 2),
     COALESCE(v_contract.currency, NEW.currency, 'CLP'),
     'pendiente');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_commission_on_payment ON public.contract_payments;
CREATE TRIGGER trg_generate_commission_on_payment
  AFTER INSERT OR UPDATE OF status ON public.contract_payments
  FOR EACH ROW EXECUTE FUNCTION public.generate_commission_on_first_invoice();

UPDATE public.role_templates
   SET permissions = array_append(permissions, 'finance_commission_manage'::public.workspace_permission)
 WHERE name IN ('Finanzas','Admin completo')
   AND is_system = true
   AND NOT ('finance_commission_manage' = ANY(permissions));