# Authenticated Account XP and Levels Sprint Spec

**Status:** approved under the standing improvement-goal authority
**Date:** 2026-08-04
**Task:** `mvp2.progression.0003`
**Decision:** ADR-0011

## Goal

Turn the existing authenticated match summary into visible progression by deriving XP and a player level from the same persisted match links and recorded winners. Keep the calculation server-owned, transparent, and reversible while singedTerra remains a stage-1 casual game.

## Progression version 1

- Every linked completed match grants 100 XP.
- A recorded win grants an additional 100 XP.
- Level 1 begins at 0 XP. Every 500 cumulative XP advances one level.
- The current-level progress is `totalXp % 500`, and the next-level target is always 500 XP.
- Draws and losses receive participation XP but no win bonus.
- The formula is retroactive: changing the accepted formula later recalculates every account from its immutable match history.

The response identifies this rule as `progressionVersion: 1` so future formulas can change deliberately instead of silently drifting.

## Scope

- Extend `account_summary` to return `progressionVersion`, `totalXp`, `level`, `levelXp`, and `nextLevelXp` alongside matches played and wins.
- Derive every value after the existing Auth-scoped participant and score consistency checks pass.
- Extend the client read model with exact-key, finite nonnegative integer validation and formula-consistency checks.
- Show the current level and XP toward the next level in the signed-in account panel on desktop and mobile.
- Preserve the existing nullable summary behavior. A failed, malformed, or timed-out optional summary must not hide the owner profile or disable sign-out.

Explicitly out of scope:

- Persistent XP writes, mutable counters, a progression ledger, or a database migration.
- Rewards, unlocks, achievements, ranks, leaderboards, matchmaking, seasons, prestige, or competitive rating.
- Per-weapon, damage, kill, round, or economy bonuses.
- Changes to match claiming, seat tokens, game simulation, action logs, anonymous play, or account onboarding.
- Google SSO, email delivery, dependencies, secrets, crypto, or spending.

## Architecture and trust boundaries

- `account_summary` remains the progression authority. It calculates XP only from its Auth-derived user id, immutable `match_participants` links, and persisted `match_scores` winners.
- The browser sends no user id, XP, level, outcome, or cumulative total and gains no progression write path.
- Named constants keep the version-1 formula reviewable. One pure calculation helper receives validated match and win counts and returns the five progression fields.
- The client validates the exact response shape and recomputes the version-1 relationships before rendering. Unknown versions or inconsistent values degrade the optional summary to unavailable.
- The panel uses semantic labelled values and readable text. It does not use a progress bar whose visual state could hide the numeric XP contract.
- Existing generic error and safe-logging behavior remains unchanged.

## Trust ceiling

XP reflects accepted persisted lockstep results. The current `finish_game` boundary does not independently simulate or competitively verify every outcome, so level is casual account history, not an anti-cheat rating. No gameplay advantage or scarce reward may depend on it in this slice.

## Acceptance criteria

1. Zero linked matches returns version 1, 0 XP, level 1, and 0 of 500 XP while avoiding a score query.
2. Matches, wins, draws, and losses produce the exact version-1 XP and level boundaries, including 499, 500, and 1,000 cumulative XP equivalents.
3. Auth rejection, query failures, inconsistent rows, duplicate rows, truncation, and unsafe logs retain their existing fail-closed behavior.
4. The client accepts only the exact seven-key summary contract and rejects unknown versions, fractional or negative fields, wins above matches, and any formula-inconsistent totals or level progress.
5. A malformed or stalled summary leaves the authenticated owner profile and sign-out path usable.
6. The account panel exposes Matches, Recorded wins, Level, and XP progress through semantic labels without duplicate ids or compact-layout overlap.
7. Focused RED/GREEN and mutation evidence prove the XP formula, level boundaries, response validation, and rendered labels causally.
8. The full local suite, adversarial review package, exact-head hosted checks, merge, Supabase deployment, exact-main Pages deployment, and production health verification all clear before the task is marked done.

## Reopen triggers

- A reward or unlock system requires a separately reviewed entitlement design and stronger result-integrity analysis.
- Formula changes require a new progression version and explicit treatment of retroactive levels.
- Scale pressure from large account histories reopens the derived-read approach in favor of an idempotent server-maintained ledger or materialized aggregate.
