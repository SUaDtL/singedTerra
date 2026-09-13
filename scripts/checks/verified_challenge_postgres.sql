-- T10/T11, AC-01/04/07/09. Real PostgreSQL, never a replay or public-career oracle.
\set ON_ERROR_STOP on
DO $$ BEGIN
  ASSERT to_regclass('public.verified_challenge_sessions') IS NOT NULL,
    'T10: dedicated owner-private immutable challenge storage is required';
END $$;
BEGIN;
CREATE FUNCTION pg_temp.expect_error(command text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = expected OR position(expected IN SQLERRM) > 0 THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'expected refusal: %', expected;
END $$;
INSERT INTO auth.users(id) VALUES
 ('c1000000-0000-4000-8000-000000000001'), ('c1000000-0000-4000-8000-000000000002');
DO $test$
DECLARE a uuid := 'c1000000-0000-4000-8000-000000000001'; b uuid := 'c1000000-0000-4000-8000-000000000002';
  start jsonb; resumed jsonb; session uuid; lease jsonb; receipt jsonb; repeated jsonb; second uuid;
  shot jsonb := '[{"angle":45,"power":70}]'; invalid jsonb;
BEGIN
  ASSERT (SELECT NOT starts_enabled FROM public.verified_challenge_controls WHERE edition_id='cq1');
  ASSERT (public.start_verified_challenge(a,'crosswind-qualification',ARRAY[1]::smallint[])->>'error')='challenge_starts_disabled';
  PERFORM public.set_verified_challenge_starts('cq1',true);
  start := public.start_verified_challenge(a,'crosswind-qualification',ARRAY[1]::smallint[]);
  ASSERT start->>'ok'='true';
  session := (start->'descriptor'->>'sessionId')::uuid;
  ASSERT start->'descriptor'->>'accountId'=a::text AND start->'descriptor'->>'seed'='42';
  ASSERT start->'descriptor'->'reward'='{"medalId":"crosswind-qualification","xp":200}'::jsonb;
  ASSERT (start->'descriptor'->>'expiresAt')::timestamptz-(start->'descriptor'->>'admittedAt')::timestamptz=interval '30 minutes';
  PERFORM public.set_verified_challenge_starts('cq1',false);
  resumed := public.start_verified_challenge(a,'crosswind-qualification',ARRAY[1]::smallint[]);
  ASSERT resumed->>'resumed'='true' AND resumed->'descriptor'=start->'descriptor';
  ASSERT (public.start_verified_challenge(a,'crosswind-qualification',ARRAY[2]::smallint[])->>'error')='active_challenge_incompatible';
  ASSERT (public.get_verified_challenge(b,session)->>'error')='challenge_not_found';
  ASSERT (public.abandon_verified_challenge(b,session)->>'error')='challenge_not_found';
  PERFORM pg_temp.expect_error(format('UPDATE public.verified_challenge_sessions SET descriptor=jsonb_set(descriptor,''{seed}'',''43'') WHERE id=%L',session),'challenge_identity_immutable');
  PERFORM pg_temp.expect_error(format('DELETE FROM public.verified_challenge_sessions WHERE id=%L',session),'challenge_session_immutable');
  FOR invalid IN SELECT value FROM jsonb_array_elements('[null,{},[],[{}],[{"angle":45,"power":70,"seed":42}],[{"angle":45.5,"power":70}],[{"angle":181,"power":70}],[{"angle":45,"power":101}],[{"angle":null,"power":70}]]') LOOP
    ASSERT NOT public.is_valid_challenge_transcript(invalid), 'exact one-to-three integer pair grammar';
  END LOOP;
  lease := public.acquire_verification_compute_lease(a,'complete_verified_challenge',session,'cq1',shot);
  ASSERT lease->>'ok'='true';
  receipt := public.finalize_verified_challenge(a,session,'cq1',shot,'objective_cleared',
    (lease->>'workerId')::uuid,(lease->>'fence')::bigint);
  ASSERT receipt->>'ok'='true';
  ASSERT receipt->'receipt'->>'disposition'='awarded' AND receipt->'receipt'->>'xpGranted'='200';
  ASSERT receipt->'receipt'->'careerBeforeLedger'->>'totalXp'='0';
  ASSERT receipt->'receipt'->'careerAfterLedger'->>'totalXp'='200';
  ASSERT (SELECT count(*) FROM public.verified_challenge_awards WHERE account_id=a)=1;
  repeated := public.finalize_verified_challenge(a,session,'cq1',shot,'objective_cleared',gen_random_uuid(),-1);
  ASSERT repeated=receipt, 'identical committed receipt bypasses lease';
  ASSERT (public.finalize_verified_challenge(a,session,'cq1','[{"angle":46,"power":70}]','objective_cleared',
    (lease->>'workerId')::uuid,(lease->>'fence')::bigint)->>'error')='challenge_completion_conflict';
  ASSERT (public.abandon_verified_challenge(a,session)->'receipt')=receipt->'receipt';
  PERFORM pg_temp.expect_error(format('UPDATE public.verified_challenge_receipts SET outcome=''work_limit'' WHERE session_id=%L',session),'challenge_evidence_immutable');
  PERFORM pg_temp.expect_error(format('DELETE FROM public.verified_challenge_receipts WHERE session_id=%L',session),'challenge_evidence_immutable');
  PERFORM pg_temp.expect_error(format('UPDATE public.verified_challenge_awards SET xp=0 WHERE account_id=%L',a),'challenge_evidence_immutable');
  PERFORM pg_temp.expect_error(format('DELETE FROM public.verified_challenge_awards WHERE account_id=%L',a),'challenge_evidence_immutable');
  PERFORM public.set_verified_challenge_starts('cq1',true);
  second := (public.start_verified_challenge(a,'crosswind-qualification',ARRAY[1]::smallint[])->'descriptor'->>'sessionId')::uuid;
  lease := public.acquire_verification_compute_lease(a,'complete_verified_challenge',second,'cq1',shot);
  repeated := public.finalize_verified_challenge(a,second,'cq1',shot,'objective_cleared',(lease->>'workerId')::uuid,(lease->>'fence')::bigint);
  ASSERT repeated->'receipt'->>'disposition'='already_owned' AND repeated->'receipt'->>'xpGranted'='0';
  ASSERT repeated->'receipt'->'careerBeforeLedger'=repeated->'receipt'->'careerAfterLedger';
  ASSERT public.finalize_verified_challenge(a,session,'cq1',shot,'objective_cleared',NULL,NULL)=receipt,
    'historical ledger snapshots survive later completion';
  -- A deterministic terminal failure stores evidence but never earns an award.
  second := (public.start_verified_challenge(b,'crosswind-qualification',ARRAY[1]::smallint[])->'descriptor'->>'sessionId')::uuid;
  lease := public.acquire_verification_compute_lease(b,'complete_verified_challenge',second,'cq1',shot);
  repeated := public.finalize_verified_challenge(b,second,'cq1',shot,'work_limit',(lease->>'workerId')::uuid,(lease->>'fence')::bigint);
  ASSERT repeated->'receipt'->>'disposition'='not_awarded' AND repeated->'receipt'->>'xpGranted'='0';
  ASSERT NOT EXISTS(SELECT FROM public.verified_challenge_awards WHERE account_id=b);
END $test$;
-- ACL assertions use actual execution as each database role (the gateway alone
-- derives p_account_id from authentication; browser JWTs cannot call these RPCs).
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error('SELECT * FROM public.verified_challenge_sessions','permission denied');
SELECT pg_temp.expect_error('SELECT public.start_verified_challenge(''c1000000-0000-4000-8000-000000000001'',''crosswind-qualification'',ARRAY[1]::smallint[])','permission denied');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error('SELECT * FROM public.verified_challenge_awards','permission denied');
SELECT pg_temp.expect_error('DELETE FROM public.verified_challenge_receipts','permission denied');
SELECT pg_temp.expect_error('SELECT public.get_verified_challenge(''c1000000-0000-4000-8000-000000000001'',gen_random_uuid())','permission denied');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.expect_error('UPDATE public.verified_challenge_controls SET starts_enabled=true','permission denied');
SELECT pg_temp.expect_error('DELETE FROM public.verified_challenge_awards','permission denied');
SELECT public.get_verified_challenge('c1000000-0000-4000-8000-000000000001',gen_random_uuid());
RESET ROLE;
-- T11 atomicity: inject a receipt insertion failure after the award attempt.
CREATE FUNCTION pg_temp.fail_challenge_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'injected_receipt_failure'; END $$;
CREATE TRIGGER p10_fault BEFORE INSERT ON public.verified_challenge_receipts
  FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_challenge_receipt();
DO $test$
DECLARE a uuid := 'c1000000-0000-4000-8000-000000000002'; session uuid; lease jsonb; shot jsonb := '[{"angle":45,"power":70}]';
BEGIN
  session := (public.start_verified_challenge(a,'crosswind-qualification',ARRAY[1]::smallint[])->'descriptor'->>'sessionId')::uuid;
  lease := public.acquire_verification_compute_lease(a,'complete_verified_challenge',session,'cq1',shot);
  PERFORM pg_temp.expect_error(format('SELECT public.finalize_verified_challenge(%L,%L,''cq1'',%L,''objective_cleared'',%L,%s)',
    a,session,shot,(lease->>'workerId')::uuid,(lease->>'fence')::bigint),'injected_receipt_failure');
  ASSERT NOT EXISTS(SELECT FROM public.verified_challenge_awards WHERE account_id=a);
  ASSERT NOT EXISTS(SELECT FROM public.verified_challenge_receipts WHERE session_id=session);
  ASSERT (SELECT status='active' AND compute_attempts=1 FROM public.verified_challenge_sessions WHERE id=session);
  ASSERT public.verification_compute_lease_is_current(a,'complete_verified_challenge',session,'cq1',(lease->>'workerId')::uuid,(lease->>'fence')::bigint);
  -- A rolled back award must not consume the one-ever entitlement.
  DROP TRIGGER p10_fault ON public.verified_challenge_receipts;
  ASSERT (public.finalize_verified_challenge(a,session,'cq1',shot,'objective_cleared',(lease->>'workerId')::uuid,(lease->>'fence')::bigint)->'receipt'->>'disposition')='awarded';
END $test$;
-- Test-owned historical admissions avoid mutating the immutable expiry clock.
-- Expired unreceipted sessions are replaced; their late workers can never award.
DO $test$
DECLARE a uuid := 'c1000000-0000-4000-8000-000000000001'; old_session uuid := gen_random_uuid(); new_session uuid;
  admitted timestamptz := clock_timestamp()-interval '31 minutes'; expires timestamptz := admitted+interval '30 minutes';
  template jsonb;
BEGIN
  SELECT c.template INTO template FROM public.verified_challenge_catalog c WHERE edition_id='cq1';
  INSERT INTO public.verified_challenge_sessions(id,account_id,edition_id,descriptor,admitted_at,expires_at)
    VALUES(old_session,a,'cq1',template||jsonb_build_object('sessionId',old_session,'accountId',a,
      'admittedAt',public.challenge_utc(admitted),'expiresAt',public.challenge_utc(expires)),admitted,expires);
  new_session := (public.start_verified_challenge(a,'crosswind-qualification',ARRAY[1]::smallint[])->'descriptor'->>'sessionId')::uuid;
  ASSERT new_session<>old_session AND (SELECT status FROM public.verified_challenge_sessions WHERE id=old_session)='expired';
  ASSERT (public.finalize_verified_challenge(a,old_session,'cq1','[{"angle":45,"power":70}]','objective_cleared',gen_random_uuid(),1)->>'error')='challenge_not_completable';
  ASSERT (public.abandon_verified_challenge(a,new_session)->>'status')='abandoned';
  ASSERT (public.abandon_verified_challenge(a,new_session)->>'status')='abandoned';
  ASSERT (public.acquire_verification_compute_lease(a,'complete_verified_challenge',new_session,'cq1','[{"angle":45,"power":70}]')->>'error')='challenge_not_completable';
END $test$;
-- Historical committed receipt lookup survives the deadline. Fixtures represent
-- an admission that completed in time; no test mutates immutable session fields.
DO $test$
DECLARE a uuid := 'c1000000-0000-4000-8000-000000000001'; historical uuid := gen_random_uuid();
  admitted timestamptz := clock_timestamp()-interval '31 minutes'; expires timestamptz := admitted+interval '30 minutes';
  template jsonb; ledger jsonb; found_receipt jsonb;
BEGIN
  SELECT c.template INTO template FROM public.verified_challenge_catalog c WHERE edition_id='cq1';
  ledger := public.verified_career_ledger_snapshot(a);
  INSERT INTO public.verified_challenge_sessions(id,account_id,edition_id,descriptor,admitted_at,expires_at,status,compute_attempts,bound_transcript)
    VALUES(historical,a,'cq1',template||jsonb_build_object('sessionId',historical,'accountId',a,
      'admittedAt',public.challenge_utc(admitted),'expiresAt',public.challenge_utc(expires)),admitted,expires,'completed',1,'[{"angle":45,"power":70}]');
  INSERT INTO public.verified_challenge_receipts(session_id,account_id,edition_id,transcript,outcome,disposition,xp_granted,career_before_ledger,career_after_ledger,completed_at)
    VALUES(historical,a,'cq1','[{"angle":45,"power":70}]','objective_cleared','already_owned',0,ledger,ledger,admitted+interval '1 minute');
  found_receipt := public.get_verified_challenge(a,historical)->'receipt';
  ASSERT found_receipt IS NOT NULL;
  ASSERT public.finalize_verified_challenge(a,historical,'cq1','[{"power":70,"angle":45}]','objective_cleared',NULL,NULL)->'receipt'=found_receipt;
  ASSERT public.acquire_verification_compute_lease(a,'complete_verified_challenge',historical,'cq1','[{"angle":45,"power":70}]')->'receipt'=found_receipt;
  ASSERT (public.finalize_verified_challenge(a,historical,'cq1','[{"angle":46,"power":70}]','objective_cleared',NULL,NULL)->>'error')='challenge_completion_conflict';
  -- Future technical metadata never changes the entitlement's unique key. It is
  -- deliberately NOT executable/admitted by the cq1-only runtime registry.
  INSERT INTO public.verified_challenge_catalog VALUES('cq1-technical-test','crosswind-qualification','crosswind-qualification',1,
    jsonb_set(template,'{editionId}','"cq1-technical-test"'));
  PERFORM pg_temp.expect_error(format('INSERT INTO public.verified_challenge_awards VALUES(%L,''crosswind-qualification'',gen_random_uuid(),''crosswind-qualification'',200,1,now())',a),
    'duplicate key value violates unique constraint "verified_challenge_awards_pkey"');
END $test$;
ROLLBACK;
