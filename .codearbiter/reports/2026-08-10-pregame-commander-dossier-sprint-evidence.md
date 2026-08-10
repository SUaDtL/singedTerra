# ux.pregame.0006 sprint evidence

## Scope

Turn the collapsed authenticated masthead record into a responsive commander dossier that keeps the full persistent identity, current level, and exact next XP milestone visible before any deployment route. Preserve the existing Player Account dialog and all Auth, progression, setup, and gameplay behavior.

## SMARTS

The live production comparison favored a structured dossier over a wider single-line card or smaller type. Securable and backend boundaries remain unchanged. Maintainable and Testable favor semantic sub-elements plus causal DOM/geometry tests. Reliable improves because maximum-length identity is no longer hidden. Available and Scalable are neutral. Verdict: strong; confidence high; intent conforms to ADR-0011 and the standing continuous-improvement goal.

The broader adversarial-player audit is fully discharged. This slice is the next bounded cell under `ux.pregame.0001`, selected from a live 1024 by 576 production capture where the authenticated identity rendered as `Commander SUaDtL - L...`.

## Test-first evidence

- Baseline component: `AccountPanelView.test.ts` passed 13 of 13.
- The first browser attempt reused an unrelated service on the repository's default port 4173 and produced no `#lobby`; it was rejected as invalid evidence and that process was not touched.
- Isolated baseline on slice-owned port 4178 passed the six compact summary/record geometry cases relevant to this change. Three account-overlay cases could not initialize against the no-env build and remain protected by the complete hosted matrix.
- Component RED: 1 of 13 failed because the collapsed surface still exposed `Player record` and no structured dossier fields.
- Browser RED: Pixel touch and small-window failed because computed `white-space` remained `nowrap`; desktop was correctly skipped by the compact-only oracle.
- Initial GREEN exposed a genuine Pixel-touch collision: dossier bottom `69.078125` overlapped Vehicle Bay spotlight top `68.375`.
- The compact preview boundary now starts at logical 82px, producing deliberate separation without changing global stage scaling.
- Focused GREEN: component 13 of 13; browser Pixel touch and small-window passed with desktop intentionally skipped.

## Mutation evidence

- Removing the milestone append failed exactly on missing `300 XP to Level 4` and returned GREEN after restoration.
- Restoring `white-space: nowrap` failed the compact browser oracle and returned GREEN after restoration.
- Removing the level append failed exactly on missing `Level 3` and returned GREEN after restoration.
- Restoring `text-overflow: ellipsis` failed the all-project front-door oracle and was restored to `clip`.
- Removing `triggerOnly` from the collapsed-dossier branch failed the production component test because the masthead no longer received a dossier while its dialog was open.
- Broadening the compact masthead reservation to no-record routes failed because the before/after masthead heights became equal.
- Broadening the compact preview offset to no-record routes failed because the before/after preview positions became equal.

## Current implementation

- `AccountPanelView` emits independent commander-name, level, and exact remaining-XP milestone elements inside the existing disclosure.
- The progress meter retains the original value, max, and commander/level accessible name.
- The collapsed record is now labeled `Commander dossier` with the visible kicker `COMMANDER DOSSIER`.
- Lobby CSS uses a wrap-capable two-column identity row, a full-width milestone row, and no ellipsis.
- No dependency, Supabase, migration, auth/session, persistence, progression-rule, gameplay, or protocol change exists.

## Adversarial review corrections

The first designated review returned BLOCK with one High merge blocker, two Medium findings, and one Low finding:

- High: desktop and front-door geometry were not covered. A new all-project front-door oracle now proves the maximum-length dossier is inside the masthead, every text range is inside the disclosure, and the card is clear of the deployment chooser.
- Medium: the compact preview offset applied to every route. The default 70px boundary is restored; only a deployment containing an authenticated `.account-panel__record` receives the 82px preview start.
- Medium: level-removal and ellipsis mutation receipts were absent. Both now fail causally and are recorded above.
- Low: the disclosure's complete accessible label was unguarded. Component and browser tests now assert the exact commander, level, milestone, and Player Account label.

The new front-door test failed first on both compact projects because the absolute dossier extended beyond its masthead owner. An authenticated-dossier-only 120px compact masthead reservation corrected containment. Desktop-fine, Pixel touch, and small-window now pass the front-door geometry case; the selected-route geometry case continues to pass both compact projects and intentionally skips desktop.

Corrected-package adversarial re-review returned PASS with zero Critical, High, Medium, Low, or merge-blocking findings.

The coverage audit returned PASS with no merge blocker and two Medium proof gaps. Both were closed: the real `open: true, triggerOnly: true` composition now has component coverage, and the compact browser test now measures no-record geometry before injecting the dossier and requires both reserved dimensions to increase afterward. Independent mutations of each `:has(.account-panel__record)` selector and of the `triggerOnly` branch failed causally as recorded above. Coverage re-audit confirmed both corrections and returned final PASS with no new blocker.

## Full matrix

- `npm run check`: PASS.
- `npm run test:client`: 151 files and 1,178 tests PASS.
- `npm run check:edge`: 267 tests PASS.
- `npm run coverage:client`: 93.55% statements, 84.11% branches, 87.99% functions, and 95.51% lines; `AccountPanelView.ts` is 100% lines and 95.65% branches.
- Production build: PASS.
- Complete Playwright matrix on an isolated temporary port: 255 passed and 30 intentional project-conditional skips. The temporary port substitution was restored; `playwright.config.ts` is unchanged from the branch base.

The exact final local rerun is green. Pending final adversarial review, commit gate, PR CI, merge, deployment, and production proof.

## Process note

The malformed legacy `.codearbiter/sprint-log.md` was neither read nor rewritten. This report and the spec persist the SMARTS, RED/GREEN, mutation, and review record for recovery.
