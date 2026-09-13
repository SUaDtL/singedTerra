-- P10 / ADR-0019. Additive, disabled admission. This migration is NOT rollout authority.
-- PRIVATE: account-linked sessions, bound transcripts, immutable receipts/awards.
-- INTERNAL: allowlisted catalog/control and account-wide worker leases.
-- No browser table grants: owner-scoped service RPCs receive the Auth-derived UUID.
-- Every account mutation uses migration 016/020's advisory lock, then row locks.
-- Keep old deployment RPCs intact for staged rollout; T14 must route their costly
-- callers through the fenced wrapper before challenge starts can be enabled.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE FUNCTION public.is_valid_challenge_transcript(p_transcript jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE shot jsonb; angle numeric; power numeric;
BEGIN
  IF p_transcript IS NULL OR jsonb_typeof(p_transcript) <> 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(p_transcript) NOT BETWEEN 1 AND 3 THEN RETURN false; END IF;
  FOR shot IN SELECT value FROM jsonb_array_elements(p_transcript) LOOP
    IF jsonb_typeof(shot) <> 'object' THEN RETURN false; END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(shot)) <> 2
      OR NOT (shot ?& ARRAY['angle','power'])
      OR jsonb_typeof(shot->'angle') <> 'number' OR jsonb_typeof(shot->'power') <> 'number'
    THEN RETURN false; END IF;
    angle := (shot->>'angle')::numeric; power := (shot->>'power')::numeric;
    IF angle <> trunc(angle) OR power <> trunc(power) OR angle NOT BETWEEN 0 AND 180 OR power NOT BETWEEN 0 AND 100
    THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;

