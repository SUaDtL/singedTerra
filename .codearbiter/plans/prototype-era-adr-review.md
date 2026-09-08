# Prototype-Era ADR Review - 2026-08-21

**Scope:** read-only lifecycle and product-intent audit requested by SUaDtL
**Purpose:** prevent early proof-of-concept cost controls from silently blocking the sustained game project

## Result

No additional accepted ADR currently prohibits a UI dependency or a more
capable presentation architecture. The restrictive HUD decision is now
superseded by accepted ADR-0017. Three other early absolutes were already
superseded by later accepted ADRs, but some prose in `CONTEXT.md`,
`tech-stack.md`, and `coding-standards.md` continued to present them as current.

## Superseded decisions

- `0001-one-engine-two-contexts` is superseded by
  `0013-verification-only-third-engine-context`. Retain one shared deterministic
  engine and one-way dependency direction; do not retain the literal two-context
  count.
- `0004-hud-dom-overlay` is superseded by
  `0017-hybrid-pixi-hud-compositor`. Retain accessible DOM semantics and
  world/UI separation; do not retain the prohibition on canvas/Pixi HUD visuals
  or UI dependencies.
- `0005-thin-edge-referees` is superseded by
  `0014-completion-time-deterministic-replay`. Retain thin live referees; do not
  treat the no-shared-engine-on-Edge wording as absolute for bounded verification.
- `0006-no-auth-ephemeral-identity` is superseded by
  `0011-password-auth-before-google-sso`. Retain anonymous play and separate seat
  credentials; do not retain the no-account/no-JWT product assumption.

## Current decisions that remain compatible

- `0002-deterministic-lockstep` and `0003-seeded-prng-determinism` protect
  multiplayer correctness and do not constrain the HUD compositor.
- `0007-per-ip-rate-limiting`, `0008-referee-turn-authority`,
  `0009-split-seat-identity`, and `0010-lobby-session-seat-token-lifecycle`
  protect public backend boundaries and do not constrain presentation.
- `0011-password-auth-before-google-sso` through
  `0014-completion-time-deterministic-replay` define current identity,
  progression, and verification boundaries. None forbids a client UI library.
- `0016-allowlisted-authenticated-production-diagnostics` remains a narrow
  maintainer/test surface and does not govern the player HUD.

## Lifecycle issue to revisit separately

- `0015-stage-hosted-replay-verification-without-awards` remains `proposed` even
  though later implementation and production evidence exist. Do not change its
  status without an explicit maintainer instruction. A future ADR-status pass
  should either accept, reject, or supersede it based on current verified
  deployment architecture.

## Context changes required

- Replace “personal project / technical exercise” and the controlling
  “friendly prototype now” framing with the maintainer's 2026-08-21 direction:
  singedTerra is a sustained game project and architecture should optimize for
  product quality and maintainability, not zero dependencies.
- Keep CodeArbiter's recorded Stage 1 value distinct from product ambition until
  the maintainer separately changes governance stage.
- Treat backend cost and hosting changes as explicit decisions, not as evidence
  that all client dependencies or engines are prohibited.
- Keep static hosting, deterministic engine, and security controls unless a
  later explicit decision changes them.

## No silent global reset

The maintainer's clarification is not permission to discard determinism,
security, auditability, or existing user data. Each future contradiction should
be resolved by a scoped superseding ADR. Prototype-era rationale remains
historical context; it no longer outranks the maintainer's current explicit
product direction.
