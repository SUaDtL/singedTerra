\set ON_ERROR_STOP on
DO $$ BEGIN
  ASSERT to_regprocedure('public.complete_verified_deployment_fenced(uuid,uuid,jsonb,boolean,text,integer,text,uuid,bigint)') IS NOT NULL,
    'T14: atomic fenced legacy finalization is required';
END $$;
BEGIN;
INSERT INTO auth.users(id) VALUES ('c4000000-0000-4000-8000-000000000001');
INSERT INTO public.verified_deployments(id,user_id,config,contract_version,engine_version,ruleset_version,expires_at)
  VALUES('d4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','{}',2,2,4,clock_timestamp()+interval '29 minutes');
DO $test$
DECLARE a uuid := 'c4000000-0000-4000-8000-000000000001'; s uuid := 'd4000000-0000-4000-8000-000000000001';
  lease jsonb; shot jsonb := '[{"angle":45,"power":70}]'; result public.verified_match_results;
BEGIN
  ASSERT NOT has_function_privilege('authenticated','public.complete_verified_deployment_fenced(uuid,uuid,jsonb,boolean,text,integer,text,uuid,bigint)','EXECUTE');
  ASSERT NOT has_function_privilege('anon','public.complete_verified_deployment_fenced(uuid,uuid,jsonb,boolean,text,integer,text,uuid,bigint)','EXECUTE');
  ASSERT has_function_privilege('service_role','public.complete_verified_deployment_fenced(uuid,uuid,jsonb,boolean,text,integer,text,uuid,bigint)','EXECUTE');
  lease := public.acquire_verification_compute_lease(a,'complete_verified_deployment',s,'deployment-v2',shot);
  BEGIN
    PERFORM public.complete_verified_deployment_fenced(a,s,shot,true,'win',200,'deployment-v2',gen_random_uuid(),(lease->>'fence')::bigint);
    RAISE EXCEPTION 'stale legacy completion incorrectly succeeded';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM='verification_lease_lost';
  END;
  UPDATE public.verification_compute_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE account_id=a;
  BEGIN
    PERFORM public.complete_verified_deployment_fenced(a,s,shot,true,'win',200,'deployment-v2',(lease->>'workerId')::uuid,(lease->>'fence')::bigint);
    RAISE EXCEPTION 'expired legacy completion incorrectly succeeded';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM='verification_lease_lost';
  END;
  ASSERT NOT EXISTS(SELECT FROM public.verified_match_results WHERE session_id=s);
  PERFORM public.release_verification_compute_lease(a,(lease->>'workerId')::uuid,(lease->>'fence')::bigint);
  lease := public.acquire_verification_compute_lease(a,'complete_verified_deployment',s,'deployment-v2',shot);
  SELECT * INTO STRICT result FROM public.complete_verified_deployment_fenced(a,s,shot,true,'win',200,'deployment-v2',(lease->>'workerId')::uuid,(lease->>'fence')::bigint);
  ASSERT result.verified_xp=200 AND result.prior_total_xp=0 AND result.current_total_xp=200;
  ASSERT (SELECT count(*) FROM public.verified_match_results WHERE session_id=s)=1;
  ASSERT NOT EXISTS(SELECT FROM public.verified_challenge_awards WHERE account_id=a);
END $test$;
ROLLBACK;
