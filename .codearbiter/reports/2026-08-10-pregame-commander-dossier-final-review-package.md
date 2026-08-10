# Commander Dossier final review package

## Review target

- Slice: `ux.pregame.0006`
- Branch: `codex/pregame-commander-dossier`
- Base: `4e27e68f1ab2eff80d99112112465c903b66f24b`
- Package scope: the exact staged implementation and governance diff below. This wrapper file is excluded from the embedded diff only to avoid self-recursion.
- Integrity method: each staged path was captured independently with `git diff --cached --no-ext-diff --unified=5 -- <path>` and concatenated in the path order below; generation rejects any transport truncation marker.

## Required artifacts

- Spec: `.codearbiter/specs/pregame-commander-dossier.md`
- Plan: `.codearbiter/plans/pregame-commander-dossier.md`
- Sprint evidence: `.codearbiter/reports/2026-08-10-pregame-commander-dossier-sprint-evidence.md`
- Unit tests: `client/src/ui/AccountPanelView.test.ts`
- Browser tests: `e2e/account-progression-summary.spec.ts`
- Production: `client/src/ui/AccountPanelView.ts`, `client/src/ui/Lobby.ts`

All artifact contents are present in the exact staged diff below.

## Exact final verification

- `npm run check`: PASS.
- `npm run test:client`: 151 files, 1,178 tests PASS.
- `npm run check:edge`: 267 tests PASS.
- `npm run coverage:client`: 93.55% statements, 84.11% branches, 87.99% functions, 95.51% lines.
- `npm run build`: PASS.
- Complete isolated Playwright matrix: 255 passed, 30 intentional project-conditional skips.
- Fresh acceptance proof: Commander Dossier front-door geometry passed desktop-fine, pixel-touch, and small-window.

## Exact staged implementation and governance diff

