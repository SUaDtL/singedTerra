-- singedTerra - owner-private Verified Deployment persistence (ADR-0014)
-- Version: 016
-- Date: 2026-08-11
-- Why: persist one bounded, resumable verification session and one immutable
-- replay-derived result without granting the browser authority over either.
-- Safety: additive new tables, indexes, triggers, and service-only RPCs. No
-- existing table or row is altered. New starts are initialized disabled.
-- Lock profile: RPCs serialize by Auth-derived user advisory lock, then the
-- singleton contract row, then session and result rows. No legacy locks exist.

CREATE TABLE public.verified_deployment_contracts (
  contract_version smallint PRIMARY KEY CHECK (contract_version = 1),
  starts_enabled boolean NOT NULL DEFAULT false,
  disabled_at timestamptz NOT NULL DEFAULT now(),
  last_started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.verified_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  config jsonb NOT NULL CHECK (jsonb_typeof(config) = 'object'),
  contract_version smallint NOT NULL DEFAULT 1 CHECK (contract_version = 1),
  engine_version smallint NOT NULL DEFAULT 1 CHECK (engine_version = 1),
  ruleset_version smallint NOT NULL DEFAULT 3 CHECK (ruleset_version = 3),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'expired', 'abandoned')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 minutes')
);

CREATE UNIQUE INDEX verified_deployments_one_active_per_user
  ON public.verified_deployments (user_id)
  WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.is_valid_verified_transcript(p_transcript jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_entry jsonb;
  v_angle numeric;
  v_power numeric;
  v_key_count integer;
BEGIN
  IF p_transcript IS NULL OR jsonb_typeof(p_transcript) <> 'array' THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(p_transcript) NOT BETWEEN 1 AND 6 THEN
    RETURN false;
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_transcript)
  LOOP
    IF jsonb_typeof(v_entry) <> 'object' THEN
      RETURN false;
    END IF;
    SELECT count(*) INTO v_key_count FROM pg_catalog.jsonb_object_keys(v_entry);
    IF v_key_count <> 2
      OR NOT (v_entry ? 'angle')
      OR NOT (v_entry ? 'power')
      OR jsonb_typeof(v_entry -> 'angle') <> 'number'
      OR jsonb_typeof(v_entry -> 'power') <> 'number'
      OR (v_entry ->> 'angle') !~ '^(0|[1-9][0-9]*)$'
      OR (v_entry ->> 'power') !~ '^(0|[1-9][0-9]*)$'
    THEN
      RETURN false;
    END IF;
    v_angle := (v_entry ->> 'angle')::numeric;
    v_power := (v_entry ->> 'power')::numeric;
    IF v_angle NOT BETWEEN 0 AND 180 OR v_power NOT BETWEEN 0 AND 100 THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$function$;

CREATE TABLE public.verified_match_results (
  session_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transcript jsonb NOT NULL CHECK (public.is_valid_verified_transcript(transcript)),
  won boolean NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('win', 'loss', 'draw')),
  verified_xp integer NOT NULL CHECK (verified_xp BETWEEN 0 AND 200),
  prior_verified_matches bigint NOT NULL,
  prior_verified_wins bigint NOT NULL,
  prior_total_xp bigint NOT NULL,
  current_verified_matches bigint NOT NULL,
  current_verified_wins bigint NOT NULL,
  current_total_xp bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((won AND outcome = 'win' AND verified_xp = 200)
    OR (NOT won AND outcome IN ('loss', 'draw') AND verified_xp = 100)),
  CHECK (prior_verified_matches >= 0 AND prior_verified_wins BETWEEN 0 AND prior_verified_matches AND prior_total_xp >= 0),
  CHECK (current_verified_matches = prior_verified_matches + 1
    AND current_verified_wins = prior_verified_wins + CASE WHEN won THEN 1 ELSE 0 END
    AND current_total_xp = prior_total_xp + verified_xp),
  FOREIGN KEY (session_id, user_id)
    REFERENCES public.verified_deployments(id, user_id) ON DELETE CASCADE
);

CREATE INDEX verified_match_results_owner_aggregate
  ON public.verified_match_results (user_id, created_at);

INSERT INTO public.verified_deployment_contracts (
  contract_version,
  starts_enabled,
  disabled_at
)
VALUES (1, false, now())
ON CONFLICT (contract_version) DO NOTHING;

