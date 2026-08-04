-- singedTerra — authenticated completed-match participant linkage (ADR-0011)
-- Version: 014
-- Date: 2026-08-04
--
-- Additive only: an authenticated account may be linked once to a completed
-- public room seat. The future claim_match referee derives every stored identity
-- server-side after validating both account and seat credentials.

CREATE TABLE public.match_participants (
  room_id    uuid NOT NULL REFERENCES public.match_scores(room_id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_id  uuid NOT NULL,
  tank_id    text NOT NULL CHECK (tank_id ~ '^p[1-9][0-9]*$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id),
  UNIQUE (room_id, player_id)
);

ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;

-- Anonymous clients have no table grant or policy. Authenticated clients can
-- read only their own immutable link. The service-role referee inserts links and
-- reads them only to classify unique-conflict retries as idempotent or conflicting.
REVOKE ALL ON TABLE public.match_participants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.match_participants TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.match_participants FROM authenticated;
REVOKE ALL ON TABLE public.match_participants FROM service_role;
GRANT SELECT, INSERT ON TABLE public.match_participants TO service_role;

CREATE POLICY match_participants_select_own
  ON public.match_participants
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DO $acl$
BEGIN
  IF NOT has_table_privilege('service_role', 'public.match_participants', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.match_participants', 'INSERT')
    OR has_table_privilege('service_role', 'public.match_participants', 'UPDATE')
    OR has_table_privilege('service_role', 'public.match_participants', 'DELETE')
    OR has_table_privilege('anon', 'public.match_participants', 'SELECT')
    OR has_table_privilege('anon', 'public.match_participants', 'INSERT')
    OR has_table_privilege('anon', 'public.match_participants', 'UPDATE')
    OR has_table_privilege('anon', 'public.match_participants', 'DELETE')
    OR NOT has_table_privilege('authenticated', 'public.match_participants', 'SELECT')
    OR has_table_privilege('authenticated', 'public.match_participants', 'INSERT')
    OR has_table_privilege('authenticated', 'public.match_participants', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.match_participants', 'DELETE')
  THEN
    RAISE EXCEPTION 'match_participants ACL assertion failed';
  END IF;
END
$acl$;

COMMENT ON TABLE public.match_participants IS 'classification: PRIVATE - owner-private account link to a completed public match seat.';
COMMENT ON COLUMN public.match_participants.room_id IS 'classification: PUBLIC - completed match room identifier.';
COMMENT ON COLUMN public.match_participants.user_id IS 'classification: PRIVATE - Supabase Auth user identifier linked only to its owner.';
COMMENT ON COLUMN public.match_participants.player_id IS 'classification: PUBLIC - verified public room-seat identifier.';
COMMENT ON COLUMN public.match_participants.tank_id IS 'classification: PUBLIC - server-derived engine tank identifier.';
COMMENT ON COLUMN public.match_participants.created_at IS 'classification: INTERNAL - server insertion timestamp for the immutable account link.';
