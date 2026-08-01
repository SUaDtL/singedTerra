# Network Ruleset Boundary — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILLS: use `superpowers:test-driven-development` for implementation, `superpowers:verification-before-completion` before delivery, and the codeArbiter commit/review/PR gates. The maintainer's standing authority covers the bounded spec/plan pause only.

**Goal:** Install a backward-compatible, Edge-enforced deterministic ruleset boundary while every newly created room remains on legacy ruleset `1`.

**Architecture:** Keep the referee thin. A pure Edge helper normalizes and compares integer ruleset versions; the version is stored in the existing JSONB options object. Create, join, and submit enforce it at their existing trust boundaries. A mirrored client constant emits current version `1`, while server-returned room options remain authoritative for engine construction, rejoin, and rematch.

**Tech Stack:** TypeScript, Deno Edge Functions, Vitest, existing deterministic harnesses; no dependency or migration.

## Global constraints

- TDD RED must be captured before production edits.
- Phase A must not create version `2` rooms from the production client or change current network damage.
- Existing membership and seat-token validation order must not be weakened.
- Legacy clients/rooms with an omitted version must behave as ruleset `1`.
- One adversarial exact-diff review, exact-head hosted CI, PR-only merge, scoped Edge deployment, Pages provenance, and live smoke remain required.

---

### Task 1: Pin the pure and Edge contracts in RED

**Files:**

- Create: `supabase/functions/_shared/ruleset.test.ts`
- Modify: `supabase/functions/create_room/handler.test.ts`
- Modify: `supabase/functions/join_room/handler.test.ts`
- Modify: `supabase/functions/submit_action/handler.test.ts`

- [x] Prove missing fields resolve to legacy `1`, supported `1`/`2` pass compatibility parsing, and invalid values or stored shapes fail closed.
- [x] Prove Phase A create stores/echoes version `1`, rejects prepared version `2` with HTTP 409, and rejects unsupported input without DB access.
- [x] Prove join rejects mismatches before any room mutation.
- [x] Prove submit preserves membership/token gates causally against a mismatched room and rejects verified mismatch/corruption before RPC.
- [x] Run the focused Deno tests and record the expected RED against unmodified production code.

### Task 2: Pin client emission and engine selection in RED

**Files:**

- Create: `client/src/client/networkRuleset.ts`
- Create or modify: `client/src/client/LobbyTransport.test.ts`
- Modify: `client/src/client/NetworkClient.lockstep.test.ts`
- Modify: `client/src/client/gameEngineOptions.test.ts`
- Modify focused Lobby/rejoin/rematch tests where the authoritative option crosses a seam.

- [x] Prove create and join send current version `1` at the top level.
- [x] Prove submit and conflict retry send version `1`.
- [x] Prove ruleset `1`/missing maps to linear and `2` maps to decisive.
- [x] Prove server-returned create options, ready/rejoin, and rematch carry the version through production engine construction.
- [x] Run the focused client tests and record RED.

### Task 3: Implement the smallest compatible boundary

**Files:**

- Create: `supabase/functions/_shared/ruleset.ts`
- Modify: `supabase/functions/_shared/mod.ts`
- Modify: `supabase/functions/_shared/database.types.ts`
- Modify: `supabase/functions/create_room/index.ts`
- Modify: `supabase/functions/join_room/index.ts`
- Modify: `supabase/functions/submit_action/index.ts`
- Create: `client/src/client/networkRuleset.ts`
- Modify: `client/src/client/LobbyTransport.ts`
- Modify: `client/src/client/NetworkClient.ts`
- Modify: `client/src/client/GameClient.ts`
- Modify: `client/src/client/gameEngineOptions.ts`
- Modify: `client/src/ui/lobbyValidation.ts`
- Modify: `client/src/ui/Lobby.ts`
- Modify: `client/src/main.ts`
- Modify exact associated tests and generated-type expectations.

- [x] Add pure supported-version, Phase A creation, stored-shape, and compatibility logic on both runtime sides without cross-layer imports.
- [x] Store and echo the create version; reject join and submit mismatches at the specified boundaries.
- [x] Emit version `1` from the current client and consume server-authoritative stored options.
- [x] Carry the version through ready, rejoin, and rematch engine construction.
- [x] Make every focused RED green without enabling ruleset `2` room creation.

### Task 4: Verify, review, ship, and deploy

**Files:**

- Append only: `.codearbiter/sprint-log.md`
- Append only when an authorized gate is bypassed: `.codearbiter/overrides.log`

- [x] Run focused Edge/client tests, the full Deno suite, `npm run check`, `npm run coverage:client`, `npm run build`, `npm audit`, `git diff --check`, and state-free secret/hard-surface scans.
- [x] Adversarially review the exact diff and correct every Critical, High, Medium, and merge-blocking finding with the same reviewer re-checking corrections.
- [x] Commit through the codeArbiter gate, push, open a ready PR, and require all hosted checks green on the exact reviewed head.
- [x] Merge through the PR under standing authority; deploy only `create_room`, `join_room`, `submit_action`, and the rematch projection in `restart_game`; verify client Pages provenance and a live legacy ruleset `1` network-compatible smoke.
- [x] Record Phase A evidence, then immediately begin the separately governed Phase B client-version flip.