ALTER TABLE public.verified_deployment_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_match_results ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.verified_deployment_contracts FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.verified_deployments FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.verified_match_results FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_verified_deployment_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.id <> OLD.id
    OR NEW.user_id <> OLD.user_id
    OR NEW.config <> OLD.config
    OR NEW.contract_version <> OLD.contract_version
    OR NEW.engine_version <> OLD.engine_version
    OR NEW.ruleset_version <> OLD.ruleset_version
    OR NEW.expires_at <> OLD.expires_at
    OR NEW.created_at <> OLD.created_at
  THEN
    RAISE EXCEPTION 'verified_deployment_identity_immutable';
  END IF;

  IF NEW.status <> OLD.status
    AND NOT (
      OLD.status = 'active'
      AND NEW.status IN ('completed', 'expired', 'abandoned')
    )
  THEN
    RAISE EXCEPTION 'verified_deployment_invalid_transition';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER verified_deployments_guard
  BEFORE UPDATE ON public.verified_deployments
  FOR EACH ROW EXECUTE FUNCTION public.guard_verified_deployment_mutation();

CREATE OR REPLACE FUNCTION public.reject_verified_match_result_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'verified_match_result_immutable';
END;
$function$;

CREATE TRIGGER verified_match_results_immutable
  BEFORE UPDATE ON public.verified_match_results
  FOR EACH ROW EXECUTE FUNCTION public.reject_verified_match_result_mutation();

CREATE OR REPLACE FUNCTION public.start_verified_deployment(
  p_user_id uuid,
  p_config jsonb,
  p_expires_at timestamptz
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  config jsonb,
  contract_version smallint,
  engine_version smallint,
  ruleset_version smallint,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
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
  IF p_user_id IS NULL
    OR jsonb_typeof(p_config) <> 'object'
    OR p_expires_at <= v_now
    OR p_expires_at > v_now + interval '30 minutes'
  THEN
    RAISE EXCEPTION 'verified_deployment_invalid_start';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));

  SELECT starts_enabled
    INTO v_starts_enabled
    FROM public.verified_deployment_contracts AS control
    WHERE control.contract_version = 1
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'verified_deployment_contract_missing';
  END IF;

  SELECT deployment.*
    INTO v_session
    FROM public.verified_deployments AS deployment
    WHERE deployment.user_id = p_user_id AND deployment.status = 'active'
    ORDER BY deployment.created_at DESC
    LIMIT 1
    FOR UPDATE;

  IF v_session.id IS NOT NULL AND v_session.expires_at > v_now THEN
    RETURN QUERY SELECT
      v_session.id,
      v_session.user_id,
      v_session.config,
      v_session.contract_version,
      v_session.engine_version,
      v_session.ruleset_version,
      v_session.status,
      v_session.expires_at,
      v_session.created_at,
      v_session.updated_at,
      true;
    RETURN;
  END IF;

  IF v_session.id IS NOT NULL THEN
    UPDATE public.verified_deployments AS deployment
      SET status = 'expired'
      WHERE deployment.id = v_session.id
      RETURNING * INTO v_session;
  END IF;

  IF NOT v_starts_enabled THEN
    RAISE EXCEPTION 'verified_deployment_starts_disabled';
  END IF;

  INSERT INTO public.verified_deployments (user_id, config, expires_at)
    VALUES (p_user_id, p_config, p_expires_at)
    RETURNING * INTO v_session;

  UPDATE public.verified_deployment_contracts AS control
    SET last_started_at = v_now,
        updated_at = v_now
    WHERE control.contract_version = 1;

  RETURN QUERY SELECT
    v_session.id,
    v_session.user_id,
    v_session.config,
    v_session.contract_version,
    v_session.engine_version,
    v_session.ruleset_version,
    v_session.status,
    v_session.expires_at,
    v_session.created_at,
    v_session.updated_at,
    false;
