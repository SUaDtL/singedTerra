-- singedTerra — durable account profiles (ADR-0011)
-- Version: 012
-- Date: 2026-08-04
--
-- Additive only: creates one auth-user-owned table, function, trigger, grants,
-- and RLS policy. No existing gameplay table or row is altered.
-- Lock profile: new objects only plus a trigger on auth.users; no table rewrite
-- or destructive lock against existing public gameplay tables.

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_display_name_length
    CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 24)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;

CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = id);

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    new.id,
    COALESCE(
      NULLIF(
        left(btrim(COALESCE(new.raw_user_meta_data ->> 'display_name', '')), 24),
        ''
      ),
      'Commander'
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- Cover any users created before this migration. The trigger is installed
-- first so concurrent signups cannot fall into a backfill/trigger gap.
INSERT INTO public.profiles (id, display_name)
SELECT
  users.id,
  COALESCE(
    NULLIF(
      left(btrim(COALESCE(users.raw_user_meta_data ->> 'display_name', '')), 24),
      ''
    ),
    'Commander'
  )
FROM auth.users AS users
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.profiles IS 'classification: PRIVATE - durable account profile readable only by its authenticated owner.';
COMMENT ON COLUMN public.profiles.id IS 'classification: PRIVATE - Supabase Auth user identifier; never a gameplay seat credential.';
COMMENT ON COLUMN public.profiles.display_name IS 'classification: PRIVATE - owner-visible player display name for future progression surfaces.';
COMMENT ON COLUMN public.profiles.created_at IS 'classification: INTERNAL - account profile creation timestamp.';
COMMENT ON COLUMN public.profiles.updated_at IS 'classification: INTERNAL - account profile update timestamp.';
