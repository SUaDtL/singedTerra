# Network Ruleset Boundary — Phase B1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILLS: use `superpowers:test-driven-development` for implementation, `superpowers:verification-before-completion` before delivery, and the codeArbiter commit/review/PR gates. Steps use checkbox syntax for resumability. The maintainer's standing authority covers the bounded spec/plan pause only.

**Goal:** Make the deployed referee capable of creating explicit ruleset `2` rooms without changing the public client's current ruleset `1` behavior.

**Architecture:** Widen only the pure Edge creation resolver from legacy-only to both already-supported versions. The existing `create_room` handler stores and echoes that resolved integer in JSONB; no schema or client change is needed. Deploy the Edge capability before a separately governed client flip.

**Tech Stack:** TypeScript, Deno Edge Functions, existing Vitest/client and deterministic harnesses; no dependency or migration.

## Global constraints

- Capture a focused TDD RED before editing production code.
- Omitted create requests must remain legacy version `1`.
- The public client constant must remain version `1` throughout Phase B1.
- Existing auth, seat-token, RLS, rate-limit, action-log, and deterministic engine behavior must not change.
- One adversarial exact-diff review, exact-head hosted CI, PR-only merge, scoped Edge deployment, Pages provenance, and production probes remain required.

---

### Task 1: Pin v2 creation in RED

**Files:**

- Modify: `supabase/functions/_shared/ruleset.test.ts`
- Modify: `supabase/functions/create_room/handler.test.ts`

**Interfaces:**

- Consumes: `resolveCreatableRulesetVersion(value: unknown)` and the injected `createRoomHandler` seam.
- Produces: causal expectations that explicit `2` is stored/echoed while omitted/explicit `1` remain legacy and unsupported values never touch the DB.

- [x] Replace the Phase A resolver expectation with assertions that omission and `1` return `{ ok: true, version: 1 }`, `2` returns `{ ok: true, version: 2 }`, and `99` returns `{ ok: false, error: 'invalid_request' }`.
- [x] Replace the Phase A handler 409 test with a captured-insert test asserting HTTP 200 plus `options.rulesetVersion === 2` in both the stored room and response.
- [x] Keep the existing omitted/explicit-`1` and unsupported-version tests unchanged as compatibility controls.
- [x] Run `deno test supabase/functions/_shared/ruleset.test.ts supabase/functions/create_room/handler.test.ts` and record the expected RED: version `2` resolves to `not_creatable` and the handler returns 409 instead of storing it.

### Task 2: Widen the server creation capability

**Files:**

- Modify: `supabase/functions/_shared/ruleset.ts`
- Modify: `supabase/functions/create_room/index.ts`

**Interfaces:**

- Consumes: `resolveRequestedRulesetVersion(value: unknown): ResolvedVersion`.
- Produces: `resolveCreatableRulesetVersion(value: unknown): ResolvedVersion`, accepting supported `1 | 2` and preserving `invalid_request` for everything else.

- [x] Change `resolveCreatableRulesetVersion` to return `resolveRequestedRulesetVersion(value)` and remove the Phase A-only `not_creatable` result type.
- [x] Remove `LEGACY_NETWORK_RULESET_VERSION` from `create_room` imports and collapse the failed-resolution branch to the existing HTTP 400 invalid-input response.
- [x] Run the two focused Deno test files and confirm GREEN.
- [x] Run the complete Edge suite to prove join, submit, restart, and legacy compatibility remain green.

### Task 3: Reconcile rollout documentation

**Files:**

- Modify: `docs/SPEC.md`
- Modify: `docs/ARCHITECTURE.md`

**Interfaces:**

- Consumes: the Phase B1 server-first behavior proven by Tasks 1–2.
- Produces: canonical prose stating that the backend accepts explicit `1` and `2`, omission remains `1`, and the current client still emits `1` until Phase B2.

- [x] Replace Phase A creation-only language with the deployed dual-version server contract.
- [x] State explicitly that the public client remains version `1` during the server-first window.
- [x] Scan the touched canonical docs for contradictory Phase A rollout claims.

### Task 4: Verify, review, ship, and deploy

**Files:**

- Append only: `.codearbiter/sprint-log.md`
- Append only when an authorized gate is bypassed: `.codearbiter/overrides.log`

**Interfaces:**

- Consumes: the corrected exact Phase B1 diff.
- Produces: a reviewed PR, exact-head hosted evidence, an active `create_room` deployment, and live v1/v2 contract proof.

- [x] Run focused tests, the full Deno suite, `npm run check`, `npm run coverage:client`, `npm run build`, `npm audit`, `git diff --check`, and state-free secret/hard-surface scans.
- [x] Dispatch one adversarial exact-diff reviewer; correct every Critical, High, Medium, and merge blocker and obtain correction re-review when needed.
- [ ] Commit through the codeArbiter gate, push, open a ready PR, and require every hosted check green on the exact reviewed head.
- [ ] Merge through the PR under standing logged authority; deploy only `create_room --project-ref jdvxfxjpobtyasozxauh` with no database push.
- [ ] Verify `create_room` is ACTIVE, omission/explicit `1` create version `1`, explicit `2` creates version `2`, and a matching version `2` join succeeds; verify Pages provenance/live smoke remains green on the merge commit.
- [ ] Record Phase B1 evidence, then begin the separately governed Phase B2 client-version flip.
