# R10 CI readiness correction evidence

## Scope and identity

- Worktree: `C:/Users/brenn/projects/singedTerra-worktrees/evidence-recovery-v2-activation`
- Branch: `codex/evidence-recovery-v2-activation`
- Base SHA: `dd00727b7b6c59b70fef75c27d1e1e439da4c791`
- Draft PR: `#476`
- Worker selection: `gpt-5.6-sol/high`, session `01a097e3-f2f4-7050-8ff5-6cb92323d6ce`, reported by the worker and independently verified by the parent at dispatch `c46a14`.
- Writer lease: `e2e/product-completion/dialog-registration.spec.ts` and this evidence report only. No runtime source, dependency, lockfile, index, stage, commit, ledger, marker, remote, production, localhost, or Docker state was changed.

## CI symptom and artifacts

GitHub Actions run `34723989364`, attempt 1, failed only the product-completion AC01 dialog test in the `standard` and `narrow` profiles. The run otherwise reported product `81 passed / 27 skipped / 2 failed`, general browser `329 passed / 19 skipped`, core `1,906` client tests, full engine, real Postgres, build, `393` Edge tests, and CodeQL passing. These are inputs from the run; this correction does not claim a later exact-head CI result.

The retained failure artifacts are under `C:/Users/brenn/AppData/Local/Temp/recovery-v2-pr476-failure-artifacts/test-results/product-completion/`:

| Profile | Artifact | SHA-256 |
|---|---|---|
| standard | `dialog-registration-AC01-d-c28d4-ander-and-Pixi-registration-standard/trace.zip` | `afb18a7d310e22b66293b5184e58d7971fe8b52f9401953bc18a3c7c233b27c0` |
| standard | `dialog-registration-AC01-d-c28d4-ander-and-Pixi-registration-standard/error-context.md` | `64b01bbb6e499af0637fbc63ec9e48c6cf0da925bf86ba5fd18d974fb07e4825` |
| standard | `dialog-registration-AC01-d-c28d4-ander-and-Pixi-registration-standard/test-failed-1.png` | `99dde5712099bb8fc0eece0722556b07793349d6228e73680b59b4714c6f4d12` |
| narrow | `dialog-registration-AC01-d-c28d4-ander-and-Pixi-registration-narrow/trace.zip` | `35276e962b802458b217d97b49911abf1d59a7afd45f28c1e902f81a107c6cba` |
| narrow | `dialog-registration-AC01-d-c28d4-ander-and-Pixi-registration-narrow/error-context.md` | `405b7cb4916965535c13a1e64098692da0e9bbc0d18c8cf05cb2c6a3e4643c3c` |
| narrow | `dialog-registration-AC01-d-c28d4-ander-and-Pixi-registration-narrow/test-failed-1.png` | `ff3ae7b29e89810a08c7a60387195c0838b50ccae55e7581ff93d1d3764eb648` |

Both CI traces show the same state immediately before the failing geometry evaluation:

```text
data-battle-console-ready="true"
data-battle-console-textures-ready="false"
data-battle-console-pending-resources="1"
```

The semantic commander node was present, the Pixi host had no `canvas`, and the failing query was exactly `[data-battle-console-host="pixi"] canvas`. The splash had accepted the click but still carried `st-splash--out` during the admission read. The CI network trace subsequently records HTTP 200 for the lazy `mount` module and all six required Pixi texture URLs.

## Diagnosis

The `ca-debug` evidence ledger considered four distinct hypotheses:

1. **H1 — readiness mismatch: CONFIRMED.** `client/src/ui/battleConsole/mount.tsx` deliberately renders the Preact semantic owner and publishes `data-battle-console-ready="true"` before starting optional Pixi decoration. It separately publishes texture readiness and pending-resource state. `client/src/ui/battleConsole/pixi/adapter.ts` waits for all six mode texture URLs and only then appends `app.canvas` to the Pixi host. The CI trace caught the valid interval between those operations.
2. **H2 — permanent Pixi fallback or environment failure: REFUTED for this failure.** The same five-profile test passed on ultrawide, wide, and compact in the same CI product run, while standard and narrow failed during pending decoration. All relevant lazy module and texture responses in both failure traces were HTTP 200. A later fallback remains a valid runtime state, but it was not the observed failure state.
3. **H3 — stale selector or changed DOM placement: REFUTED.** The current adapter still assigns the battle-console canvas and appends it under the Pixi host, and the identical selector passed in the other three CI profiles.
4. **H4 — stale or wrong local artifact: REFUTED.** Before dispatch, the parent independently verified the sole preview PID and all 60 served file digests against the activation build at the required base. The local run used that existing preview exclusively.

Root cause: the geometry test treated semantic readiness as visual-decoration readiness. That assumption contradicts the runtime contract that keeps semantic controls prompt while Pixi loads lazily. The missing element was the not-yet-published Pixi `canvas`; it was pending, not evidence of fallback. Splash removal is a separate visual admission condition and is now awaited before geometry, without coupling semantic readiness to Pixi.

`ca-debug` exited through confirmed-bug route (a) into `ca-fix` with this regression obligation: hold a real required Pixi texture request, prove semantic readiness while texture decoration is pending and the canvas is absent, then require completed visual registration before measuring geometry.

