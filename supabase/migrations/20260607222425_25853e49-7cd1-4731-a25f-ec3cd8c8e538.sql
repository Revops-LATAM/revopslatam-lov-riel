SELECT cron.schedule(
  'invoice-reminders-daily',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--310d0c09-7379-442d-bfc0-2277f67bc9bb.lovable.app/api/public/cron/invoice-reminders',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzemlhZ3ZwYnd5Z3dteXN2aXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwODg2ODcsImV4cCI6MjA5NTY2NDY4N30.nB-y2b1czmzZv69u-t_HvuEkuq4jcgiZoUOK-wZaICM"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);