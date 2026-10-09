
-- Auto-advance sprint/phase statuses when their start date arrives
CREATE OR REPLACE FUNCTION public.auto_advance_sprint_phase_statuses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.sprints
     SET status = 'en_curso'
   WHERE status IN ('por_planificar','planificado')
     AND start_date <= CURRENT_DATE
     AND end_date   >= CURRENT_DATE;

  UPDATE public.phases
     SET status = 'en_curso'
   WHERE status = 'sin_iniciar'
     AND start_date IS NOT NULL
     AND start_date <= CURRENT_DATE
     AND (end_date IS NULL OR end_date >= CURRENT_DATE);
END;
$$;

-- Run once now to sync current data
SELECT public.auto_advance_sprint_phase_statuses();

-- Schedule daily at 00:05 UTC
DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'auto-advance-sprint-phase-statuses';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
  PERFORM cron.schedule(
    'auto-advance-sprint-phase-statuses',
    '5 0 * * *',
    $cron$ SELECT public.auto_advance_sprint_phase_statuses(); $cron$
  );
END $$;