END;
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
  v_contract_version smallint;
  v_session public.verified_deployments%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL THEN
    RAISE EXCEPTION 'verified_deployment_invalid_abandon';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));

  SELECT contract_version
    INTO v_contract_version
    FROM public.verified_deployment_contracts
    WHERE contract_version = 1
    FOR UPDATE;

  SELECT *
    INTO v_session
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

  IF v_session.status <> 'active' OR v_session.expires_at <= v_now THEN
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
  p_user_id uuid,
  p_session_id uuid,
  p_transcript jsonb,
  p_won boolean,
  p_outcome text,
  p_verified_xp integer
)
RETURNS SETOF public.verified_match_results
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz := now();
  v_contract_version smallint;
  v_session public.verified_deployments%ROWTYPE;
  v_result public.verified_match_results%ROWTYPE;
  v_prior_verified_matches bigint;
  v_prior_verified_wins bigint;
  v_prior_total_xp bigint;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL
    OR NOT public.is_valid_verified_transcript(p_transcript)
    OR (p_won AND (p_outcome <> 'win' OR p_verified_xp <> 200))
    OR (NOT p_won AND (p_outcome NOT IN ('loss', 'draw') OR p_verified_xp <> 100))
  THEN
    RAISE EXCEPTION 'verified_deployment_invalid_completion';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));

  SELECT contract_version
    INTO v_contract_version
    FROM public.verified_deployment_contracts
    WHERE contract_version = 1
    FOR UPDATE;

  SELECT *
    INTO v_session
    FROM public.verified_deployments
    WHERE id = p_session_id
    FOR UPDATE;

  IF v_session.id IS NULL OR v_session.user_id <> p_user_id THEN
    RAISE EXCEPTION 'verified_deployment_not_found';
  END IF;

  SELECT *
    INTO v_result
    FROM public.verified_match_results
    WHERE session_id = p_session_id
    FOR UPDATE;

  IF v_result.session_id IS NOT NULL THEN
    IF v_result.transcript = p_transcript
      AND v_result.won = p_won
      AND v_result.outcome = p_outcome
      AND v_result.verified_xp = p_verified_xp
    THEN
      RETURN NEXT v_result;
      RETURN;
    END IF;
    RAISE EXCEPTION 'verified_deployment_completion_conflict';
  END IF;

  IF v_session.status <> 'active' OR v_session.expires_at <= v_now THEN
    RAISE EXCEPTION 'verified_deployment_not_completable';
  END IF;

  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE result.won)::bigint,
    COALESCE(sum(result.verified_xp), 0)::bigint
  INTO v_prior_verified_matches, v_prior_verified_wins, v_prior_total_xp
  FROM public.verified_match_results AS result
  WHERE result.user_id = p_user_id;

  INSERT INTO public.verified_match_results (
    session_id,
    user_id,
    transcript,
    won,
    outcome,
    verified_xp,
    prior_verified_matches,
    prior_verified_wins,
    prior_total_xp,
    current_verified_matches,
    current_verified_wins,
    current_total_xp
  )
  VALUES (
    p_session_id,
    p_user_id,
    p_transcript,
    p_won,
    p_outcome,
    p_verified_xp,
    v_prior_verified_matches,
    v_prior_verified_wins,
    v_prior_total_xp,
    v_prior_verified_matches + 1,
    v_prior_verified_wins + CASE WHEN p_won THEN 1 ELSE 0 END,
    v_prior_total_xp + p_verified_xp
  )
  RETURNING * INTO v_result;

  UPDATE public.verified_deployments
    SET status = 'completed'
    WHERE id = p_session_id;

  RETURN NEXT v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verified_progression_summary(p_user_id uuid)
