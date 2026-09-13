# P11 implementation plan

| Task | Paths | Automated proof | Maps to |
| --- | --- | --- | --- |
| T-01 | `client/src/ui/HUD.victoryReport.test.ts` | causal terminal facts and local eligibility RED/GREEN | AC1–AC3 |
| T-02 | `client/src/ui/TerminalMatchView.test.ts` | rendered non-focusable copy and retained Tab/focus behavior | AC2, AC4 |
| T-03 | `client/src/ui/HUD.ts`, `client/src/ui/TerminalMatchView.ts`, `client/src/main.ts` | existing projection/view/restart owners only | AC1–AC4 |
| T-04 | focused HUD/terminal/main tests, `npm run typecheck` | parent-owned browser proof after frozen review | AC1–AC4 |
| T-05 | `client/src/ui/HUD.css`, `e2e/after-action-experiment.spec.ts`, existing report/guest browser tests | Physical text floor, contained explanation/actions, natural best-of-three clinch and public replay | AC2, AC4 |

Implementation order: write the factual and exclusion regressions first; make
the smallest projection/view/config-presence change; then prove existing local
restart and network-rematch semantics remain distinct. No browser, build,
server, remote action, or full-suite execution belongs to this worktree.

Browser handoff: exercise an ordinary local multi-round clinch on desktop and
touch, assert exact copy, Tab/Shift+Tab and touch access to Replay same scenario
and Main Menu, and verify a P03 Last Light report has its existing Field Order
without P11 copy. Human understanding and voluntary replay remain pending
observation, not acceptance criteria.

Parent verification: 1,956 client tests PASS; build/type checks PASS; final
39 browser tests PASS with three existing profile skips. Coverage passed at
94.14% lines and 84.44% branches. Causal layout and stable-parent corrections
are recorded in `../reports/product-v2-p11-evidence.md`. Independent final
source and visual review precedes integration into the existing product PR.
