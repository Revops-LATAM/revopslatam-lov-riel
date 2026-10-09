ALTER TABLE public.sla_targets
  ADD COLUMN IF NOT EXISTS response_target_minutes integer;

COMMENT ON COLUMN public.sla_targets.response_target_minutes IS
  'First-response SLA in minutes. If NULL, fallback is max(15, round(target_minutes/4)).';