-- Riel 2.0 / Cuotas: generate_contract_monthly_payments pasa a ser idempotente.
-- Antes reinsertaba todos los meses y duplicaba los ya facturados (caso Antu Energía).
CREATE OR REPLACE FUNCTION public.generate_contract_monthly_payments(_contract_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  c public.contracts%ROWTYPE;
  cur_month date;     -- first day of the current month being scheduled
  due date;           -- computed due date for that month
  end_d date;
  first_due date;
  fee numeric(14,2);
  bday int;
  last_dom int;
BEGIN
  SELECT * INTO c FROM public.contracts WHERE id = _contract_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF c.payment_schedule_type <> 'monthly_fixed' AND c.payment_schedule_type <> 'mixed' THEN
    RETURN;
  END IF;

  SELECT cf.monthly_fee INTO fee FROM public.contract_financials cf WHERE cf.contract_id = _contract_id;
  IF fee IS NULL OR fee <= 0 THEN RETURN; END IF;

  -- Remove future scheduled monthly payments not yet paid/invoiced
  DELETE FROM public.contract_payments
   WHERE contract_id = _contract_id
     AND kind = 'monthly'
     AND status = 'scheduled';

  -- Anchor first invoice date
  IF c.fecha_primera_facturacion IS NOT NULL THEN
    first_due := c.fecha_primera_facturacion;
  ELSE
    bday := COALESCE(c.dia_facturacion, EXTRACT(DAY FROM c.start_date)::int);
    cur_month := date_trunc('month', c.start_date)::date;
    last_dom := EXTRACT(DAY FROM (cur_month + interval '1 month - 1 day'))::int;
    first_due := (cur_month + (LEAST(bday, last_dom) - 1) * interval '1 day')::date;
    -- If billing day already passed in start month, push to next month
    IF first_due < c.start_date THEN
      cur_month := (cur_month + interval '1 month')::date;
      last_dom := EXTRACT(DAY FROM (cur_month + interval '1 month - 1 day'))::int;
      first_due := (cur_month + (LEAST(bday, last_dom) - 1) * interval '1 day')::date;
    END IF;
  END IF;

  end_d := COALESCE(c.end_date, (c.start_date + interval '12 months')::date);
  bday := COALESCE(c.dia_facturacion, EXTRACT(DAY FROM first_due)::int);

  cur_month := date_trunc('month', first_due)::date;
  WHILE cur_month <= end_d LOOP
    last_dom := EXTRACT(DAY FROM (cur_month + interval '1 month - 1 day'))::int;
    due := (cur_month + (LEAST(bday, last_dom) - 1) * interval '1 day')::date;
    -- Idempotencia: si ya queda una cuota mensual ese mes (facturada, pagada, vencida o
    -- cancelada), no se vuelve a generar. Evita duplicar meses ya facturados.
    IF due <= end_d AND NOT EXISTS (
      SELECT 1 FROM public.contract_payments cp
       WHERE cp.contract_id = _contract_id
         AND cp.kind = 'monthly'
         AND date_trunc('month', cp.due_date) = cur_month
    ) THEN
      INSERT INTO public.contract_payments
        (contract_id, kind, amount, currency, due_date, status, period_label)
      VALUES
        (_contract_id, 'monthly', fee, c.currency, due, 'scheduled', to_char(cur_month, 'YYYY-MM'));
    END IF;
    cur_month := (cur_month + interval '1 month')::date;
  END LOOP;
END;
$function$;