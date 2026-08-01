# Sprint spec: Network Ruleset Boundary — Phase B1 Server Capability

> Proposed by Codex on 2026-08-01 under the maintainer's standing continuous-improvement goal. This bounded spec and plan use the maintainer's standing approval through one sprint-specific logged override.

## Problem

Phase A is deployed and production-proven: online rooms carry an authoritative deterministic `rulesetVersion`, old clients and legacy rows resolve to version `1`, and mixed-version joins/actions fail closed. The backend still rejects version `2` room creation, so flipping the public client to the decisive ruleset now would race the deployed referee and make room creation unavailable.

The next safe step is server capability only. The backend must accept explicit version `2` rooms before any public client emits version `2`, while preserving old clients that omit the field or explicitly request version `1`.

## SMARTS decision

Enable explicit versions `1` and `2` in `create_room`, keep omission mapped to legacy `1`, and leave the client constant at `1` until a separate Phase B2.

| Lens | Dual-version backend first | Make backend omission mean v2 | Flip backend and client together |
|---|---|---|---|
| Scalable | Strong. Future clients select a declared room contract. | Weak. Implicit defaults become deployment-sensitive. | Adequate, but repeats rollout races. |
| Maintainable | Strong. One pure resolver owns supported creation versions. | Weak. Legacy behavior becomes a special case elsewhere. | Weak. Two deploy surfaces must remain synchronized. |
| Available | Strong. Old and new clients can create through the same backend. | Weak. Old clients silently create rooms with physics they do not implement. | Weak. Pages can publish before the Edge bundle converges. |
| Reliable | Strong. Explicit requests are authoritative; omission remains backward-compatible. | Weak. Missing data changes meaning mid-rollout. | Weak. A partial deploy temporarily returns 409 to the new client. |
| Testable | Strong. Pure resolver and injected handler tests prove stored/echoed versions. | Adequate, but compatibility intent is indirect. | Weak. Correctness depends on deployment timing. |
| Securable | Strong. No auth, token, RLS, rate-limit, secret, or trust-order change. | Adequate. | Adequate. |

**Recommendation:** dual-version backend first. Strength: **strong**, led by Available and Reliable.

## Design

- `resolveCreatableRulesetVersion` accepts every supported requested version: omitted and explicit `1` resolve to `1`; explicit `2` resolves to `2`; unsupported values still fail with `invalid_request`.
- `create_room` stores the resolved version in the existing `rooms.options` JSONB object and echoes those authoritative options. The Phase A-only `ruleset_not_available` response is removed because both supported versions are now creatable.
- The deployed client remains unchanged and continues to emit `CURRENT_NETWORK_RULESET_VERSION = 1`. Existing clients that omit the field continue to create version `1` rooms.
- Join, submit, rematch, and engine construction retain the Phase A compatibility contract without production changes.
- Rollout remains server-first: merge and deploy only `create_room` (which bundles the shared resolver), prove v1 and v2 creation plus v2 join in production, then govern the client flip as Phase B2.
- Update canonical specification and architecture prose so the documented rollout state matches production.

## Acceptance criteria

1. Focused tests fail first because explicit version `2` is still rejected by the Phase A gate.
2. The pure creation resolver returns version `1` for omission/explicit `1`, version `2` for explicit `2`, and `invalid_request` for unsupported values.
3. `create_room` stores and echoes version `2` when explicitly requested, while omission and explicit `1` continue to store and echo version `1`.
4. Unsupported versions still return HTTP 400 before any database access.
5. The public client constant and its request-body expectations remain version `1` in this slice.
6. No database migration, dependency, auth/seat-token behavior, RLS, rate limit, secret, action-log shape, engine math, existing room, or active client balance changes.
7. Full Edge tests, deterministic checks, client coverage, build, dependency audit, exact-diff adversarial review, exact-head hosted CI, PR-only merge, scoped `create_room` deployment, Pages provenance, and production contract probes are green before Phase B2.

## Non-goals

- Changing `CURRENT_NETWORK_RULESET_VERSION` from `1` to `2`.
- Advertising or selecting version `2` in the public UI.
- Rewriting existing rooms or changing the legacy omission default.
- Changing join/submit credential ordering, rematch behavior, physics, damage, terrain, economy, database schema, dependencies, or security controls.
