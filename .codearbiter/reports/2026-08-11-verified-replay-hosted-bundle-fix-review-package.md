# Adversarial review package: verified replay hosted bundle fix

## Required inputs

- Spec: `.codearbiter/specs/verified-replay-hosted-bundle-fix.md`
- Plan: `.codearbiter/plans/verified-replay-hosted-bundle-fix.md`
- Parent sprint audit record: `.codearbiter/reports/2026-08-10-verified-replay-hosted-probe-sprint-evidence.md`
- Delivery-correction evidence: `.codearbiter/reports/2026-08-11-verified-replay-hosted-bundle-fix-evidence.md`
- Tests: fresh command results listed in the delivery-correction evidence.
- Final diff: the complete staged commit candidate from `git diff --cached`, supplied after staging every intended production, test, and governance file.

## Review mandate

Try to prove that the guard misses reachable imports, the import conversion changes runtime behavior, TypeScript or Deno compatibility is weakened, the scope is incomplete for hosted bundling, or the repair creates unnecessary churn. Report findings by severity and identify every merge blocker. Do not edit files.
