DROP TRIGGER IF EXISTS trg_ensure_partner_account ON public.partners;

CREATE OR REPLACE FUNCTION public.ensure_partner_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
  v_slug text;
  v_creator uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.partner_account_id IS NOT NULL THEN
      UPDATE public.accounts SET name = NEW.name WHERE id = NEW.partner_account_id;
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.partner_account_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT owner_id INTO v_creator FROM public.workspaces WHERE id = NEW.workspace_id;
  v_slug := lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || substr(md5(NEW.id::text), 1, 6);

  INSERT INTO public.accounts (workspace_id, name, slug, status, created_by, partner_id)
  VALUES (NEW.workspace_id, NEW.name, v_slug, 'active', v_creator, NEW.id)
  RETURNING id INTO v_account_id;

  UPDATE public.partners SET partner_account_id = v_account_id WHERE id = NEW.id;

  RETURN NEW;
END
$$;

CREATE TRIGGER trg_ensure_partner_account_ins
AFTER INSERT ON public.partners
FOR EACH ROW EXECUTE FUNCTION public.ensure_partner_account();

CREATE TRIGGER trg_ensure_partner_account_upd
BEFORE UPDATE OF name ON public.partners
FOR EACH ROW EXECUTE FUNCTION public.ensure_partner_account();