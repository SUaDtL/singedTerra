# R25 power-cap correction evidence

## Scope and baseline

- Worktree: `C:/Users/brenn/projects/singedTerra-worktrees/recovery-v2-r25`
- Branch: `codex/recovery-v2-r25`
- Baseline: `3902cad662aea03cec913d984d17aa9573b89bd0`
- Production change is limited to forwarding the engine-owned active tank power cap through `InputHandler`, `main`, `HUD`, and the existing battle-console projection/renderers. No shared-engine rule, tuning value, framework, dependency, or coordinator changed.
- `npm ci` completed with exit 0, added 178 packages from the unchanged lockfile, and reported 0 vulnerabilities. The reported esbuild install script remained unapproved and was not enabled.

## Meaningful RED

The first usable run before dependencies were installed failed because `vitest` was unavailable; it was environment setup and is not claimed as defect reproduction.

After `npm ci`, this focused command reproduced seven product failures with exit 1:

```text
npm -w @singedterra/client run test -- src/input/InputHandler.test.ts src/ui/HUD.battleConsoleIntegration.test.ts src/ui/battleConsole/visual-state-contract.test.ts src/ui/battleConsole/CompactConsole.runtime.test.tsx src/ui/battleConsole/pixi/live-instruments.test.ts
```

Observed failures showed that keyboard and touch steps remained capped at 100, a legal selected power of 140 was lost, HUD omitted the live cap, projection equality/key coverage omitted the cap, CompactConsole announced only `Power`, and Pixi normalized 100 against a fixed 100 instead of the active 200 cap.

The composition and semantic command then failed three targeted assertions with exit 1 while 50 tests passed:

```text
npm -w @singedterra/client run test -- src/main.hotSeatProgression.test.ts src/ui/battleConsole/semantic-parity.test.tsx
```

`main` never called the input cap seam for casual or verified play, and the semantic power output announced `Power` instead of `Power 150 of 200`.

The normal-entry browser journey later exposed a second source regression after the cap/purchase/pointer assertions were already green: closing Armory restored focus to its button, and a real pointer gesture on the non-focusable battlefield left that stale focus in place, so ArrowDown was dropped. The focused regression command failed with exit 1 (35 passed, 1 failed), observing the retained button instead of the gameplay target:

```text
npm -w @singedterra/client run test -- src/input/InputHandler.test.ts
```

A fresh Astra/high review then found a same-seat next-round synchronization defect. The engine reset the retained opener to power 50 while preserving cap 200, but `main` only re-seeded input aim when the active player ID changed. A production-composition regression used the actual `InputHandler` through the existing `main` wiring, while the mocked client changed round and tank values when it received `next_round`. It does not execute `GameEngine` or reproduce the engine's exact staging point; it isolates the state-snapshot-to-input synchronization defect. Before the fix, its first decrement expected 49 but received 149 (focused command exit 1: 51 passed, 1 failed):

```text
npm -w @singedterra/client run test -- src/main.hotSeatProgression.test.ts
```

## Implemented behavior

- `InputHandler` tracks a live power cap initialized from the active tank, uses it for keyboard steps, on-screen step calls, direct pointer scaling, absolute pointer clamping, and aim reseeding, and clamps only when a lower seat cap makes the prior selection illegal.
- `main` refreshes the effective cap on construction, every live state frame, synchronous hot-seat purchase, and next-round transition. A verified deployment bounds that value by its descriptor maximum, which remains 100.
- `main` also keys aim re-seeding on round identity as well as active-player identity. When a new round retains the same opening seat, the real `InputHandler` now mirrors the engine's reset power before accepting the first human adjustment.
- An accepted battlefield pointer gesture makes the gameplay target programmatically focusable outside the Tab order and focuses it. This restores keyboard aim after an Armory/settings button returned focus without broadly hijacking arrows from text fields, selects, links, dialogs, or the dedicated Fire control.
- HUD live projection includes the engine-owned tank cap. Compact and semantic outputs announce the current value against that cap, and the inert Pixi instrument normalizes its needle/arc against the same cap.
- Projection copying, equality, and the explicit live contract key include `ballistics.powerCap`; historical fixtures without the additive field retain the baseline 100 fallback.

## Green verification

Final focused regression set, exit 0: 7 files, 116 tests passed.

```text
npm -w @singedterra/client run test -- src/input/InputHandler.test.ts src/ui/HUD.battleConsoleIntegration.test.ts src/ui/battleConsole/visual-state-contract.test.ts src/ui/battleConsole/CompactConsole.runtime.test.tsx src/ui/battleConsole/semantic-parity.test.tsx src/ui/battleConsole/pixi/live-instruments.test.ts src/main.hotSeatProgression.test.ts
```

After the fresh-review correction, its focused composition suite exited 0 with 52 tests passed. The mocked client fixture retained the same active player, advanced its state from round 1 to round 2, changed tank power from 150 to 50 while retaining cap 200, and observed the actual `InputHandler` emit `{ type: 'set_power', power: 49 }` for the first on-screen decrement:

```text
npm -w @singedterra/client run test -- src/main.hotSeatProgression.test.ts
```

Final full client suite, exit 0: 200 files, 1,786 tests passed.

```text
npm -w @singedterra/client test
```

