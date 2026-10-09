
-- 1. Partner -> Account 1:1
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS partner_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS partners_partner_account_id_uq
  ON public.partners(partner_account_id) WHERE partner_account_id IS NOT NULL;

-- 2. Mark partner-owned contracts so finance can hide them
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS is_partner boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS contracts_is_partner_idx ON public.contracts(is_partner);

-- 3. Trigger: ensure partner has an account
CREATE OR REPLACE FUNCTION public.ensure_partner_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_account_id uuid;
  v_slug text;
  v_creator uuid;
BEGIN
  IF NEW.partner_account_id IS NOT NULL THEN
    UPDATE public.accounts SET name = NEW.name WHERE id = NEW.partner_account_id;
    RETURN NEW;
  END IF;

  SELECT owner_id INTO v_creator FROM public.workspaces WHERE id = NEW.workspace_id;
  v_slug := lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || substr(md5(COALESCE(NEW.id::text, gen_random_uuid()::text)), 1, 6);

  INSERT INTO public.accounts (workspace_id, name, slug, status, created_by, partner_id)
  VALUES (NEW.workspace_id, NEW.name, v_slug, 'active', v_creator, NEW.id)
  RETURNING id INTO v_account_id;

  NEW.partner_account_id := v_account_id;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_ensure_partner_account ON public.partners;
CREATE TRIGGER trg_ensure_partner_account
  BEFORE INSERT OR UPDATE OF name ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.ensure_partner_account();

-- 4. Backfill existing partners
DO $bf$
DECLARE
  r record;
  v_account_id uuid;
  v_slug text;
  v_creator uuid;
BEGIN
  FOR r IN SELECT * FROM public.partners WHERE partner_account_id IS NULL LOOP
    SELECT owner_id INTO v_creator FROM public.workspaces WHERE id = r.workspace_id;
    v_slug := lower(regexp_replace(r.name, '[^a-zA-Z0-9]+', '-', 'g'))
              || '-' || substr(md5(r.id::text), 1, 6);
    INSERT INTO public.accounts (workspace_id, name, slug, status, created_by, partner_id)
    VALUES (r.workspace_id, r.name, v_slug, 'active', v_creator, r.id)
    RETURNING id INTO v_account_id;
    UPDATE public.partners SET partner_account_id = v_account_id WHERE id = r.id;
  END LOOP;
END
$bf$;

-- 5. Revise validate_task_anchors: partner projects now have real (hidden) contracts,
--    so go through the normal contract-based validation path. Keep the special branch
--    only for 'internal_no_contract'.
CREATE OR REPLACE FUNCTION public.validate_task_anchors()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  ctype public.contract_type;
  p_area public.area;
  p_billing text;
  ph_is_inbox boolean;
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    SELECT area, billing_mode INTO p_area, p_billing FROM public.projects WHERE id = NEW.project_id;
    IF p_area IS NOT NULL THEN
      NEW.area := p_area;
    END IF;
  END IF;

  IF NEW.area IN ('marketing', 'internal') THEN
    NEW.contract_id := NULL;
    NEW.sprint_id := NULL;
    NEW.phase_id := NULL;
  ELSIF p_billing = 'internal_no_contract' THEN
    NEW.contract_id := NULL;
    NEW.sprint_id := NULL;
    NEW.phase_id := NULL;
  ELSE
    IF NEW.contract_id IS NULL THEN
      RAISE EXCEPTION 'tasks in operations area require contract_id';
    END IF;
    SELECT c.type INTO ctype FROM public.contracts c WHERE c.id = NEW.contract_id;
    IF NEW.phase_id IS NOT NULL THEN
      SELECT is_ticket_inbox INTO ph_is_inbox FROM public.phases WHERE id = NEW.phase_id;
    END IF;
    IF ctype = 'implementation' AND NEW.sprint_id IS NOT NULL THEN
      RAISE EXCEPTION 'implementation contract tasks cannot have sprint_id';
    END IF;
    IF ctype = 'recurrente' AND NEW.phase_id IS NOT NULL AND COALESCE(ph_is_inbox, false) = false THEN
      RAISE EXCEPTION 'recurrente contract tasks cannot have phase_id (except ticket inbox)';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 6. validate_project_billing_mode: partner projects ALLOWED to have contract_id
--    (we create one automatically). Keep partner_id requirement.
CREATE OR REPLACE FUNCTION public.validate_project_billing_mode()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.billing_mode = 'partner' THEN
    IF NEW.partner_id IS NULL THEN
      RAISE EXCEPTION 'partner projects require partner_id';
    END IF;
    -- contract_id is now ALLOWED (auto-created hidden partner contract)
  ELSIF NEW.billing_mode = 'internal' THEN
    NEW.partner_id := NULL;
  ELSIF NEW.billing_mode = 'internal_no_contract' THEN
    NEW.partner_id := NULL;
    NEW.contract_id := NULL;
  END IF;
  RETURN NEW;
END $function$;
