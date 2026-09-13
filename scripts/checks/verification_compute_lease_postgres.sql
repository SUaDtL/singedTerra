-- T12 / AC-05: real database fencing, persistent attempts, bound transcripts.
\set ON_ERROR_STOP on
DO $$ BEGIN
  ASSERT to_regclass('public.verification_compute_leases') IS NOT NULL,
    'T12: a shared persistent account computation lease is required';
END $$;
BEGIN;
INSERT INTO auth.users(id) VALUES ('c2000000-0000-4000-8000-000000000001');
INSERT INTO public.verified_deployments(id,user_id,config,contract_version,engine_version,ruleset_version,expires_at)
  VALUES('d2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','{}',2,2,4,now()+interval '29 minutes');
SELECT public.set_verified_challenge_starts('cq1',true);
DO $test$
DECLARE a uuid := 'c2000000-0000-4000-8000-000000000001'; session uuid; l1 jsonb; l2 jsonb; r jsonb;
  shot jsonb := '[{"angle":45,"power":70}]';
BEGIN
  session := (public.start_verified_challenge(a,'crosswind-qualification',ARRAY[1]::smallint[])->'descriptor'->>'sessionId')::uuid;
  ASSERT (public.acquire_verification_compute_lease(a,'complete_verified_challenge',session,'cq1','[]')->>'error')='invalid_verification_request';
  l1 := public.acquire_verification_compute_lease(a,'complete_verified_challenge',session,'cq1',shot);
  ASSERT l1->>'ok'='true' AND (l1->>'fence')::bigint>0;
  ASSERT (l1->>'expiresAt')::timestamptz>clock_timestamp();
  ASSERT (l1->>'expiresAt')::timestamptz<=clock_timestamp()+interval '10 seconds';
  ASSERT (l1->>'uncertainUntil')::timestamptz-(l1->>'expiresAt')::timestamptz=interval '400 seconds';
  ASSERT (public.acquire_verification_compute_lease(a,'verified_replay_probe',NULL,'probe-v1',NULL)->>'error')='verification_busy';
  ASSERT (public.acquire_verification_compute_lease(a,'complete_verified_deployment','d2000000-0000-4000-8000-000000000001','deployment-v2',shot)->>'error')='verification_busy';
  ASSERT (SELECT compute_attempts FROM public.verified_challenge_sessions WHERE id=session)=1;
  ASSERT NOT public.release_verification_compute_lease(a,gen_random_uuid(),(l1->>'fence')::bigint);
  ASSERT (public.finalize_verified_challenge(a,session,'cq1',shot,'objective_cleared',gen_random_uuid(),(l1->>'fence')::bigint)->>'error')='verification_lease_lost';
  -- Infrastructure-only clock manipulation on the test-owned database simulates a crashed worker.
  UPDATE public.verification_compute_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE account_id=a;
  ASSERT (public.acquire_verification_compute_lease(a,'verified_replay_probe',NULL,'probe-v1',NULL)->>'error')='verification_busy',
    'expired write fence must not bypass the uncertain-execution cooldown';
  ASSERT (SELECT compute_attempts FROM public.verified_challenge_sessions WHERE id=session)=1;
  ASSERT (public.acquire_verification_compute_lease(a,'complete_verified_deployment','d2000000-0000-4000-8000-000000000001','deployment-v2',shot)->>'error')='verification_busy';
  ASSERT NOT public.verification_compute_lease_is_current(a,'complete_verified_challenge',session,'cq1',(l1->>'workerId')::uuid,(l1->>'fence')::bigint);
  -- Only the separately elapsed crash cooldown permits replacing unknown work.
  UPDATE public.verification_compute_leases SET uncertain_until=expires_at WHERE account_id=a;
  l2 := public.acquire_verification_compute_lease(a,'complete_verified_challenge',session,'cq1',shot);
  ASSERT l2->>'ok'='true' AND (l2->>'fence')::bigint>(l1->>'fence')::bigint;
  ASSERT (SELECT compute_attempts FROM public.verified_challenge_sessions WHERE id=session)=2;
  ASSERT NOT public.release_verification_compute_lease(a,(l1->>'workerId')::uuid,(l1->>'fence')::bigint);
  ASSERT (public.finalize_verified_challenge(a,session,'cq1',shot,'objective_cleared',(l1->>'workerId')::uuid,(l1->>'fence')::bigint)->>'error')='verification_lease_lost';
  ASSERT public.release_verification_compute_lease(a,(l2->>'workerId')::uuid,(l2->>'fence')::bigint);
  ASSERT (public.acquire_verification_compute_lease(a,'complete_verified_challenge',session,'cq1','[{"angle":46,"power":70}]')->>'error')='challenge_transcript_conflict';
  ASSERT (SELECT compute_attempts FROM public.verified_challenge_sessions WHERE id=session)=2;
  l2 := public.acquire_verification_compute_lease(a,'complete_verified_challenge',session,'cq1',shot);
  ASSERT l2->>'ok'='true';
  UPDATE public.verification_compute_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE account_id=a;
  r := public.get_verified_challenge(a,session);
  ASSERT r->>'status'='verification_unavailable', 'lazy third-crash reconciliation closes unavailable, not failed';
  ASSERT (SELECT compute_attempts FROM public.verified_challenge_sessions WHERE id=session)=3;
  ASSERT (public.acquire_verification_compute_lease(a,'complete_verified_challenge',session,'cq1',shot)->>'error')='challenge_not_completable';
  ASSERT NOT EXISTS(SELECT FROM public.verified_challenge_awards WHERE account_id=a);
  ASSERT (public.acquire_verification_compute_lease(a,'verified_replay_probe',NULL,'probe-v1',NULL)->>'error')='verification_busy';
  -- Exact identity can release a completed/ended call even after its write fence
  -- has expired; unrelated releases above could not clear the account cooldown.
  ASSERT public.release_verification_compute_lease(a,(l2->>'workerId')::uuid,(l2->>'fence')::bigint);
  l1 := public.acquire_verification_compute_lease(a,'verified_replay_probe',NULL,'probe-v1',NULL);
  ASSERT l1->>'ok'='true';
  ASSERT public.release_verification_compute_lease(a,(l1->>'workerId')::uuid,(l1->>'fence')::bigint);
  l2 := public.acquire_verification_compute_lease(a,'verified_replay_probe',NULL,'probe-v1',NULL);
  ASSERT (l2->>'fence')::bigint>(l1->>'fence')::bigint, 'fence survives released lease';
  PERFORM public.release_verification_compute_lease(a,(l2->>'workerId')::uuid,(l2->>'fence')::bigint);
  l1 := public.acquire_verification_compute_lease(a,'complete_verified_deployment','d2000000-0000-4000-8000-000000000001','deployment-v2',shot);
  ASSERT l1->>'ok'='true';
  ASSERT public.verification_compute_lease_is_current(a,'complete_verified_deployment','d2000000-0000-4000-8000-000000000001','deployment-v2',(l1->>'workerId')::uuid,(l1->>'fence')::bigint);
  ASSERT NOT public.verification_compute_lease_is_current(a,'complete_verified_deployment','d2000000-0000-4000-8000-000000000001','deployment-v3',(l1->>'workerId')::uuid,(l1->>'fence')::bigint);
  session := (public.start_verified_challenge(a,'crosswind-qualification',ARRAY[1]::smallint[])->'descriptor'->>'sessionId')::uuid;
  ASSERT (public.acquire_verification_compute_lease(a,'complete_verified_challenge',session,'cq1',shot)->>'error')='verification_busy';
  ASSERT (SELECT compute_attempts=0 AND bound_transcript IS NULL FROM public.verified_challenge_sessions WHERE id=session);
  PERFORM public.abandon_verified_challenge(a,session);