## Causal RED

The regression routes and holds the real required wide-mode texture request at `/art/battle-console-integrated/canonical-pixi-layer.png`. Because the adapter loads all six mode textures as one set, holding this response keeps the real visual registration incomplete without replacing the production renderer, canvas, shaders, capability detection, or application code.

Before the correction released the route, the test:

- observed the actual texture request;
- waited for the splash to be removed;
- observed semantic readiness `true`;
- asserted texture readiness `false` and pending resources `1`;
- asserted exactly zero Pixi canvases;
- then exercised the original geometry function.

The original geometry function failed on the canvas `getBoundingClientRect` with exit 1. All setup and causal-state assertions had completed first; there were no import, syntax, server, browser-launch, navigation, selector-setup, or environment failures.

```powershell
$env:E2E_LIVE_URL = 'http://127.0.0.1:5198/'
$env:E2E_DENY_EXTERNAL_NETWORK = '1'
npx playwright test -c playwright.product-completion.config.ts e2e/product-completion/dialog-registration.spec.ts --project=standard --workers=1 --output=C:/Users/brenn/AppData/Local/Temp/recovery-v2-r10-ci-red-standard --reporter=list
```

- Exit: `1`
- Log: `C:/Users/brenn/AppData/Local/Temp/recovery-v2-r10-ci-red-standard.log`
- Log SHA-256: `fe66cf5d39d54cf6eb170a95419ade4e3033310574cd5566dfea30b0aff29183`
- Failure: `TypeError: Cannot read properties of null (reading 'getBoundingClientRect')`
- Failure location: the original geometry call, after the deterministic pending-decoration assertions.

## Minimal correction and retained oracle

The test releases the held real texture request after proving the early semantic state, then waits for all three observable visual-admission conditions:

```text
data-battle-console-textures-ready="true"
data-battle-console-pending-resources="0"
[data-battle-console-host="pixi"] canvas count = 1
```

A fallback or absent Pixi registration therefore still fails the test. No arbitrary sleep, retry, skip, swallowed error, fake shader, fake canvas, capability override, or timeout change was introduced. Semantic readiness remains independent and is explicitly demonstrated before decoration completes.

The existing strict oracle remains intact:

- exact surface, internal commander, and Pixi-canvas geometry snapshots before any dialog;
- exact equality of all three boxes while each dialog is open and after Escape closes it;
- zero horizontal and vertical surface scroll;
- visible `Battle Settings` and `Armory` dialogs;
- Escape closure of both dialogs;
- explicit restoration of focus to each opener after Escape;
- all five ultrawide, wide, standard, narrow, and compact profiles.

## GREEN verification

The readiness correction first passed 15/15 delayed-admission repetitions across all five profiles. After adding the explicit existing-contract opener-focus assertion, the final frozen candidate repeated the complete test three times in every profile and again passed 15/15:

```powershell
$env:E2E_LIVE_URL = 'http://127.0.0.1:5198/'
$env:E2E_DENY_EXTERNAL_NETWORK = '1'
npx playwright test -c playwright.product-completion.config.ts e2e/product-completion/dialog-registration.spec.ts --workers=1 --repeat-each=3 --output=C:/Users/brenn/AppData/Local/Temp/recovery-v2-r10-ci-final-five-profiles-repeat3 --reporter=list
```

- Exit: `0`
- Result: `15 passed (34.1s)`
- Log: `C:/Users/brenn/AppData/Local/Temp/recovery-v2-r10-ci-final-five-profiles-repeat3.log`

The earlier readiness-only green run also exited 0 with 15/15 across the same matrix:

- Log: `C:/Users/brenn/AppData/Local/Temp/recovery-v2-r10-ci-green-five-profiles-repeat3.log`
- Log SHA-256: `23dfc229e9949b1a85280c1e8c141a660f2abd3710bdd2dfabf2c2a05ac5b34c`

Playwright compiled and exercised the changed TypeScript test in real Chromium. The project declares no lint command and no E2E coverage command; client Vitest coverage is a different runtime surface. The parent owns the broader product rerun after integration.

## Evidence boundary and lease release

This proof covers the corrected AC01 admission and geometry path against the already-served activation artifact. It does not establish a new commit, exact-head CI, full product-suite result, merge readiness, release readiness, production behavior, or R20 completion. No commit, PR mutation, merge, release, deployment, localhost mutation, or production action was performed.

The frozen candidate contains exactly these two paths:

- `e2e/product-completion/dialog-registration.spec.ts`
- `.codearbiter/reports/recovery-v2-r10-ci-readiness-evidence.md`

The writer lease is released after final hashes and clean diff checks are reported to the parent integration owner.

## Post-review deployment-prefix correction

A fresh independent Astra/high review raised `R10-CI-BASE-01` at HIGH severity after the first lease release. The first implementation registered a prefix-tolerant route glob, but observed requests by requiring the pathname to equal `/art/battle-console-integrated/canonical-pixi-layer.png`. That observer cannot match the real GitHub Pages pathname `/singedTerra/art/battle-console-integrated/canonical-pixi-layer.png`; therefore the original root-hosted 15/15 results did not establish deployment-prefix compatibility. The same two-file lease was reacquired for this correction.