RETURNS TABLE (
  verified_matches bigint,
  verified_wins bigint,
  total_xp bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'verified_progression_identity_required';
  END IF;

  RETURN QUERY
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE result.won)::bigint,
    COALESCE(sum(result.verified_xp), 0)::bigint
  FROM public.verified_match_results AS result
  WHERE result.user_id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verified_deployment_completion_context(
  p_user_id uuid,
  p_session_id uuid
)
RETURNS TABLE (
  session_id uuid,
  user_id uuid,
  config jsonb,
  contract_version smallint,
  engine_version smallint,
  ruleset_version smallint,
  status text,
  expires_at timestamptz,
  transcript jsonb,
  won boolean,
  outcome text,
  verified_xp integer,
  prior_verified_matches bigint,
  prior_verified_wins bigint,
  prior_total_xp bigint,
  current_verified_matches bigint,
  current_verified_wins bigint,
  current_total_xp bigint,
  result_created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL THEN
    RAISE EXCEPTION 'verified_deployment_not_found';
  END IF;

  RETURN QUERY
  SELECT
    deployment.id,
    deployment.user_id,
    deployment.config,
    deployment.contract_version,
    deployment.engine_version,
    deployment.ruleset_version,
    deployment.status,
    deployment.expires_at,
    result.transcript,
    result.won,
    result.outcome,
    result.verified_xp,
    result.prior_verified_matches,
    result.prior_verified_wins,
    result.prior_total_xp,
    result.current_verified_matches,
    result.current_verified_wins,
    result.current_total_xp,
    result.created_at
  FROM public.verified_deployments AS deployment
  LEFT JOIN public.verified_match_results AS result
    ON result.session_id = deployment.id
    AND result.user_id = deployment.user_id
  WHERE deployment.id = p_session_id
    AND deployment.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'verified_deployment_not_found';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_verified_deployment_starts(
  p_contract_version smallint,
  p_starts_enabled boolean
)
RETURNS SETOF public.verified_deployment_contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz := now();
  v_contract public.verified_deployment_contracts%ROWTYPE;
  v_safe_after timestamptz;
  v_unexpired bigint;
BEGIN
  IF p_contract_version <> 1 THEN
    RAISE EXCEPTION 'verified_deployment_contract_unsupported';
  END IF;

  SELECT *
    INTO v_contract
    FROM public.verified_deployment_contracts
    WHERE contract_version = p_contract_version
    FOR UPDATE;

  IF p_starts_enabled AND NOT v_contract.starts_enabled THEN
    v_safe_after := COALESCE(
      v_contract.last_started_at + interval '30 minutes',
      v_contract.disabled_at
    );
    SELECT count(*)
      INTO v_unexpired
      FROM public.verified_deployments
      WHERE status = 'active' AND expires_at > v_now;
    IF v_now < v_safe_after OR v_unexpired <> 0 THEN
      RAISE EXCEPTION 'verified_deployment_drain_incomplete';
    END IF;
  END IF;

  UPDATE public.verified_deployment_contracts
    SET starts_enabled = p_starts_enabled,
        disabled_at = CASE
          WHEN starts_enabled AND NOT p_starts_enabled THEN v_now
          ELSE disabled_at
        END,
        updated_at = v_now
    WHERE contract_version = p_contract_version
    RETURNING * INTO v_contract;

  RETURN NEXT v_contract;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verified_deployment_drain_status(
  p_contract_version smallint
)
RETURNS TABLE (
  contract_version smallint,
  starts_enabled boolean,
  disabled_at timestamptz,
  last_started_at timestamptz,
  safe_after timestamptz,
  unexpired_sessions bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz := now();
BEGIN
  RETURN QUERY
  SELECT
    control.contract_version,
    control.starts_enabled,
    control.disabled_at,
    control.last_started_at,
    COALESCE(control.last_started_at + interval '30 minutes', control.disabled_at),
    (
      SELECT count(*)
      FROM public.verified_deployments AS deployment
      WHERE deployment.status = 'active' AND deployment.expires_at > v_now
    )
  FROM public.verified_deployment_contracts AS control
  WHERE control.contract_version = p_contract_version;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_verified_deployment_mutation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reject_verified_match_result_mutation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_valid_verified_transcript(jsonb) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.start_verified_deployment(uuid, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.abandon_verified_deployment(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_verified_deployment(uuid, uuid, jsonb, boolean, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verified_deployment_completion_context(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verified_progression_summary(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_verified_deployment_starts(smallint, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verified_deployment_drain_status(smallint) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.start_verified_deployment(uuid, jsonb, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.abandon_verified_deployment(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_verified_deployment(uuid, uuid, jsonb, boolean, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.verified_deployment_completion_context(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.verified_progression_summary(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_verified_deployment_starts(smallint, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.verified_deployment_drain_status(smallint) TO service_role;

DO $acl$
DECLARE
  table_name text;
  role_name text;
  privilege_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'verified_deployment_contracts',
    'verified_deployments',
    'verified_match_results'
  ]
  LOOP
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
    LOOP
      FOREACH privilege_name IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']
      LOOP
        IF has_table_privilege(role_name, 'public.' || table_name, privilege_name) THEN
          RAISE EXCEPTION 'verified deployment direct table ACL assertion failed';
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END
$acl$;

COMMENT ON TABLE public.verified_deployment_contracts IS 'classification: INTERNAL - service-only admission and deployment-drain state for a replay contract.';
COMMENT ON COLUMN public.verified_deployment_contracts.contract_version IS 'classification: INTERNAL - exact Verified Deployment contract number.';
COMMENT ON COLUMN public.verified_deployment_contracts.starts_enabled IS 'classification: INTERNAL - service-controlled admission state for new sessions.';
COMMENT ON COLUMN public.verified_deployment_contracts.disabled_at IS 'classification: INTERNAL - authoritative time at which admission was disabled.';
COMMENT ON COLUMN public.verified_deployment_contracts.last_started_at IS 'classification: INTERNAL - authoritative creation time of the newest session.';
COMMENT ON COLUMN public.verified_deployment_contracts.updated_at IS 'classification: INTERNAL - latest control-row mutation timestamp.';

COMMENT ON TABLE public.verified_deployments IS 'classification: PRIVATE - owner-bound immutable Verified Deployment descriptor and lifecycle.';
COMMENT ON COLUMN public.verified_deployments.id IS 'classification: PRIVATE - server-generated deployment session identifier.';
COMMENT ON COLUMN public.verified_deployments.user_id IS 'classification: PRIVATE - Auth-derived owner identifier.';
COMMENT ON COLUMN public.verified_deployments.config IS 'classification: PRIVATE - immutable server-owned deterministic duel config.';
COMMENT ON COLUMN public.verified_deployments.contract_version IS 'classification: INTERNAL - exact verification contract version.';
COMMENT ON COLUMN public.verified_deployments.engine_version IS 'classification: INTERNAL - exact shared-engine behavior version.';
COMMENT ON COLUMN public.verified_deployments.ruleset_version IS 'classification: INTERNAL - exact fixed duel ruleset version.';
COMMENT ON COLUMN public.verified_deployments.status IS 'classification: PRIVATE - owner deployment lifecycle state.';
COMMENT ON COLUMN public.verified_deployments.expires_at IS 'classification: PRIVATE - hard verified-eligibility deadline.';
COMMENT ON COLUMN public.verified_deployments.created_at IS 'classification: INTERNAL - server session creation timestamp.';
COMMENT ON COLUMN public.verified_deployments.updated_at IS 'classification: INTERNAL - server lifecycle mutation timestamp.';

COMMENT ON TABLE public.verified_match_results IS 'classification: PRIVATE - immutable replay-derived result and canonical human evidence.';
COMMENT ON COLUMN public.verified_match_results.session_id IS 'classification: PRIVATE - one-to-one verified deployment identifier.';
COMMENT ON COLUMN public.verified_match_results.user_id IS 'classification: PRIVATE - Auth-derived result owner identifier.';
COMMENT ON COLUMN public.verified_match_results.transcript IS 'classification: PRIVATE - bounded canonical accepted human fire commitments.';
COMMENT ON COLUMN public.verified_match_results.won IS 'classification: PRIVATE - replay-derived commander win fact.';
COMMENT ON COLUMN public.verified_match_results.outcome IS 'classification: PRIVATE - replay-derived win, loss, or draw classification.';
COMMENT ON COLUMN public.verified_match_results.verified_xp IS 'classification: PRIVATE - replay-derived bounded verified XP award.';
COMMENT ON COLUMN public.verified_match_results.prior_verified_matches IS 'classification: PRIVATE - immutable owner match count before this result.';
COMMENT ON COLUMN public.verified_match_results.prior_verified_wins IS 'classification: PRIVATE - immutable owner win count before this result.';
COMMENT ON COLUMN public.verified_match_results.prior_total_xp IS 'classification: PRIVATE - immutable owner verified XP before this result.';
COMMENT ON COLUMN public.verified_match_results.current_verified_matches IS 'classification: PRIVATE - immutable owner match count including this result.';
COMMENT ON COLUMN public.verified_match_results.current_verified_wins IS 'classification: PRIVATE - immutable owner win count including this result.';
COMMENT ON COLUMN public.verified_match_results.current_total_xp IS 'classification: PRIVATE - immutable owner verified XP including this result.';
COMMENT ON COLUMN public.verified_match_results.created_at IS 'classification: INTERNAL - authoritative server result timestamp.';
COMMENT ON FUNCTION public.verified_deployment_completion_context(uuid, uuid) IS 'classification: INTERNAL - service-only owner-and-session completion context with optional immutable result evidence.';
COMMENT ON FUNCTION public.verified_progression_summary(uuid) IS 'classification: INTERNAL - service-only owner-scoped aggregate over immutable verified results.';
