
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
DECLARE
  v_first_owner uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin'::public.app_role) THEN
    SELECT owner_id INTO v_first_owner
      FROM public.workspaces
     WHERE owner_id IS NOT NULL
     ORDER BY created_at ASC
     LIMIT 1;
    IF v_first_owner IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (v_first_owner, 'super_admin'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;
END $$;
