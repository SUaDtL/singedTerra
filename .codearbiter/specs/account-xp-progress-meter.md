# Account XP progress meter

Status: approved under standing sprint authority
Date: 2026-08-08
Task: mvp2.progression.0004

## Problem

Authenticated players can read `200 / 500` XP as one compact statistic, but the
account panel does not communicate progress proportion or the exact distance to
the next level. Persistent progression should feel directional without adding a
new reward, entitlement, write path, or trust claim.

## Contract

1. Use only the existing validated `AccountSummary` fields. Do not call a new
   endpoint or change the progression formula.
2. Keep Matches, Recorded wins, and Level as definition pairs.
3. Replace the compact XP definition pair with a full-width XP section that
   shows `levelXp / nextLevelXp XP`, a native `<progress>` element with exact
   numeric value and maximum, and `<remaining> XP to Level <level + 1>`.
4. Give the progress element a self-contained accessible name without adding a
   fixed DOM id, so two account panels can coexist without duplicate ids.
5. At level boundaries, show zero progress and the full next-level requirement.
   At the nearest reachable V1 step below a boundary, show `100 XP` remaining.
6. Keep the meter and both visible labels contained, legible, and non-overlapping
   in the existing compact/mobile account fixture.
7. Preserve anonymous, unavailable, authenticated-error, sign-out, account
   summary validation, and gameplay behavior.

## Acceptance

- The existing 1,200-XP fixture shows Level 3, `200 / 500 XP`, progress value
  200/max 500, and `300 XP to Level 4`.
- A level-boundary fixture shows progress 0/max 500 and `500 XP to Level 3`.
- A validated 400-XP fixture shows progress 400/max 500 and
  `100 XP to Level 2`.
- Two simultaneously mounted account panels remain id-free.
- Focused DOM tests start RED before implementation and pass after it.
- Compact Playwright geometry/readability coverage and the full local matrix pass.

## Non-goals

- New XP rules, levels, rewards, unlocks, titles, ranks, or editable profile data.
- Supabase, Auth, Edge Function, schema, migration, secret, dependency, or
  network-action changes.
- A dashboard, history view, leaderboard, or Google SSO.
