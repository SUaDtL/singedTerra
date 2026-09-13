# P13 implementation sequence

This is the implementation definition for [P13](../specs/product-v2-p13.md),
not another status board. The parent updates the sole execution ledger in
`evidence-recovery-v2/.codearbiter/plans/evidence-recovery-v2.md`.

| Step | Owned paths | Dependency | Verification and criterion |
| --- | --- | --- | --- |
| P13.1 contract regressions | `scripts/checks/balance_pacing.mjs`, runner test seam in `scripts/balance/p13BalanceCorpus.ts` | None | Known small action/state sequences fail on incorrect aggregation; missing provenance/mechanism and malformed tuning records fail for their specified reason. AC1/AC3/AC4. |
| P13.2 metrics and validation | `scripts/balance/p13BalanceCorpus.ts` | P13.1 causal RED | Direct `npx --no-install tsx scripts/checks/balance_pacing.mjs` passes known-outcome and negative cases. AC1/AC3/AC4. |
| P13.3 corpus and report | `scripts/balance/p13BalanceCorpus.ts`, `docs/balance/p13-v1.json`, `docs/balance/p13-v1.html` | P13.2 | Existing engine executes all named scenarios within diagnostic limits; report discloses caps, scripted openings and bot-evidence limits. AC1/AC2/AC3. |
| P13.4 repeat and inspect | Same corpus/report paths | P13.3 | Repeat versioned corpus and compare deterministic bytes; inspect report and trace outliers; validate empty baseline tuning list. AC1/AC2/AC3/AC4. |
| P13.5 integration review | Source/report paths above and this spec/plan | P13.4 | Existing `npm run check`, `npm run test:client`, `npm run build` as applicable; fresh Sol/high review against all four original JSON criteria. |

The complete baseline is the useful slice. No optional engine or UI refactor is
bundled. No acceptance criterion is omitted: AC1 maps to reproducibility; AC2 to
report limits; AC3 to meaningful metrics and inspectable trace; AC4 to validated
tuning proposals. Current source hashes and actual command results belong in the
completion receipt. If deterministic equality passes while an intended mechanism
never executes, AC3 remains incomplete until that gap is explicit and resolved.
