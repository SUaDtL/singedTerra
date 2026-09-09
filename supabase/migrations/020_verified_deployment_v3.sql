-- singedTerra - compatible Verified Deployment V3 admission and completion
-- Version: 020
-- Safety: V2 remains admitted and replayable; V3 starts disabled by default.
-- Classification: existing account-linked deployment/result data retains the
-- classification and service-only access established by migration 016 and
-- .codearbiter/security-controls.md. No new personal-data columns are added.
-- Operational rollback: SELECT * FROM public.set_verified_deployment_starts(3::smallint, false);
-- Retain this schema and both verifiers after any V3 session exists: eligible
-- sessions must still resume/complete, and completed evidence is immutable.
-- Deploy this migration before the capability-aware start Edge function; the
-- existing three-argument start RPC remains available for the old function.
-- Bound deployment contention with live V2 traffic. On timeout, inspect the
-- remote migration state before retrying; do not repeatedly queue the DDL.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

ALTER TABLE public.verified_deployment_contracts
  DROP CONSTRAINT verified_deployment_contracts_contract_version_check,
  ADD CONSTRAINT verified_deployment_contracts_contract_version_check
    CHECK (contract_version IN (1, 2, 3));

ALTER TABLE public.verified_deployments
  DROP CONSTRAINT verified_deployments_version_tuple_check,
  ADD CONSTRAINT verified_deployments_version_tuple_check
    CHECK (
      (contract_version = 1 AND engine_version = 1 AND ruleset_version = 3)
      OR (contract_version = 2 AND engine_version = 2 AND ruleset_version = 4)
      OR (contract_version = 3 AND engine_version = 3 AND ruleset_version = 4)
    );

INSERT INTO public.verified_deployment_contracts (contract_version, starts_enabled, disabled_at)
VALUES (3, false, now())
ON CONFLICT (contract_version) DO NOTHING;


