-- singedTerra persistent identity foundation
-- Version: 013
-- Date: 2026-08-04
-- Why: ADR-0011 adds optional account JWT sessions. Preserve the existing public
-- gameplay-read contract when the shared Supabase client becomes authenticated.
-- Safety: additive policy/grant change only; no row mutation, table rewrite, or
-- destructive DDL. Brief catalog locks may occur on the three named tables while
-- grants and policies are installed; there is no data scan or long-running lock.
--
-- Preserve public gameplay reads when the Supabase client carries an account JWT.
-- Password accounts are optional, so authenticated players need the same read-only
-- room, replay, Realtime, and score visibility that anonymous players already have.

REVOKE INSERT, UPDATE, DELETE
  ON TABLE public.rooms, public.room_actions, public.match_scores
  FROM authenticated;

GRANT SELECT
  ON TABLE public.rooms, public.room_actions, public.match_scores
  TO authenticated;

CREATE POLICY rooms_select_authenticated
  ON public.rooms
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY room_actions_select_authenticated
  ON public.room_actions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY match_scores_select_authenticated
  ON public.match_scores
  FOR SELECT
  TO authenticated
  USING (true);
