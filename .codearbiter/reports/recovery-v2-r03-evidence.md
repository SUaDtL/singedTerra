# R03 real-control oracle evidence

Date: 2026-09-10
Task: R03
Base: `dad0c506f3b780b4ed6eb362df89a39c1161f509`
Branch: `codex/recovery-v2-r03`
Worker: `gpt-5.6-sol` at `high` effort
Result: parent integration atop `a4f332033d69d7d0afeb28d32d5efd210ded07d0`; resulting commit is recorded by Git and the canonical ledger.

## Outcome

The production-bundled test probe was circular. `mount.tsx` selected an expectation, projected fixture state, and exposed it through `window.__battleConsoleVisualTest__`. `BattleConsoleRoot.tsx` then rendered a detached marker whose data and CSS came from that expectation. `observeRenderedAppearance` read the same marker. A precise observation could therefore coexist with a broken actual control.

The hook, marker, projector, observer, types, and `appearanceRuntime.ts` module are removed. The existing 124-record archive remains byte-for-byte unchanged. Its registry/cardinality/ownership test remains and is explicitly described as a structural contract test. It is no longer presented as rendered-product evidence.

## Acceptance obligations

| Criterion | Evidence | Status |
|---|---|---|
| AC-010 | The existing five-profile product-completion suite ran through `playwright.product-completion.config.ts`. Its geometry, interaction, focus, purchase, fallback, and progression assertions were unchanged. | COVERED |
| AC-011 | Browser tests mutate the real fuel text, Settings switch, focus owner, and Equipped button. The independent real-control assertions reject each defect, then pass again after restoration. The expectation archive is unchanged. | COVERED |
| AC-012 | The browser tests require the global hook and appearance marker to be absent while retaining real font, containment, disabled, focus, purchase, and interaction assertions. The limited 124-key structural test remains. | COVERED |

## Retained real-control coverage

`e2e/product-completion/console.spec.ts` still checks:

- console and battlefield geometry;
- Settings ordering, containment, switch interaction, persistence, dismissal, and return focus;
- Match containment and menu/title clearance;
- Armory keyboard scrolling, final-item visibility, action containment, equip, purchase, ammo, credits, and disabled state;
- compact 44-pixel touch targets;
- fuel movement and font stability;
- angle, power, fire-disabled, turn-progression, and canvas continuity behavior.

The full product-completion run also retained the existing compact-readability, settings-registration, instrument-face, dialog-registration, fallback, match-drawer, match-clearance, skin, paint, orientation, and scroll checks.

## Regression-first proof

The parent built the unmodified R03 runtime and verified the sole `127.0.0.1:5198` preview against it:

- index SHA-256: `86f462bd6c2a6cd372a83a653b8332eb4a953ed8ebc6b673281d1cfa233a0976`
- entry SHA-256: `3e70e88295a1857fb560bc55625f79b86d740a429a6d0414ff3ea323750f3f3a`
- build log: `C:/Users/brenn/AppData/Local/Temp/recovery-v2-r03-red-build.log`
- build-log SHA-256: `E366A46B70AAA1BB81978B1C278FDD9C89DAF0BE75DC8EDAF0255829DEFCAB3F`

The targeted command failed before runtime cleanup:

```text
npx playwright test -c playwright.product-completion.config.ts console.spec.ts --grep "AC-010/011/012" --project=standard --project=compact
exit 1
2 failed, 2 profile-skipped
```

Both failures were the intended assertion at `console.spec.ts:23`: expected `__battleConsoleVisualTest__ in window` to be false, received true. This established that the old runtime still exposed the synthetic oracle before removal.

After cleanup, the parent rebuilt and byte-verified the same sole preview:

- index SHA-256: `744d7c7fc7fcdbe25ac116d83ea084b1d44194a30ab65a3ce84a9c377a63e18a`
- entry SHA-256: `80db0f47c9bbc9d5c89e05358a0d2596f512cdeecd3945dbd1b45e83516fc3f2`
- build log: `C:/Users/brenn/AppData/Local/Temp/recovery-v2-r03-green-build.log`
- build-log SHA-256: `01A4EFBB7F40EF80BC9022949CB3F560BA62A59856B7F7E73547F9B15C6B45CC`

The same targeted command then exited 0 with two applicable passes and two profile skips. The complete product-completion command exited 0 with 83 passes and 27 profile-specific skips across 110 enumerated cases.

## Negative controls

| Actual control | Injected browser defect | Independent assertion |
|---|---|---|
| Compact fuel value | `font-size: 1px !important` on the rendered semantic node | Physical font size must remain at least 13.99 pixels after chassis scaling. |
| Settings Sound switch | Translate the rendered switch 200 viewport widths | Its live bounding box must remain inside the live dialog box. |
| Settings return target | Move focus from the trigger to the real game canvas | The actual Battle settings button must be focused. |
| Equipped action | Clear the real button's `disabled` property | The actual Equipped button must be disabled. |

Each control is first asserted healthy, then mutated and required to make its oracle reject, then restored and asserted healthy again. No application test hook or expectation dataset constructs the observed answer.

## Commands and gates

| Command | Result |
|---|---|
| `npm ci --ignore-scripts --no-fund` | exit 0; 178 packages; 0 vulnerabilities; lock unchanged |
| Targeted browser test before cleanup | exit 1; intended 2 failures and 2 profile skips |
| `npm -w @singedterra/client run test -- src/ui/battleConsole/pixi/dynamic-appearance.test.ts` | exit 0; 1 file, 1 test |
| `npm run typecheck` | exit 0 |
| Parent `npm run build` on cleaned source | exit 0; served-byte binding recorded above |
| Targeted browser test after cleanup | exit 0; 2 passes, 2 profile skips |
| `npx playwright test -c playwright.product-completion.config.ts` | exit 0; 83 passes, 27 profile skips |
| `npm run test:client` | exit 0; 200 files, 1,788 tests |
| `npm run coverage:client` | exit 0; 200 files, 1,788 tests |
| Source scan for removed hook/probe identifiers | no matches |
| `git diff --check` | exit 0 |

