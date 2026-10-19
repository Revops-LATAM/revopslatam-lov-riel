REVOKE EXECUTE ON FUNCTION
  public.enqueue_email(text, jsonb),
  public.read_email_batch(text, integer, integer),
  public.delete_email(text, bigint),
  public.move_to_dlq(text, text, bigint, jsonb)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.enqueue_email(text, jsonb),
  public.read_email_batch(text, integer, integer),
  public.delete_email(text, bigint),
  public.move_to_dlq(text, text, bigint, jsonb)
TO service_role;