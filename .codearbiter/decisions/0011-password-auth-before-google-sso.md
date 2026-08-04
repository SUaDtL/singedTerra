---
status: accepted
date: 2026-08-04
title: Use password-based Supabase Auth before adding Google SSO
decided-by: SUaDtL <SUaDtL@users.noreply.github.com>
supersedes: 0006-no-auth-ephemeral-identity
governs: supabase/config.toml, supabase/migrations/*, supabase/functions/*, client/src/client/*
---

# ADR-0011 — Use password-based Supabase Auth before adding Google SSO

## Status
Accepted

## Context
The product direction has changed: persistent players and progression are now the highest-value improvement, and the previous no-account assumption in ADR-0006 no longer fits the product. The first account path must not depend on SMTP, magic-link resend delivery, an external email provider, or paid service usage. Existing seat tokens remain necessary for room-level authorization and are not a substitute for durable account identity.

## Decision
Adopt Supabase Auth email/password accounts as the first persistent identity foundation, with signups enabled and email confirmation disabled initially so the slice has no email-delivery dependency. Durable profile and progression records will be keyed to the authenticated Supabase user id and protected by JWT-aware server boundaries and RLS; client-reported progress is never trusted as an account write. Preserve the existing per-room seat-token model for room ownership and action authorization, and defer Google SSO and password-reset email delivery until a later provider/budget slice.

## Alternatives considered
- **Magic link or email OTP first** — rejected because it requires dependable email delivery, resend behavior, and an SMTP/provider budget that is intentionally unavailable now.
- **Google SSO first** — deferred because provider configuration and OAuth redirect/security work would expand the first persistence slice without improving the zero-cost local path.
- **Keep ephemeral identity only** — rejected because it cannot support the user-approved persistent-player and progression direction.

## Consequences
The client gains a durable authenticated session and the backend gains an account identity boundary while existing room flows can continue using seat tokens during migration. The first slice must explicitly handle session restore, sign-out, duplicate-account errors, and the fact that password recovery is unavailable until email delivery is configured. Future progression writes can be associated with a stable user id without exposing service-role credentials or trusting browser-owned totals.

## Risks
With confirmation disabled, users can create accounts with mistyped or inaccessible email addresses, and password reset cannot be offered safely without an email provider. These risks are acceptable for the initial bounded slice and will be revisited before enabling recovery or treating email ownership as verified. The decision is proven wrong if the product requires verified email, social-only onboarding, or abuse controls that cannot be met by password auth plus existing rate limits and RLS.
