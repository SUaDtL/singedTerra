# Sprint spec: Lobby Network View Browser Oracle

> Proposed by Codex on 2026-08-01 under the maintainer's standing continuous-improvement goal. This bounded spec and plan use the maintainer's standing approval through one sprint-specific logged override.

## Problem

PR #245 established real-browser geometry coverage for the offline Lobby views, but issue #129 still cannot safely move `renderBrowse()` or `renderWaitingRoom()`. Those views depend on Edge responses and the waiting-room Realtime seam, so ordinary local Playwright builds cannot reach them deterministically without network fixtures.

## SMARTS decision

Give the local Playwright web server a same-origin dummy Supabase URL and explicit non-secret test key, then intercept `list_rooms` and `create_room` at the browser boundary. Navigate through the public UI and render the real Browse and Waiting views without adding any production state hook.

| Lens | Route interception + test env | Runtime query hook | Unit coverage only |
|---|---|---|---|
| Scalable | Strong: fixture responses can cover later network views and errors. | Adequate but adds runtime fixture surface. | Weak: no computed geometry. |
| Maintainable | Strong: uses the existing HTTP contract and public controls. | Weak: couples tests to private state. | Adequate. |
| Available | Strong: Playwright routing already ships. | Strong. | Strong. |
| Reliable | Strong: proves response-to-view data flow and bundled CSS. | Adequate: bypasses transport and transitions. | Weak for browser layout. |
| Testable | Strong: fixture-derived rows/code plus Phase 1 invariants are observable. | Strong. | Weak for the target regression class. |
| Securable | Strong: same-origin dummy values, intercepted calls, no real credential or backend. | Adequate. | Strong. |

**Recommendation:** Playwright route interception with local-only dummy env. Strength: **strong**.

## Acceptance criteria

1. Local/CI Playwright production builds receive `VITE_SUPABASE_URL=http://localhost:4173` and an explicit non-secret dummy anon key; live-smoke builds remain unchanged.
2. Browse is reached through Play Online -> Browse public rooms after intercepting `list_rooms`.
3. The Browse fixture proves host name, rounds/arms/CPU metadata, seat count, and enabled Join action reach the rendered view.
4. Waiting is reached by entering a player name and clicking Create Room after intercepting `create_room`.
5. The Waiting fixture proves room code, human/CPU roster, readiness summary, invite action, Ready Up, and Leave reach the rendered view.
6. Browse and Waiting reuse the Phase 1 full-app containment, no-page-scroll, no-horizontal-overflow, and action-reachability invariants across all three viewport projects.
7. No request reaches a real Supabase project; no production, dependency, backend, auth, crypto, migration, or deployment workflow behavior changes.
8. The focused 6-case matrix and complete repository gates remain green; one adversarial reviewer clears the exact package.
9. The PR advances but does not close issue #129. With all major Lobby views then under a browser oracle, the next phase may extract one bounded render component.

## Non-goals

- Refactoring Lobby views or changing player-visible behavior/CSS.
- Exercising ready-up mutations, live Realtime updates, error states, rejoin, or game launch.
- Adding runtime E2E query hooks, snapshot baselines, dependencies, or real network credentials.
