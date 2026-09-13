-- Execute only after reviewed production approval, migration023, and the matching
-- Edge Functions are deployed. This is deliberately NOT an automatic migration.
-- Fixed upstream pg_cron>=1.6.5 required (GHSA-j8p5-79jf-g575).
BEGIN;
DO $$
DECLARE v_version text;
BEGIN
  SELECT extversion INTO v_version FROM pg_extension WHERE extname = 'pg_cron';
  IF v_version IS NULL THEN
    SELECT default_version INTO v_version FROM pg_available_extensions WHERE name = 'pg_cron';
  END IF;
  IF v_version IS NULL OR v_version !~ '^[0-9]+\.[0-9]+\.[0-9]+$'
    OR string_to_array(v_version,'.')::integer[] < ARRAY[1,6,5] THEN
    RAISE EXCEPTION 'room cleanup requires a verified pg_cron version >=1.6.5; request a supported Supabase upgrade first';
  END IF;
  IF to_regprocedure('public.expire_abandoned_rooms()') IS NULL THEN
    RAISE EXCEPTION 'room lifecycle migration023 is required';
  END IF;
END;
$$;
CREATE EXTENSION IF NOT EXISTS pg_cron;
-- Named scheduling updates this application's existing job instead of duplicating
-- it. PostgreSQL executes the fixed SQL directly; no HTTP call or secret is used.
SELECT cron.schedule('singedterra-room-cleanup', '* * * * *',
  'SELECT public.expire_abandoned_rooms();');
COMMIT;

SELECT jobid,jobname,schedule,active FROM cron.job WHERE jobname = 'singedterra-room-cleanup';
-- Observe actual executions, including failures:
-- SELECT d.runid,d.status,d.return_message,d.start_time,d.end_time
-- FROM cron.job_run_details d JOIN cron.job j USING(jobid)
-- WHERE j.jobname='singedterra-room-cleanup' ORDER BY d.runid DESC LIMIT 20;
-- Roll back scheduling only (retain schema, presence and canonical match data):
-- SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='singedterra-room-cleanup';
