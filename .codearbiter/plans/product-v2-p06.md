# P06 implementation definition

This is the sole bounded plan for the authorized short-height compact-console
legibility correction.

## TDD obligation ledger

- `P06-O01` · `product-v2-p06.md` P06-AC1 · COVERED by
  `e2e/compact-console-legibility.spec.ts` short-height text-line, content-box,
  and physical-font assertions; parent-owned causal RED confirmed in run
  `ae80db` and retained measurement run `ce7697` / `aa2100`.
- `P06-O02` · `product-v2-p06.md` P06-AC2 · COVERED by
  `e2e/compact-console-legibility.spec.ts` all-control and chassis geometry
  assertions plus the one-file production boundary; unchanged baseline geometry
  and resource URLs retained by the parent.

## Tasks

| ID | Paths | Verification | Covers | Status |
| --- | --- | --- | --- | --- |
| T-01 | `e2e/compact-console-legibility.spec.ts` | Parent runs the focused `pixel-touch` test against the unchanged P03 bundle and records the label-geometry assertion failure | P06-O01, P06-O02 | RED CONFIRMED |
| T-02 | `client/src/ui/battleConsole/components/CompactConsole.module.css` | After RED, add only short-height label declarations; retain full text containment and the 14 physical CSS pixel floor | P06-O01, P06-O02 | GREEN; longer-name containment regression also corrected |
| T-03 | Focused browser test, three-profile before/after captures, applicable full gates and independent Astra/high review | Parent-owned execution and evidence | P06-O01, P06-O02 | PASS: 1938 client, 40 three-profile browser, 33 five-profile compatibility checks; independent Astra/high PASS |

Final evidence is in `../reports/product-v2-p06-evidence.md`. Text-line counting
groups same-height font fallback fragments; every fragment retains its own
containment assertion. No acceptance requirement was relaxed.

No build, browser, server, commit, PR, dependency, deployment, or production
action belongs to this author unit.
