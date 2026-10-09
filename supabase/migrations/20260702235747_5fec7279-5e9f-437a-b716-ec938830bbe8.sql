
CREATE OR REPLACE FUNCTION public.get_finance_dashboard(_workspace_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH today AS (
    SELECT (now() AT TIME ZONE 'America/Santiago')::date AS d
  ),
  pays AS (
    SELECT cp.amount, cp.currency, cp.status::text AS status, cp.due_date
    FROM public.contract_payments cp
    JOIN public.contracts c ON c.id = cp.contract_id
    WHERE c.workspace_id = _workspace_id
      AND c.is_partner = false
  ),
  by_status AS (
    SELECT status, COUNT(*)::int AS n
    FROM pays GROUP BY status
  ),
  by_currency AS (
    SELECT
      currency,
      COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)::numeric AS paid,
      COALESCE(SUM(amount) FILTER (
        WHERE status IN ('scheduled','invoiced')
          AND (due_date IS NULL OR due_date >= (SELECT d FROM today))
      ), 0)::numeric AS scheduled,
      COALESCE(SUM(amount) FILTER (
        WHERE status IN ('scheduled','invoiced')
          AND due_date IS NOT NULL AND due_date < (SELECT d FROM today)
      ), 0)::numeric AS overdue
    FROM pays
    GROUP BY currency
  ),
  counts AS (
    SELECT
      COUNT(*) FILTER (
        WHERE status IN ('scheduled','invoiced')
          AND due_date IS NOT NULL AND due_date < (SELECT d FROM today)
      )::int AS overdue_count,
      COUNT(*) FILTER (
        WHERE status IN ('scheduled','invoiced')
          AND due_date IS NOT NULL AND due_date >= (SELECT d FROM today)
      )::int AS upcoming_count
    FROM pays
  )
  SELECT jsonb_build_object(
    'byStatus',      COALESCE((SELECT jsonb_object_agg(status, n) FROM by_status), '{}'::jsonb),
    'byCurrency',    COALESCE((SELECT jsonb_object_agg(currency, jsonb_build_object(
                        'scheduled', scheduled, 'paid', paid, 'overdue', overdue
                      )) FROM by_currency), '{}'::jsonb),
    'overdueCount',  (SELECT overdue_count  FROM counts),
    'upcomingCount', (SELECT upcoming_count FROM counts)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_finance_dashboard(uuid) TO authenticated, service_role;
