# Hosted Verified Replay Probe - Final Review Package

## Review mandate

Act as an adversarial player-safety, security-boundary, deterministic-engine, and test-quality reviewer. Ignore implementation intent when behavior or evidence disagrees. Report every Critical, High, or other merge-blocking finding, plus lower-severity defects worth fixing. Explicitly assess whether tests would fail under realistic mutations of auth, body rejection, fixture identity, replay output, persistence, error disclosure, and rate-limit wiring.

## Required artifacts

- Spec: `.codearbiter/specs/verified-replay-hosted-probe.md`
- Plan: `.codearbiter/plans/verified-replay-hosted-probe.md`
- Sprint log substitute: `.codearbiter/reports/2026-08-10-verified-replay-hosted-probe-sprint-evidence.md`
- Governing decision: `.codearbiter/decisions/0015-stage-hosted-replay-verification-without-awards.md`
- Security boundary: `.codearbiter/security-controls.md`
- Endpoint tests: `supabase/functions/verified_replay_probe/index.test.ts`
- Shared request-wrapper tests: `supabase/functions/_shared/mod.test.ts`
- Replay ceiling tests: `supabase/functions/_shared/verifiedMatchReplay.workload.test.ts`
- Production endpoint: `supabase/functions/verified_replay_probe/index.ts`
- Production fixtures: `supabase/functions/_shared/verifiedReplayProbeFixture.ts`

## Final diff

The canonical review diff is the complete working-tree delta from exact baseline `775b795e28dd58e9c5173c79d6d156f0db014b67` in this isolated worktree. Review it with:

`git diff --no-ext-diff --find-renames 775b795e28dd58e9c5173c79d6d156f0db014b67 -- . ':(exclude)client/dist'`

Include untracked files listed by `git status --short`; they are part of the candidate even though ordinary `git diff` does not print them. Do not review or modify the unrelated primary checkout.

## Verification evidence

- `npm run check:edge`: 307 passed, 0 failed, including 52/52 shared-wrapper tests, 12/12 endpoint tests, and 7/7 workload tests.
- `npm run test:client`: 153 files, 1220 passed.
- `npm run check`: passed.
- `npm run build`: passed.
- `npm run audit:deps`: 0 vulnerabilities.
- `node scripts/checks/profile_identity.mjs`: passed.
- `git diff --check`: passed on the corrected candidate.

Mutation evidence: TypeScript AST validation binds the unique top-level exported handler to the exact zero-argument factory call, the registration default to `Deno.serve`, the startup registrar default to `registerVerifiedReplayProbe`, and the final standalone startup expression to `startVerifiedReplayProbe(import.meta.main)`, killing comment, string, dead-code, unreachable-declaration, inert-default, and short-circuit decoys. The executable registration seam asserts that the runtime receives the exact configured exported handler. Limiting recursive fixture freezing to one child fails, changing an outcome-neutral `maximumTurn` field fails the canonical whole-graph digest, and cloning any replay fixture argument fails strict reference identity. The no-body wrapper suite covers cancellation on both normal body rejection and over-limit 429 responses, including rejecting cancellation and thrown limiter-transport paths, while JSON and optional-body modes prove their legacy parse-before-limit ordering. The real production limiter enforcer is exercised with only its RPC bump injected, killing a probe-specific bypass, and the handler's exact Auth-only client capability is compile-time pinned against widening to storage or RPC access.

Governance note: the legacy `.codearbiter/sprint-log.md` is malformed and intentionally untouched. SUaDtL explicitly authorized this bounded alternate sprint evidence report on 2026-08-11, and the slice-specific `$ca-override` is recorded in the append-only `.codearbiter/overrides.log`. Reviewers must verify that disposition from the live diff.

The first review round's blockers and their corrections are recorded in the sprint evidence. This package now points at the corrected live diff; reviewers must independently verify every disposition rather than trusting that record.

## Required verdict format

For each finding: severity, merge-blocking yes/no, exact file/line, violated acceptance criterion or boundary, concrete failure mode, and smallest defensible correction. End with a coverage-strength verdict and a merge verdict. Do not edit files.
