# P06 implementation definition

This is the sole bounded plan for the authorized short-height compact-console
legibility correction.

## TDD obligation ledger

- `P06-O01` · `product-v2-p06.md` P06-AC1 · MAPPED to
  `e2e/compact-console-legibility.spec.ts` short-height text-line, content-box,
  and physical-font assertions plus `CompactConsole.runtime.test.tsx` finite
  ammo text and action coverage. The focused component test passes; the revised
  candidate's Linux browser result remains pending. Parent-owned causal RED was
  confirmed in run `ae80db` and retained measurement run `ce7697` / `aa2100`.
- `P06-O02` · `product-v2-p06.md` P06-AC2 · MAPPED to
  `e2e/compact-console-legibility.spec.ts` all-control and chassis geometry
  assertions plus the bounded CSS and metadata-child production diff; unchanged
  baseline geometry and resource URLs passed parent-owned browser revalidation.

## Tasks

| ID | Paths | Verification | Covers | Status |
| --- | --- | --- | --- | --- |
| T-01 | `e2e/compact-console-legibility.spec.ts` | Parent runs the focused `pixel-touch` test against the unchanged P03 bundle and records the label-geometry assertion failure | P06-O01, P06-O02 | RED CONFIRMED |
| T-02 | `client/src/ui/battleConsole/components/CompactConsole.module.css`, `components/CompactConsole.tsx` | After RED, add short-height label declarations and two explicit metadata rows; retain natural metadata spacing, full text containment, accessible action, and the 14 physical CSS pixel floor | P06-O01, P06-O02 | LOCAL PASS; Astra source and visual review PASS, Linux browser boundary pending |
| T-03 | `client/src/ui/battleConsole/CompactConsole.runtime.test.tsx` | Preserve finite counts `0`, `12`, and `999`, the ammo unit, cycle cue, accessible name, and `weapon-next` dispatch without claiming an inventory cap | P06-O01 | PASS: six focused tests |
| T-04 | Focused browser test, three-profile before/after captures, applicable full gates and hosted Linux rerun | Parent-owned execution and evidence | P06-O01, P06-O02 | LOCAL PASS: 340 browser tests, 1,949 client tests, build and type checks; hosted Linux pending |

Evidence is in `../reports/product-v2-p06-evidence.md`. Text-line counting
groups same-height font fallback fragments; every fragment retains its own
containment assertion. The earlier Windows pass does not clear the later Linux
fallback-font failure; that hosted boundary remains pending.

No browser, server, build, commit, PR, dependency, deployment, or production
action belongs to this author unit; only the focused component test runs here.
