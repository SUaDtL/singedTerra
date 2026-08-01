# Mobility Signatures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Every task is test-first and receives spec-compliance plus code-quality review before acceptance.

**Goal:** Make each Garage mobility family feel visibly distinct during fuel movement without changing deterministic movement or network contracts.

**Architecture:** Observe authoritative per-tank position deltas inside the client renderer, classify only legal-looking same-round movement, and hand one immutable event to a bounded mobility-effects renderer. Keep profile selection and lifecycle math pure and exhaustive over `TankKitId`; draw the resulting client-only underlay between terrain and tanks.

**Tech Stack:** TypeScript 7 native compiler, Canvas 2D, existing shared tank-loadout types, Vitest, Playwright, no new dependency or asset.

## Global constraints

- No shared engine, physics, movement, fuel, action-log, Supabase, migration, or dependency change.
- TDD RED evidence precedes every production behavior change.
- Read `tank.loadout.treads` only; cosmetic parts remain mechanically inert.
- No perpetual animation or idle 60fps cost.
- Reduced motion suppresses animated signatures.
- Browser proof must observe canvas pixels, not only labels or internal state.

---

## File map

- `client/src/renderer/mobilitySignatures.ts`: pure observation, profile, geometry, and lifecycle contract.
- `client/src/renderer/mobilitySignatures.test.ts`: exhaustive deterministic unit coverage.
- `client/src/renderer/MobilityEffectsRenderer.ts`: bounded undercarriage burst storage/update/draw.
- `client/src/renderer/Renderer.ts`: authoritative delta observation, layer placement, reset, and idle-skip integration.
- `client/src/renderer/Renderer.mobility.test.ts`: renderer lifecycle and admission integration.
- `e2e/mobility-signatures.spec.ts`: production-canvas proof for all four kits and reduced motion.
- `docs/PLAYING.md`: one concise player-facing Garage note.

### Task 1: Pure movement-signature contract

**Files:**

- Create: `client/src/renderer/mobilitySignatures.ts`
- Create: `client/src/renderer/mobilitySignatures.test.ts`

**Interfaces:**

- Export `MobilitySignatureProfile`, `MobilitySignatureEvent`, and an exhaustive `MOBILITY_SIGNATURE_PROFILES` record keyed by `TankKitId`.
- Export a pure `observeMobilitySignature(previous, current)` classifier returning an event or `null`.
- Export pure bounded age/progress helpers used by drawing code.

- [x] Add failing tests for first-sample baseline, unchanged x, legal positive/negative movement, maximum delta, oversized jump, round change, dead/buried tank, and every kit profile.
- [x] Run the focused test and record the expected RED caused by the absent module.
- [x] Implement the smallest pure types/helpers/profile record satisfying the behavioral contract.
- [x] Run the focused test and `npm run typecheck`; require green.
- [x] Run spec-compliance review, then code-quality review; correct every blocker before acceptance.

### Task 2: Bounded client renderer and lifecycle integration

**Files:**

- Create: `client/src/renderer/MobilityEffectsRenderer.ts`
- Modify: `client/src/renderer/Renderer.ts`
- Create or modify: `client/src/renderer/Renderer.mobility.test.ts`

**Interfaces:**

- `MobilityEffectsRenderer.spawn(event)`, `.update()`, `.draw(ctx)`, `.clear()`, and readonly `.isActive`.
- `Renderer` keeps a per-tank previous-pose map, observes movement before effect update, draws mobility effects after terrain/shadows and before visible tanks, and clears both stores on reset.
- Renderer sets its busy state only for admitted signatures; reduced motion never spawns or extends busy state.

- [x] Add failing renderer tests proving one spawn for a legal delta, no repeated spawn, large-jump/round/dead/buried suppression, correct layer order, reset clearing, bounded expiry, and reduced-motion suppression.
- [x] Run the focused tests and record behavioral RED.
- [x] Implement the effects renderer and minimal `Renderer` integration without changing shared state or movement code.
- [x] Run focused tests, `npm run typecheck`, and existing renderer/movement tests; require green.
- [x] Run spec-compliance review, then code-quality review; correct every blocker before acceptance.

### Task 3: Production-browser visual proof and player guidance

**Files:**

- Create: `e2e/mobility-signatures.spec.ts`
- Modify: `docs/PLAYING.md`
- Modify production CSS or renderer constants only if the browser oracle exposes a real visibility defect.

**Browser contract:**

- Use the production bundle and real hot-seat setup.
- Select Foundry, Ranger, Bulwark, and Jackal mobility for the active player in separate deterministic cases.
- Start play, capture the settled undercarriage region, issue a real movement control, and poll/capture the live effect region.
- Prove each moved region changes from baseline, remains nonblank/in viewport, and differs materially across motifs.
- Prove authoritative x/fuel deltas remain the existing values, no document scroll appears, and reduced motion produces no animated signature trail.

- [x] Write the production-browser acceptance oracle and record its first honest result.
- [x] Correct only defects actually exposed by the oracle, with focused RED/GREEN evidence.
- [x] Add the concise player-guide note.
- [x] Run the focused browser test across desktop-fine, small-window, and pixel-touch profiles.
- [x] Run spec-compliance review, then code-quality review; correct every blocker before acceptance.

### Task 4: Sprint-wide adversarial and delivery gates

**Files:**

- Modify append-only `.codearbiter/sprint-log.md` with task, decision, and review receipts.
- Modify append-only `.codearbiter/overrides.log` only for the distinct standing-authority gates actually bypassed.

- [x] Run `npm run check`.
- [x] Run `npm run test:client`.
- [x] Run `npm run build`.
- [x] Run focused production Playwright and the repository rendering guardrails.
- [x] Run `npm audit --audit-level=high`, diff hygiene, and the state-free secret scan.
- [x] Give one adversarial subagent the spec, plan, sprint log, tests, and exact final diff.
- [x] Resolve every Critical, High, and other merge-blocking finding; obtain exact-diff follow-up clearance.
- [x] Run the governed commit gate, push `codex/mobility-signatures`, and open a ready PR.
- [ ] Require every hosted check green on the exact reviewed PR head.
- [ ] Log one distinct merge-boundary override under the maintainer's standing authority, merge through the PR, and verify Pages provenance plus live production behavior.
- [ ] Harvest any low-confidence decision or `[NEEDS-TRIAGE]` finding, then immediately select the next sprint cell.