END $test$;
-- Early infrastructure release on attempt three closes immediately; a real
-- deterministic-invalid result closes on attempt one without a receipt/award.
DO $test$
DECLARE a uuid := 'c2000000-0000-4000-8000-000000000001'; session uuid; lease jsonb; shot jsonb := '[{"angle":45,"power":70}]';
BEGIN
  SELECT jsonb_build_object('workerId',worker_id,'fence',fence) INTO lease FROM public.verification_compute_leases WHERE account_id=a;
  PERFORM public.release_verification_compute_lease(a,(lease->>'workerId')::uuid,(lease->>'fence')::bigint);
  session := (public.start_verified_challenge(a,'crosswind-qualification',ARRAY[1]::smallint[])->'descriptor'->>'sessionId')::uuid;
  FOR attempt IN 1..3 LOOP
    lease := public.acquire_verification_compute_lease(a,'complete_verified_challenge',session,'cq1',shot);
    ASSERT lease->>'ok'='true';
    ASSERT public.release_verification_compute_lease(a,(lease->>'workerId')::uuid,(lease->>'fence')::bigint);
  END LOOP;
  ASSERT (public.get_verified_challenge(a,session)->>'status')='verification_unavailable';
  session := (public.start_verified_challenge(a,'crosswind-qualification',ARRAY[1]::smallint[])->'descriptor'->>'sessionId')::uuid;
  lease := public.acquire_verification_compute_lease(a,'complete_verified_challenge',session,'cq1',shot);
  ASSERT (public.reject_verified_challenge(a,session,(lease->>'workerId')::uuid,(lease->>'fence')::bigint)->>'status')='invalid';
  ASSERT NOT EXISTS(SELECT FROM public.verified_challenge_receipts WHERE session_id=session);
  ASSERT (public.acquire_verification_compute_lease(a,'complete_verified_challenge',session,'cq1',shot)->>'error')='challenge_not_completable';
  -- Abandon invalidates completion but retains admission until exact ended-call
  -- release or cooldown expiry; this does not prove host termination.
  session := (public.start_verified_challenge(a,'crosswind-qualification',ARRAY[1]::smallint[])->'descriptor'->>'sessionId')::uuid;
  lease := public.acquire_verification_compute_lease(a,'complete_verified_challenge',session,'cq1',shot);
  PERFORM public.abandon_verified_challenge(a,session);
  ASSERT (public.acquire_verification_compute_lease(a,'verified_replay_probe',NULL,'probe-v1',NULL)->>'error')='verification_busy';
  ASSERT (public.finalize_verified_challenge(a,session,'cq1',shot,'objective_cleared',(lease->>'workerId')::uuid,(lease->>'fence')::bigint)->>'error')='challenge_not_completable';
  PERFORM public.release_verification_compute_lease(a,(lease->>'workerId')::uuid,(lease->>'fence')::bigint);
END $test$;
ROLLBACK;
