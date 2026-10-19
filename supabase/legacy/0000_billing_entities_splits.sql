CREATE TABLE public.account_billing_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  rut text,
  razon_social text NOT NULL,
  giro text,
  direccion text,
  comuna text,
  email_facturacion text,
  cc_emails text[] NOT NULL DEFAULT '{}',
  is_primary boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  orden int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.account_billing_entities(account_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_billing_entities TO authenticated;
GRANT ALL ON public.account_billing_entities TO service_role;
ALTER TABLE public.account_billing_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY abe_select ON public.account_billing_entities FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND app_private.is_workspace_member(a.workspace_id, auth.uid())));
CREATE POLICY abe_write ON public.account_billing_entities FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND (app_private.has_workspace_role(a.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]) OR app_private.has_permission(a.workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND (app_private.has_workspace_role(a.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]) OR app_private.has_permission(a.workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission))));
CREATE TRIGGER abe_updated BEFORE UPDATE ON public.account_billing_entities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.contract_billing_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  billing_entity_id uuid NOT NULL REFERENCES public.account_billing_entities(id) ON DELETE CASCADE,
  monto numeric NOT NULL DEFAULT 0,
  orden int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, billing_entity_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_billing_splits TO authenticated;
GRANT ALL ON public.contract_billing_splits TO service_role;
ALTER TABLE public.contract_billing_splits ENABLE ROW LEVEL SECURITY;
CREATE POLICY cbs_select ON public.contract_billing_splits FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = contract_id AND app_private.is_workspace_member(c.workspace_id, auth.uid())));
CREATE POLICY cbs_write ON public.contract_billing_splits FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = contract_id AND (app_private.has_workspace_role(c.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]) OR app_private.has_permission(c.workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = contract_id AND (app_private.has_workspace_role(c.workspace_id, auth.uid(), ARRAY['owner','admin','super_admin']::public.workspace_role[]) OR app_private.has_permission(c.workspace_id, auth.uid(), 'finance_manage'::public.workspace_permission))));

ALTER TABLE public.contract_payments ADD COLUMN billing_entity_id uuid REFERENCES public.account_billing_entities(id) ON DELETE SET NULL;
ALTER TABLE public.invoices ADD COLUMN billing_entity_id uuid REFERENCES public.account_billing_entities(id) ON DELETE SET NULL;

-- Backfill primary entity
INSERT INTO public.account_billing_entities (account_id, rut, razon_social, giro, direccion, comuna, email_facturacion, is_primary)
SELECT id, tax_id, COALESCE(NULLIF(legal_name,''), name), business_activity, address, commune, billing_email, true
FROM public.accounts;

-- Split / re-merge scheduled installments of a contract
CREATE OR REPLACE FUNCTION public.apply_contract_billing_splits(_contract_id uuid)
RETURNS int LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  g record; s record; total numeric; n int := 0; cnt int;
BEGIN
  -- 1) merge back scheduled, non-invoiced split rows
  FOR g IN
    SELECT service_line_id, milestone_id, due_date, period_label, kind, currency, min(notes) notes,
           bool_or(ready_to_invoice) rti, sum(amount) amt, array_agg(id) ids
    FROM contract_payments
    WHERE contract_id = _contract_id AND billing_entity_id IS NOT NULL
      AND status = 'scheduled' AND invoice_id IS NULL
    GROUP BY service_line_id, milestone_id, due_date, period_label, kind, currency
  LOOP
    DELETE FROM contract_payments WHERE id = ANY(g.ids);
    INSERT INTO contract_payments(contract_id, service_line_id, milestone_id, kind, amount, currency, due_date, status, period_label, notes, ready_to_invoice)
    VALUES (_contract_id, g.service_line_id, g.milestone_id, g.kind, g.amt, g.currency, g.due_date, 'scheduled', g.period_label, g.notes, g.rti);
  END LOOP;

  SELECT count(*), COALESCE(sum(monto),0) INTO cnt, total FROM contract_billing_splits WHERE contract_id = _contract_id;
  IF cnt = 0 OR total <= 0 THEN RETURN 0; END IF;

  -- 2) split each scheduled, non-invoiced installment
  FOR g IN
    SELECT * FROM contract_payments
    WHERE contract_id = _contract_id AND billing_entity_id IS NULL
      AND status = 'scheduled' AND invoice_id IS NULL AND amount > 0
  LOOP
    FOR s IN SELECT * FROM contract_billing_splits WHERE contract_id = _contract_id ORDER BY orden LOOP
      INSERT INTO contract_payments(contract_id, service_line_id, milestone_id, kind, amount, currency, due_date, status, period_label, notes, ready_to_invoice, billing_entity_id)
      VALUES (_contract_id, g.service_line_id, g.milestone_id, g.kind,
        CASE WHEN g.amount = total THEN s.monto ELSE round(g.amount * s.monto / total, 2) END,
        g.currency, g.due_date, 'scheduled', g.period_label, g.notes, g.ready_to_invoice, s.billing_entity_id);
    END LOOP;
    DELETE FROM contract_payments WHERE id = g.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.apply_contract_billing_splits(uuid) TO authenticated;

