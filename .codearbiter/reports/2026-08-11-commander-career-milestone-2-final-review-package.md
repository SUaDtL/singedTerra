# Commander Career Milestone 2 — T-09 Production-Start Correction Review Package

**Review target:** complete uncommitted diff on `codex/verified-deployment-timestamp` against `main@e1ef4be452c`

## Required context

- Initiative spec: `.codearbiter/specs/commander-career-loop-milestone-2.md`
- Initiative plan: `.codearbiter/plans/commander-career-loop-milestone-2.md`
- Standing sprint log: `.codearbiter/sprint-log.md`
- Milestone sprint evidence: `.codearbiter/reports/2026-08-11-commander-career-milestone-2-sprint-evidence.md`
- Tests: `client/src/client/verifiedDeployment.test.ts`, `client/src/ui/Lobby.account.test.ts`, and `scripts/checks/verified_deployment_migration.mjs`
- Production code: `client/src/client/verifiedDeployment.ts`
- Final tracked diff: `git diff -- . ':(exclude)AGENTS.md'`
- Final untracked package (content plus identity): `Get-Content -Raw .codearbiter/reports/2026-08-11-commander-career-milestone-2-final-review-package.md; Get-FileHash -Algorithm SHA256 .codearbiter/reports/2026-08-11-commander-career-milestone-2-final-review-package.md`

## Incident and expected behavior

Authenticated production start returned HTTP 200 from `start_verified_deployment`, but the client displayed `Verified deployment is unavailable. Try again.` The client must accept a valid PostgreSQL/Supabase UTC-offset `timestamptz`, canonicalize it to one UTC ISO representation, preserve strict response keys/versions/config, and proceed through the existing lifecycle.

## Test-first evidence

- RED: one new parser test failed because `2026-08-12T13:30:00+00:00` produced `undefined`; 24 sibling contract tests passed.
- GREEN before adversarial correction: focused parser 25/25; combined parser/Lobby 78/78; full client 1,487/1,487.
- Adversarial correction RED/GREEN: eight hostile non-contract timestamps failed against unrestricted parsing; closed PostgreSQL/RFC3339 grammar then passed focused parser 35/35, including valid zero/nonzero offsets and microseconds.
- Full gates: Edge 352/352; aggregate deterministic/static check PASS; build PASS; audit 0 vulnerabilities; migration oracle PASS; diff-check PASS.

## Review obligations

Adversarially inspect the complete diff for contract widening, timestamp ambiguity, invalid-date exceptions, expiry/storage equality regressions, time-fixture leakage, cross-platform oracle weakening, security/privacy exposure, and test-oracle gaps. Classify every finding by severity and state whether it blocks merge. Critical, High, and any merge-blocking finding must be resolved and the exact corrected diff re-reviewed.
