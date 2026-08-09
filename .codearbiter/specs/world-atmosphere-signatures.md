# World Atmospheric Signatures

**Slice:** visual world differentiation, resumed on `origin/main@4a7ee07b987fc23db2db1e968964ed939336f32b`

## Problem

Battlefield selection changes the panorama and terrain material, but the air above the battlefield still reads as the same scene. Players need each explicit world to feel distinct without touching deterministic simulation, replay, networking, or account state.

## Decision

Give each existing battlefield world one immutable atmosphere profile and derive a fixed, bounded Canvas mark field from its selected id. Ember Dusk paints warm rising embers; Obsidian Caldera paints slow falling ash; Glassstorm Expanse paints diagonal cyan crystal streaks. The renderer draws the selected field after the sky and before wind, terrain, tanks, projectiles, and HUD. A short selection-arrival flourish can keep an otherwise idle scene rendering; reduced motion stays static.

## In scope

- Existing Ember Dusk, Obsidian Caldera, and Glassstorm Expanse only.
- Fixed, deterministic presentation marks capped at 28.
- Selection/reset, reduced-motion, finite idle eligibility, and draw ordering.
- Unit, integration, browser, build, and review evidence.

## Out of scope

- Engine, terrain generation, action/replay data, multiplayer protocol, Supabase, auth, persistence, dependencies, new worlds, settings changes, or gameplay balance.

## Acceptance criteria

1. Each current world owns an immutable, visually distinct bounded profile.
2. The derived mark field is reproducible from world id/profile, frozen, and never exceeds 28 marks even for an oversized future profile.
3. A match freezes one selected field until reset; it never uses wall-clock time or unseeded randomness.
4. Ember, ash, and crystal paths are visibly distinct and remain Canvas-only behind gameplay and HUD.
5. Reduced-motion fields remain static; non-reduced motion releases idle eligibility after a finite arrival interval.
6. Existing explicit requested-world selection reaches backdrop, terrain, and atmosphere together.
7. Focused and full client tests, typecheck, build, browser validation, review, exact-head hosted CI, and Pages deployment evidence pass before merge.