-- Show razón social in payments list
CREATE OR REPLACE FUNCTION public.list_workspace_payments(_workspace_id uuid, _status text DEFAULT NULL::text, _from_date date DEFAULT NULL::date, _to_date date DEFAULT NULL::date)
 RETURNS TABLE(id uuid, contract_id uuid, milestone_id uuid, service_line_id uuid, kind text, amount numeric, currency text, due_date date, paid_at timestamp with time zone, status text, period_label text, notes text, ready_to_invoice boolean, invoice_id uuid, created_at timestamp with time zone, contract_name text, account_name text, description text, fecha_emision date, emitido_at timestamp with time zone, monto_clp numeric, uf_usada numeric, uf_fecha date, es_uf_estimada boolean, folio_sii text, has_pdf boolean, pdf_url text, invoice_estado text)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH today AS (SELECT (now() AT TIME ZONE 'America/Santiago')::date AS d),
  latest_uf AS (
    SELECT rate_to_base AS valor, rate_date AS fecha FROM public.currency_rates
    WHERE workspace_id = _workspace_id AND currency = 'UF' AND base_currency = 'CLP'
    ORDER BY rate_date DESC LIMIT 1
  ),
  base AS (
    SELECT cp.id, cp.contract_id, cp.milestone_id, cp.service_line_id,
      cp.kind::text, cp.amount, cp.currency, cp.due_date, cp.paid_at,
      cp.status::text, cp.period_label, cp.notes, cp.ready_to_invoice,
      cp.invoice_id, cp.created_at,
      c.name AS contract_name,
      CASE WHEN be.id IS NOT NULL THEN a.name || ' · ' || be.razon_social ELSE a.name END AS account_name,
      inv.id AS inv_id, inv.fecha_emision, inv.emitido_at, inv.monto_clp AS inv_monto_clp,
      inv.folio_sii, inv.pdf_url, inv.estado::text AS invoice_estado, inv.descripcion AS inv_desc,
      ml.name AS milestone_name, sl.descripcion AS service_line_desc
    FROM public.contract_payments cp
    JOIN public.contracts c ON c.id = cp.contract_id
    LEFT JOIN public.accounts a ON a.id = c.account_id
    LEFT JOIN public.account_billing_entities be ON be.id = cp.billing_entity_id
    LEFT JOIN public.invoices inv ON inv.id = cp.invoice_id
    LEFT JOIN public.milestones ml ON ml.id = cp.milestone_id
    LEFT JOIN public.contract_service_lines sl ON sl.id = cp.service_line_id
    WHERE c.workspace_id = _workspace_id AND c.is_partner = false
      AND (_status IS NULL
        OR (_status = 'overdue' AND cp.status::text IN ('scheduled','invoiced') AND cp.due_date < (SELECT d FROM today))
        OR (_status <> 'overdue' AND cp.status::text = _status))
      AND (_from_date IS NULL OR cp.due_date >= _from_date)
      AND (_to_date IS NULL OR cp.due_date <= _to_date)
  ),
  resolved AS (
    SELECT b.*, CASE WHEN b.currency = 'UF' THEN
      CASE WHEN b.status IN ('invoiced','paid') THEN COALESCE(b.fecha_emision, b.emitido_at::date, b.due_date) ELSE (SELECT d FROM today) END
      ELSE NULL END AS uf_ref_date
    FROM base b
  ),
  with_uf AS (
    SELECT r.*, uf.rate_to_base AS uf_valor, uf.rate_date AS uf_fecha_row, uf.diff_days
    FROM resolved r
    LEFT JOIN LATERAL (
      SELECT cr.rate_to_base, cr.rate_date, (r.uf_ref_date - cr.rate_date) AS diff_days
      FROM public.currency_rates cr
      WHERE r.uf_ref_date IS NOT NULL AND cr.workspace_id = _workspace_id
        AND cr.currency = 'UF' AND cr.base_currency = 'CLP'
        AND cr.rate_date <= r.uf_ref_date AND cr.rate_date >= (r.uf_ref_date - INTERVAL '30 days')::date
      ORDER BY cr.rate_date DESC LIMIT 1
    ) uf ON TRUE
  )
  SELECT w.id, w.contract_id, w.milestone_id, w.service_line_id, w.kind,
    w.amount, w.currency, w.due_date, w.paid_at, w.status,
    w.period_label, w.notes, w.ready_to_invoice, w.invoice_id, w.created_at,
    w.contract_name, w.account_name,
    COALESCE(w.service_line_desc, w.milestone_name, w.inv_desc, w.notes,
      CASE WHEN w.period_label IS NOT NULL THEN w.kind || ' · ' || w.period_label ELSE w.kind END) AS description,
    w.fecha_emision, w.emitido_at,
    CASE WHEN w.currency = 'UF' THEN
        CASE WHEN w.status IN ('invoiced','paid') AND w.inv_monto_clp IS NOT NULL THEN w.inv_monto_clp
          ELSE ROUND(COALESCE(w.amount,0) * COALESCE(w.uf_valor, (SELECT valor FROM latest_uf), 38500)) END
      WHEN w.currency = 'CLP' THEN COALESCE(w.inv_monto_clp, w.amount)
      ELSE w.inv_monto_clp END AS monto_clp,
    CASE WHEN w.currency = 'UF' THEN COALESCE(w.uf_valor, (SELECT valor FROM latest_uf)) END AS uf_usada,
    CASE WHEN w.currency = 'UF' THEN COALESCE(w.uf_fecha_row, (SELECT fecha FROM latest_uf)) END AS uf_fecha,
    CASE WHEN w.currency = 'UF' THEN (w.uf_valor IS NULL OR COALESCE(w.diff_days, 0) > 7) ELSE false END AS es_uf_estimada,
    w.folio_sii, (w.pdf_url IS NOT NULL) AS has_pdf, w.pdf_url, w.invoice_estado
  FROM with_uf w
  ORDER BY w.due_date ASC
  LIMIT 2000;
$function$;