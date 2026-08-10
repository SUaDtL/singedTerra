# Sprint Evidence: Deployment Choice Front Door

**Task:** `ux.pregame.0005`
**Branch:** `codex/deployment-choice-front-door`
**Base:** `ab690c8d8d2171d13e682b081f8787e2f9d2ca7b`

## Scope and decision

The selected SMARTS option was a focused three-choice deployment front door: one dominant Quick Duel action plus equal Local Battle and Play Online alternatives. This removes setup-form interpretation from first contact while retaining every existing preparation owner, value, invite, and rejoin contract. The alternatives considered and scores are recorded in the approved spec.

No Auth, backend, Supabase, migration, persistence, engine, dependency, asset, or global scaling surface changed. Historical worktree cleanup remains deferred.

## Test-first evidence

1. Shell contract RED: the new chooser/preparation test produced seven intended failures and one passing preservation assertion against the peer-row implementation.
2. Shell GREEN: the typed `chooser | preparation` surface passed all eight focused shell tests.
3. Lobby state RED: ordinary-entry, route selection, and Back/focus tests produced three intended failures; the pre-existing invite direct-open behavior remained green.
4. Lobby state GREEN: the Lobby-owned surface field, direct invite preparation, and bounded Back focus restoration passed the focused state suite and the affected Lobby suites.
5. Production-browser RED: the first desktop, compact fine-pointer, and landscape-touch run produced five intended failures, with twelve passes and one expected skip. The missing inverse-zoom 44px target token and undersized compact Back target were causal.
6. Browser GREEN: after publishing the scoped target token and correcting the scoped chooser CSS, the focused browser matrix passed 17 tests with one expected desktop-only compact skip.
7. Visual adversary correction: a fresh screenshot exposed inverted emphasis because Local and Online inherited the gold primary treatment. Tests were tightened before the correction to require both secondary roles, equal treatment, and a background distinct from Quick Duel. The corrected matrix again passed 17 tests with one expected skip.
8. Mutation proof: temporarily removing both secondary-role classes caused exactly the hierarchy assertion to fail (one of eight focused shell tests). Reverting the mutation restored eight of eight.
9. Broad-suite contract check: the first full non-live browser run produced 179 passes, 30 skips, and stale setup-on-entry failures in older journey tests. Those tests were updated only to explicitly enter their intended Local or Online preparation route; geometry and gameplay assertions were retained.
10. Systematic compact repair: the updated routes exposed one genuine Pixel-touch regression at four Local players (`scrollHeight 604`, `clientHeight 600`). A first isolated 14px compact-frame-padding hypothesis remained RED at 602 and was reverted. The second isolated 12px value passed at 600/600 while preserving the Back target at 123.70 x 33.33 rendered pixels.
11. Adversarial review RED: Rawls blocked staged hash `90d1fcba35b0ddd47bd63d5187d5b94baae52d13` because Browse Back leaked polling, Waiting Back bypassed room leave, compact Back measured only 33px, and Rejoin remained visually subordinate. Four causal unit failures and four browser failures reproduced those defects before corrections.
12. Review corrections GREEN: Browse Back now stops polling, resets to Online create, and rejects the late response; Waiting omits generic Back so the existing Leave lifecycle remains authoritative; Rejoin becomes the sole primary action while available; compact Back uses the full inverse-zoom target. The initial full-target layout measured 607/600; placing Back beside the compact masthead restored four-player fit at 600/600 while retaining a 123.70 x 44.44px rendered target.

## Fresh verification

- `npm run test:client`: 151 files and 1,177 tests passed after review corrections.
- `npm run check`: passed, including typecheck and all deterministic engine harnesses.
- `npm run check:edge`: 267 tests passed and Deno checks passed.
- `npm run audit:deps`: zero vulnerabilities at the configured high threshold.
- `npm run build`: passed; Vite transformed 1,920 modules and emitted the production bundle.
- `npm run coverage:client`: 151 files and 1,177 tests passed; 95.50% line coverage.
- Focused production-bundle chooser matrix: 17 passed, one expected skip.
- Full non-live production-bundle browser matrix after review corrections: 252 passed, 30 expected skips, zero failures across desktop, Pixel touch, and compact fine-pointer.
- Exact-staged secret review: specialist PASS with zero sensitive added lines. The state-free whole-file scanner matched only an unchanged mock-only password placeholder; the corrected rejoin fixture contains public room identifiers and deliberately omits the separate seat credential. The content-bound H-10b pass is recorded only after the final governance reconciliation.

## Adversarial verdict

Rawls first returned BLOCK on staged hash `90d1fcba35b0ddd47bd63d5187d5b94baae52d13` with one High and two Medium merge blockers. All were reproduced and resolved test-first. Rawls re-reviewed corrected staged hash `b1f2582ab026352c9cb1d0c5f379931544eb6b68`, ran 39 focused tests, and returned PASS with no Critical, High, Medium, Low, or merge-blocking findings. The sanctioned task helper then marked `ux.pregame.0005` done; the governance-only final staged hash receives an exact recheck before commit.

The first governance-only recheck correctly blocked because the original spec still promised universal Back/state preservation. The reconciled contract now names Browse teardown/reset and authoritative Waiting Leave as accepted lifecycle exceptions; the plan separately records the completed task flip and pending delivery work.

## Governance and recovery

The malformed `.codearbiter/sprint-log.md` remains protected by H-05 and was neither read nor written. This report, the approved spec and plan, task-board entry, test output, and exact staged review package are the recovery record for this bounded sprint.

The single adversarial reviewer is Rawls (`019fed34-ebb9-7801-af9c-27f81d07c4fb`). The final review package will contain the approved spec, plan, this evidence report, tests, and exact staged diff; every Critical, High, and merge-blocking finding must be resolved before delivery.
