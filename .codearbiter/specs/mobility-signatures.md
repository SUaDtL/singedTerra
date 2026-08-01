# Sprint spec: Mobility Signatures

> Proposed by Codex on 2026-08-01 under the maintainer's standing continuous-improvement goal. This bounded spec and its plan use the maintainer's standing approval through one sprint-specific logged override.

## Problem

The Garage now makes modular tank parts legible before play, but their battlefield identity is still largely static. Fuel movement translates every vehicle through the same state change, so choosing tracks, spider legs, hover gear, or wheels does not produce a distinct sense of motion. The authored silhouettes differ, yet a player watching a quick eight-pixel move receives little feedback about what their mobility choice means visually.

## SMARTS decision

Choose client-only, kit-specific movement signatures driven by observed authoritative tank-position deltas.

| Lens | Mobility signatures | Mag Deflector | Team skirmish |
|---|---|---|---|
| Scalable | Strong. One profile per existing mobility kit extends without simulation or transport changes. | Adequate. A shield family extends, but every new mode widens action replay. | Adequate. Four-seat teams fit today; future modes widen winner and lobby contracts. |
| Maintainable | Strong. A dedicated visual observer and profile map keep kit art behavior centralized. | Weak. Projectile collision, inventory, AI, replay, validation, and UI all change together. | Weak. Engine, options, lobby, scoreboard, bots, and backend room contracts all coordinate. |
| Available | Strong. Effects fail closed while authored tanks and movement remain fully usable. | Adequate. Existing play remains, but version-skewed clients cannot replay the new action safely. | Adequate. Existing free-for-all remains, but mixed client versions disagree on team outcomes. |
| Reliable | Strong. Presentation observes bounded deltas and never mutates deterministic state. | Weak. Reflection ownership and repeated-contact rules create new deterministic outcome paths. | Adequate. Centralized win checks help, but round scoring and disconnect handling widen state risk. |
| Testable | Strong. Pure admission/profile helpers plus production-browser pixel changes provide direct oracles. | Adequate. Deterministic harnesses exist, but geometric reflection needs extensive adversarial seeds. | Adequate. Engine cases are direct; network lobby and rematch matrices are broad. |
| Securable | Strong. No input, action log, backend, dependency, or persistence surface changes. | Weak. A new replay payload and referee validation branch cross the network trust boundary. | Weak. New room options and team assignments widen validated peer-controlled state. |

**Recommendation:** Mobility signatures. Strength: **strong** — Maintainable, Reliable, Testable, and Securable dominate; it also directly continues the player's customization and richer-graphics direction.

Non-SMARTS consideration: this is materially faster to ship and visually verify than either gameplay-contract alternative, keeping the one-cell improvement loop moving.

## Chosen experience

Each successful fuel move produces a short, bounded undercarriage signature based on `tank.loadout.treads`:

- **Foundry / tracks:** grounded dust and short tread-stamp marks trailing the move.
- **Ranger / spider legs:** paired foot-contact pulses that read as articulated steps.
- **Bulwark / hover:** a cool ion underglow and wake opposite the travel direction.
- **Jackal / wheels:** warm rolling arcs and speed streaks around the wheel line.

The effect appears beneath the tank, follows its player color without losing the kit motif, and expires quickly. It is cosmetic only: the engine remains the sole authority for position, fuel, collision, and turn state.

## Scope

In scope:

- A pure movement-observation contract that recognizes only bounded, same-round, living, visible tank displacement.
- One exhaustive mobility-profile map keyed by the existing `TankKitId` used in the `treads` slot.
- A small client-only renderer for bounded kit-specific bursts below the tank layer.
- Renderer lifecycle integration, reset hygiene, idle-skip compatibility, and reduced-motion suppression.
- Unit and production-browser coverage across all four mobility kits.
- A concise player-guide note that Garage mobility choices carry visual signatures into battle.

Out of scope:

