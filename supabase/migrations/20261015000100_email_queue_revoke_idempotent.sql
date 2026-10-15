-- Riel 2.0 / Seguridad: asegura que las funciones de la cola de correos solo las ejecute el
-- servidor. Idempotente: si los permisos ya estaban restringidos, no cambia nada.
-- email_queue_wake es una función de trigger (no necesita EXECUTE para dispararse) y
-- email_queue_dispatch la invoca pg_cron como postgres.
REVOKE ALL ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO service_role;