Final typecheck and production build, exit 0:

```text
npm run build
```

This ran shared and client `tsc --noEmit`, then transformed 2,739 Vite modules. The ordinary existing large-chunk advisory remained non-blocking.

The full deterministic gate ran before the final pointer-focus-only correction and exited 0:

```text
npm run check
```

Its Battery harness directly confirmed baseline cap 100, a $5,000 Battery raising the cap to 200, acceptance and additional range at power 150, next-round carry, replay behavior, arms-level rejection, and authoritative clamping. The final pointer-focus correction does not modify shared engine code; its post-correction coverage is the final focused/full-client/typecheck/build set above.

## Real browser proof

The parent held the sole localhost listener and verified that `http://127.0.0.1:5198/` was served by PID 11048 from this worktree. After the fresh-review correction, the served entry and all three entry assets matched `client/dist` byte-for-byte, including `index-CPVm8CbJ.js`; served `index.html` SHA-256 was `7f58b11ff323a6ecaac69b073f5b09b87f38958c75bc44dcb08dfa4284c15d47`.

Exact final browser command, exit 0 (1 passed in 2.4 seconds; test body 2.1 seconds):

```powershell
$env:E2E_LIVE_URL = 'http://127.0.0.1:5198/'
npx playwright test e2e/power-cap-controls.spec.ts --project=desktop-fine
```

The final test used only visible product entry and gameplay controls: splash dismissal, `Local Battle`, `Deploy local battle`, visible First Salvo controls when present, Armory, Battery purchase, Close Armory, battlefield pointer, ArrowDown, on-screen Increase power, and Fire. It did not use `?e2e=hotseat`, a fixture probe, local-storage seeding, or programmatic gameplay-state mutation.

Observed causal journey:

1. Baseline output announced `Power 50 of 100`.
2. The visible Battery purchase debited credits from `$8,000` to `$3,000`.
3. Closing Armory immediately announced `Power 50 of 200`.
4. A real battlefield pointer gesture reached `Power 200 of 200` and restored gameplay focus.
5. ArrowDown produced `Power 198 of 200`.
6. Two visible +1 power-control clicks produced `Power 199 of 200` and then `Power 200 of 200`.
7. Fire moved the live console into `firing` or `resolving`, proving the over-100 solution was submitted through the normal human path.
8. The real handoff displayed `Player 2` and returned the active output to `Power 50 of 100`.

Browser setup/oracle corrections are retained rather than hidden:

- First run timed out on a transient Skip node during lifecycle setup. The test was corrected to wait for `data-battle-console-ready=true` and a visible Power output before using the visible Skip control.
- Second run expected `1 owned`; that was an invalid purchase oracle because the existing Battery engine path changes credits and power cap without incrementing `accessories.battery`. The test now observes the real credit debit and cap. The generic accessory-owned display remains a separate observation and was not changed for R25.
- Third run exposed the retained-focus ArrowDown source defect described above and led to the bounded pointer-focus regression/fix.
- The next run correctly produced 199 after one on-screen +1 step; the test expectation was corrected to observe 199 and use a second visible click to reach 200.

## Proof boundaries

- The browser proof covers one normal two-human local battle in Chromium at the `desktop-fine` project. Responsive rendering remains covered by the existing suite, but this exact causal purchase/fire journey was not repeated in mobile Chromium or a live network room.
- The browser proves visible credit debit, live cap/readout agreement, real pointer/keyboard/on-screen control behavior, accepted shot phase, and upgraded-to-baseline seat handoff. It does not inspect or mutate internal `GameState`.
- Next-round cap carry is proven by the shared deterministic Battery harness and by `main` composition regressions that drive the existing `onNextRound` callback through a mocked synchronous client. The same-seat regression observes the real `InputHandler` state through its emitted power action, but does not execute `GameEngine` or reproduce its exact round-over staging; it is not claimed as a second natural multi-round browser playthrough.
- Verified maximum 100 is proven by the immutable descriptor boundary, existing verified engine gates, and the `main` composition regression that supplies a tank cap of 200 but observes an effective input cap of 100. This browser journey is casual local play and is not claimed as live verified-deployment proof.


## Parent integration evidence

Integrated with accepted R24 atop df9d9958e88becd1a2bef51c4eb1ced2f49a91c3. The test-helper merge preserves the effective-gravity argument and adds the optional purchase-action callback as a third argument. Fresh final Astra/high review, triage and aggregate passed AC079 through AC082 with zero findings. Parent combined client coverage passed 200 files / 1789 tests, lines93.20% (8123/8715), branches81.67% (4791/5866); build/typecheck and full deterministic check exited0. Parent then ran the normal visible Battery purchase/fire journey on the combined build: 1/1 passed, exit0. Preview PID35612, session71382, port5198 serves the integration client/dist, verified index SHA25686f462bd6c2a6cd372a83a653b8332eb4a953ed8ebc6b673281d1cfa233a0976 plus all entryasset bytes. Logs are ../recovery-v2-r25-integrated-coverage.log, ../recovery-v2-r25-integrated-build.log, ../recovery-v2-r25-integrated-browser.log and ../recovery-v2-r13-r25-integrated-check.log relative to the worktree root. These local checks do not establish mobile hardware, live network or live verified-deployment proof.
