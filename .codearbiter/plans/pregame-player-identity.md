# Pre-game Player Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use the governed test-first workflow task by task. Each task ends in fresh evidence before the next begins.

**Goal:** Make authenticated player identity and earned progress an always-visible, coherent part of the pre-game command experience.

**Architecture:** `AccountPanelView` owns the semantic Player Record DOM from the existing `AccountState` summary. `Lobby.ts` owns only the presentation layer that docks it into the command shell. Existing `onOpen`, `onClose`, and `onSignOut` callbacks remain the sole interaction owners.

**Tech Stack:** TypeScript, DOM APIs, CSS in `Lobby.ts`, Vitest, Playwright.

## Global Constraints

- Client-only presentation; do not change auth, persistence, Supabase, network contracts, migrations, or dependencies.
- Preserve password-based account behavior under ADR-0011 and ADR-0012.
- Do not read or edit `.codearbiter/sprint-log.md` (H-05).
- Keep the generated `.codearbiter/open-tasks.md.lock` untracked and unstaged.
- Use explicit-path staging and an adversarial review of the exact final diff.

---

### Task 1: Pin the Player Record contract

**Files:**
- Modify: `client/src/ui/AccountPanelView.test.ts`
- Create: `e2e/pregame-player-record.spec.ts`

- [ ] Add a unit assertion for collapsed authenticated state that requires a labelled Player Record, commander identity, level, a `progress` meter with exact values, and no detailed account controls.
- [ ] Run `npm --workspace client run test -- AccountPanelView.test.ts` and confirm it fails because the record does not exist.
- [ ] Add browser assertions that the record remains visible and reachable in Hot Seat and Online routes across desktop, Pixel touch, and small-window projects; assert the lobby frame remains free of overflow.
- [ ] Run the new browser spec against a production Vite preview and confirm it fails before implementation.

### Task 2: Render and style the compact record

**Files:**
- Modify: `client/src/ui/AccountPanelView.ts`
- Modify: `client/src/ui/Lobby.ts`
- Test: `client/src/ui/AccountPanelView.test.ts`
- Test: `e2e/pregame-player-record.spec.ts`

- [ ] Add the minimal authenticated-collapsed Player Record subtree from the existing `AccountSummary`: commander, level, and semantic XP progress, without new state or callbacks.
- [ ] Keep the existing disclosure button as the record interaction and leave expanded matches, wins, exact XP, close, and sign-out unchanged.
- [ ] Add scoped tactical CSS for the record dock. Protect fixed-stage fit in every supported layout and retain existing focus-visible behavior.
- [ ] Re-run the focused unit and browser contracts until green.

### Task 3: Prove route and regression safety

**Files:**
- Test: `client/src/ui/AccountPanelView.test.ts`
- Test: `client/src/ui/Lobby.account.test.ts`
- Test: `e2e/pregame-player-record.spec.ts`
- Test: `e2e/online-garage-layout.spec.ts`
- Test: `e2e/tank-garage.spec.ts`

- [ ] Run focused account and lobby tests to prove anonymous, loading, unavailable, and authenticated-error paths remain unchanged.
- [ ] Run Player Record and existing garage browser guards in all reviewed viewport projects to prove no overlap or overflow regression.
- [ ] Run `npm --workspace client run test`, `npm run check`, `npm run build`, and `npm audit --audit-level=high`.
- [ ] Run the state-free secret scan and `git diff --check` on the final diff.

### Task 4: Governed delivery

**Files:**
- Modify: `.codearbiter/open-tasks.md` via `taskwrite.py` only
- Add: `.codearbiter/specs/pregame-player-identity.md`
- Add: `.codearbiter/plans/pregame-player-identity.md`

- [ ] Mark `ux.menu.0006` done only after implementation and evidence are complete.
- [ ] Give an adversarial reviewer the spec, plan, H-05 exception, test evidence, and exact final diff. Resolve every Critical, High, and merge-blocking finding.
- [ ] Commit with the full governed gate, open a PR, require all hosted checks green on the exact reviewed head, merge, deploy Pages, and verify live provenance.


## Maintenance reconciliation — 2026-10-29

**Current disposition:** Current account presentation. Current source/oracles: `client/src/ui/AccountPanelView.ts`, `client/src/ui/AccountPanelView.test.ts`.

The latest change to this historical plan reachable from `origin/main` is `77ce39c68a00` (feat(lobby): surface player progress before matches). The original unchecked RED, review, exact-head CI, deployment and acceptance entries remain historical evidence gaps unless a specific later receipt says otherwise. Current source or merge containment alone does not prove those executions. Do not rerun this old feature plan merely to manufacture a historical RED.

See [the project maintenance report](../reports/project-maintenance-2026-10-29.md#historical-plan-dispositions) for the bounded disposition and remaining obligation. This dated note preserves the original execution ledger.
