-- singedTerra - protected-floor Verified Deployment contract transition
-- Version: 017
-- Safety: preserve immutable V1 history; V2 never selects old replay code.
-- Rollout: disable/drain V1, apply this additive migration, deploy V2 functions,
-- publish the strict V2 client, verify, then explicitly enable V2 starts.

ALTER TABLE public.verified_deployment_contracts
  DROP CONSTRAINT verified_deployment_contracts_contract_version_check,
  ADD CONSTRAINT verified_deployment_contracts_contract_version_check
    CHECK (contract_version IN (1, 2));

ALTER TABLE public.verified_deployments
  DROP CONSTRAINT verified_deployments_contract_version_check,
  DROP CONSTRAINT verified_deployments_engine_version_check,
  DROP CONSTRAINT verified_deployments_ruleset_version_check,
  ADD CONSTRAINT verified_deployments_version_tuple_check
    CHECK (
      (contract_version = 1 AND engine_version = 1 AND ruleset_version = 3)
      OR (contract_version = 2 AND engine_version = 2 AND ruleset_version = 4)
    );

INSERT INTO public.verified_deployment_contracts (contract_version, starts_enabled, disabled_at)
VALUES (2, false, now())
ON CONFLICT (contract_version) DO NOTHING;

CREATE OR REPLACE FUNCTION public.start_verified_deployment(
  p_user_id uuid,
  p_config jsonb,
  p_expires_at timestamptz
)
RETURNS TABLE (
  id uuid, user_id uuid, config jsonb, contract_version smallint,
  engine_version smallint, ruleset_version smallint, status text,
  expires_at timestamptz, created_at timestamptz, updated_at timestamptz,
  resumed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz := now();
  v_starts_enabled boolean;
  v_session public.verified_deployments%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR jsonb_typeof(p_config) <> 'object'
    OR p_expires_at <= v_now OR p_expires_at > v_now + interval '30 minutes'
  THEN RAISE EXCEPTION 'verified_deployment_invalid_start'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  SELECT * INTO v_session FROM public.verified_deployments
    WHERE user_id = p_user_id AND status = 'active' FOR UPDATE;
  IF FOUND AND v_session.expires_at > v_now THEN
    IF v_session.contract_version <> 2 OR v_session.engine_version <> 2 OR v_session.ruleset_version <> 4
    THEN RAISE EXCEPTION 'verified_deployment_legacy_drain_active'; END IF;
    RETURN QUERY SELECT v_session.id, v_session.user_id, v_session.config, v_session.contract_version,
      v_session.engine_version, v_session.ruleset_version, v_session.status, v_session.expires_at,
      v_session.created_at, v_session.updated_at, true;
    RETURN;
  END IF;
  IF FOUND THEN UPDATE public.verified_deployments SET status = 'expired' WHERE id = v_session.id; END IF;

  -- Disable gates only new admissions. A live V2 session must remain resumable
  -- through an incident/drain; a live V1 session was rejected above.
  SELECT starts_enabled INTO v_starts_enabled
    FROM public.verified_deployment_contracts WHERE contract_version = 2 FOR UPDATE;
  IF NOT FOUND OR NOT v_starts_enabled THEN RAISE EXCEPTION 'verified_deployment_starts_disabled'; END IF;

  INSERT INTO public.verified_deployments (
    user_id, config, contract_version, engine_version, ruleset_version, expires_at
  ) VALUES (p_user_id, p_config, 2, 2, 4, p_expires_at)
  RETURNING * INTO v_session;
  UPDATE public.verified_deployment_contracts SET last_started_at = v_now, updated_at = v_now
    WHERE contract_version = 2;
  RETURN QUERY SELECT v_session.id, v_session.user_id, v_session.config, v_session.contract_version,
    v_session.engine_version, v_session.ruleset_version, v_session.status, v_session.expires_at,
    v_session.created_at, v_session.updated_at, false;
END;
$function$;

-- Draining V1 starts must not strand an authenticated player who elects to
-- abandon a still-live V1 session. Abandonment never evaluates a replay; it
-- only transitions an owned active session to its terminal status.
CREATE OR REPLACE FUNCTION public.abandon_verified_deployment(
  p_user_id uuid,
  p_session_id uuid
)
RETURNS SETOF public.verified_deployments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz := now();
  v_session public.verified_deployments%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL THEN
    RAISE EXCEPTION 'verified_deployment_invalid_abandon';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  SELECT * INTO v_session
    FROM public.verified_deployments
    WHERE id = p_session_id
    FOR UPDATE;

  IF v_session.id IS NULL OR v_session.user_id <> p_user_id THEN
    RAISE EXCEPTION 'verified_deployment_not_found';
  END IF;
  IF v_session.status = 'abandoned' THEN
    RETURN NEXT v_session;
    RETURN;
  END IF;
  IF v_session.contract_version NOT IN (1, 2)
    OR v_session.status <> 'active' OR v_session.expires_at <= v_now THEN
    RAISE EXCEPTION 'verified_deployment_not_abandonable';
  END IF;

  UPDATE public.verified_deployments
    SET status = 'abandoned'
    WHERE id = v_session.id
    RETURNING * INTO v_session;
  RETURN NEXT v_session;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_verified_deployment(
  p_user_id uuid, p_session_id uuid, p_transcript jsonb, p_won boolean,
  p_outcome text, p_verified_xp integer
)
RETURNS SETOF public.verified_match_results
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz := now();
  v_session public.verified_deployments%ROWTYPE;
  v_result public.verified_match_results%ROWTYPE;
  v_prior_verified_matches bigint;
  v_prior_verified_wins bigint;
  v_prior_total_xp bigint;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR NOT public.is_valid_verified_transcript(p_transcript)
    OR (p_won AND (p_outcome <> 'win' OR p_verified_xp <> 200))
    OR (NOT p_won AND (p_outcome NOT IN ('loss', 'draw') OR p_verified_xp <> 100))
  THEN RAISE EXCEPTION 'verified_deployment_invalid_completion'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  SELECT * INTO v_session FROM public.verified_deployments WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.user_id <> p_user_id THEN RAISE EXCEPTION 'verified_deployment_not_found'; END IF;
  SELECT * INTO v_result FROM public.verified_match_results WHERE session_id = p_session_id FOR UPDATE;
  IF FOUND THEN
    IF v_result.transcript = p_transcript AND v_result.won = p_won AND v_result.outcome = p_outcome
      AND v_result.verified_xp = p_verified_xp THEN RETURN NEXT v_result; RETURN; END IF;
    RAISE EXCEPTION 'verified_deployment_completion_conflict';
  END IF;
  IF v_session.contract_version <> 2 OR v_session.engine_version <> 2 OR v_session.ruleset_version <> 4
    OR v_session.status <> 'active' OR v_session.expires_at <= v_now
  THEN RAISE EXCEPTION 'verified_deployment_not_completable'; END IF;

  SELECT count(*)::bigint, count(*) FILTER (WHERE result.won)::bigint, COALESCE(sum(result.verified_xp), 0)::bigint
    INTO v_prior_verified_matches, v_prior_verified_wins, v_prior_total_xp
    FROM public.verified_match_results AS result WHERE result.user_id = p_user_id;
  INSERT INTO public.verified_match_results (
    session_id, user_id, transcript, won, outcome, verified_xp,
    prior_verified_matches, prior_verified_wins, prior_total_xp,
    current_verified_matches, current_verified_wins, current_total_xp
  ) VALUES (
    p_session_id, p_user_id, p_transcript, p_won, p_outcome, p_verified_xp,
    v_prior_verified_matches, v_prior_verified_wins, v_prior_total_xp,
    v_prior_verified_matches + 1, v_prior_verified_wins + CASE WHEN p_won THEN 1 ELSE 0 END,
    v_prior_total_xp + p_verified_xp
  ) RETURNING * INTO v_result;
  UPDATE public.verified_deployments SET status = 'completed' WHERE id = p_session_id;
  RETURN NEXT v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_verified_deployment_starts(
  p_contract_version smallint, p_starts_enabled boolean
)
RETURNS SETOF public.verified_deployment_contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz := now();
  v_contract public.verified_deployment_contracts%ROWTYPE;
  v_v1 public.verified_deployment_contracts%ROWTYPE;
  v_safe_after timestamptz;
  v_unexpired bigint;
BEGIN
  IF p_contract_version NOT IN (1, 2) THEN RAISE EXCEPTION 'verified_deployment_contract_unsupported'; END IF;
  -- V1 may be observed and disabled during the drain, but this deployment
  -- boundary is one-way: no service tool can admit fresh V1 semantics again.
  IF p_contract_version = 1 AND p_starts_enabled
  THEN RAISE EXCEPTION 'verified_deployment_legacy_reenable_forbidden'; END IF;
  SELECT * INTO v_contract FROM public.verified_deployment_contracts
    WHERE contract_version = p_contract_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'verified_deployment_contract_unsupported'; END IF;
  IF p_starts_enabled AND NOT v_contract.starts_enabled THEN
    v_safe_after := COALESCE(v_contract.last_started_at + interval '30 minutes', v_contract.disabled_at);
    SELECT count(*) INTO v_unexpired FROM public.verified_deployments
      WHERE status = 'active' AND contract_version = p_contract_version AND expires_at > v_now;
    IF v_now < v_safe_after OR v_unexpired <> 0 THEN RAISE EXCEPTION 'verified_deployment_drain_incomplete'; END IF;
    IF p_contract_version = 2 THEN
      SELECT * INTO v_v1 FROM public.verified_deployment_contracts WHERE contract_version = 1 FOR UPDATE;
      v_safe_after := COALESCE(v_v1.last_started_at + interval '30 minutes', v_v1.disabled_at);
      SELECT count(*) INTO v_unexpired FROM public.verified_deployments
        WHERE status = 'active' AND contract_version = 1 AND expires_at > v_now;
      IF v_v1.starts_enabled OR v_now < v_safe_after OR v_unexpired <> 0
      THEN RAISE EXCEPTION 'verified_deployment_drain_incomplete'; END IF;
    END IF;
  END IF;
  UPDATE public.verified_deployment_contracts SET starts_enabled = p_starts_enabled,
    disabled_at = CASE WHEN starts_enabled AND NOT p_starts_enabled THEN v_now ELSE disabled_at END,
    updated_at = v_now WHERE contract_version = p_contract_version RETURNING * INTO v_contract;
  RETURN NEXT v_contract;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verified_deployment_drain_status(p_contract_version smallint)
RETURNS TABLE (
  contract_version smallint, starts_enabled boolean, disabled_at timestamptz,
  last_started_at timestamptz, safe_after timestamptz, unexpired_sessions bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_now timestamptz := now();
BEGIN
  IF p_contract_version NOT IN (1, 2) THEN RAISE EXCEPTION 'verified_deployment_contract_unsupported'; END IF;
  RETURN QUERY SELECT control.contract_version, control.starts_enabled, control.disabled_at,
    control.last_started_at, COALESCE(control.last_started_at + interval '30 minutes', control.disabled_at),
    (SELECT count(*) FROM public.verified_deployments AS deployment
      WHERE deployment.contract_version = p_contract_version AND deployment.status = 'active' AND deployment.expires_at > v_now)
  FROM public.verified_deployment_contracts AS control WHERE control.contract_version = p_contract_version;
END;
$function$;
