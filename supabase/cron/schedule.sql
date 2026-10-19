-- Tareas programadas de Riel en el Supabase propio (pg_cron + pg_net).
-- Reemplaza las de Lovable Cloud, que llamaban a la URL de Lovable.
--
-- ANTES de ejecutar este archivo:
--  1) Database → Extensions: activar pg_cron y pg_net.
--  2) Guardar tres secretos en Vault (reemplaza los valores; NUNCA subas esto con valores reales):
--       select vault.create_secret('https://TU-DOMINIO',         'app_base_url');
--       select vault.create_secret('<clave service_role>',        'cron_service_role_key');
--       select vault.create_secret('<clave publishable (anon)>',  'cron_publishable_key');
--  3) Tener ya cargado el esquema (usa public.auto_advance_sprint_phase_statuses y public.purge_deleted_tasks).

create or replace function app_private.cron_post(_path text, _auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  secret text;
  hdrs jsonb;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'app_base_url';
  if base is null then raise exception 'Falta el secreto app_base_url en Vault'; end if;

  if _auth = 'service' then
    select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_service_role_key';
    hdrs := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret);
  else
    select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_publishable_key';
    hdrs := jsonb_build_object('Content-Type', 'application/json', 'apikey', secret);
  end if;
  if secret is null then raise exception 'Falta el secreto de la clave (%)', _auth; end if;

  perform net.http_post(url := base || _path, headers := hdrs, body := '{}'::jsonb);
end;
$$;
revoke all on function app_private.cron_post(text, text) from public, anon, authenticated;

-- cron.schedule con un nombre existente lo actualiza, así que este archivo se puede repetir.
select cron.schedule('auto-advance-sprint-phase-statuses', '5 * * * *',
  $$select public.auto_advance_sprint_phase_statuses()$$);
select cron.schedule('purge-deleted-tasks', '30 4 * * *',
  $$select public.purge_deleted_tasks()$$);
select cron.schedule('asana-sync-every-15min', '*/15 * * * *',
  $$select app_private.cron_post('/api/public/cron/asana-sync', 'service')$$);
select cron.schedule('asana-queue-worker', '* * * * *',
  $$select app_private.cron_post('/api/public/cron/asana-queue', 'service')$$);
select cron.schedule('dispatch-notifications', '*/2 * * * *',
  $$select app_private.cron_post('/api/public/cron/dispatch-notifications', 'publishable')$$);

-- Recordatorios de facturas vencidas (en Riel 1.0 nunca estuvo programado). Activar SOLO cuando los
-- dominios de correo estén verificados en Resend: envía correos reales a clientes.
-- select cron.schedule('invoice-reminders', '0 12 * * *',
--   $$select app_private.cron_post('/api/public/cron/invoice-reminders', 'service')$$);
