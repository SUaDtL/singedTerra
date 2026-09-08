-- Execute only in an isolated Postgres fixture with migrations 016 onward.
-- Every fixture mutation rolls back; ON_ERROR_STOP makes failed assertions fail CI.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id) VALUES
 ('00000000-0000-4000-8000-000000000019'),
 ('00000000-0000-4000-8000-000000000020'),
 ('00000000-0000-4000-8000-000000000021'),
 ('00000000-0000-4000-8000-000000000022');
UPDATE public.verified_deployment_contracts SET starts_enabled = true WHERE contract_version = 2;
DO $test$
DECLARE
  first_session record;
  resumed_session record;
  replacement record;
  expired_id uuid := '00000000-0000-4000-8000-000000000119';
BEGIN
  SELECT * INTO STRICT first_session FROM public.start_verified_deployment(
    '00000000-0000-4000-8000-000000000019', '{"seed":19}', now() + interval '29 minutes');
  ASSERT first_session.resumed = false AND first_session.status = 'active';
  ASSERT (first_session.contract_version, first_session.engine_version, first_session.ruleset_version) = (2, 2, 4);
  ASSERT first_session.user_id = '00000000-0000-4000-8000-000000000019'::uuid;
  ASSERT first_session.config = '{"seed":19}'::jsonb;
  ASSERT (SELECT last_started_at IS NOT NULL FROM public.verified_deployment_contracts WHERE contract_version = 2);

  -- Disabling admissions must not strand an existing V2 session or replace its config.
  UPDATE public.verified_deployment_contracts SET starts_enabled = false WHERE contract_version = 2;
  SELECT * INTO STRICT resumed_session FROM public.start_verified_deployment(
    '00000000-0000-4000-8000-000000000019', '{"seed":20}', now() + interval '28 minutes');
  ASSERT resumed_session.resumed AND resumed_session.id = first_session.id;
  ASSERT resumed_session.config = first_session.config AND resumed_session.expires_at = first_session.expires_at;
  BEGIN
    PERFORM public.start_verified_deployment('00000000-0000-4000-8000-000000000020', '{}', now() + interval '29 minutes');
    RAISE EXCEPTION 'expected_disabled_admission';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'verified_deployment_starts_disabled' THEN RAISE; END IF;
  END;

  -- A stale active row must expire before the next admission can be inserted.
  UPDATE public.verified_deployment_contracts SET starts_enabled = true WHERE contract_version = 2;
  INSERT INTO public.verified_deployments(id,user_id,config,contract_version,engine_version,ruleset_version,created_at,expires_at)
  VALUES(expired_id,'00000000-0000-4000-8000-000000000021','{}',2,2,4,now()-interval '40 minutes',now()-interval '11 minutes');
  SELECT * INTO STRICT replacement FROM public.start_verified_deployment(
    '00000000-0000-4000-8000-000000000021','{}',now()+interval '29 minutes');
  ASSERT NOT replacement.resumed AND replacement.id <> expired_id;
  ASSERT (SELECT status = 'expired' FROM public.verified_deployments WHERE id = expired_id);

  INSERT INTO public.verified_deployments(user_id,config,contract_version,engine_version,ruleset_version,expires_at)
  VALUES('00000000-0000-4000-8000-000000000022','{}',1,1,3,now()+interval '29 minutes');
  BEGIN
    PERFORM public.start_verified_deployment('00000000-0000-4000-8000-000000000022','{}',now()+interval '29 minutes');
    RAISE EXCEPTION 'expected_legacy_drain';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'verified_deployment_legacy_drain_active' THEN RAISE; END IF;
  END;
  ASSERT NOT has_function_privilege('anon','public.start_verified_deployment(uuid,jsonb,timestamptz)','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','public.start_verified_deployment(uuid,jsonb,timestamptz)','EXECUTE');
  ASSERT has_function_privilege('service_role','public.start_verified_deployment(uuid,jsonb,timestamptz)','EXECUTE');
END;
$test$;
ROLLBACK;