CREATE FUNCTION public.challenge_utc(p_time timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT to_char(p_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
$$;

CREATE TABLE public.verified_challenge_catalog (
  edition_id text PRIMARY KEY,
  trial_id text NOT NULL,
  entitlement_id text NOT NULL,
  descriptor_version smallint NOT NULL CHECK (descriptor_version > 0),
  template jsonb NOT NULL CHECK (jsonb_typeof(template)='object'),
  CHECK (template->>'editionId'=edition_id AND template->>'trialId'=trial_id
    AND template->>'entitlementId'=entitlement_id
    AND (template->>'descriptorVersion')::smallint=descriptor_version),
  -- Future technical editions may retain this stable entitlement. Another
  -- entitlement/reward is a separately reviewed migration, never runtime input.
  CHECK (entitlement_id='crosswind-qualification'
    AND template->'reward'='{"medalId":"crosswind-qualification","xp":200}'::jsonb
    AND template->>'rewardVersion'='1')
);
INSERT INTO public.verified_challenge_catalog VALUES (
 'cq1','crosswind-qualification','crosswind-qualification',1,
 '{"descriptorVersion":1,"trialId":"crosswind-qualification","editionId":"cq1", "entitlementId":"crosswind-qualification",
 "objectiveVersion":1,"verifierArtifactId":"cq1","cpuPolicyId":"cq1-hard-v3","rewardVersion":1,
 "reward":{"medalId":"crosswind-qualification","xp":200},"seed":42,
 "rules":{"maxPlayers":2,"humanSeat":0,"rounds":1,"walls":"wrap","hazards":"none","gravity":0.15,"maxWind":6,"interestRate":0,
 "suddenDeathTurn":0,"teamMode":false,"armsLevel":0,"starterWeaponFalloff":"decisive","weapon":"baby_missile"},
 "limits":{"humanSalvos":3,"cpuSalvos":3,"angle":{"min":0,"max":180},"power":{"min":0,"max":100},"sessionSeconds":1800,"computeAttempts":3}}'
);
CREATE TABLE public.verified_challenge_controls (
  edition_id text PRIMARY KEY REFERENCES public.verified_challenge_catalog(edition_id),
  starts_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO public.verified_challenge_controls(edition_id) VALUES ('cq1');

CREATE TABLE public.verified_challenge_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES auth.users(id),
  edition_id text NOT NULL REFERENCES public.verified_challenge_catalog(edition_id),
  descriptor jsonb NOT NULL,
  admitted_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','expired','abandoned','invalid','verification_unavailable')),
  compute_attempts integer NOT NULL DEFAULT 0 CHECK (compute_attempts BETWEEN 0 AND 3),
  bound_transcript jsonb CHECK (bound_transcript IS NULL OR public.is_valid_challenge_transcript(bound_transcript)),
  UNIQUE(id,account_id),
  CHECK (expires_at>admitted_at AND expires_at<=admitted_at+interval '30 minutes'),
  CHECK ((compute_attempts=0 AND bound_transcript IS NULL) OR (compute_attempts>0 AND bound_transcript IS NOT NULL))
);
CREATE UNIQUE INDEX verified_challenge_one_active_account ON public.verified_challenge_sessions(account_id) WHERE status='active';

CREATE TABLE public.verified_challenge_receipts (
  session_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  edition_id text NOT NULL REFERENCES public.verified_challenge_catalog(edition_id),
  transcript jsonb NOT NULL CHECK (public.is_valid_challenge_transcript(transcript)),
  outcome text NOT NULL CHECK (outcome IN ('objective_cleared','terminal_without_clear','objective_not_cleared','work_limit')),
  disposition text NOT NULL CHECK (disposition IN ('awarded','already_owned','not_awarded')),
  xp_granted integer NOT NULL,
  -- INTERNAL ledger facts, not a partial public Verified Career projection.
  -- T18 must apply its frozen pure projection to these facts for responses.
  career_before_ledger jsonb NOT NULL,
  career_after_ledger jsonb NOT NULL,
  completed_at timestamptz NOT NULL,
  UNIQUE(session_id,account_id),
  FOREIGN KEY(session_id,account_id) REFERENCES public.verified_challenge_sessions(id,account_id),
  CHECK ((outcome='objective_cleared' AND disposition IN ('awarded','already_owned'))
    OR (outcome<>'objective_cleared' AND disposition='not_awarded')),
  CHECK (xp_granted=CASE WHEN disposition='awarded' THEN 200 ELSE 0 END)
);
CREATE TABLE public.verified_challenge_awards (
  account_id uuid NOT NULL,
  entitlement_id text NOT NULL CHECK (entitlement_id='crosswind-qualification'),
  session_id uuid NOT NULL UNIQUE,
  medal_id text NOT NULL CHECK (medal_id='crosswind-qualification'),
  xp integer NOT NULL CHECK (xp=200),
  reward_version smallint NOT NULL CHECK (reward_version=1),
  awarded_at timestamptz NOT NULL,
  PRIMARY KEY(account_id,entitlement_id),
  FOREIGN KEY(session_id,account_id) REFERENCES public.verified_challenge_receipts(session_id,account_id) DEFERRABLE INITIALLY DEFERRED
);

-- Rows persist after release so fencing tokens cannot restart at 1. No clock
-- parameters or caller-selected lease duration; all live checks occur AFTER locks.
CREATE TABLE public.verification_compute_leases (
  account_id uuid PRIMARY KEY REFERENCES auth.users(id),
  fence bigint NOT NULL DEFAULT 0 CHECK (fence>=0),
  worker_id uuid,
  endpoint text CHECK (endpoint IN ('complete_verified_challenge','complete_verified_deployment','verified_replay_probe')),
  session_id uuid,
  descriptor_binding text,
  expires_at timestamptz,
  uncertain_until timestamptz,
  CHECK ((worker_id IS NULL AND endpoint IS NULL AND session_id IS NULL AND descriptor_binding IS NULL AND expires_at IS NULL AND uncertain_until IS NULL)
    OR (worker_id IS NOT NULL AND endpoint IS NOT NULL AND descriptor_binding IS NOT NULL AND expires_at IS NOT NULL AND uncertain_until IS NOT NULL
      AND uncertain_until>=expires_at
      AND ((endpoint='verified_replay_probe' AND session_id IS NULL) OR (endpoint<>'verified_replay_probe' AND session_id IS NOT NULL))))
);

CREATE FUNCTION public.reject_challenge_evidence_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN RAISE EXCEPTION 'challenge_evidence_immutable'; END $$;
CREATE TRIGGER verified_challenge_catalog_immutable BEFORE UPDATE OR DELETE ON public.verified_challenge_catalog
  FOR EACH ROW EXECUTE FUNCTION public.reject_challenge_evidence_mutation();
CREATE TRIGGER verified_challenge_receipts_immutable BEFORE UPDATE OR DELETE ON public.verified_challenge_receipts
  FOR EACH ROW EXECUTE FUNCTION public.reject_challenge_evidence_mutation();
CREATE TRIGGER verified_challenge_awards_immutable BEFORE UPDATE OR DELETE ON public.verified_challenge_awards
  FOR EACH ROW EXECUTE FUNCTION public.reject_challenge_evidence_mutation();

CREATE FUNCTION public.guard_challenge_session() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE template jsonb;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'challenge_session_immutable'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (NEW.id,NEW.account_id,NEW.edition_id,NEW.descriptor,NEW.admitted_at,NEW.expires_at)
      IS DISTINCT FROM (OLD.id,OLD.account_id,OLD.edition_id,OLD.descriptor,OLD.admitted_at,OLD.expires_at)
    THEN RAISE EXCEPTION 'challenge_identity_immutable'; END IF;
    IF OLD.status<>'active' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'challenge_session_terminal'; END IF;
    IF NEW.compute_attempts NOT IN (OLD.compute_attempts,OLD.compute_attempts+1)
      OR (OLD.bound_transcript IS NOT NULL AND NEW.bound_transcript IS DISTINCT FROM OLD.bound_transcript)
    THEN RAISE EXCEPTION 'challenge_attempt_immutable'; END IF;
  ELSE
    SELECT c.template INTO template FROM public.verified_challenge_catalog c WHERE c.edition_id=NEW.edition_id;
    IF NEW.descriptor IS DISTINCT FROM template || jsonb_build_object('sessionId',NEW.id,'accountId',NEW.account_id,
      'admittedAt',public.challenge_utc(NEW.admitted_at),'expiresAt',public.challenge_utc(NEW.expires_at))
    THEN RAISE EXCEPTION 'challenge_descriptor_invalid'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER verified_challenge_session_guard BEFORE INSERT OR UPDATE OR DELETE ON public.verified_challenge_sessions
  FOR EACH ROW EXECUTE FUNCTION public.guard_challenge_session();

CREATE FUNCTION public.reconcile_verified_challenge(p_account_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_now timestamptz;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_account_id::text,0));
  v_now := clock_timestamp();
  -- Expired write authority alone does not establish that native execution ended.
  -- Retain its identity until exact-fence cleanup or the approved crash cooldown.
  UPDATE public.verification_compute_leases SET worker_id=NULL,endpoint=NULL,session_id=NULL,descriptor_binding=NULL,expires_at=NULL,uncertain_until=NULL
    WHERE account_id=p_account_id AND uncertain_until<=v_now;
  UPDATE public.verified_challenge_sessions s SET status=CASE WHEN s.expires_at<=v_now THEN 'expired' ELSE 'verification_unavailable' END
    WHERE s.account_id=p_account_id AND s.status='active' AND (s.expires_at<=v_now OR (s.compute_attempts=3 AND NOT EXISTS(
      SELECT FROM public.verification_compute_leases l WHERE l.account_id=p_account_id AND l.session_id=s.id
        AND l.endpoint='complete_verified_challenge' AND l.worker_id IS NOT NULL AND l.expires_at>v_now)));