```diff
diff --git a/.codearbiter/open-tasks.md b/.codearbiter/open-tasks.md
index ed5dbd0..b1b40d4 100644
--- a/.codearbiter/open-tasks.md
+++ b/.codearbiter/open-tasks.md
@@ -159,10 +159,12 @@ Decision forks split to `open-questions.md` (CONFIRM-04 rate-limiting, CONFIRM-0
 - (informational, no action) `submit_action` lets any room member proxy any bot/ai seat — within documented design (controls §26), exactly-once via the seq cursor; threat-model awareness only.
 - (informational, no action) `REPLICA IDENTITY FULL` on rooms/room_actions = WAL write-amplification, justified for Realtime; revisit only if WAL cost grows.

 - (Possible-later, from room-browser-enrichment spec 2026-06-22) Surface `interestRate` / `suddenDeathTurn` on the public browse row too, now that `StoredOptions` declares them. Pure read-path addition mirroring the rounds/armsLevel/botCount work. [L/S]
 ## In-flight
+- [x] ux.pregame.0006 - Keep the full persistent commander identity, level, and next XP milestone legible in the pre-game command header across desktop and compact layouts without changing authentication or progression rules.  (from live-production-commander-dossier-audit-2026-08-10)  (done 2026-08-10)
+  - Boundaries: client, pregame-ux, account-presentation
 - [x] ux.pregame.0005 - Present Quick Duel, Local Battle, and Play Online as a focused deployment chooser before revealing either setup flow.  (from adversarial-player-experience-followup-2026-08-10)  (done 2026-08-10)
   - Boundaries: client, pre-game-ux
 - [x] ux.pregame.0004 - Make the compact pre-game command shell legible and remove duplicate preview-plane ghosting without changing global stage scaling.  (from live-production-command-shell-audit-2026-08-10)  (done 2026-08-10)
   - Boundaries: client, pre-game-ux
 - [x] ux.pregame.0003 - Make Hot Seat defaults immediately deployable while progressively disclosing crew and battlefield customization behind one accessible preparation control.  (from continuous-improvement-smarts-2026-08-10)  (done 2026-08-10)
diff --git a/.codearbiter/plans/pregame-commander-dossier.md b/.codearbiter/plans/pregame-commander-dossier.md
new file mode 100644
index 0000000..9f3e5c8
--- /dev/null
+++ b/.codearbiter/plans/pregame-commander-dossier.md
@@ -0,0 +1,104 @@
+# Pre-game Commander Dossier Implementation Plan
+
+> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
+
+**Goal:** Keep full persistent commander identity and the next XP milestone legible in the pre-game masthead at every supported layout.
+
+**Architecture:** Extend the existing `AccountPanelView` collapsed authenticated composition with semantic name, level, and milestone elements. Keep `Lobby` as the CSS/layout owner and keep the stage-owned account dialog unchanged. Unit tests own semantic behavior; Playwright owns scaled geometry and clipping behavior.
+
+**Tech Stack:** TypeScript, DOM APIs, Vitest with jsdom, CSS embedded by `Lobby`, Playwright.
+
+## Global Constraints
+
+- Work test-first. No production code before a causal failing test.
+- Change client account presentation only.
+- Preserve the existing account dialog, Auth/session behavior, progression arithmetic, and account action callbacks.
+- Add no dependencies and make no Supabase, migration, gameplay, or action-protocol changes.
+- Do not read or rewrite malformed `.codearbiter/sprint-log.md`; persist sprint evidence in the spec and report.
+
+---
+
+### Task 1: Dossier semantics
+
+**Files:**
+- Modify: `client/src/ui/AccountPanelView.test.ts`
+- Modify: `client/src/ui/AccountPanelView.ts`
+
+**Interfaces:**
+- Consumes: authenticated `AccountState.profile.displayName` and server-derived `AccountSummary`.
+- Produces: `.account-panel__commander-name`, `.account-panel__commander-level`, and `.account-panel__record-milestone` inside the existing disclosure/record contract.
+
+- [ ] **Step 1: Write the failing component test**
+
+  Extend the collapsed authenticated test to require literal `Ranger`, `Level 3`, and `300 XP to Level 4` elements, while retaining meter value `200`, max `500`, the existing progress accessible name, click behavior, and `aria-expanded=false`.
+
+- [ ] **Step 2: Verify RED**
+
+  Run `npm run test:client -- --run client/src/ui/AccountPanelView.test.ts` and confirm failure because the three dossier selectors do not exist.
+
+- [ ] **Step 3: Implement the semantic dossier**
+
+  Build separate spans for the commander name and level, add the exact remaining-XP milestone from the same server-derived summary, and append them inside the existing single disclosure and record.
+
+- [ ] **Step 4: Verify GREEN and mutations**
+
+  Re-run the focused test. Temporarily remove the milestone and level append operations one at a time and confirm the test fails, then restore GREEN.
+
+### Task 2: Responsive containment
+
+**Files:**
+- Modify: `e2e/account-progression-summary.spec.ts`
+- Modify: `client/src/ui/Lobby.ts`
+
+**Interfaces:**
+- Consumes: the Task 1 dossier classes and the existing `#app.is-compact` stage-scale contract.
+- Produces: a wrap-capable masthead dossier with no clipped text and no overlap with adjacent pre-game regions.
+
+- [ ] **Step 1: Write the failing browser oracle**
+
+  Update the authenticated fixture to mirror the Task 1 production structure. Require every text range for a 24-character commander, `Level 3`, and `300 XP to Level 4` to stay inside its owning element; require `text-overflow` not to be `ellipsis`, `white-space` not to be `nowrap`, and preserve non-overlap with the Vehicle Bay and deployment content.
+
+- [ ] **Step 2: Verify RED**
+
+  Run `npx playwright test e2e/account-progression-summary.spec.ts` and confirm the compact projects fail because the current trigger enforces nowrap plus ellipsis.
+
+- [ ] **Step 3: Implement responsive dossier CSS**
+
+  Replace the collapsed record's single-line clipping with a two-column identity/level row and a meter/milestone row. Permit the commander name to wrap anywhere, keep level and milestone readable, and use existing tactical color/type/border tokens.
+
+- [ ] **Step 4: Verify GREEN and mutations**
+
+  Re-run the focused browser file. Temporarily restore `white-space: nowrap` and `text-overflow: ellipsis` independently and confirm the oracle fails, then restore GREEN.
+
+### Task 3: Sprint landing evidence
+
+**Files:**
+- Create: `.codearbiter/reports/2026-08-10-pregame-commander-dossier-sprint-evidence.md`
+- Modify: `.codearbiter/open-tasks.md` through `taskwrite.py` only
+
+**Interfaces:**
+- Consumes: final code/tests, RED/GREEN transcripts, mutation outcomes, full verification, and reviewer findings.
+- Produces: durable sprint evidence and completed task `ux.pregame.0006`.
+
+- [ ] **Step 1: Run complete verification**
+
+  Run focused tests, `npm run check`, `npm run test:client`, `npm run check:edge`, `npm run coverage:client`, `npm run build`, `npm run test:e2e`, `git diff --check`, dependency audit, and state-free secret scan.
+
+- [ ] **Step 2: Dispatch the adversarial final-package review**
+
+  Provide the reviewer with the spec, this plan, report/sprint evidence, tests, and exact final diff. Resolve every Critical, High, and merge-blocking finding test-first, then rerun the reviewer against the corrected exact package.
+
+- [ ] **Step 3: Persist the report and complete the task**
+
+  Record SMARTS, RED/GREEN, mutation, reviewer, and matrix evidence. Use `taskwrite.py done -- ux.pregame.0006` only after all obligations pass.
+
+- [ ] **Step 4: Governed landing**
+
+  Run commit-gate, coverage audit, `$ca-pr`, exact-head hosted CI, authorized merge, Pages deployment, production health/provenance, and the focused live browser matrix.
+
+## Self-review
+
+- Spec coverage: every acceptance criterion maps to Task 1 semantics, Task 2 geometry, or Task 3 verification.
+- Placeholder scan: no TBD, TODO, or deferred implementation instruction remains.
+- Type consistency: all class names produced in Task 1 are the selectors consumed in Task 2.
+- Scope check: one client-only presentation slice with no independent subsystem bundled in.
diff --git a/.codearbiter/reports/2026-08-10-pregame-commander-dossier-sprint-evidence.md b/.codearbiter/reports/2026-08-10-pregame-commander-dossier-sprint-evidence.md
new file mode 100644
index 0000000..de4cb1d
--- /dev/null
+++ b/.codearbiter/reports/2026-08-10-pregame-commander-dossier-sprint-evidence.md
@@ -0,0 +1,70 @@
+# ux.pregame.0006 sprint evidence
+
+## Scope
+
+Turn the collapsed authenticated masthead record into a responsive commander dossier that keeps the full persistent identity, current level, and exact next XP milestone visible before any deployment route. Preserve the existing Player Account dialog and all Auth, progression, setup, and gameplay behavior.
+
+## SMARTS
+
+The live production comparison favored a structured dossier over a wider single-line card or smaller type. Securable and backend boundaries remain unchanged. Maintainable and Testable favor semantic sub-elements plus causal DOM/geometry tests. Reliable improves because maximum-length identity is no longer hidden. Available and Scalable are neutral. Verdict: strong; confidence high; intent conforms to ADR-0011 and the standing continuous-improvement goal.
+
+The broader adversarial-player audit is fully discharged. This slice is the next bounded cell under `ux.pregame.0001`, selected from a live 1024 by 576 production capture where the authenticated identity rendered as `Commander SUaDtL - L...`.
+
+## Test-first evidence
+
+- Baseline component: `AccountPanelView.test.ts` passed 13 of 13.
+- The first browser attempt reused an unrelated service on the repository's default port 4173 and produced no `#lobby`; it was rejected as invalid evidence and that process was not touched.
+- Isolated baseline on slice-owned port 4178 passed the six compact summary/record geometry cases relevant to this change. Three account-overlay cases could not initialize against the no-env build and remain protected by the complete hosted matrix.
+- Component RED: 1 of 13 failed because the collapsed surface still exposed `Player record` and no structured dossier fields.
+- Browser RED: Pixel touch and small-window failed because computed `white-space` remained `nowrap`; desktop was correctly skipped by the compact-only oracle.
+- Initial GREEN exposed a genuine Pixel-touch collision: dossier bottom `69.078125` overlapped Vehicle Bay spotlight top `68.375`.
+- The compact preview boundary now starts at logical 82px, producing deliberate separation without changing global stage scaling.
+- Focused GREEN: component 13 of 13; browser Pixel touch and small-window passed with desktop intentionally skipped.
+
+## Mutation evidence
+
+- Removing the milestone append failed exactly on missing `300 XP to Level 4` and returned GREEN after restoration.
+- Restoring `white-space: nowrap` failed the compact browser oracle and returned GREEN after restoration.
+- Removing the level append failed exactly on missing `Level 3` and returned GREEN after restoration.
+- Restoring `text-overflow: ellipsis` failed the all-project front-door oracle and was restored to `clip`.
+- Removing `triggerOnly` from the collapsed-dossier branch failed the production component test because the masthead no longer received a dossier while its dialog was open.
+- Broadening the compact masthead reservation to no-record routes failed because the before/after masthead heights became equal.
+- Broadening the compact preview offset to no-record routes failed because the before/after preview positions became equal.
+
+## Current implementation
+
+- `AccountPanelView` emits independent commander-name, level, and exact remaining-XP milestone elements inside the existing disclosure.
+- The progress meter retains the original value, max, and commander/level accessible name.
+- The collapsed record is now labeled `Commander dossier` with the visible kicker `COMMANDER DOSSIER`.
+- Lobby CSS uses a wrap-capable two-column identity row, a full-width milestone row, and no ellipsis.
+- No dependency, Supabase, migration, auth/session, persistence, progression-rule, gameplay, or protocol change exists.
+
+## Adversarial review corrections
+
+The first designated review returned BLOCK with one High merge blocker, two Medium findings, and one Low finding:
+
+- High: desktop and front-door geometry were not covered. A new all-project front-door oracle now proves the maximum-length dossier is inside the masthead, every text range is inside the disclosure, and the card is clear of the deployment chooser.
+- Medium: the compact preview offset applied to every route. The default 70px boundary is restored; only a deployment containing an authenticated `.account-panel__record` receives the 82px preview start.
+- Medium: level-removal and ellipsis mutation receipts were absent. Both now fail causally and are recorded above.
+- Low: the disclosure's complete accessible label was unguarded. Component and browser tests now assert the exact commander, level, milestone, and Player Account label.
+
+The new front-door test failed first on both compact projects because the absolute dossier extended beyond its masthead owner. An authenticated-dossier-only 120px compact masthead reservation corrected containment. Desktop-fine, Pixel touch, and small-window now pass the front-door geometry case; the selected-route geometry case continues to pass both compact projects and intentionally skips desktop.
+
+Corrected-package adversarial re-review returned PASS with zero Critical, High, Medium, Low, or merge-blocking findings.
+
+The coverage audit returned PASS with no merge blocker and two Medium proof gaps. Both were closed: the real `open: true, triggerOnly: true` composition now has component coverage, and the compact browser test now measures no-record geometry before injecting the dossier and requires both reserved dimensions to increase afterward. Independent mutations of each `:has(.account-panel__record)` selector and of the `triggerOnly` branch failed causally as recorded above. Coverage re-audit confirmed both corrections and returned final PASS with no new blocker.
+
+## Full matrix
+
+- `npm run check`: PASS.
+- `npm run test:client`: 151 files and 1,178 tests PASS.
+- `npm run check:edge`: 267 tests PASS.
+- `npm run coverage:client`: 93.55% statements, 84.11% branches, 87.99% functions, and 95.51% lines; `AccountPanelView.ts` is 100% lines and 95.65% branches.
+- Production build: PASS.
+- Complete Playwright matrix on an isolated temporary port: 255 passed and 30 intentional project-conditional skips. The temporary port substitution was restored; `playwright.config.ts` is unchanged from the branch base.
+
+The exact final local rerun is green. Pending final adversarial review, commit gate, PR CI, merge, deployment, and production proof.
+
+## Process note
+
+The malformed legacy `.codearbiter/sprint-log.md` was neither read nor rewritten. This report and the spec persist the SMARTS, RED/GREEN, mutation, and review record for recovery.
diff --git a/.codearbiter/specs/pregame-commander-dossier.md b/.codearbiter/specs/pregame-commander-dossier.md
new file mode 100644
index 0000000..3094bbc
--- /dev/null
+++ b/.codearbiter/specs/pregame-commander-dossier.md
@@ -0,0 +1,57 @@
+# Pre-game Commander Dossier
+
+## Goal
+
+Make persistent player identity read as a first-class part of the pre-game command shell. An authenticated player must see the complete commander name, current level, and exact next XP milestone without opening the account dialog or encountering ellipsis at supported desktop and compact layouts.
+
+## Player problem
+
+Production at a 1024 by 576 compact viewport renders the masthead account record as `Commander SUaDtL - L...`. The identity and progression work is technically present but visually reduced to a cramped utility button on the first decision screen. This weakens both product coherence and the reason for a returning player to care about the account.
+
+## Chosen design
+
+The collapsed authenticated surface becomes a structured commander dossier:
+
+- `COMMANDER DOSSIER` remains the identifying kicker.
+- The disclosure contains separate commander-name and level elements instead of one unbreakable text node.
+- A visible milestone states the exact XP remaining to the next level beside the existing semantic progress meter.
+- Long valid display names wrap inside the dossier. They are never hidden by ellipsis.
+- The whole dossier remains the single account-dialog trigger with one accessible name and `aria-expanded` state.
+
+The existing opaque account dialog, sign-out action, account loading/error states, Auth session, progression arithmetic, and server-derived summary remain unchanged.
+
+## Alternatives considered
+
+1. Increase only the existing card width. Rejected because it consumes masthead space and still fails at narrower stage scales.
+2. Keep the current single-line label and reduce its font. Rejected because it trades truncation for illegibility.
+3. Structure the dossier so identity, level, and milestone can wrap independently. Chosen because it preserves information and adapts without changing shell ownership.
+
+## SMARTS decision
+
+The structured dossier is strong. Securable is unchanged because no credential or auth data moves. Maintainable improves through semantic sub-elements rather than more breakpoint-specific text clipping. Available and Scalable are neutral. Reliable and Testable improve because unit tests can prove exact identity/milestone semantics while browser tests prove rendered text containment at compact scale. Intent conforms to ADR-0011: password-based account identity remains separate from room authorization, and this slice changes presentation only.
+
+## Acceptance criteria
+
+1. An authenticated summary renders the complete commander display name, `Level N`, and exact `X XP to Level N+1` milestone in the collapsed masthead dossier.
+2. The existing progress element retains exact value, max, and accessible commander/level context.
+3. The dossier remains one disclosure that opens the existing Player Account dialog and accurately exposes `aria-expanded`.
+4. A maximum-length 24-character display name has no clipped or ellipsized rendered text in desktop-fine, Pixel touch, and small-window projects.
+5. The dossier remains contained inside the masthead and does not overlap the deployment chooser, mission brief, or Vehicle Bay.
+6. Anonymous, unavailable-summary, loading, account-dialog, Auth, progression, and match-launch behavior do not change.
+
+## Boundaries
+
+Client account presentation, Lobby CSS, focused DOM tests, and real-browser geometry only. No authentication, authorization, credentials, Supabase functions, persistence, progression rules, migrations, dependencies, gameplay, or action protocol changes.
+
+## Verification obligations
+
+- RED unit proof for missing structured identity, level, and milestone elements.
+- RED browser proof that the current compact single-line trigger clips a maximum-length commander name.
+- Focused unit and browser GREEN runs.
+- Mutation checks for removing the milestone, restoring `white-space: nowrap`, restoring ellipsis, and omitting the level element.
+- Full client, engine/check, Edge, coverage, build, and Playwright matrix before commit.
+- One adversarial reviewer receives this spec, the plan, sprint evidence, tests, and final diff.
+
+## Governance note
+
+The standing continuous-improvement goal explicitly approves this bounded spec and its plan. The malformed legacy `.codearbiter/sprint-log.md` is not read or rewritten; SMARTS, RED/GREEN, mutation, review, and matrix evidence is persisted in this spec and the slice report.
diff --git a/client/src/ui/AccountPanelView.test.ts b/client/src/ui/AccountPanelView.test.ts
index bc62b93..d57a811 100644
--- a/client/src/ui/AccountPanelView.test.ts
+++ b/client/src/ui/AccountPanelView.test.ts
@@ -137,11 +137,11 @@ describe('buildAccountPanelView', () => {
     expect(root.querySelector('.account-panel__error')?.textContent)
       .toBe('<img src=x onerror=alert(1)>')
     expect(root.querySelector('img')).toBeNull()
   })

