# Commander Career Milestone 2 — production closeout review package

**Date:** 2026-08-12
**Initiative:** `career.initiative.0001`
**Task:** T-09 production lifecycle closeout
**Base:** `main@0336e18beb189041d01f0754107064a821bc79b7`
**Status:** FROZEN — review the current staged four-file candidate; its SHA-256 is supplied out-of-band with the review request so the package does not create a self-referential hash

## Review mandate

Act as the required adversarial reviewer for the exact closeout candidate. Read the approved spec, milestone plan, append-only sprint log, sprint evidence, tests/evidence named below, and the complete exact diff. Report Critical, High, Medium, and Low findings separately and state every merge blocker explicitly. Treat an audit-truth overclaim as merge-blocking. Do not infer production behavior that the receipt does not show.

## Source package

- Approved spec: `.codearbiter/specs/commander-career-loop-milestone-2.md`
- Executed plan: `.codearbiter/plans/commander-career-loop-milestone-2.md`
- Append-only autonomous decision log: `.codearbiter/sprint-log.md`
- Consolidated sprint/test/rollout evidence: `.codearbiter/reports/2026-08-11-commander-career-milestone-2-sprint-evidence.md`
- Prior implementation review package: `.codearbiter/reports/2026-08-11-commander-career-milestone-2-final-review-package.md`
- This production-closeout package: `.codearbiter/reports/2026-08-12-commander-career-milestone-2-production-closeout-review-package.md`

## Exact candidate scope

The candidate contains governance evidence only. `AGENTS.md` is user-owned, untracked, and excluded. Reproduce the candidate from the repository root with:

```powershell
git diff --binary -- .codearbiter/plans/commander-career-loop-milestone-2.md .codearbiter/reports/2026-08-11-commander-career-milestone-2-sprint-evidence.md .codearbiter/sprint-log.md
Get-Content -Raw .codearbiter/reports/2026-08-12-commander-career-milestone-2-production-closeout-review-package.md
```

After staging the four intended files, the exact reviewed diff is reproduced with:

```powershell
git diff --cached --binary -- .codearbiter/plans/commander-career-loop-milestone-2.md .codearbiter/reports/2026-08-11-commander-career-milestone-2-sprint-evidence.md .codearbiter/reports/2026-08-12-commander-career-milestone-2-production-closeout-review-package.md .codearbiter/sprint-log.md
```

**Frozen staged diff SHA-256:** supplied with the adversarial review request and recomputed from the current index before verdict

## Merged implementation and hosted provenance

- PR #407 reviewed head: `dc5c5fc04a8dc291dbc08d12d74aa144ea1b46a4`
- Squash merge on main: `0336e18beb189041d01f0754107064a821bc79b7`
- Exact-main CI: run `31650838445`, success
- Exact-main CodeQL: run `31650838460`, success
- Exact-main Pages: run `31650838432`, success, including current-main provenance and live smoke
- No Supabase schema or Edge Function change belonged to PR #407.

## Production lifecycle receipt

- Fresh authenticated start: production accepted the authoritative explicit-offset timestamp and launched at `29:59`.
- Real cap completion: six human and six regenerated CPU salvos, Commander `100`, CPU `63`, `Verified victory · +200 XP`; dossier moved from `500 XP to Level 2` to `300 XP to Level 2`.
- Same-owner resume/account limit/refresh: an in-progress match at salvos `1/6` and `1/6`, health `100/67`, and `29:33` resumed after a full reload at the same salvos and health with `29:14` remaining rather than allocating a new session.
- Recovered completion/persistence: the resumed match completed at salvos `5/5`, health `67/0`, awarded `+200 XP`, and remained at `100 XP to Level 2` after another reload.
- Anonymous casual fallback: a separate unauthenticated browser showed no Commander dossier or verified claim and launched a playable `Player 1` versus `CPU 1` Quick Duel without mutating the authenticated browser.
- Expiry presentation/freeze: the untouched match showed `Five minutes remain` at `04:41`, `One minute remains` at `00:13`, then `Verification expired.` at `00:00`; retry was disabled, the modal offered `Continue casually` and `Return to Battery`, and the observed `Return to Battery` exit restored signed-in preparation with the dossier unchanged at `100 XP to Level 2` and no award. The unchosen casual-continuation path is not claimed.
- Completion retry/idempotency: the deployed user path completed twice with one POST and one award each. Exact tests prove terminal evidence retention and retry before expiry (`client/src/ui/Lobby.account.test.ts`), retry/freeze composition (`client/src/main.hotSeatProgression.test.ts`), completed same-evidence immutable receipt without replay (`supabase/functions/complete_verified_deployment/index.test.ts`), and the locked atomic stored-result/idempotency/conflict contract (`scripts/checks/verified_deployment_migration.mjs`). A forced lost-response-after-commit exercise is not claimed: it requires authenticated runtime/network interception or production infrastructure mutation, which is an explicit security/operational hard gate under the standing authorization.

## Fresh local gates

- `npm run audit:deps`: PASS, 0 vulnerabilities
- `npm run check`: PASS
- `npm run check:edge`: PASS, 352/352
- `npm run test:client`: PASS, 158 files / 1,503 tests
- `npm run coverage:client`: PASS, 92.96% statements / 84.78% branches / 89.94% functions / 95.24% lines
- `npm run build`: PASS
- `npm run test:e2e`: PASS, 293 passed / 31 skipped
- focused retry/expiry client matrix: PASS, 3 files / 82 tests
- focused completion Edge matrix: PASS, 13/13
- verified-deployment migration oracle: PASS
- state-free CodeArbiter secret scan: PASS, `[]`
- `git diff --check`: PASS

## Required reviewer questions

1. Does every checked T-09 obligation have direct production or exact deployed-code evidence, with limitations stated plainly?
2. Does the expiry receipt prove visible warning/expiry state, disabled fire controls, and one observed player exit without claiming the unchosen path?
3. Is the completion retry/idempotency disposition honest, proportionate, and sufficient without introducing a production-only fault-injection surface or crossing the authenticated-session security boundary?
4. Does the append-only sprint log preserve and explicitly supersede earlier overclaims?
5. Is `career.initiative.0001` kept active while the tactical-objective slice is selected only after T-09 acceptance?
6. Is the staged four-file diff exactly reproducible by the recorded SHA-256 and free of `AGENTS.md` or other user-owned material?