CREATE OR REPLACE FUNCTION public.start_verified_deployment_for_contracts(
  p_user_id uuid,
  p_config jsonb,
  p_expires_at timestamptz,
  p_supported_contract_versions smallint[]
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
  v_selected_contract smallint;
  v_session public.verified_deployments%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_config IS NULL OR jsonb_typeof(p_config) <> 'object'
    OR p_expires_at IS NULL OR p_expires_at <= v_now OR p_expires_at > v_now + interval '30 minutes'
    OR p_supported_contract_versions IS NULL
    OR array_ndims(p_supported_contract_versions) <> 1
    OR COALESCE(array_length(p_supported_contract_versions, 1), 0) = 0
    OR EXISTS (SELECT 1 FROM unnest(p_supported_contract_versions) AS requested(version)
      WHERE requested.version IS NULL OR requested.version NOT IN (2, 3))
    OR (SELECT count(*) FROM unnest(p_supported_contract_versions))
      <> (SELECT count(DISTINCT requested.version) FROM unnest(p_supported_contract_versions) AS requested(version))
  THEN RAISE EXCEPTION 'verified_deployment_invalid_start'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  -- Every admission/control path locks the control rows in ascending order.
  PERFORM control.contract_version FROM public.verified_deployment_contracts AS control
    WHERE control.contract_version IN (1, 2, 3) ORDER BY control.contract_version FOR UPDATE;

  SELECT deployment.* INTO v_session FROM public.verified_deployments AS deployment
    WHERE deployment.user_id = p_user_id AND deployment.status = 'active' FOR UPDATE;
  IF FOUND AND v_session.expires_at > v_now THEN
    IF (v_session.contract_version, v_session.engine_version, v_session.ruleset_version) = (1, 1, 3)
    THEN RAISE EXCEPTION 'verified_deployment_legacy_drain_active'; END IF;
    IF NOT (
      (v_session.contract_version, v_session.engine_version, v_session.ruleset_version) IN ((2, 2, 4), (3, 3, 4))
      AND v_session.contract_version = ANY(p_supported_contract_versions)
    ) THEN RAISE EXCEPTION 'verified_deployment_incompatible_active'; END IF;
    RETURN QUERY SELECT v_session.id, v_session.user_id, v_session.config, v_session.contract_version,
      v_session.engine_version, v_session.ruleset_version, v_session.status, v_session.expires_at,
      v_session.created_at, v_session.updated_at, true;
    RETURN;
  END IF;
  IF FOUND THEN
    UPDATE public.verified_deployments AS deployment SET status = 'expired' WHERE deployment.id = v_session.id;
  END IF;

  SELECT control.contract_version INTO v_selected_contract
    FROM public.verified_deployment_contracts AS control
    WHERE control.contract_version = ANY(p_supported_contract_versions) AND control.starts_enabled
      AND control.contract_version IN (2, 3)
    ORDER BY control.contract_version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'verified_deployment_starts_disabled'; END IF;

  INSERT INTO public.verified_deployments AS deployment (
    user_id, config, contract_version, engine_version, ruleset_version, expires_at
  ) VALUES (
    p_user_id, p_config, v_selected_contract,
    CASE v_selected_contract WHEN 2 THEN 2 WHEN 3 THEN 3 END,
    4, p_expires_at
  ) RETURNING deployment.* INTO v_session;
  UPDATE public.verified_deployment_contracts AS control
    SET last_started_at = v_now, updated_at = v_now
    WHERE control.contract_version = v_selected_contract;
  RETURN QUERY SELECT v_session.id, v_session.user_id, v_session.config, v_session.contract_version,
    v_session.engine_version, v_session.ruleset_version, v_session.status, v_session.expires_at,
    v_session.created_at, v_session.updated_at, false;
END;
$function$;

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
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT * FROM public.start_verified_deployment_for_contracts(
    p_user_id, p_config, p_expires_at, ARRAY[2]::smallint[]
  );
$function$;

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
  IF v_session.contract_version NOT IN (1, 2, 3)
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
  IF NOT ((v_session.contract_version, v_session.engine_version, v_session.ruleset_version) IN ((2, 2, 4), (3, 3, 4)))
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
  IF p_contract_version NOT IN (1, 2, 3) THEN RAISE EXCEPTION 'verified_deployment_contract_unsupported'; END IF;
  PERFORM control.contract_version FROM public.verified_deployment_contracts AS control
    WHERE control.contract_version IN (1, 2, 3) ORDER BY control.contract_version FOR UPDATE;
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
  IF p_contract_version NOT IN (1, 2, 3) THEN RAISE EXCEPTION 'verified_deployment_contract_unsupported'; END IF;
  RETURN QUERY SELECT control.contract_version, control.starts_enabled, control.disabled_at,
    control.last_started_at, COALESCE(control.last_started_at + interval '30 minutes', control.disabled_at),
    (SELECT count(*) FROM public.verified_deployments AS deployment
      WHERE deployment.contract_version = p_contract_version AND deployment.status = 'active' AND deployment.expires_at > v_now)
  FROM public.verified_deployment_contracts AS control WHERE control.contract_version = p_contract_version;
END;
$function$;

REVOKE ALL ON FUNCTION public.start_verified_deployment_for_contracts(uuid, jsonb, timestamptz, smallint[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_verified_deployment_for_contracts(uuid, jsonb, timestamptz, smallint[]) TO service_role;

-- Reassert the existing service-only surface after replacement.
REVOKE ALL ON FUNCTION public.start_verified_deployment(uuid, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.abandon_verified_deployment(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_verified_deployment(uuid, uuid, jsonb, boolean, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_verified_deployment_starts(smallint, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verified_deployment_drain_status(smallint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_verified_deployment(uuid, jsonb, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.abandon_verified_deployment(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_verified_deployment(uuid, uuid, jsonb, boolean, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_verified_deployment_starts(smallint, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.verified_deployment_drain_status(smallint) TO service_role;

RESET lock_timeout;
RESET statement_timeout;
