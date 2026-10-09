
REVOKE EXECUTE ON FUNCTION public.confirm_calendar_meeting(uuid, uuid, uuid, uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_calendar_meeting(uuid, uuid, uuid, uuid, int) TO authenticated;
