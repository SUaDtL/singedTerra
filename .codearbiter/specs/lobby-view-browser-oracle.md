# Sprint spec: Lobby View Browser Oracle

> Proposed by Codex on 2026-08-01 under the maintainer's standing continuous-improvement goal. This bounded spec and plan use the maintainer's standing approval through one sprint-specific logged override.

## Problem

Issue #129 correctly blocks decomposition of the 2,000-plus-line Lobby view until the real browser can prove DOM and geometry parity. Current Playwright coverage bypasses the Lobby with `?e2e=hotseat`, so a refactor could preserve jsdom behavior while crushing, overflowing, or hiding actual setup controls.

## SMARTS decision

Add production-bundle Playwright guardrails that navigate through the Lobby's public controls. Phase 1 covers the three offline-reachable views: Hot Seat, Online Create, and Join by Code. Browse and Waiting Room require deterministic network fixtures and remain a later phase.

| Lens | Public-control browser oracle | E2E-only state hook | jsdom snapshots |
|---|---|---|---|
| Scalable | Strong: shared invariants apply across every configured viewport and future view. | Adequate: fast but adds runtime fixture surface. | Weak: cannot observe computed layout. |
| Maintainable | Strong: tests use player-visible labels/classes and broad geometry. | Weak: couples tests to private Lobby state. | Adequate but structurally brittle. |
| Available | Strong: Playwright and the production preview already exist. | Strong. | Strong. |
| Reliable | Strong: exercises actual navigation and bundled CSS. | Adequate: forced state can bypass broken navigation. | Weak for the exact regression class. |
| Testable | Strong: containment, overflow, visibility, and reachability are measurable. | Strong. | Weak for geometry. |
| Securable | Strong: no backend call, credential, dependency, or runtime change. | Adequate: ships a benign but unnecessary hook. | Strong. |

**Recommendation:** public-control browser oracle. Strength: **strong**.

## Acceptance criteria

1. A shared helper opens the ordinary Lobby in the production bundle, removes only the splash overlay, and waits for the real Lobby card.
2. Hot Seat, Online Create, and Join by Code are reached only through visible public controls.
3. Each view runs under the existing desktop-fine, pixel-touch, and small-window projects.
4. Each view proves the Lobby card remains inside the full-app Lobby overlay, the document has no horizontal or vertical page scroll, and the card has no horizontal overflow.
5. Each view proves its primary controls have non-zero rendered boxes and can be scrolled into the Lobby card's visible region.
6. Tests assert durable player-facing labels and structural invariants, not pixel snapshots or exact coordinates.
7. The full rendering suite, deterministic/client/Edge gates, build, audit, and secret scan remain green.
8. One adversarial reviewer clears the exact package before PR-only delivery. The PR advances issue #129 without closing it; Browse/Waiting fixtures and component extraction remain follow-ups.

## Non-goals

- Refactoring `Lobby.ts`, changing CSS, or changing player behavior.
- Mocking Supabase, exercising Browse/Waiting, or creating an E2E runtime query hook.
- Adding visual snapshots, screenshot baselines, or dependencies.
- Backend, migration, auth, crypto, secret, or deployment workflow changes.
