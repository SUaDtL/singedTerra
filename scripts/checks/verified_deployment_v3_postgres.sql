-- Execute after migration 020 in the isolated PostgreSQL harness.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES
 ('30000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000002'),
 ('30000000-0000-4000-8000-000000000003'),
 ('30000000-0000-4000-8000-000000000004'),
 ('30000000-0000-4000-8000-000000000005'),
 ('30000000-0000-4000-8000-000000000006'),
 ('30000000-0000-4000-8000-000000000007');
UPDATE public.verified_deployment_contracts SET starts_enabled = true WHERE contract_version = 2;
DO $test$
DECLARE legacy record; fallback record; v3 record; v3_abandon record; completed record; retried record; abandoned record;
  invalid_versions smallint[]; invalid_config jsonb; invalid_expiry timestamptz;
BEGIN
  ASSERT (SELECT NOT starts_enabled FROM public.verified_deployment_contracts WHERE contract_version = 3);
  SELECT * INTO STRICT legacy FROM public.start_verified_deployment(
    '30000000-0000-4000-8000-000000000001','{}',now()+interval '29 minutes');
  ASSERT (legacy.contract_version,legacy.engine_version,legacy.ruleset_version)=(2,2,4);
  SELECT * INTO STRICT fallback FROM public.start_verified_deployment_for_contracts(
    '30000000-0000-4000-8000-000000000002','{}',now()+interval '29 minutes',ARRAY[2,3]::smallint[]);
  ASSERT (fallback.contract_version,fallback.engine_version,fallback.ruleset_version)=(2,2,4);

  PERFORM public.set_verified_deployment_starts(3::smallint,true);
  SELECT * INTO STRICT v3 FROM public.start_verified_deployment_for_contracts(
    '30000000-0000-4000-8000-000000000003','{}',now()+interval '29 minutes',ARRAY[2,3]::smallint[]);
  ASSERT (v3.contract_version,v3.engine_version,v3.ruleset_version)=(3,3,4);
  SELECT * INTO STRICT v3_abandon FROM public.start_verified_deployment_for_contracts(
    '30000000-0000-4000-8000-000000000007','{}',now()+interval '29 minutes',ARRAY[3]::smallint[]);
  ASSERT (v3_abandon.contract_version,v3_abandon.engine_version,v3_abandon.ruleset_version)=(3,3,4);
  SELECT * INTO STRICT v3 FROM public.start_verified_deployment_for_contracts(
    '30000000-0000-4000-8000-000000000003','{"ignored":"replacement"}',now()+interval '28 minutes',ARRAY[3]::smallint[]);
  ASSERT v3.resumed AND v3.config='{}'::jsonb;
  BEGIN
    PERFORM public.start_verified_deployment_for_contracts(
      '30000000-0000-4000-8000-000000000003','{}',now()+interval '29 minutes',ARRAY[2]::smallint[]);
    RAISE EXCEPTION 'expected_incompatible_active';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'verified_deployment_incompatible_active' THEN RAISE; END IF;
  END;

  -- A disabled V3 control never changes an existing V3 tuple. Capable new
  -- admission falls back to V2, while a V3-only new request is refused.
  PERFORM public.set_verified_deployment_starts(3::smallint,false);
  SELECT * INTO STRICT v3_abandon FROM public.abandon_verified_deployment(
    '30000000-0000-4000-8000-000000000007',v3_abandon.id);
  ASSERT v3_abandon.status='abandoned' AND v3_abandon.contract_version=3;
  SELECT * INTO STRICT v3 FROM public.start_verified_deployment_for_contracts(
    '30000000-0000-4000-8000-000000000003','{"ignored":"replacement"}',now()+interval '28 minutes',ARRAY[2,3]::smallint[]);
  ASSERT v3.resumed AND (v3.contract_version,v3.engine_version,v3.ruleset_version)=(3,3,4) AND v3.config='{}'::jsonb;
  SELECT * INTO STRICT fallback FROM public.start_verified_deployment_for_contracts(
    '30000000-0000-4000-8000-000000000004','{}',now()+interval '29 minutes',ARRAY[2,3]::smallint[]);
  ASSERT NOT fallback.resumed AND (fallback.contract_version,fallback.engine_version,fallback.ruleset_version)=(2,2,4);
  BEGIN
    PERFORM public.start_verified_deployment_for_contracts(
      '30000000-0000-4000-8000-000000000005','{}',now()+interval '29 minutes',ARRAY[3]::smallint[]);
    RAISE EXCEPTION 'expected_v3_disabled';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'verified_deployment_starts_disabled' THEN RAISE; END IF;
  END;

  FOR invalid_versions IN SELECT versions FROM (VALUES
    (NULL::smallint[]), (ARRAY[]::smallint[]), (ARRAY[NULL]::smallint[]),
    (ARRAY[4]::smallint[]), (ARRAY[2,2]::smallint[]), (ARRAY[[2,3]]::smallint[])
  ) AS invalid(versions) LOOP
    BEGIN
      PERFORM public.start_verified_deployment_for_contracts(
        '30000000-0000-4000-8000-000000000004','{}',now()+interval '29 minutes',invalid_versions);
      RAISE EXCEPTION 'expected_invalid_capabilities';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'verified_deployment_invalid_start' THEN RAISE; END IF;
    END;
  END LOOP;

  FOR invalid_config, invalid_expiry IN SELECT config, expiry FROM (VALUES
    (NULL::jsonb, now()+interval '29 minutes'), ('{}'::jsonb, NULL::timestamptz)
  ) AS invalid(config, expiry) LOOP
    BEGIN
      PERFORM public.start_verified_deployment_for_contracts(
        '30000000-0000-4000-8000-000000000005',invalid_config,invalid_expiry,ARRAY[2]::smallint[]);
      RAISE EXCEPTION 'expected_invalid_null_start';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'verified_deployment_invalid_start' THEN RAISE; END IF;
    END;
  END LOOP;

  SELECT * INTO STRICT completed FROM public.complete_verified_deployment(
    '30000000-0000-4000-8000-000000000003',v3.id,'[{"angle":45,"power":50}]',false,'loss',100);
  SELECT * INTO STRICT retried FROM public.complete_verified_deployment(
    '30000000-0000-4000-8000-000000000003',v3.id,'[{"angle":45,"power":50}]',false,'loss',100);
  ASSERT completed.session_id=retried.session_id AND completed.created_at=retried.created_at;
  ASSERT completed.current_verified_matches=1 AND retried.current_verified_matches=1;
  ASSERT (SELECT count(*)=1 FROM public.verified_match_results WHERE session_id=v3.id);
  BEGIN
    PERFORM public.complete_verified_deployment(
      '30000000-0000-4000-8000-000000000003',v3.id,'[{"angle":46,"power":50}]',false,'loss',100);
    RAISE EXCEPTION 'expected_completion_conflict';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'verified_deployment_completion_conflict' THEN RAISE; END IF;
  END;

  SELECT * INTO STRICT completed FROM public.complete_verified_deployment(
    '30000000-0000-4000-8000-000000000004',fallback.id,'[{"angle":45,"power":50}]',true,'win',200);
  SELECT * INTO STRICT retried FROM public.complete_verified_deployment(
    '30000000-0000-4000-8000-000000000004',fallback.id,'[{"angle":45,"power":50}]',true,'win',200);
  ASSERT completed.session_id=retried.session_id AND completed.created_at=retried.created_at;
  ASSERT completed.current_verified_matches=1 AND completed.current_verified_wins=1 AND completed.current_total_xp=200;
  ASSERT (SELECT count(*)=1 FROM public.verified_match_results WHERE session_id=fallback.id);

  SELECT * INTO STRICT abandoned FROM public.start_verified_deployment(
    '30000000-0000-4000-8000-000000000006','{}',now()+interval '29 minutes');
  SELECT * INTO STRICT abandoned FROM public.abandon_verified_deployment(
    '30000000-0000-4000-8000-000000000006',abandoned.id);
  ASSERT abandoned.status='abandoned';

  ASSERT (SELECT contract_version=3 FROM public.verified_deployment_drain_status(3::smallint));
  ASSERT NOT has_function_privilege('anon','public.start_verified_deployment_for_contracts(uuid,jsonb,timestamptz,smallint[])','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','public.start_verified_deployment_for_contracts(uuid,jsonb,timestamptz,smallint[])','EXECUTE');
  ASSERT has_function_privilege('service_role','public.start_verified_deployment_for_contracts(uuid,jsonb,timestamptz,smallint[])','EXECUTE');
END;
$test$;
ROLLBACK;
