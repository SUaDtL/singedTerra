# Sprint spec: Network Ruleset Boundary — Phase B2 Client Rollout

> Proposed by Codex on 2026-08-01 under the maintainer's standing continuous-improvement goal. This bounded spec and plan use the maintainer's standing approval through one sprint-specific logged override.

## Problem

Phase B1 is deployed and production-proven: the Edge backend accepts explicit ruleset versions `1` and `2`, omission remains legacy `1`, and join/action compatibility is enforced against each room's stored version. The public browser still emits version `1`, so players cannot yet create decisive-falloff network matches.

A bare client constant flip would make new rooms version `2`, but a freshly deployed browser could no longer join an already-open version `1` lobby. The rollout needs a bounded compatibility bridge without silently downgrading new rooms or weakening the fail-closed protocol.

## SMARTS decision

Flip the current browser version to `2` and retry a join exactly once as legacy `1` only when the server explicitly reports a version-1 mismatch.

| Lens | Current v2 + server-directed legacy retry | Bare current-v2 flip | General version negotiation |
|---|---|---|---|
| Scalable | Strong. New rooms advance while existing lobbies drain naturally. | Adequate, but every rollout strands old lobbies. | Strong, but adds unused protocol breadth. |
| Maintainable | Strong. One transport helper owns one explicit compatibility case. | Strong in code size, weak operationally. | Weak. Multiple negotiation states exceed the two-version need. |
| Available | Strong. New browsers can enter both live v1 and new v2 rooms. | Weak. A deployment invalidates joinability of open v1 lobbies. | Strong. |
| Reliable | Strong. Retry is driven by an authoritative 409 and the first request is pre-mutation. | Adequate. Fail-closed but disruptive. | Adequate. More states create more failure modes. |
| Testable | Strong. Two ordered request bodies and non-retry cases are deterministic. | Strong. | Weak. Matrix breadth grows without current value. |
| Securable | Strong. No credential, mutation-order, auth, token, RLS, or secret change. | Strong. | Adequate. Larger input surface. |

**Recommendation:** current v2 plus one server-directed legacy retry. Strength: **strong**, led by Available, Reliable, and Testable.

## Design

- `CURRENT_NETWORK_RULESET_VERSION` becomes `2`. New room creation and the first join attempt therefore request version `2`.
- `LobbyTransport.joinRoom` performs at most two requests. It retries with explicit version `1` only when all three authoritative signals match: HTTP status `409`, body error `ruleset_mismatch`, and `requiredRulesetVersion === 1`.
- The first mismatched join is safe to retry because the deployed `join_room` referee checks the stored version before mutating the roster. No other status, error, missing field, malformed field, or requested version may trigger a retry.
- A successful legacy retry returns the room's authoritative version-1 options. Lobby state, engine construction, rematch handling, and `NetworkClient.submitAction` continue to use that stored room version, not the global current version.
- New v2 rooms never downgrade. An old cached v1 client receives the existing fail-closed mismatch response when it attempts to join a v2 room.
- Canonical docs advance from the server-first window to the live v2 browser contract and explicitly document the temporary legacy-lobby bridge.

## Acceptance criteria

1. Focused client tests fail first because the current browser version is still `1` and no legacy retry exists.
2. Create requests and first join requests emit ruleset version `2`.
3. A `409 ruleset_mismatch` response requiring version `1` causes exactly one second join request with the same player fields and explicit version `1`, returning that second result.
4. No retry occurs for a different status, error, missing/malformed required version, or a mismatch requiring version `2`.
5. A legacy-joined room constructs a linear ruleset-1 engine and submits/retries actions with version `1`; a new v2 room constructs decisive falloff and submits version `2`.
6. Ready-up/start and rematch paths preserve the authoritative room version.
7. No Edge Function, database migration, dependency, credential order, auth, seat token, RLS, rate limit, secret, action-log shape, or offline/hot-seat balance changes.
8. Focused tests, full client coverage, deterministic checks, Edge tests, build, dependency audit, exact-diff adversarial review, exact-head hosted CI, PR-only merge, Pages deploy, and a production two-browser v2 match proof are green.

## Non-goals

- Rewriting or upgrading existing version-1 rooms.
- Letting old version-1 browsers enter version-2 rooms.
- Supporting arbitrary version negotiation or more than the deployed `1 | 2` protocol.
- Changing projectile physics, damage numbers, lobby discovery, authentication, persistence schema, dependencies, or Supabase deployment.
