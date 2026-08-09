-- singedTerra - authenticated hot-seat match results (ADR-0012)
-- Version: 015
-- Date: 2026-08-09
--
-- Additive only: the record_hotseat_match referee derives the account from a
-- validated Auth bearer and stores one immutable client-attested local result.

CREATE TABLE public.hotseat_match_results (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id   uuid NOT NULL,
  won        boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, match_id)
);

ALTER TABLE public.hotseat_match_results ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.hotseat_match_results FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.hotseat_match_results TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.hotseat_match_results FROM authenticated;
REVOKE ALL ON TABLE public.hotseat_match_results FROM service_role;
GRANT SELECT, INSERT ON TABLE public.hotseat_match_results TO service_role;

CREATE POLICY hotseat_match_results_select_own
  ON public.hotseat_match_results
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DO $acl$
BEGIN
  IF NOT has_table_privilege('service_role', 'public.hotseat_match_results', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.hotseat_match_results', 'INSERT')
    OR has_table_privilege('service_role', 'public.hotseat_match_results', 'UPDATE')
    OR has_table_privilege('service_role', 'public.hotseat_match_results', 'DELETE')
    OR has_table_privilege('anon', 'public.hotseat_match_results', 'SELECT')
    OR has_table_privilege('anon', 'public.hotseat_match_results', 'INSERT')
    OR has_table_privilege('anon', 'public.hotseat_match_results', 'UPDATE')
    OR has_table_privilege('anon', 'public.hotseat_match_results', 'DELETE')
    OR NOT has_table_privilege('authenticated', 'public.hotseat_match_results', 'SELECT')
    OR has_table_privilege('authenticated', 'public.hotseat_match_results', 'INSERT')
    OR has_table_privilege('authenticated', 'public.hotseat_match_results', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.hotseat_match_results', 'DELETE')
  THEN
    RAISE EXCEPTION 'hotseat_match_results ACL assertion failed';
  END IF;
END
$acl$;

COMMENT ON TABLE public.hotseat_match_results IS 'classification: PRIVATE - authenticated account local-match history with client-attested outcome.';
COMMENT ON COLUMN public.hotseat_match_results.user_id IS 'classification: PRIVATE - Auth-derived Supabase user identifier.';
COMMENT ON COLUMN public.hotseat_match_results.match_id IS 'classification: PRIVATE - client-generated idempotency identifier for one local match.';
COMMENT ON COLUMN public.hotseat_match_results.won IS 'classification: PRIVATE - client-attested Player 1 outcome, casual history only.';
COMMENT ON COLUMN public.hotseat_match_results.created_at IS 'classification: INTERNAL - server insertion timestamp for the immutable local result.';
