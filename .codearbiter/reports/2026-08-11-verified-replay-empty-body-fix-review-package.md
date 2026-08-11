# Adversarial review package: verified replay empty transport body fix

## Inputs

- Spec: `.codearbiter/specs/verified-replay-empty-body-fix.md`
- Plan: `.codearbiter/plans/verified-replay-empty-body-fix.md`
- Parent sprint record: `.codearbiter/reports/2026-08-10-verified-replay-hosted-probe-sprint-evidence.md`
- Delivery evidence: `.codearbiter/reports/2026-08-11-verified-replay-empty-body-fix-evidence.md`
- Tests: focused RED/GREEN plus the fresh full matrix recorded in delivery evidence.
- Final diff: exact staged commit candidate from `git diff --cached`.

## Mandate

Try to prove the wrapper accepts hidden bytes, can hang or over-read, weakens rate limiting, leaks body/error content, changes other body modes, or fails to model the hosted request. Report findings by severity and mark every merge blocker. Do not edit files.
