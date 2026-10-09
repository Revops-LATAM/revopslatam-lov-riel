CREATE OR REPLACE FUNCTION public.handle_contract_activation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'activo'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'activo')
     AND NEW.contrato_padre_id IS NULL
     AND COALESCE(NEW.is_partner, false) = false
     AND NOT EXISTS (SELECT 1 FROM public.contract_handoffs WHERE contract_id = NEW.id) THEN
    INSERT INTO public.contract_handoffs (contract_id, workspace_id, state)
    VALUES (NEW.id, NEW.workspace_id, 'pendiente');
  END IF;
  RETURN NEW;
END;
$function$;

DELETE FROM public.contract_handoffs
WHERE contract_id IN (SELECT id FROM public.contracts WHERE is_partner = true);