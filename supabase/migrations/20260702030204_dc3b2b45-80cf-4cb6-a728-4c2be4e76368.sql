DROP INDEX IF EXISTS public.uniq_invoice_lines_contract_payment_not_null;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_active_invoice_payment_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_new_invoice_active boolean;
  v_conflict_invoice uuid;
BEGIN
  IF NEW.contract_payment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT i.estado <> 'cancelled'
    INTO v_new_invoice_active
  FROM public.invoices i
  WHERE i.id = NEW.invoice_id;

  IF COALESCE(v_new_invoice_active, false) = false THEN
    RETURN NEW;
  END IF;

  SELECT il.invoice_id
    INTO v_conflict_invoice
  FROM public.invoice_lines il
  JOIN public.invoices i ON i.id = il.invoice_id
  WHERE il.contract_payment_id = NEW.contract_payment_id
    AND il.id IS DISTINCT FROM NEW.id
    AND i.estado <> 'cancelled'
  LIMIT 1;

  IF v_conflict_invoice IS NOT NULL THEN
    RAISE EXCEPTION 'La cuota ya está asociada a otra factura activa';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_active_invoice_payment_line ON public.invoice_lines;
CREATE TRIGGER trg_prevent_duplicate_active_invoice_payment_line
BEFORE INSERT OR UPDATE OF contract_payment_id, invoice_id ON public.invoice_lines
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_active_invoice_payment_line();