- Any change to `resolveTankMove`, fuel cost, terrain traversal, collision, physics, or deterministic state.
- New sprites, generated assets, dependencies, audio, or gameplay stats for cosmetic parts.
- Continuous idle animation or a permanent 60fps rendering cost.
- Action-log, Supabase, room-option, migration, or backend deployment changes.
- Repainting the authored tank atlas, changing tank scale, or changing barrel/aim geometry.
- A new defensive mechanic, team mode, or AI behavior.

## Behavioral contract

1. The first state observed for a tank establishes a baseline and emits no movement effect.
2. A later same-round horizontal delta with `0 < abs(dx) <= MAX_MOVE_DELTA` may emit exactly one burst when the tank is alive and not buried.
3. No burst is emitted for unchanged positions, eliminated/buried tanks, removed tanks, round changes, resets, or displacements larger than one legal committed move.
4. The burst kit is read only from normalized `tank.loadout.treads`; invalid legacy loadouts already normalize to Foundry upstream.
5. Direction is `sign(dx)`. Burst geometry trails opposite that direction and remains inside a bounded area around the tank.
6. Every `TankKitId` has an explicit profile with a distinct motif, palette role, particle/stroke budget, and finite positive lifetime.
7. Effects draw after terrain and projectile shadows but before visible tank bodies, so vehicles remain readable and effects appear grounded.
8. Effects never mutate `GameState`, terrain, tank positions, or action data. Render randomness, if any, is local presentation only.
9. The idle-skip gate redraws only while a burst is active, then returns to the existing static behavior. No kit causes perpetual animation.
10. `prefers-reduced-motion: reduce` suppresses animated movement signatures and does not create a busy-frame loop.
11. `Renderer.reset()` clears position baselines and all live mobility effects so rematches and same-tab new games cannot inherit stale trails.
12. Existing movement, tank art, recoil, damage, shield, projectile, HUD, and Garage behavior remain unchanged.

## Visual direction

- Signatures should read at normal battlefield scale without obscuring the chassis or terrain edge.
- Foundry is dusty and mechanical; Ranger is precise and articulated; Bulwark is cool and energy-driven; Jackal is fast and warm.
- Reuse current dusk, gold, cyan, terrain, and player-color tokens. Avoid neon effects that compete with projectiles or explosions.
- Keep every burst under roughly half a second and spatially local. Movement feedback should feel crisp, not like a persistent particle trail.

## Acceptance criteria

1. Moving a Foundry-track tank produces a short dusty tread signature beneath/behind it and no duplicate burst on unchanged frames.
2. Ranger, Bulwark, and Jackal mobility choices each produce a visibly different motif, not merely a color swap.
3. One legal eight-pixel move emits one bounded burst with the correct direction and kit profile.
4. A round reset or implausibly large position jump rebases silently without drawing a traversal trail across the battlefield.
5. Eliminated or buried tanks never emit movement signatures.
6. Effects render below the tank, expire within their profile lifetime, release the idle-skip gate, and clear on renderer reset.
7. Reduced-motion mode suppresses bursts and remains static after movement.
8. A production-browser oracle proves visible nonblank pixel changes in the undercarriage region after movement for all four kits and proves materially distinct rendered signatures.
9. Existing movement fuel expenditure and final tank coordinates remain identical before and after the client-only slice.
10. Focused tests, full deterministic checks, client tests, production build, browser profiles, secret scan, adversarial review, and exact-head hosted CI pass.

## Verification

- Pure unit tests for movement admission, direction, round/reset rebasing, exhaustive profiles, finite geometry, and lifecycle expiry.
- Renderer integration tests for baseline tracking, one-burst admission, reset clearing, reduced-motion suppression, and idle-skip release.
- Focused Playwright coverage selecting each mobility kit, starting hot-seat play, moving the active tank, and comparing stable canvas regions without relying on DOM labels alone.
- `npm run typecheck`, `npm run check`, `npm run test:client`, `npm run build`, focused Playwright, state-free secret scan, adversarial review, and exact-head hosted CI.

## Open questions

None. The slice is presentation-only and deliberately avoids the lockstep/referee hard gate discovered during Mag Deflector scouting.
