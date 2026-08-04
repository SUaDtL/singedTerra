# Persistent Identity Foundation Sprint Spec

**Status:** approved under the standing improvement-goal authority
**Date:** 2026-08-04
**Task:** `mvp2.identity.0001`
**Decision:** ADR-0011

## Goal

Give a player an optional, durable singedTerra account and profile that survives browser/device changes, without charging for email delivery and without changing the existing anonymous hot-seat, room, seat-token, or deterministic game flows.

## Scope

This slice delivers the identity foundation only:

- Supabase Auth email/password signup, sign-in, session restore, and sign-out.
- Email confirmation disabled initially; no magic link, OTP, resend, password-reset email, SMTP, or paid provider.
- A `profiles` table keyed one-to-one to `auth.users.id`, created by a server-side trigger and readable only by its owner in this slice.
- A lobby account panel that reports loading, signed-out, busy/error, and signed-in states and works on desktop and mobile.
- Existing hot-seat and anonymous online play remain available when signed out or when Supabase configuration is absent.
- Signed-in players retain the same public, read-only visibility of rooms, action logs, Realtime events, and match scores as anonymous players; account JWTs grant no gameplay writes.
- Deployment pushes the auth configuration and forward-only migration through the already-linked local Supabase CLI.
- Full config push explicitly preserves the linked project's existing API schema, TOTP MFA, and email abuse-control settings and keeps paid vector buckets disabled.

Explicitly out of scope:

- Progression counters, XP, levels, unlocks, achievements, ranked play, or leaderboards.
- Associating a room seat or completed match with an account.
- Google or other OAuth providers.
- Email verification, password recovery, account deletion, email change, or admin tooling.
- Any new runtime dependency, custom password storage, custom crypto, service-role exposure, or spending. The exact reviewed Supabase CLI is a development-only deployment tool pinned in the lockfile.

## Player experience

- The lobby exposes a compact `Account` affordance without hiding or gating play controls.
- Signed-out players can choose `Sign in` or `Create account`.
- Account creation requires display name, email, and a password of at least 8 characters. Display names are trimmed and limited to 24 characters.
- Sign-in requires email and password. Password values are never retained across renders, placed in URLs, or logged.
- A signed-in player sees the durable profile display name and can sign out.
- Auth errors use a generic user-facing message derived from the SDK error message only; they never echo credentials.
- When backend configuration is absent, the account affordance is omitted and the current local-only boot behavior remains intact.

## Architecture and trust boundaries

- `AccountSession` is a DOM-free client owner for SDK loading, auth subscription lifetime, session restore, auth commands, profile loading, and normalized state.
- The Supabase module remains lazy-loaded. A pure config check prevents importing it when `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is absent.
- `AccountPanelView` renders account state and forwards intent; it does not call Supabase directly.
- `Lobby` owns only panel-open/mode policy and composes the session and view.
- Postgres creates `profiles` from an `auth.users` trigger. The public profile row contains only `id`, `display_name`, and timestamps—never email, password material, access tokens, refresh tokens, or seat tokens.
- RLS is enabled. `anon` has no profile access. `authenticated` can select only the row where `id = auth.uid()`; profile insertion remains trigger-only in this slice.
- Existing public gameplay reads are mirrored for `authenticated` through explicit SELECT grants and read-only policies on `rooms`, `room_actions`, and `match_scores`. Direct authenticated writes remain revoked and policy-denied.
- Existing `room_seats` tokens remain the sole room/action bearer credential. Account JWTs do not replace them in this slice.

## Threat-model constraints

STRIDE verdict: **PROCEED WITH CONSTRAINTS**.

- Spoofing: Supabase Auth verifies the account; profile ownership is `auth.uid() = profiles.id`.
- Tampering/elevation: authenticated clients cannot insert another profile, read another profile, or write progression; RLS and grants default-deny those paths.
- Information disclosure: no email or credential material enters `public.profiles`, logs, URLs, room rows, Realtime, or error copy.
- Repudiation: profile identity is attributable to the Supabase user id; gameplay remains attributable to the existing seat id/token until a later linkage slice.
- Denial of service: Supabase Auth platform limits apply; the UI prevents duplicate in-flight submissions but does not claim to replace server controls.
- Session theft remains bounded by Supabase's standard browser-session storage and TLS. No custom token persistence is introduced.

## Migration contract

- Add exactly two forward-only migrations after `011`: `012_profiles.sql` and `013_authenticated_gameplay_reads.sql`.
- Migration 012 is additive: create table, constraints, comments/classification, RLS, grants/policies, trigger function, and trigger. It drops no data and alters no existing gameplay table.
- Migration 013 preserves online play after authentication by granting SELECT and adding authenticated read-only policies for the three existing public gameplay tables. It explicitly revokes authenticated INSERT, UPDATE, and DELETE and changes no rows or table definitions.
- `profiles.id` references `auth.users(id) ON DELETE CASCADE`; account deletion itself is out of scope.
- Trigger logic normalizes a non-empty display name to at most 24 characters and falls back to `Commander` if metadata is absent.
- The trigger function is `SECURITY DEFINER` with an empty search path and qualified object names.
- A deterministic harness pins both migrations, proves the required SQL/config statements, and rejects credential columns, permissive profile policies, or authenticated gameplay writes.

## Acceptance criteria

1. A configured client restores an existing authenticated session and owner profile after reload.
2. A signed-out player can create an account and receives an authenticated profile state without email confirmation or delivery.
3. A signed-out player can sign in with email/password; a signed-in player can sign out.
4. Invalid display name, malformed email, short password, duplicate/busy submission, and SDK failure produce bounded state without logging or retaining the password.
5. No Supabase module is evaluated on an unconfigured hot-seat boot.
6. The account panel is keyboard-operable, labelled, and responsive; it does not gate existing lobby controls.
7. The migration creates one owner-only profile row per auth user with RLS and no public credential data.
8. Signed-in and anonymous clients retain public gameplay reads, while direct client writes remain denied and existing seat-token behavior, deterministic checks, client tests, Edge tests, build, and e2e checks remain green.
9. The exact reviewed PR head passes every required hosted check before merge; merged auth config/migration are deployed through local CLI auth without unrelated config drift or paid-feature activation, and production health is verified.

## Reopen triggers

- Google SSO becomes the next identity-onboarding option when provider configuration is acceptable.
- Email verification or password recovery requires an explicit SMTP/provider and spending decision.
- Match/account linkage and trusted progression begin only after this foundation is deployed and verified.