Coverage was measured on Windows. Overall client coverage was 93.89% lines and 83.44% branches, above the Stage 1 60% floor for both binding metrics. The `ui/battleConsole` subtree measured 88.55% lines and 83.67% branches.

## Integrity and limits

- `.codearbiter/contracts/battle-console/state/dynamic-appearance.json` still contains 124 expectations.
- Its SHA-256 remains `426FB13F4E0FECF37960E77A7E3BD04EB028168A5F556A03E8F7E986629D1738` and `git diff --quiet` returns 0.
- No Playwright configuration, workflow, dependency manifest, lockfile, server process, R21 source, remote state, or production state changed in this task.
- The retained registry test checks keys, cardinality, and declared ownership flags only. It does not validate every archived field or actual appearance. R09 owns later removal of raw proof archives from the production graph.
- Browser evidence uses Chromium viewport and input emulation. It is not physical-device evidence or maintainer visual acceptance.

## Parent handoff and rollback boundary

Parent verified the original worker session01a0896e-7909-71b3-8cc4-122fe4930fb8 as gpt-5.6-sol/high. The author released all six changed paths; a fresh Astra/high review remains required. All author test handles are terminal; the parent-owned sole preview PID61264/exec43293 remains live and serves the frozen GREEN artifact. The author did not own a server handle.

Rollback before delivery means reverting only the six-path R03 change to its recorded dad0c506 baseline through normal reviewed recovery work; preserve the unchanged expectation archive and unrelated dirty work. After a recovery commit, use a reviewed revert of that bounded commit if required. No dependency, database, runtime protocol or production rollback is part of this local task, and no destructive reset or cleanup has been performed.

## Fresh independent review and recovered original coverage

Reviewer `/root/r03_control_review`, session `01a089f0-104c-7213-8378-409cb1f98e15`, was verified as `gpt-6-astra/high`. Coverage-auditor and architecture-drift were the two matched units; both completed with zero findings. Separate finding-triage and verdict-aggregator phases returned PASS with zero blocking, deferrable, informational, or incomplete findings. AC-010 through AC-012 are covered within the bounded task.

The reviewer independently passed the actual-control browser tests (2 passes, 2 profile skips, exec 27539 terminal exit 0), the registry test (1 pass), and mount/root runtime tests (18 passes across 2 files). It independently verified the unchanged archive and the served GREEN index/entry bytes. The full author product matrix and initial RED remain author/parent execution evidence, not reviewer reruns.

Parent and reviewer independently inspected the original coverage tool output in author session `01a0896e-7909-71b3-8cc4-122fe4930fb8`: command `npm run coverage:client`, exec 97793, terminal chunk 727d22, exit 0. The original report measures lines 93.89% (8085/8611), branches 83.44% (4753/5696), Root TSX lines 95.58%/branches 86.46%, and mount TSX lines 87.32%/branches 86.27%. The reviewer's initial configuration-only inference that TSX was excluded was incorrect and explicitly withdrawn after inspecting that output.

Recovered original output, without a rerun: `C:/Users/brenn/AppData/Local/Temp/recovery-v2-r03-original-coverage-output.log`, SHA-256 `2DE4549B4DE6FD6C7F2CB82B9578A59DC874790BA2013090FA463F3EC86009ED`. The source tool call is `call_oLQ9O0vDltIYLHc7hkqjoH6j` at `2026-09-10T06:05:16.185Z`; its predecessor confirms 200 files and 1,788 tests passed.

## Parent integration verification

Parent verified all five tracked paths still matched their baseline Git blobs before copying, copied the five surviving files including this receipt byte-for-byte, and removed only the reviewed obsolete module. The original task worktree and its built artifact remain preserved. After all author and reviewer browser jobs ended, parent stopped the verified old preview PID 61264 and started the sole integration preview at `127.0.0.1:5198`, PID 21264, exec 29055. The complete integrated product-completion run passed against that frozen build: 83 passes, 27 profile-specific skips, exec 86514 terminal exit 0. It exercises wide, standard, narrow, ultrawide, and compact profiles, including all four corruption/rejection/restoration checks.

The integrated build/typecheck and configured secrets scan exited 0 (scanner returned `[]`). Integrated coverage exec 37266 exited 0 with 200 files/1,816 tests, lines 93.85% (8165/8700), and branches 83.56% (4837/5788). Full integrated `npm run check`, exec 80789, exited 0. All verification jobs are terminal; only the parent preview remains live. Logs are `C:/Users/brenn/AppData/Local/Temp/recovery-v2-r03-integrated-{coverage,check,build,product}.log`. Source and browser gates cover the changed UI; the immediately preceding R06 Edge/database results remain historical evidence for unchanged backend surfaces, not newly rerun R03 checks.

Served integration index SHA-256 is `F55585CE1098A9F1CB21E6BE0C3662B3ADA2779F93C4B16B444DF6EDAD51E7C5`; entry `assets/index-CO-OoFsH.js` is `66C1BFEE9A2DF4959B668D3302AB497ECFD02D7C1B8D6C4D09C856E1883474DC`. Parent compared HTTP bytes to disk for index, entry, Tank chunk, and CSS. No hosted, physical-device, or maintainer visual acceptance is inferred.
