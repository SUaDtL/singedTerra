# Network Ruleset Boundary — Phase B2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILLS: use `superpowers:test-driven-development` for implementation, `superpowers:verification-before-completion` before delivery, and the codeArbiter commit/review/PR gates. Steps use checkbox syntax for resumability. The maintainer's standing authority covers the bounded spec/plan pause only.

**Goal:** Make newly deployed browsers create and play decisive ruleset-2 network rooms while preserving safe entry into already-open ruleset-1 lobbies.

**Architecture:** Advance the single client current-version constant to `2`. Keep the deployed server as the authority: the Lobby transport retries a join once as version `1` only on the exact server mismatch contract. All established-session gameplay continues to use the room's authoritative options.

**Tech Stack:** TypeScript, Vitest, deterministic harnesses, Vite, existing Supabase Edge contract; no dependency or migration.

## Global constraints

- Capture a focused TDD RED before editing production code.
- A legacy retry must be exact, one-time, and pre-mutation by the deployed server contract.
- Established-session actions must use the room version, never the global creation default.
- No Edge, database, auth, token, RLS, secret, dependency, or offline gameplay change.
- One adversarial exact-diff review, exact-head hosted CI, PR-only merge, Pages deploy, and production gameplay proof remain required.

---

### Task 1: Pin the v2 browser rollout in RED

**Files:**

- Modify: `client/src/client/networkRuleset.test.ts`
- Add: `client/src/client/LobbyTransport.ruleset.test.ts`
- Modify as needed: `client/src/client/NetworkClient.lockstep.test.ts`
- Modify as needed: `client/src/client/NetworkClient.humanRetry.test.ts`
- Modify as needed: `client/src/ui/Lobby.network.test.ts`

**Interfaces:**

- Consumes: the current-version constant, `LobbyTransport.createRoom/joinRoom`, authoritative `RoomOptions`, and `NetworkClient.submitAction`.
- Produces: causal expectations for v2 defaults, exact legacy retry conditions, and room-authoritative gameplay mutations.

- [x] Assert the current browser ruleset is `2` and create/first-join bodies emit `2`.
- [x] Assert exact 409/v1 mismatch produces one retry with otherwise-identical fields and returns the second result.
- [x] Assert all non-matching errors return after one request.
- [x] Assert established v1 and v2 rooms submit their own authoritative version through initial and retry action paths.
- [x] Run the focused tests and record the expected behavioral RED.

### Task 2: Implement the bounded compatibility bridge

**Files:**

- Modify: `client/src/client/networkRuleset.ts`
- Modify: `client/src/client/LobbyTransport.ts`

**Interfaces:**

- Consumes: `EdgeResult<JoinRoomResponse>` including status, error, and `requiredRulesetVersion`.
- Produces: current-v2 create/join defaults and one exact server-directed legacy retry.

- [x] Set `CURRENT_NETWORK_RULESET_VERSION` to prepared version `2`.
- [x] Add the typed mismatch response field without widening the supported version domain.
- [x] Factor join request construction so the retry preserves code/name/color/loadout exactly and changes only the requested version.
- [x] Retry once only for HTTP 409 + `ruleset_mismatch` + required version `1`; return every other result unchanged.
- [x] Run focused tests GREEN.

### Task 3: Prove authoritative gameplay and reconcile docs

**Files:**

- Modify as needed: focused Lobby/NetworkClient tests
- Modify: `docs/SPEC.md`
- Modify: `docs/ARCHITECTURE.md`

**Interfaces:**

- Consumes: authoritative room options from create, join, ready-up, Realtime, and rematch paths.
- Produces: v2 new-match engine/action behavior, v1 legacy-match behavior, and accurate canonical rollout documentation.

- [x] Prove a v2 room reaches decisive engine construction and submits version `2`.
- [x] Prove a legacy retry reaches linear engine construction and submits/retries version `1`.
- [x] Prove ready-up/start and rematch preserve the synchronized room version.
- [x] Update canonical docs from the Phase B1 server-first window to the live Phase B2 browser behavior.

### Task 4: Verify, review, ship, and production-prove

**Files:**

- Append only: `.codearbiter/sprint-log.md`
- Append only when an authorized gate is bypassed: `.codearbiter/overrides.log`

**Interfaces:**

- Consumes: the corrected exact Phase B2 diff.
- Produces: a reviewed PR, exact-head hosted evidence, a Pages deployment, and a live version-2 network match proof.

- [x] Run focused tests, full client coverage, the complete Edge suite, `npm run check`, `npm run build`, `npm audit`, `git diff --check`, and state-free secret/hard-surface scans.
- [x] Dispatch one adversarial exact-diff reviewer; correct every Critical, High, Medium, and merge blocker and obtain correction re-review when needed.
- [x] Commit through the codeArbiter gate, push, open a ready PR, and require every hosted check green on the exact reviewed head.
- [ ] Merge through the PR under standing logged authority and wait for the exact-merge Pages deployment.
- [ ] Prove in production that a new browser creates/joins a version-2 room, starts it, and commits a version-2 action; separately prove the legacy mismatch retry contract without mutating the first request.
- [ ] Record the evidence, close Phase B2, and immediately select the next highest-value scoped improvement.
