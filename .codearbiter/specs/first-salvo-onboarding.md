# Sprint spec: First Salvo onboarding

> Proposed by Codex on 2026-07-31 under the maintainer's standing continuous-improvement goal. Spec and plan explicitly approved by the maintainer on 2026-07-31.

## Problem

The command deck now exposes every control, but a new player still has to infer the first-turn sequence: move the barrel, set power, read the wind vector, then commit the shot. The existing trajectory guide supplies a useful short-range hint without solving the shot, so onboarding should teach the current instruments rather than add a target marker or stronger prediction.

## Chosen experience

Add a compact, local-only **First Salvo** coach for the first locally controlled human turn. It advances through three contextual steps:

1. **Aim** — point at the elevation gauge and the active aim controls. Advance after a real `set_angle` action.
2. **Power + wind** — point at the power and wind instruments and explain that wind changes the shot. Advance after a real `set_power` action.
3. **Fire** — point at the live primary action and let the player commit. Any `fire` or `use_shield` action completes the coach.

The coach is informative, never modal. It must not capture the playfield, disable controls, change input values, alter the trajectory guide, or add actions to the deterministic log. A player may skip it immediately. Completion and skip state persist locally, while a **Replay First Salvo** action in the pause menu starts it again without resetting the match.

## Scope

In scope:

- A small pure state machine for eligibility, step progression, skip, completion, and replay.
- A compact coach card, progress label, skip control, and contextual highlights in the existing HUD visual language.
- Keyboard, pointer-drag, and touch actions progressing through the same local action observation point.
- First eligible local-human-turn behavior in hot-seat and networked modes.
- A pause-menu replay affordance.
- Safe local persistence with graceful fallback when storage is unavailable.
- Reduced-motion and accessibility behavior.
- Unit, DOM, and production-browser coverage, including a deterministic opt-in test hook.
- A short player-guide update.

Out of scope:

- Engine, physics, Supabase, action-log, or replay-contract changes.
- A target marker, predicted impact point, longer trajectory reveal, automatic aiming, or aim-value mutation.
- A scripted training map, forced weapon, forced shot, rewards, narration, or audio assets.
- Blocking tutorials, lobby redesign, or a general-purpose tour framework/dependency.

## Behavioral contract

1. The coach is eligible only when the feature has not been completed or skipped locally and this browser controls a living human tank during `PLAYER_TURN`.
2. Remote-player and CPU turns never show or advance it.
3. Valid local actions advance monotonically: `set_angle` advances Aim, `set_power` advances Power + wind, and `fire` or `use_shield` completes from any step.
4. Movement, store, weapon-cycle, menu, rejected input, and passive state updates do not advance it.
5. The coach never delays, replaces, duplicates, or mutates the action forwarded to `GameClient.sendAction`.
6. Skip and completion hide the coach immediately and write the versioned local preference. Storage read/write failures remain non-fatal.
7. Replay clears only the in-memory session state, not the saved preference or match state; it resumes the live match and begins at Aim on the next eligible local-human frame.
8. A new game in the same tab does not resurrect a completed or skipped coach unless Replay was selected.
9. The card remains inside the fixed game stage at supported desktop and phone-landscape viewports. It does not cause document scrolling or cover the tactical rail's primary action.
10. Active targets have a clear static outline. Motion-capable clients may add a restrained pulse; `prefers-reduced-motion` receives no animation.
11. The card exposes an appropriate status/live-region semantic, the skip and replay controls are keyboard accessible, and instruction copy names both visible controls and keyboard equivalents where relevant.
12. Normal test and live entrypoints preserve current behavior. An explicit tutorial query flag may force the coach for deterministic browser coverage without clearing unrelated local storage.

## Visual direction

- Reuse the command HUD's dark glass, gold hairline, amber active state, monospace telemetry, and existing icon vocabulary.
- Keep the card to a short step label, one instruction sentence, and one quiet Skip action.
- Highlight existing controls instead of drawing arrows over the battlefield.
- Do not introduce an onboarding mascot, generic tooltip bubbles, gradients unrelated to the current system, or celebratory confetti.

## Acceptance criteria

1. A clean-profile hot-seat game presents Aim on the first controllable turn; the same behavior waits correctly for a network player's first owned turn.
2. Keyboard arrows, touch steppers, and mouse drag all advance through the same action-driven state machine.
3. Power copy explicitly calls attention to the Wind Vector without predicting the hit.
4. Firing completes and persists the coach; Skip persists dismissal; neither action affects match state beyond the player's original game action.
5. Replay First Salvo is present in the pause menu, resumes the existing match, and restarts the coach without erasing progress, restarting the engine, or leaving the network action stream.
6. The coach and highlights are legible and non-overlapping in desktop-fine, small-window, and pixel-touch browser projects.
7. Reduced-motion, keyboard focus, accessible names, and live-region behavior are covered.
8. Existing hot-seat, mobile-control, HUD-layout, replay, and deterministic engine checks stay green.
9. No new runtime dependency, backend deployment, database change, or product asset is introduced.

## Verification

- Pure reducer tests for every transition, irrelevant action, early fire, skip, replay, and eligibility boundary.
- HUD DOM tests for copy, target classes, focusable controls, persistence failure, and pause-menu replay.
- Playwright desktop and pixel-touch paths that force the coach, exercise real controls, and assert stage fit/no page scroll.
- `npm run typecheck`, focused Vitest, focused Playwright, `npm run check`, `npm run test:client`, and `npm run build`.
- State-free secret scan, adversarial review, and exact-head hosted CI.

## Open questions

None. The only material choice is whether to build this bounded onboarding slice; implementation details are delegated to SMARTS once the spec and plan are approved.
