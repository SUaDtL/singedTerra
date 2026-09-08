-- singedTerra - resolve Verified Deployment start output-variable collisions
-- Version: 019
-- Date: 2026-09-07
-- Why: PR #445 follow-up: real V2 starts fail with SQLSTATE 42702 because
-- RETURNS TABLE output names shadow unqualified columns in migration 017.
-- Safety: replace only this function body; no rows, schema, version tuples,
-- admission/drain rules, function signature, SECURITY DEFINER or ACLs change.
-- Lock profile: preserve user advisory lock, session row lock, then contract
-- row lock and all existing transactional semantics. No table rewrite.

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
  SELECT deployment.* INTO v_session FROM public.verified_deployments AS deployment
    WHERE deployment.user_id = p_user_id AND deployment.status = 'active' FOR UPDATE;
  IF FOUND AND v_session.expires_at > v_now THEN
    IF v_session.contract_version <> 2 OR v_session.engine_version <> 2 OR v_session.ruleset_version <> 4
    THEN RAISE EXCEPTION 'verified_deployment_legacy_drain_active'; END IF;
    RETURN QUERY SELECT v_session.id, v_session.user_id, v_session.config, v_session.contract_version,
      v_session.engine_version, v_session.ruleset_version, v_session.status, v_session.expires_at,
      v_session.created_at, v_session.updated_at, true;
    RETURN;
  END IF;
  IF FOUND THEN UPDATE public.verified_deployments AS deployment SET status = 'expired' WHERE deployment.id = v_session.id; END IF;

  -- Disable gates only new admissions. A live V2 session must remain resumable
  -- through an incident/drain; a live V1 session was rejected above.
  SELECT control.starts_enabled INTO v_starts_enabled
    FROM public.verified_deployment_contracts AS control WHERE control.contract_version = 2 FOR UPDATE;
  IF NOT FOUND OR NOT v_starts_enabled THEN RAISE EXCEPTION 'verified_deployment_starts_disabled'; END IF;

  INSERT INTO public.verified_deployments AS deployment (
    user_id, config, contract_version, engine_version, ruleset_version, expires_at
  ) VALUES (p_user_id, p_config, 2, 2, 4, p_expires_at)
  RETURNING deployment.* INTO v_session;
  UPDATE public.verified_deployment_contracts AS control SET last_started_at = v_now, updated_at = v_now
    WHERE control.contract_version = 2;
  RETURN QUERY SELECT v_session.id, v_session.user_id, v_session.config, v_session.contract_version,
    v_session.engine_version, v_session.ruleset_version, v_session.status, v_session.expires_at,
    v_session.created_at, v_session.updated_at, false;
END;
$function$;
