# Sprint spec: Network Ruleset Boundary — Phase A

> Proposed by Codex on 2026-08-01 under the maintainer's standing continuous-improvement goal. This bounded spec and plan use the maintainer's standing approval through one sprint-specific logged override.

## Problem

singedTerra's network mode is deterministic lockstep: every browser replays the same ordered action log through its own engine. The deployed referee currently proves seat and turn authority, but rooms do not record which deterministic balance contract their clients must use. That made the preceding starter-weapon improvement unsafe for network mode: old and new browsers could apply different damage to the same accepted shot.

The missing boundary must be installed before any network room adopts the new damage curve. It must also remain compatible with deployed clients and legacy rooms while Phase A is rolling out.

## SMARTS decision

Install a server-enforced integer room ruleset with legacy version `1` and prepared version `2`, while keeping the current client on version `1`. The room's stored options are authoritative; create echoes them, join rejects mismatches before mutation, and submit rejects mismatches after the existing seat-token gate but before turn authorization or action insertion.

| Lens | Versioned room contract | Force all network clients to the new curve | Keep network balance frozen |
|---|---|---|---|
| Scalable | Strong. Future deterministic changes reuse one room-level boundary. | Weak. Every rollout repeats the mixed-version risk. | Weak. Multiplayer can never receive tuning safely. |
| Maintainable | Strong. One small pure compatibility helper owns legacy defaults and mismatch behavior. | Weak. Compatibility is implicit in deployment timing. | Adequate, but preserves a known architecture gap. |
| Available | Strong. `rooms.options` is already JSONB; no migration or dependency is required. | Strong mechanically, unsafe operationally. | Strong. |
| Reliable | Strong. Missing client/stored versions mean legacy `1`; explicit mismatches fail closed. | Weak. The same action log can diverge. | Strong but blocks progress. |
| Testable | Strong. Pure helpers plus injected Edge handlers and request-body seams are deterministic. | Weak. Same-version tests miss mixed deployment. | Strong. |
| Securable | Strong. Existing membership/token order is preserved and no credential surface changes. | Weak through correctness failure, though not credential exposure. | Strong. |

**Recommendation:** Versioned room contract. Strength: **strong** across Reliable, Testable, and Scalable.

## Design

- Define supported network rulesets `1` and `2`; define the currently emitted client ruleset as `1` for this Phase A.
- Interpret an omitted request version and an omitted stored room version as legacy `1`, so deployed clients and existing rooms continue working.
- Reject unsupported explicit request versions with HTTP 400. Treat corrupt/unsupported stored versions as unavailable rather than silently replaying them as legacy.
- `create_room` understands both versions but Phase A permits only omitted/explicit version `1`; an explicit prepared version `2` receives stable HTTP 409 `ruleset_not_available` before DB access. Successful creation stores version `1` inside `rooms.options` and returns the complete authoritative stored options. The client uses those returned options; if an older deployed Edge omits them, it falls back explicitly to ruleset `1`.
- `join_room` compares the request and stored versions immediately after the room read and before reaping, roster updates, or seat creation. A mismatch returns HTTP 409 with stable `ruleset_mismatch` and the required room version.
- `submit_action` compares versions after the existing membership and seat-token checks, preserving the security boundary, and before turn authorization or the insert RPC.
- The client sends version `1` on create, join, and every submit/retry. Rejoin and rematch carry the room's stored version into the engine configuration.
- Network engine construction maps room ruleset `1` (or absent) to linear starter falloff and ruleset `2` to decisive falloff. Hot-seat remains decisive.
- Phase A does not create version `2` rooms. Enabling them is a separate Phase B after the new Edge functions are deployed and verified.

## Acceptance criteria

1. Failing tests first prove the Edge helper, handler paths, and client request bodies lack the ruleset contract.
2. Missing client and stored fields resolve to legacy `1`; explicit `1` and `2` are understood for compatibility; malformed stored option shapes and invalid values fail closed.
3. `create_room` stores ruleset `1` for old/missing/explicit-`1` requests, rejects prepared version `2` with stable HTTP 409 and unsupported versions with HTTP 400 before DB access, and echoes authoritative stored options.
4. `join_room` rejects a mismatch with HTTP 409 before any reap/update/seat mutation and returns the required room version.
5. `submit_action` rejects a mismatch only after membership and seat-token verification, but before turn authorization or RPC insertion.
6. Current client create, join, and submit bodies explicitly send version `1`, including conflict retries.
7. Lobby create, join, ready, rejoin, and rematch paths use the server-stored ruleset; a missing field in a valid stored options object stays legacy `1`, while malformed stored shapes do not produce a successor.
8. The production engine-options seam maps network ruleset `1` to linear and `2` to decisive; hot-seat remains decisive.
9. No database migration, dependency, auth/seat-token behavior, action-log shape, physics math, or active network balance changes.
10. Full deterministic checks, client coverage, Edge tests, build, one exact-diff adversarial review, exact-head hosted CI, scoped Edge deployment, Pages deployment, and production smoke are green before Phase B.

## Non-goals

- Creating or advertising ruleset `2` rooms in Phase A.
- Migrating or rewriting existing room rows.
- Adding a server-authoritative physics engine or shipping `GameState` over the network.
- Changing seat tokens, auth, RLS, rate limits, secrets, CORS, database schema, dependencies, or spending.
- Altering weapon stats, blast math, terrain, economy, or any hot-seat behavior.
