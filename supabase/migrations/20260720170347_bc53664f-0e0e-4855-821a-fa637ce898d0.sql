
DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
  ws_id uuid := 'd90e7950-0e6f-497e-a4c7-4b73a29a69c2';
  inviter uuid;
BEGIN
  SELECT user_id INTO inviter FROM public.workspace_members WHERE workspace_id = ws_id AND role IN ('owner','admin') LIMIT 1;
  IF inviter IS NULL THEN
    SELECT user_id INTO inviter FROM public.workspace_members WHERE workspace_id = ws_id LIMIT 1;
  END IF;

  INSERT INTO public.workspace_invitations (workspace_id, email, role, invited_by)
  VALUES (ws_id, 'camila@revopslatam.com', 'member', inviter)
  ON CONFLICT DO NOTHING;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', new_user_id, 'authenticated', 'authenticated',
    'camila@revopslatam.com', crypt(gen_random_uuid()::text, gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Camila Rossi"}'::jsonb,
    now(), now(), '', '', '', ''
  );

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new_user_id, 'camila@revopslatam.com', 'Camila Rossi')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (ws_id, new_user_id, 'member')
  ON CONFLICT DO NOTHING;
END $$;
