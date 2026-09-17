# Ash Road final campaign review

Status: BLOCKED by the sole permitted ASTRA review; every reported code finding is corrected and machine-verified, but no second ASTRA review will be run.

## Review boundary

- Reviewer: `gpt-6-astra`, used once for the final campaign review only.
- Reviewed: commit `af647fd79f8124d9dd21e25a2cba7689299edcd8` plus the then-current corrective working tree.
- PR: draft #514.
- Deployment, release, and merge were outside the review and remain unperformed.

## Blocking findings and corrective evidence

1. A stale lobby resume could adopt the newest CAS revision while replaying an older cached payload. The lobby now binds payload and revision, acquisition rejects any changed record, save failures are visible, and read-only ownership cannot cross retry/continue. `main.campaign.test.ts` covers stale resume and conflict followed by transition.
2. The live replay journal could exceed its canonical 256-command bound after authoritative mutation. `CampaignClient` now admits the complete atomic journal expansion before engine mutation and ends overflow as a deterministic rewardless `replay-limit` technical failure. Exact-capacity and overflow tests pass.
3. Campaign elimination could clear remaining fire or projectiles before causal settlement. The ordinary immediate game-over branch is unchanged; campaign verdicts now wait for physical settlement. `campaign_settlement.mjs` proves a dead defender with live fire remains in `FIRING` until the fire drains.
4. Napalm burn damage lacked campaign source attribution. The engine now retains the igniting weapon identity across clones and records every burn/shield component under the active root. The settlement harness reconciles component sums to actual hull loss.

Fresh post-correction evidence includes the complete deterministic gate, 248 client files / 2,316 tests, 476 Edge tests, production build, backend release 46/46, ST1 32-source compatibility, focused settlement/storage/journal regressions, all 17 applicable browser cases across three projects, exact-bound performance evidence, and a deployment-manifest security review PASS. T-42 returned to ACCEPTED on machine evidence; T-43 remains an honest record of the sole review verdict rather than pretending an unperformed ASTRA rereview passed.

## Non-blocking review backlog

The review also identified checkpoint focus containment, unavailable-weapon cycling, semantic objective/warning detail, and emergency-hull public-flow integration as MEDIUM work. Those are implemented with unit, lifecycle, and cross-layout browser coverage. Evidence wording continues to distinguish machine checks from named-browser cold/warm timing, physical-device, listening-room, integrated-art, and owner acceptance.
