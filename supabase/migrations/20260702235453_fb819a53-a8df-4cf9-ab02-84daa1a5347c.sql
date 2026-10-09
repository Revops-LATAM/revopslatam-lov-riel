
-- RPC: list_workspace_payments
-- Consolidates the 3 queries + Node UF-resolution loop in listWorkspacePayments()
-- into a single indexed SQL call. UF resolution replicates ufForDate():
--   1) exact date, 2) nearest previous day (within 30d), 3) latest known.
-- Returns one row per contract_payment with all display fields pre-joined.

CREATE OR REPLACE FUNCTION public.list_workspace_payments(
  _workspace_id uuid,
  _status text DEFAULT NULL,
  _from_date date DEFAULT NULL,
  _to_date date DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  contract_id uuid,
  milestone_id uuid,
  service_line_id uuid,
  kind text,
  amount numeric,
  currency text,
  due_date date,
  paid_at timestamptz,
  status text,
  period_label text,
  notes text,
  ready_to_invoice boolean,
  invoice_id uuid,
  created_at timestamptz,
  contract_name text,
  account_name text,
  description text,
  fecha_emision date,
  emitido_at timestamptz,
  monto_clp numeric,
  uf_usada numeric,
  uf_fecha date,
  es_uf_estimada boolean,
  folio_sii text,
  has_pdf boolean,
  pdf_url text,
  invoice_estado text
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH today AS (
    SELECT (now() AT TIME ZONE 'America/Santiago')::date AS d
  ),
  latest_uf AS (
    SELECT rate_to_base AS valor, rate_date AS fecha
    FROM public.currency_rates
    WHERE workspace_id = _workspace_id
      AND currency = 'UF' AND base_currency = 'CLP'
    ORDER BY rate_date DESC
    LIMIT 1
  ),
  base AS (
    SELECT
      cp.id, cp.contract_id, cp.milestone_id, cp.service_line_id,
      cp.kind::text, cp.amount, cp.currency, cp.due_date, cp.paid_at,
      cp.status::text, cp.period_label, cp.notes, cp.ready_to_invoice,
      cp.invoice_id, cp.created_at,
      c.name AS contract_name,
      a.name AS account_name,
      inv.id AS inv_id,
      inv.fecha_emision, inv.emitido_at, inv.monto_clp AS inv_monto_clp,
      inv.folio_sii, inv.pdf_url, inv.estado::text AS invoice_estado,
      inv.descripcion AS inv_desc,
      ml.name AS milestone_name,
      sl.descripcion AS service_line_desc
    FROM public.contract_payments cp
    JOIN public.contracts c ON c.id = cp.contract_id
    LEFT JOIN public.accounts a ON a.id = c.account_id
    LEFT JOIN public.invoices inv ON inv.id = cp.invoice_id
    LEFT JOIN public.milestones ml ON ml.id = cp.milestone_id
    LEFT JOIN public.contract_service_lines sl ON sl.id = cp.service_line_id
    WHERE c.workspace_id = _workspace_id
      AND c.is_partner = false
      AND (
        _status IS NULL
        OR (_status = 'overdue' AND cp.status::text IN ('scheduled','invoiced')
             AND cp.due_date < (SELECT d FROM today))
        OR (_status <> 'overdue' AND cp.status::text = _status)
      )
      AND (_from_date IS NULL OR cp.due_date >= _from_date)
      AND (_to_date IS NULL OR cp.due_date <= _to_date)
  ),
  resolved AS (
    SELECT
      b.*,
      CASE
        WHEN b.currency = 'UF' THEN
          CASE
            WHEN b.status IN ('invoiced','paid')
              THEN COALESCE(b.fecha_emision, b.emitido_at::date, b.due_date)
            ELSE (SELECT d FROM today)
          END
        ELSE NULL
      END AS uf_ref_date
    FROM base b
  ),
  with_uf AS (
    SELECT r.*,
      uf.rate_to_base AS uf_valor,
      uf.rate_date AS uf_fecha_row,
      uf.diff_days
    FROM resolved r
    LEFT JOIN LATERAL (
      SELECT cr.rate_to_base, cr.rate_date,
             (r.uf_ref_date - cr.rate_date) AS diff_days
      FROM public.currency_rates cr
      WHERE r.uf_ref_date IS NOT NULL
        AND cr.workspace_id = _workspace_id
        AND cr.currency = 'UF' AND cr.base_currency = 'CLP'
        AND cr.rate_date <= r.uf_ref_date
        AND cr.rate_date >= (r.uf_ref_date - INTERVAL '30 days')::date
      ORDER BY cr.rate_date DESC
      LIMIT 1
    ) uf ON TRUE
  )
  SELECT
    w.id, w.contract_id, w.milestone_id, w.service_line_id, w.kind,
    w.amount, w.currency, w.due_date, w.paid_at, w.status,
    w.period_label, w.notes, w.ready_to_invoice, w.invoice_id, w.created_at,
    w.contract_name, w.account_name,
    COALESCE(w.service_line_desc, w.milestone_name, w.inv_desc, w.notes,
             CASE WHEN w.period_label IS NOT NULL THEN w.kind || ' · ' || w.period_label ELSE w.kind END
    ) AS description,
    w.fecha_emision, w.emitido_at,
    CASE
      WHEN w.currency = 'UF' THEN
        CASE
          WHEN w.status IN ('invoiced','paid') AND w.inv_monto_clp IS NOT NULL THEN w.inv_monto_clp
          ELSE ROUND(COALESCE(w.amount,0) * COALESCE(w.uf_valor, (SELECT valor FROM latest_uf), 38500))
        END
      WHEN w.currency = 'CLP' THEN COALESCE(w.inv_monto_clp, w.amount)
      ELSE w.inv_monto_clp
    END AS monto_clp,
    CASE WHEN w.currency = 'UF'
      THEN COALESCE(w.uf_valor, (SELECT valor FROM latest_uf)) END AS uf_usada,
    CASE WHEN w.currency = 'UF'
      THEN COALESCE(w.uf_fecha_row, (SELECT fecha FROM latest_uf)) END AS uf_fecha,
    CASE WHEN w.currency = 'UF'
      THEN (w.uf_valor IS NULL OR COALESCE(w.diff_days, 0) > 7) ELSE false END AS es_uf_estimada,
    w.folio_sii,
    (w.pdf_url IS NOT NULL) AS has_pdf,
    w.pdf_url,
    w.invoice_estado
  FROM with_uf w
  ORDER BY w.due_date ASC
  LIMIT 2000;
$$;

GRANT EXECUTE ON FUNCTION public.list_workspace_payments(uuid, text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_workspace_payments(uuid, text, date, date) TO service_role;