END $$;

CREATE FUNCTION public.set_verified_challenge_starts(p_edition_id text,p_enabled boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'challenge_invalid_control'; END IF;
  UPDATE public.verified_challenge_controls SET starts_enabled=p_enabled,updated_at=clock_timestamp() WHERE edition_id=p_edition_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'challenge_unknown_edition'; END IF;
END $$;

CREATE FUNCTION public.start_verified_challenge(p_account_id uuid,p_trial_id text,p_supported_descriptor_versions smallint[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.verified_challenge_sessions%ROWTYPE; c public.verified_challenge_catalog%ROWTYPE; v_now timestamptz; session uuid;
BEGIN
  IF p_account_id IS NULL OR p_trial_id IS DISTINCT FROM 'crosswind-qualification'
    OR p_supported_descriptor_versions IS NULL OR cardinality(p_supported_descriptor_versions)<>1 OR array_ndims(p_supported_descriptor_versions)<>1
    OR p_supported_descriptor_versions[1] IS NULL
  THEN RETURN jsonb_build_object('ok',false,'error','invalid_challenge_start'); END IF;
  PERFORM public.reconcile_verified_challenge(p_account_id);
  SELECT * INTO s FROM public.verified_challenge_sessions WHERE account_id=p_account_id AND status='active' FOR UPDATE;
  IF FOUND THEN
    IF s.edition_id<>'cq1' OR (s.descriptor->>'descriptorVersion')::smallint<>p_supported_descriptor_versions[1]
    THEN RETURN jsonb_build_object('ok',false,'error','active_challenge_incompatible'); END IF;
    RETURN jsonb_build_object('ok',true,'resumed',true,'descriptor',s.descriptor);
  END IF;
  IF p_supported_descriptor_versions<>ARRAY[1]::smallint[] THEN RETURN jsonb_build_object('ok',false,'error','unsupported_challenge_descriptor'); END IF;
  -- The static cq1 registry alone is executable in this release. Future rows do
  -- not become executable just because an operator adds/enables a catalog entry.
  PERFORM FROM public.verified_challenge_controls WHERE edition_id='cq1' AND starts_enabled FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','challenge_starts_disabled'); END IF;
  SELECT * INTO STRICT c FROM public.verified_challenge_catalog WHERE edition_id='cq1';
  v_now := clock_timestamp(); session := gen_random_uuid();
  INSERT INTO public.verified_challenge_sessions(id,account_id,edition_id,descriptor,admitted_at,expires_at)
    VALUES(session,p_account_id,c.edition_id,c.template||jsonb_build_object('sessionId',session,'accountId',p_account_id,
      'admittedAt',public.challenge_utc(v_now),'expiresAt',public.challenge_utc(v_now+interval '30 minutes')),
      v_now,v_now+interval '30 minutes') RETURNING * INTO s;
  RETURN jsonb_build_object('ok',true,'resumed',false,'descriptor',s.descriptor);
END $$;

CREATE FUNCTION public.challenge_receipt_json(p_receipt public.verified_challenge_receipts) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('sessionId',p_receipt.session_id,'accountId',p_receipt.account_id,'editionId',p_receipt.edition_id,
    'transcript',p_receipt.transcript,'outcome',p_receipt.outcome,'disposition',p_receipt.disposition,'xpGranted',p_receipt.xp_granted,
    'completedAt',public.challenge_utc(p_receipt.completed_at),
    'careerBeforeLedger',p_receipt.career_before_ledger,'careerAfterLedger',p_receipt.career_after_ledger);
$$;

CREATE FUNCTION public.get_verified_challenge(p_account_id uuid,p_session_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.verified_challenge_sessions%ROWTYPE; r public.verified_challenge_receipts%ROWTYPE;
BEGIN
  IF p_account_id IS NULL OR p_session_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','challenge_not_found'); END IF;
  PERFORM public.reconcile_verified_challenge(p_account_id);
  SELECT * INTO s FROM public.verified_challenge_sessions WHERE id=p_session_id AND account_id=p_account_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','challenge_not_found'); END IF;
  SELECT * INTO r FROM public.verified_challenge_receipts WHERE session_id=p_session_id AND account_id=p_account_id;
  RETURN jsonb_build_object('ok',true,'descriptor',s.descriptor,'status',s.status,'computeAttempts',s.compute_attempts,
    'boundTranscript',s.bound_transcript,'receipt',CASE WHEN r.session_id IS NULL THEN NULL ELSE public.challenge_receipt_json(r) END);
END $$;

CREATE FUNCTION public.abandon_verified_challenge(p_account_id uuid,p_session_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.reconcile_verified_challenge(p_account_id);
  UPDATE public.verified_challenge_sessions SET status='abandoned' WHERE id=p_session_id AND account_id=p_account_id AND status='active';
  -- Aborting a session excludes finalization but retains the account admission
  -- guard until exact ended-call release or cooldown expiry, not termination proof.
  RETURN public.get_verified_challenge(p_account_id,p_session_id);
END $$;

CREATE FUNCTION public.acquire_verification_compute_lease(p_account_id uuid,p_endpoint text,p_session_id uuid,p_descriptor_binding text,p_transcript jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.verified_challenge_sessions%ROWTYPE; d public.verified_deployments%ROWTYPE; l public.verification_compute_leases%ROWTYPE;
  r public.verified_challenge_receipts%ROWTYPE; v_now timestamptz;
BEGIN
  IF p_account_id IS NULL OR p_endpoint IS NULL OR p_endpoint NOT IN ('complete_verified_challenge','complete_verified_deployment','verified_replay_probe')
    OR p_descriptor_binding IS NULL
    OR (p_endpoint='complete_verified_challenge' AND (p_session_id IS NULL OR NOT public.is_valid_challenge_transcript(p_transcript)))
    OR (p_endpoint='complete_verified_deployment' AND (p_session_id IS NULL OR NOT public.is_valid_verified_transcript(p_transcript)))
    OR (p_endpoint='verified_replay_probe' AND (p_session_id IS NOT NULL OR p_transcript IS NOT NULL OR p_descriptor_binding<>'probe-v1'))
  THEN RETURN jsonb_build_object('ok',false,'error','invalid_verification_request'); END IF;
  PERFORM public.reconcile_verified_challenge(p_account_id);
  IF p_endpoint='complete_verified_challenge' THEN
    SELECT * INTO s FROM public.verified_challenge_sessions WHERE id=p_session_id AND account_id=p_account_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','challenge_not_found'); END IF;
    SELECT * INTO r FROM public.verified_challenge_receipts WHERE session_id=p_session_id;
    IF FOUND THEN
      IF r.transcript=p_transcript AND r.edition_id=p_descriptor_binding
      THEN RETURN jsonb_build_object('ok',true,'receipt',public.challenge_receipt_json(r)); END IF;
      RETURN jsonb_build_object('ok',false,'error','challenge_completion_conflict');
    END IF;
    IF s.status<>'active' OR s.edition_id<>'cq1' OR s.edition_id<>p_descriptor_binding OR s.expires_at<=clock_timestamp()
    THEN RETURN jsonb_build_object('ok',false,'error','challenge_not_completable'); END IF;
    IF s.bound_transcript IS NOT NULL AND s.bound_transcript<>p_transcript
    THEN RETURN jsonb_build_object('ok',false,'error','challenge_transcript_conflict'); END IF;
  ELSIF p_endpoint='complete_verified_deployment' THEN
    SELECT * INTO d FROM public.verified_deployments WHERE id=p_session_id AND user_id=p_account_id FOR UPDATE;
    IF NOT FOUND OR d.status<>'active' OR d.expires_at<=clock_timestamp() OR d.contract_version NOT IN (2,3)
      OR p_descriptor_binding<>'deployment-v'||d.contract_version::text
    THEN RETURN jsonb_build_object('ok',false,'error','verified_deployment_not_completable'); END IF;
    -- Legacy completed receipts bypass this RPC at the existing completion-context lookup.
  END IF;
  INSERT INTO public.verification_compute_leases(account_id) VALUES(p_account_id) ON CONFLICT DO NOTHING;
  SELECT * INTO l FROM public.verification_compute_leases WHERE account_id=p_account_id FOR UPDATE;
  v_now := clock_timestamp();
  IF l.worker_id IS NOT NULL AND l.uncertain_until>v_now
  THEN RETURN jsonb_build_object('ok',false,'error','verification_busy','retryAfter',greatest(1,ceil(extract(epoch FROM
    (CASE WHEN l.expires_at>v_now THEN l.expires_at ELSE l.uncertain_until END)-v_now)))::integer); END IF;
  IF p_endpoint='complete_verified_challenge' THEN
    IF s.compute_attempts>=3 THEN RETURN jsonb_build_object('ok',false,'error','challenge_not_completable'); END IF;
    UPDATE public.verified_challenge_sessions SET compute_attempts=compute_attempts+1,bound_transcript=p_transcript WHERE id=p_session_id;
  END IF;
  UPDATE public.verification_compute_leases SET fence=fence+1,worker_id=gen_random_uuid(),endpoint=p_endpoint,session_id=p_session_id,
    descriptor_binding=p_descriptor_binding,expires_at=v_now+interval '10 seconds',uncertain_until=v_now+interval '410 seconds'
    WHERE account_id=p_account_id RETURNING * INTO l;
  RETURN jsonb_build_object('ok',true,'workerId',l.worker_id,'fence',l.fence,'endpoint',l.endpoint,'sessionId',l.session_id,
    'descriptorBinding',l.descriptor_binding,'expiresAt',public.challenge_utc(l.expires_at),
    'uncertainUntil',public.challenge_utc(l.uncertain_until));
END $$;

CREATE FUNCTION public.verification_compute_lease_is_current(p_account_id uuid,p_endpoint text,p_session_id uuid,p_descriptor_binding text,p_worker_id uuid,p_fence bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_account_id::text,0));
  RETURN EXISTS(SELECT FROM public.verification_compute_leases WHERE account_id=p_account_id AND endpoint=p_endpoint
    AND session_id IS NOT DISTINCT FROM p_session_id AND descriptor_binding=p_descriptor_binding
    AND worker_id=p_worker_id AND fence=p_fence AND expires_at>clock_timestamp());
END $$;

-- The existing RPC remains available during a staged migration; upgraded costly
-- handlers use this wrapper. Enable cq1 only after every deployed handler has
-- joined the lease. Holding the account lock makes the fence and legacy award
-- one transaction, while leaving historical receipt/XP calculations unchanged.
CREATE FUNCTION public.complete_verified_deployment_fenced(p_user_id uuid,p_session_id uuid,p_transcript jsonb,
  p_won boolean,p_outcome text,p_verified_xp integer,p_descriptor_binding text,p_worker_id uuid,p_fence bigint)
RETURNS SETOF public.verified_match_results
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE session public.verified_deployments%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,0));
  SELECT * INTO session FROM public.verified_deployments WHERE id=p_session_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR session.status<>'active' OR session.expires_at<=clock_timestamp()
    OR p_descriptor_binding IS DISTINCT FROM 'deployment-v'||session.contract_version::text
  THEN RAISE EXCEPTION 'verified_deployment_not_completable'; END IF;
  IF NOT public.verification_compute_lease_is_current(p_user_id,'complete_verified_deployment',p_session_id,p_descriptor_binding,p_worker_id,p_fence)
  THEN RAISE EXCEPTION 'verification_lease_lost'; END IF;
  RETURN QUERY SELECT * FROM public.complete_verified_deployment(p_user_id,p_session_id,p_transcript,p_won,p_outcome,p_verified_xp);
END $$;

CREATE FUNCTION public.release_verification_compute_lease(p_account_id uuid,p_worker_id uuid,p_fence bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE released boolean;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_account_id::text,0));
  UPDATE public.verification_compute_leases SET worker_id=NULL,endpoint=NULL,session_id=NULL,descriptor_binding=NULL,expires_at=NULL,uncertain_until=NULL
    WHERE account_id=p_account_id AND worker_id=p_worker_id AND fence=p_fence;
  released := FOUND;
  PERFORM public.reconcile_verified_challenge(p_account_id);
  RETURN released;
END $$;

CREATE FUNCTION public.verified_career_ledger_snapshot(p_account_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE snapshot jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_account_id::text,0));
  -- One statement gives both ledgers the same MVCC snapshot. The shared account
  -- lock also serializes migration 020's existing verified completion writes.
  SELECT jsonb_build_object('verifiedMatches',replay.matches,'verifiedWins',replay.wins,'replayXp',replay.xp,
    'challengeXp',challenge.xp,'totalXp',replay.xp+challenge.xp,'medals',challenge.medals) INTO snapshot
  FROM (SELECT count(*)::bigint AS matches,count(*) FILTER(WHERE won)::bigint AS wins,
      (100*count(*)+100*count(*) FILTER(WHERE won))::bigint AS xp FROM public.verified_match_results WHERE user_id=p_account_id) replay
  CROSS JOIN (SELECT coalesce(sum(xp),0)::bigint AS xp,
    coalesce(jsonb_agg(jsonb_build_object('entitlementId',entitlement_id,'medalId',medal_id,'xp',xp,'rewardVersion',reward_version,
      'awardedAt',public.challenge_utc(awarded_at),'sessionId',session_id) ORDER BY entitlement_id,awarded_at,session_id),'[]'::jsonb) AS medals
    FROM public.verified_challenge_awards WHERE account_id=p_account_id) challenge;
  RETURN snapshot;
END $$;

CREATE FUNCTION public.finalize_verified_challenge(p_account_id uuid,p_session_id uuid,p_edition_id text,p_transcript jsonb,p_outcome text,p_worker_id uuid,p_fence bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.verified_challenge_sessions%ROWTYPE; r public.verified_challenge_receipts%ROWTYPE;
  before_ledger jsonb; after_ledger jsonb; granted integer := 0; disposition text := 'not_awarded'; completed timestamptz;
BEGIN
  IF p_account_id IS NULL OR p_session_id IS NULL OR p_edition_id IS NULL OR NOT public.is_valid_challenge_transcript(p_transcript)
    OR p_outcome IS NULL OR p_outcome NOT IN ('objective_cleared','terminal_without_clear','objective_not_cleared','work_limit')
  THEN RETURN jsonb_build_object('ok',false,'error','invalid_challenge_completion'); END IF;
  PERFORM public.reconcile_verified_challenge(p_account_id);
  SELECT * INTO s FROM public.verified_challenge_sessions WHERE id=p_session_id AND account_id=p_account_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','challenge_not_found'); END IF;
  SELECT * INTO r FROM public.verified_challenge_receipts WHERE session_id=p_session_id;
  IF FOUND THEN
    IF r.transcript=p_transcript AND r.outcome=p_outcome AND r.edition_id=p_edition_id
    THEN RETURN jsonb_build_object('ok',true,'receipt',public.challenge_receipt_json(r)); END IF;
    RETURN jsonb_build_object('ok',false,'error','challenge_completion_conflict');
  END IF;
  IF s.status<>'active' OR s.expires_at<=clock_timestamp() OR s.edition_id<>'cq1' OR s.edition_id<>p_edition_id
  THEN RETURN jsonb_build_object('ok',false,'error','challenge_not_completable'); END IF;
  IF s.bound_transcript IS DISTINCT FROM p_transcript THEN RETURN jsonb_build_object('ok',false,'error','challenge_transcript_conflict'); END IF;
  IF NOT public.verification_compute_lease_is_current(p_account_id,'complete_verified_challenge',p_session_id,p_edition_id,p_worker_id,p_fence)
  THEN RETURN jsonb_build_object('ok',false,'error','verification_lease_lost'); END IF;
  before_ledger := public.verified_career_ledger_snapshot(p_account_id); completed := clock_timestamp();
  IF p_outcome='objective_cleared' THEN
    INSERT INTO public.verified_challenge_awards(account_id,entitlement_id,session_id,medal_id,xp,reward_version,awarded_at)
      VALUES(p_account_id,s.descriptor->>'entitlementId',p_session_id,s.descriptor->'reward'->>'medalId',200,1,completed)
      ON CONFLICT(account_id,entitlement_id) DO NOTHING;
    IF FOUND THEN granted := 200; disposition := 'awarded'; ELSE disposition := 'already_owned'; END IF;
  END IF;
  after_ledger := public.verified_career_ledger_snapshot(p_account_id);
  INSERT INTO public.verified_challenge_receipts(session_id,account_id,edition_id,transcript,outcome,disposition,xp_granted,
    career_before_ledger,career_after_ledger,completed_at)
    VALUES(p_session_id,p_account_id,p_edition_id,p_transcript,p_outcome,disposition,granted,before_ledger,after_ledger,completed) RETURNING * INTO r;
  UPDATE public.verified_challenge_sessions SET status='completed' WHERE id=p_session_id;
  PERFORM public.release_verification_compute_lease(p_account_id,p_worker_id,p_fence);
  RETURN jsonb_build_object('ok',true,'receipt',public.challenge_receipt_json(r));
END $$;

-- Replay-invalid transcripts are terminal non-awarding attempts, distinct from
-- an objective failure. This is trusted worker output; syntax fails before acquire.
CREATE FUNCTION public.reject_verified_challenge(p_account_id uuid,p_session_id uuid,p_worker_id uuid,p_fence bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.verified_challenge_sessions%ROWTYPE;
BEGIN
  PERFORM public.reconcile_verified_challenge(p_account_id);
  SELECT * INTO s FROM public.verified_challenge_sessions WHERE id=p_session_id AND account_id=p_account_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','challenge_not_found'); END IF;
  IF s.status<>'active' THEN RETURN jsonb_build_object('ok',false,'error','challenge_not_completable'); END IF;
  IF NOT public.verification_compute_lease_is_current(p_account_id,'complete_verified_challenge',p_session_id,s.edition_id,p_worker_id,p_fence)
  THEN RETURN jsonb_build_object('ok',false,'error','verification_lease_lost'); END IF;
  UPDATE public.verified_challenge_sessions SET status='invalid' WHERE id=p_session_id;
  PERFORM public.release_verification_compute_lease(p_account_id,p_worker_id,p_fence);
  RETURN public.get_verified_challenge(p_account_id,p_session_id);
END $$;

-- Explicit ACLs apply even on hosts with broad default grants. No SECURITY DEFINER
-- function resolves caller-owned objects; trusted service_role is the only entry.
DO $acl$
DECLARE table_name text; function_signature regprocedure;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['verified_challenge_catalog','verified_challenge_controls','verified_challenge_sessions',
    'verified_challenge_receipts','verified_challenge_awards','verification_compute_leases'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',table_name);
  END LOOP;
  FOR function_signature IN SELECT p.oid::regprocedure FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('is_valid_challenge_transcript','challenge_utc','reject_challenge_evidence_mutation','guard_challenge_session',
      'reconcile_verified_challenge','set_verified_challenge_starts','start_verified_challenge','challenge_receipt_json','get_verified_challenge',
      'abandon_verified_challenge','acquire_verification_compute_lease','verification_compute_lease_is_current','release_verification_compute_lease',
      'verified_career_ledger_snapshot','finalize_verified_challenge','reject_verified_challenge','complete_verified_deployment_fenced') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',function_signature);
  END LOOP;
END $acl$;
GRANT EXECUTE ON FUNCTION public.set_verified_challenge_starts(text,boolean),public.start_verified_challenge(uuid,text,smallint[]),
  public.complete_verified_deployment_fenced(uuid,uuid,jsonb,boolean,text,integer,text,uuid,bigint),
  public.get_verified_challenge(uuid,uuid),public.abandon_verified_challenge(uuid,uuid),
  public.acquire_verification_compute_lease(uuid,text,uuid,text,jsonb),public.verification_compute_lease_is_current(uuid,text,uuid,text,uuid,bigint),
  public.release_verification_compute_lease(uuid,uuid,bigint),public.verified_career_ledger_snapshot(uuid),
  public.finalize_verified_challenge(uuid,uuid,text,jsonb,text,uuid,bigint),public.reject_verified_challenge(uuid,uuid,uuid,bigint) TO service_role;

COMMENT ON TABLE public.verified_challenge_catalog IS 'INTERNAL immutable reviewed trial descriptors; cq1 starts disabled on migration.';
COMMENT ON TABLE public.verified_challenge_controls IS 'INTERNAL service-only admission; enable only after separately approved hosted rollout evidence.';
COMMENT ON TABLE public.verified_challenge_sessions IS 'PRIVATE Auth owner, immutable challenge admission, bounded attempts and transcript. No direct browser access.';
COMMENT ON TABLE public.verified_challenge_receipts IS 'PRIVATE append-only replay results and historical ledger facts; not a public career response.';
COMMENT ON TABLE public.verified_challenge_awards IS 'PRIVATE append-only one-ever entitlement medal and exactly 200 XP; technical editions never reset this key.';
COMMENT ON TABLE public.verification_compute_leases IS 'INTERNAL account worker/fence bindings. Database fencing does not prove host CPU termination.';
RESET lock_timeout;
RESET statement_timeout;