-  it('keeps an accessible Player Record visible while authenticated details are collapsed', () => {
+  it('keeps the full commander dossier and next milestone visible while authenticated details are collapsed', () => {
     const onOpen = vi.fn()
     const state: AccountState = {
       status: 'authenticated',
       busy: false,
       error: '',
@@ -149,27 +149,59 @@ describe('buildAccountPanelView', () => {
     }
     const root = buildAccountPanelView(options({ state, onOpen }))
     if (!root) throw new Error('Expected authenticated account panel')

     const record = root.querySelector<HTMLElement>('section.account-panel__record')
-    const trigger = button(root, 'Commander Ranger - Level 3')
+    const trigger = record?.querySelector<HTMLButtonElement>('.account-panel__account-trigger')
     const meter = record?.querySelector<HTMLProgressElement>('progress')
+    if (!record || !trigger) throw new Error('Expected collapsed commander dossier disclosure')
     expect(trigger.classList.contains('account-panel__account-trigger')).toBe(true)
     expect(trigger.getAttribute('aria-expanded')).toBe('false')
-    expect(record?.getAttribute('aria-label')).toBe('Player record')
-    expect(record?.querySelector('h2')?.textContent).toBe('PLAYER RECORD')
+    expect(trigger.getAttribute('aria-label'))
+      .toBe('Commander Ranger, Level 3, 300 XP to Level 4. Player account')
+    expect(record?.getAttribute('aria-label')).toBe('Commander dossier')
+    expect(record?.querySelector('h2')?.textContent).toBe('COMMANDER DOSSIER')
+    expect(trigger?.querySelector('.account-panel__commander-name')?.textContent).toBe('Ranger')
+    expect(trigger?.querySelector('.account-panel__commander-level')?.textContent).toBe('Level 3')
+    expect(trigger?.querySelector('.account-panel__record-milestone')?.textContent)
+      .toBe('300 XP to Level 4')
     expect(meter?.value).toBe(200)
     expect(meter?.max).toBe(500)
     expect(meter?.getAttribute('aria-label')).toBe('Commander Ranger Level 3 XP progress')
     expect(root.classList.contains('account-panel--open')).toBe(false)
     expect(root.querySelector('.account-panel__progress')).toBeNull()
     expect([...root.querySelectorAll('button')].some((candidate) => candidate.textContent === 'Sign out')).toBe(false)
     expect(root.querySelector('form')).toBeNull()
-    trigger.click()
+    trigger?.click()
     expect(onOpen).toHaveBeenCalledOnce()
   })

+  it('keeps the same dossier semantics when the masthead requests trigger-only while the dialog is open', () => {
+    const state: AccountState = {
+      status: 'authenticated',
+      busy: false,
+      error: '',
+      profile: { id: 'user-1', displayName: 'Ranger', summary: validSummary },
+    }
+    const root = buildAccountPanelView(options({ state, open: true, triggerOnly: true }))
+    if (!root) throw new Error('Expected trigger-only commander dossier')
+
+    const record = root.querySelector<HTMLElement>('.account-panel__record')
+    const trigger = record?.querySelector<HTMLButtonElement>('.account-panel__account-trigger')
+    if (!record || !trigger) throw new Error('Expected trigger-only dossier disclosure')
+    expect(trigger.getAttribute('aria-expanded')).toBe('true')
+    expect(trigger.getAttribute('aria-label'))
+      .toBe('Commander Ranger, Level 3, 300 XP to Level 4. Player account')
+    expect(trigger.querySelector('.account-panel__commander-name')?.textContent).toBe('Ranger')
+    expect(trigger.querySelector('.account-panel__commander-level')?.textContent).toBe('Level 3')
+    expect(trigger.querySelector('.account-panel__record-milestone')?.textContent)
+      .toBe('300 XP to Level 4')
+    expect(root.querySelector('.account-panel__progress')).toBeNull()
+    expect([...root.querySelectorAll('button')].some((candidate) => candidate.textContent === 'Sign out'))
+      .toBe(false)
+  })
+
   it('renders semantic XP progress and exact remaining XP while preserving authenticated sign-out', () => {
     const onSignOut = vi.fn()
     const state: AccountState = {
       status: 'authenticated',
       busy: false,
diff --git a/client/src/ui/AccountPanelView.ts b/client/src/ui/AccountPanelView.ts
index b017ce6..1aff90c 100644
--- a/client/src/ui/AccountPanelView.ts
+++ b/client/src/ui/AccountPanelView.ts
@@ -90,23 +90,41 @@ export function buildAccountPanelView(
     )
     disclosure.className = 'account-panel__account-trigger'
     disclosure.setAttribute('aria-expanded', String(options.open))

     if (!options.open || options.triggerOnly) {
-      if (options.state.profile.summary) {
+      if (accountSummary) {
+        const remainingXp = accountSummary.nextLevelXp - accountSummary.levelXp
+        const nextLevel = accountSummary.level + 1
+        disclosure.textContent = ''
+        disclosure.setAttribute(
+          'aria-label',
+          `Commander ${options.state.profile.displayName}, Level ${accountSummary.level}, ${remainingXp} XP to Level ${nextLevel}. Player account`,
+        )
+        const commander = document.createElement('span')
+        commander.className = 'account-panel__commander-name'
+        commander.textContent = options.state.profile.displayName
+        const level = document.createElement('span')
+        level.className = 'account-panel__commander-level'
+        level.textContent = `Level ${accountSummary.level}`
+        const milestone = document.createElement('span')
+        milestone.className = 'account-panel__record-milestone'
+        milestone.textContent = `${remainingXp} XP to Level ${nextLevel}`
+        disclosure.append(commander, level, milestone)
+
         const record = document.createElement('section')
         record.className = 'account-panel__record'
-        record.setAttribute('aria-label', 'Player record')
+        record.setAttribute('aria-label', 'Commander dossier')
         const heading = document.createElement('h2')
-        heading.textContent = 'PLAYER RECORD'
+        heading.textContent = 'COMMANDER DOSSIER'
         const xp = document.createElement('progress')
         xp.className = 'account-panel__record-xp'
-        xp.value = options.state.profile.summary.levelXp
-        xp.max = options.state.profile.summary.nextLevelXp
+        xp.value = accountSummary.levelXp
+        xp.max = accountSummary.nextLevelXp
         xp.setAttribute(
           'aria-label',
-          `Commander ${options.state.profile.displayName} Level ${options.state.profile.summary.level} XP progress`,
+          `Commander ${options.state.profile.displayName} Level ${accountSummary.level} XP progress`,
         )
         record.append(heading, disclosure, xp)
         root.append(record)
       } else {
         root.append(disclosure)
diff --git a/client/src/ui/Lobby.ts b/client/src/ui/Lobby.ts
index f406e64..6cef8ef 100644
--- a/client/src/ui/Lobby.ts
+++ b/client/src/ui/Lobby.ts
@@ -1726,11 +1726,11 @@ export class Lobby {
         color: #ffe0a0;
         border-left: 2px solid rgba(255, 188, 80, 0.70);
       }
       #lobby .account-panel__record {
         display: grid;
-        width: min(264px, calc(100vw - 36px));
+        width: min(330px, calc(100vw - 36px));
         gap: 4px;
         padding: 7px 9px 8px;
         box-sizing: border-box;
         border: 1px solid rgba(229, 161, 65, 0.46);
         border-left: 3px solid rgba(255, 188, 80, 0.72);
@@ -1741,17 +1741,45 @@ export class Lobby {
         color: rgba(255, 224, 159, 0.72);
         font: 700 8px/1 var(--font-mono);
         letter-spacing: 1.6px;
       }
       #lobby .account-panel__record .account-panel__account-trigger {
+        display: grid;
+        grid-template-columns: minmax(0, 1fr) max-content;
+        align-items: baseline;
+        column-gap: 8px;
+        row-gap: 3px;
+        width: 100%;
         max-width: 100%;
         min-height: 24px;
         padding: 0;
         text-align: left;
         border: 0;
         border-left: 0;
         background: transparent;
+        overflow: visible;
+        text-overflow: clip;
+        white-space: normal;
+      }
+      #lobby .account-panel__commander-name {
+        min-width: 0;
+        overflow-wrap: anywhere;
+        color: #ffe0a0;
+        font-weight: 700;
+      }
+      #lobby .account-panel__commander-level {
+        color: rgba(255, 224, 159, 0.78);
+        font: 700 0.78em/1 var(--font-mono);
+        letter-spacing: 0.4px;
+        white-space: nowrap;
+      }
+      #lobby .account-panel__record-milestone {
+        grid-column: 1 / -1;
+        color: rgba(216, 198, 162, 0.82);
+        font: 700 9px/1.15 var(--font-mono);
+        letter-spacing: 0.45px;
+        text-transform: uppercase;
       }
       #lobby .account-panel__record-xp {
         display: block;
         width: 100%;
         height: 5px;
@@ -1768,10 +1796,13 @@ export class Lobby {
       }
       #app.is-compact #lobby .account-panel__record .account-panel__account-trigger {
         min-height: calc(var(--st-store-buy-target) * 0.55);
         font-size: calc(var(--st-store-buy-target) * 0.19);
       }
+      #app.is-compact #lobby .account-panel__record-milestone {
+        font-size: calc(var(--st-store-buy-target) * 0.16);
+      }
       #app.is-compact #lobby .account-panel__record-xp {
         height: calc(var(--st-store-buy-target) * 0.1);
       }
       #lobby .account-panel__xp-meter { accent-color: #d79a38; }
       #app.is-compact #lobby .lobby-command-header {
@@ -2264,10 +2295,17 @@ export class Lobby {
         min-height: 0;
         height: auto;
       }
       #app.is-compact #lobby .lobby-deployment > .lobby-controls { bottom: 56px; }
       #app.is-compact #lobby .lobby-deployment__masthead { min-height: 0; }
+      #app.is-compact #lobby .lobby-deployment__masthead:has(.account-panel__record) {
+        min-height: 120px;
+      }
+      #app.is-compact #lobby .lobby-deployment:has(.account-panel__record)
+        > .lobby-preview {
+        inset-block-start: 82px;
+      }
       #app.is-compact #lobby .lobby-deployment__masthead > .account-panel,
       #app.is-compact #lobby .lobby-deployment__masthead > .account-panel--open {
         position: absolute;
         top: 0;
         right: 0;
diff --git a/e2e/account-progression-summary.spec.ts b/e2e/account-progression-summary.spec.ts
index 2fd6689..f711a6a 100644
--- a/e2e/account-progression-summary.spec.ts
+++ b/e2e/account-progression-summary.spec.ts
@@ -14,20 +14,35 @@ async function installSummaryFixture(page: Page, available: boolean, open = true
     panel.classList.toggle('account-panel--open', isOpen);
     panel.dataset['summaryFixture'] = hasSummary ? 'available' : 'unavailable';

     const trigger = document.createElement('button');
     trigger.className = 'account-panel__account-trigger';
-    trigger.textContent = hasSummary
-      ? 'Commander ABCDEFGHIJKLMNOPQRSTUVWX - Level 3'
-      : 'Commander ABCDEFGHIJKLMNOPQRSTUVWX';
+    if (hasSummary) {
+      const commander = document.createElement('span');
+      commander.className = 'account-panel__commander-name';
+      commander.textContent = 'ABCDEFGHIJKLMNOPQRSTUVWX';
+      const level = document.createElement('span');
+      level.className = 'account-panel__commander-level';
+      level.textContent = 'Level 3';
+      const milestone = document.createElement('span');
+      milestone.className = 'account-panel__record-milestone';
+      milestone.textContent = '300 XP to Level 4';
+      trigger.append(commander, level, milestone);
+      trigger.setAttribute(
+        'aria-label',
+        'Commander ABCDEFGHIJKLMNOPQRSTUVWX, Level 3, 300 XP to Level 4. Player account',
+      );
+    } else {
+      trigger.textContent = 'Commander ABCDEFGHIJKLMNOPQRSTUVWX';
+    }
     trigger.setAttribute('aria-expanded', String(isOpen));
     if (hasSummary && !isOpen) {
       const record = document.createElement('section');
       record.className = 'account-panel__record';
-      record.setAttribute('aria-label', 'Player record');
+      record.setAttribute('aria-label', 'Commander dossier');
       const heading = document.createElement('h2');
-      heading.textContent = 'PLAYER RECORD';
+      heading.textContent = 'COMMANDER DOSSIER';
       const meter = document.createElement('progress');
       meter.className = 'account-panel__record-xp';
       meter.value = 200;
       meter.max = 500;
       meter.setAttribute('aria-label', 'Commander ABCDEFGHIJKLMNOPQRSTUVWX Level 3 XP progress');
@@ -241,25 +256,49 @@ test.describe('Account progression summary compact readability', () => {
     expect(boxesOverlap(summaryBox!, xpBox!), 'summary and XP section must not overlap').toBe(false);
   });

   test('collapsed authenticated account stays clear of the vehicle spotlight', async ({ page }) => {
     await openLocalPreparation(page);
+    const preview = page.locator('.lobby-preview');
+    const masthead = page.locator('.lobby-deployment__masthead');
+    const baselinePreviewBox = await preview.boundingBox();
+    const baselineMastheadBox = await masthead.boundingBox();
+    expect(baselinePreviewBox, 'no-record preview should render').not.toBeNull();
+    expect(baselineMastheadBox, 'no-record masthead should render').not.toBeNull();
     await installSummaryFixture(page, true, false);
     const panel = page.locator('[data-summary-fixture="available"]');
     const trigger = panel.locator('.account-panel__account-trigger');
     const spotlight = page.locator('.lobby-preview__spotlight');
+    const missionBrief = page.locator('.lobby-deployment__mission-brief');
     const summary = panel.locator('.account-panel__progress');
     const xp = panel.locator('.account-panel__xp');

     await expect(trigger).toBeVisible();
     await expect(trigger).toHaveAttribute('aria-expanded', 'false');
     const record = panel.locator('.account-panel__record');
     await expect(record).toBeVisible();
-    await expect(record).toHaveAttribute('aria-label', 'Player record');
-    await expect(record.getByRole('heading', { name: 'PLAYER RECORD', exact: true })).toBeVisible();
+    await expect(record).toHaveAttribute('aria-label', 'Commander dossier');
+    await expect(record.getByRole('heading', { name: 'COMMANDER DOSSIER', exact: true })).toBeVisible();
     await expect(record.locator('progress')).toHaveAttribute('aria-label', 'Commander ABCDEFGHIJKLMNOPQRSTUVWX Level 3 XP progress');
-    const headingBox = await record.getByRole('heading', { name: 'PLAYER RECORD', exact: true }).boundingBox();
+    const commander = trigger.locator('.account-panel__commander-name');
+    const level = trigger.locator('.account-panel__commander-level');
+    const milestone = trigger.locator('.account-panel__record-milestone');
+    await expect(commander).toHaveText('ABCDEFGHIJKLMNOPQRSTUVWX');
+    await expect(level).toHaveText('Level 3');
+    await expect(milestone).toHaveText('300 XP to Level 4');
+    expect(await trigger.evaluate((node) => getComputedStyle(node).whiteSpace)).not.toBe('nowrap');
+    expect(await trigger.evaluate((node) => getComputedStyle(node).textOverflow)).not.toBe('ellipsis');
+    for (const text of [commander, level, milestone]) {
+      const textBox = await renderedTextBox(text);
+      const ownerBox = await trigger.boundingBox();
+      expect(ownerBox, 'dossier disclosure should render').not.toBeNull();
+      expect(textBox.x).toBeGreaterThanOrEqual(ownerBox!.x - 1);
+      expect(textBox.y).toBeGreaterThanOrEqual(ownerBox!.y - 1);
+      expect(textBox.x + textBox.width).toBeLessThanOrEqual(ownerBox!.x + ownerBox!.width + 1);
+      expect(textBox.y + textBox.height).toBeLessThanOrEqual(ownerBox!.y + ownerBox!.height + 1);
+    }
+    const headingBox = await record.getByRole('heading', { name: 'COMMANDER DOSSIER', exact: true }).boundingBox();
     const triggerBox = await trigger.boundingBox();
     const meterBox = await record.locator('progress').boundingBox();
     expect(headingBox, 'Player Record heading should render').not.toBeNull();
     expect(triggerBox, 'Player Record disclosure should render').not.toBeNull();
     expect(meterBox, 'Player Record meter should render').not.toBeNull();
@@ -268,15 +307,27 @@ test.describe('Account progression summary compact readability', () => {
     expect(meterBox!.height, 'Player Record meter should remain visible after stage zoom').toBeGreaterThanOrEqual(4);
     await expect(summary).toBeHidden();
     await expect(xp).toBeHidden();
     const panelBox = await panel.boundingBox();
     const spotlightBox = await spotlight.boundingBox();
+    const missionBriefBox = await missionBrief.boundingBox();
+    const reservedPreviewBox = await preview.boundingBox();
+    const reservedMastheadBox = await masthead.boundingBox();
     expect(panelBox).not.toBeNull();
     expect(spotlightBox).not.toBeNull();
+    expect(missionBriefBox).not.toBeNull();
+    expect(reservedPreviewBox, 'dossier-reserved preview should render').not.toBeNull();
+    expect(reservedMastheadBox, 'dossier-reserved masthead should render').not.toBeNull();
+    expect(reservedPreviewBox!.y).toBeGreaterThan(baselinePreviewBox!.y);
+    expect(reservedMastheadBox!.height).toBeGreaterThan(baselineMastheadBox!.height);
     expect(
       boxesOverlap(panelBox!, spotlightBox!),
-      'collapsed account trigger must not cover the vehicle spotlight',
+      `collapsed account trigger must not cover the vehicle spotlight: ${JSON.stringify({ panelBox, spotlightBox })}`,
+    ).toBe(false);
+    expect(
+      boxesOverlap(panelBox!, missionBriefBox!),
+      `collapsed account trigger must not cover the mission brief: ${JSON.stringify({ panelBox, missionBriefBox })}`,
     ).toBe(false);
   });

   test('unavailable summary remains legible and contained', async ({ page }) => {
     await installSummaryFixture(page, false);
@@ -288,10 +339,54 @@ test.describe('Account progression summary compact readability', () => {
       .toBeGreaterThanOrEqual(8);
     await expectInside(unavailable, panel);
   });
 });

+test.describe('Collapsed commander dossier front-door geometry', () => {
+  test.beforeEach(async ({ page }) => {
+    await gotoLobby(page);
+    await installSummaryFixture(page, true, false);
+  });
+
+  test('keeps the full dossier inside the masthead and clear of deployment choices', async ({ page }) => {
+    const panel = page.locator('[data-summary-fixture="available"]');
+    const masthead = page.locator('.lobby-deployment__masthead');
+    const chooser = page.locator('.lobby-deployment-chooser');
+    const trigger = panel.locator('.account-panel__account-trigger');
+    const commander = trigger.locator('.account-panel__commander-name');
+    const level = trigger.locator('.account-panel__commander-level');
+    const milestone = trigger.locator('.account-panel__record-milestone');
+
+    await expect(trigger).toHaveAttribute(
+      'aria-label',
+      'Commander ABCDEFGHIJKLMNOPQRSTUVWX, Level 3, 300 XP to Level 4. Player account',
+    );
+    expect(await trigger.evaluate((node) => getComputedStyle(node).whiteSpace)).not.toBe('nowrap');
+    expect(await trigger.evaluate((node) => getComputedStyle(node).textOverflow)).not.toBe('ellipsis');
+    await expectInside(panel, masthead);
+
+    const triggerBox = await trigger.boundingBox();
+    expect(triggerBox, 'dossier disclosure should render').not.toBeNull();
+    for (const text of [commander, level, milestone]) {
+      const textBox = await renderedTextBox(text);
+      expect(textBox.x).toBeGreaterThanOrEqual(triggerBox!.x - 1);
+      expect(textBox.y).toBeGreaterThanOrEqual(triggerBox!.y - 1);
+      expect(textBox.x + textBox.width).toBeLessThanOrEqual(triggerBox!.x + triggerBox!.width + 1);
+      expect(textBox.y + textBox.height).toBeLessThanOrEqual(triggerBox!.y + triggerBox!.height + 1);
+    }
+
+    const panelBox = await panel.boundingBox();
+    const chooserBox = await chooser.boundingBox();
+    expect(panelBox).not.toBeNull();
+    expect(chooserBox).not.toBeNull();
+    expect(
+      boxesOverlap(panelBox!, chooserBox!),
+      `commander dossier must not cover deployment choices: ${JSON.stringify({ panelBox, chooserBox })}`,
+    ).toBe(false);
+  });
+});
+
 test('opened Player Account owns the lobby stage without ghosting the deployment beneath it', async ({ page }) => {
   await gotoLobby(page);
   await openLocalPreparation(page);
   const lobby = page.locator('#lobby');
   const card = page.locator('#lobby .lobby-card');
```