The parent completed the already-running root full-product suite before replacing the sole preview: exit 0 with `83 passed / 27 skipped`. The parent then built the activation source with `VITE_BASE=/singedTerra/`, supplied only the synthetic loopback/public test configuration, and replaced the verified old listener with sole preview PID `49632` at `http://127.0.0.1:5198/singedTerra/`. All 60 served files matched the prefixed build. Retained artifact evidence:

- Receipt: `C:/Users/brenn/AppData/Local/Temp/recovery-v2-r10-ci-prefixed-artifact.json`
- Receipt SHA-256: `efb6f3e473c35a432a816caa04e3dd9d0d5a4888218d3104bf9070fa72a3b7ab`
- Served `index.html` SHA-256: `8171703f6a868e624dee2156917a7d59763457153d99cc93ba6fc2e33185ca00`
- Artifact inventory SHA-256: `f0a77bf3efae3af800dd5baa981663dc83eeeac69963022c4fb408a610f00a08`

### Deployment-prefix causal RED

Before editing the reviewed candidate, the unchanged root-only observer ran against the verified prefixed artifact:

```powershell
$env:E2E_LIVE_URL = 'http://127.0.0.1:5198/singedTerra/'
$env:E2E_DENY_EXTERNAL_NETWORK = '1'
npx playwright test -c playwright.product-completion.config.ts e2e/product-completion/dialog-registration.spec.ts --project=standard --workers=1 --output=C:/Users/brenn/AppData/Local/Temp/recovery-v2-r10-ci-prefixed-matcher-red-standard --reporter=list
```

- Exit: `1`
- Failure: the unchanged `page.waitForRequest` remained unresolved until the existing 45-second test timeout.
- Log: `C:/Users/brenn/AppData/Local/Temp/recovery-v2-r10-ci-prefixed-matcher-red-standard.log`
- Log SHA-256: `0f738f7ebd5f29127a0438f125fd450a427ce8f6557dd4dce674442109b6e914`
- Trace: `C:/Users/brenn/AppData/Local/Temp/recovery-v2-r10-ci-prefixed-matcher-red-standard/dialog-registration-AC01-d-c28d4-ander-and-Pixi-registration-standard/trace.zip`
- Trace SHA-256: `f6442d48e2b6e5f501250fe32f507fb9846c78fc2ad496b19641eb624170b745`

The trace makes this a causal matcher red rather than a generic setup failure. It records the route glob registration, then an intercepted request for exactly `http://127.0.0.1:5198/singedTerra/art/battle-console-integrated/canonical-pixi-layer.png` with response status `-1`, proving the route handler held the actual prefixed request. In the same trace, the surface reached semantic readiness with textures `false`, pending resources `1`, and no released decoration response. Navigation, browser launch, splash dismissal, semantic mount, and interception all succeeded; only the root-exact request observer failed to recognize that held prefixed URL.

### Corrected matcher

The test now requires the Playwright-configured `baseURL`, resolves the relative texture URL against it, and defines one exact full-URL predicate. That same predicate owns both `page.route` interception and `page.waitForRequest` observation. It resolves to the root URL under root hosting and to the `/singedTerra/` URL under Pages hosting without a suffix, glob, or duplicated-path interpretation. No runtime source, timeout, retry, skip, or assertion changed.

The pending-semantics proof remains unchanged: the test observes the real held request, semantic readiness, textures `false`, pending resources `1`, and zero canvases before release. It then requires textures `true`, pending resources `0`, and exactly one canvas before preserving the strict geometry, scroll, dialog, Escape, and opener-focus oracle.

### Deployment-prefix GREEN

The corrected exact matcher ran the full five-profile test three times per profile against the verified prefixed artifact:

```powershell
$env:E2E_LIVE_URL = 'http://127.0.0.1:5198/singedTerra/'
$env:E2E_DENY_EXTERNAL_NETWORK = '1'
npx playwright test -c playwright.product-completion.config.ts e2e/product-completion/dialog-registration.spec.ts --workers=1 --repeat-each=3 --output=C:/Users/brenn/AppData/Local/Temp/recovery-v2-r10-ci-prefixed-final-five-profiles-repeat3 --reporter=list
```

- Exit: `0`
- Result: `15 passed (34.4s)`
- Log: `C:/Users/brenn/AppData/Local/Temp/recovery-v2-r10-ci-prefixed-final-five-profiles-repeat3.log`
- Log SHA-256: `a98e4f3b657ec7f267ba7a22538aee6066792a88e70f3625a46b70d2c8325000`
- Corrected test SHA-256 before this report append: `1128db18eb79321d3ac5873aec349a7c91a751d1c2754f7eda8cab87a6790edc`

The parent retains ownership of the fresh root-compatibility check, full prefixed product suite, independent review, commit, and exact-head CI. This worker makes no CI-green, merge-readiness, release-readiness, production, or R20-completion claim. The reacquired writer lease is released after the corrected report hash and final diff check are sent to the parent.
