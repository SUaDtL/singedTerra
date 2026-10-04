# Last Stand playable loop validation

The saved `LastStandPrototype` scene now completes the local loop: deploy,
ordinary defeat, persist a pending salvage reward, reload, claim, purchase a
permanent Cannon Attack level, reload again, and redeploy stronger. The browser
journey used real pointer input and ordinary simulation time. At level 0 the
first cannon hit deals 20 damage and leaves the first enemy at 10 HP; after the
purchase, the same repair fitting deals 30 and destroys that enemy in one hit.

## Executed checks

Run these commands from the repository root with the pinned Unity editor
available at the path configured in the runners:

```powershell
C:/Python314/python.exe -m unittest discover -s campaign-unity/Tools/last_stand_loop -p test_loop_model.py -v
C:/Python314/python.exe -m unittest discover -s campaign-unity/Tools/last_stand_loop -p test_loop_unity.py -v
C:/Python314/python.exe -m unittest discover -s campaign-unity/Tools -p verify_last_stand_loop.py -v
C:/Python314/python.exe -m unittest discover -s campaign-unity/Tools/last_stand_loop -p test_console_classification.py -v
```

The October 4, 2026 local results are:

| Surface | Observed result |
| --- | --- |
| Compiled C# progression and storage model | 6 tests passed in 0.952 seconds: defeat idempotence, non-defeat exclusion, save shape/reload, storage retry, uncertain-write reconciliation, and prices/cap/next-run damage. |
| Actual imported Unity scenes and session | 2 tests passed in 7.61 seconds: session modes/damage and pause/terminal/UI/audio lifecycle. Both fittings naturally reach defeat. The export also reran these checks. |
| Pinned Unity Web export and Chrome journey | The command passed in 164.214 seconds, with 49 recorded checks and 9 pointer actions matched to 18 input edges. The console assertion in that original receipt is corrected below. |
| Console reporting regression | 2 self-contained tests passed; replay of the original console identifies nine known shader notices and no unclassified errors. No repeat export or gameplay journey was needed for this reporting correction. |
| Repository static check | `npm run typecheck` passed. It checks the existing TypeScript project, not Unity C#. |

The browser proof covers pending-reward reload, exactly one salvage from Claim,
the first purchase, spent balance and permanent level after reload, and the
actual stronger first hit. It also checks controls at 1280x720 and 800x600,
rendered sound, mute, pause, real browser-tab focus loss, explicit resume without
combat catch-up, and isolated corrupt/blocked-storage screens with Retry.

The console is **not error-free**. Across the three main-page loads Unity logged
nine notices for these three unsupported internal renderer shaders:
`Hidden/CoreSRP/CoreCopy`,
`Hidden/Universal Render Pipeline/StencilDitherMaskSeed`, and
`Hidden/Universal/HDRDebugView`. Unity emitted each `ERROR: Shader ` prefix
separately from its shader name. The original verifier only checked console
message severity and missed them. Independent review found the issue; the
verifier now classifies these exact renderer limitations explicitly and rejects
unclassified logged errors. The original receipt remains intact. Its claim of
"no browser, Unity console, request or page errors" is superseded by this
disposition and the separately retained console-review addendum. Scene and UI
screenshots render correctly, but they do not prove every hidden pipeline effect
on every GPU. No JavaScript page exception or failed HTTP request was observed.

## Evidence and source identity

Evidence is retained locally under `campaign-unity/Evidence` and is ignored by
Git; these are local review links, not hosted media:

- [Browser result](../Evidence/last-stand-playable-loop/t03/browser-20261004T230058Z-1860d4/result.json), with raw console, runtime telemetry and pointer trace in the same directory. Read it with the [console-classification addendum](../Evidence/last-stand-playable-loop/t03/console-classification-browser-20261004T230058Z-1860d4.json), which supersedes its clean-console claim.
- [Normal-speed battle with captured audio](../Evidence/last-stand-playable-loop/t03/browser-20261004T230058Z-1860d4/normal-speed-repair-with-audio.mp4).
- [Compact workshop](../Evidence/last-stand-playable-loop/t03/browser-20261004T230058Z-1860d4/04-compact-workshop.png), [completed purchase](../Evidence/last-stand-playable-loop/t03/browser-20261004T230058Z-1860d4/05-compact-purchased.png), and [upgraded first hit](../Evidence/last-stand-playable-loop/t03/browser-20261004T230058Z-1860d4/07-upgraded-first-hit.png).
- [Build receipt](../Evidence/last-stand-playable-loop/t03/build-20261004T230058Z-9e18c9/result.json).
- [Imported-scene Unity log](../Evidence/last-stand-playable-loop/t02/unity-editor.log).

The export used Unity 6000.3.24f1 and URP 17.3.0. The approved
`ST-LS-LOOP-SPEC` revision 4 and `ST-LS-LOOP-PLAN` revision 6 identities are
recorded in the build receipt. Its source inventory SHA-256 is
`e44b63c8cd4fae695b76f2af6ffe5697295a6911ba64f0b3f50f82062e0171ac`.
It was captured from `e55361fa62c055222bd36c8bebd169dff68704d2` plus the
declared feature changes, not from a clean final commit. Inputs matched before
and after export. The later console-classification correction changes the test
driver only; it does not change the captured Unity runtime or exported Web files.

The saved `BattlefieldReview` SHA-256 remains
`024013749d3d53cb32844715ec6f5013bea8144417424561681cbb2263d22c2f`;
`FieldAssembly` remains
`5652aaba327cc7f26056a7ee033a98016a061e2de00e6176ea643441ca2adf65`.
The default export is still `field`; `last-stand` is an explicit route.

The 81.865-second recording includes actual rendered WebAudio mirrored in the
isolated test page and decoded to confirm non-silent cannon/impact, defeat and
purchase cues. Unity event logs alone were not the sound oracle. Mute, pause and
focus-loss samples were silent. The browser was Chrome 153.0.8010.50 in owned
headless mode. The recording contains 2,277 frames with a maximum frame gap of
1.292 seconds, so it is motion evidence, not a smooth-frame-rate benchmark.
There is no hardware-speaker loopback, OS-window acceptance, owner listening
acceptance or phone-performance result.

The initial headed run could not reach readiness while the remote desktop
browser was hidden. The final run used actual visible/focused browser tabs in
headless mode, without forced visibility, background overrides or longer startup
timeouts. Intermediate harness runs also exposed a pause-event race and stale
resize geometry; the final driver waits for the requested pause state and settled
control geometry. Earlier evidence is retained rather than relabeled as passing.

## Governance and coverage limits

NU2Z approved the bounded spec and plan. The logged one-sprint exception in
[overrides.log](../../.codearbiter/overrides.log) permits delivery with actual
tests and available independent reviewers while the unavailable native reviewer
receipts remain pending. Fresh native approval checks passed; native task and
scope completion acceptance has **not** been recorded. The exception does not
authorize merge or replace owner acceptance.

T-01 retains actual behavioral failing-test evidence before implementation.
The broader T-02 runtime was authored before its scene tests; that task does not
have a complete test-first history. Compile/environment failures and the repaired
launcher-versus-repair test comparator are not presented as gameplay regression
proof. The manifest adds only the pinned editor's built-in
`com.unity.modules.audio` 1.0.0 module, required for the approved audio scope;
no third-party package was installed.

The repository's [Testing profile](../../.codearbiter/tech-stack.md#testing)
defines deterministic TypeScript helpers, Deno Edge tests, Vitest client tests
and CI for those three layers. Its coverage command is
`npm run coverage:client` with `@vitest/coverage-v8` 5.0.0.
That TypeScript coverage does not measure Unity/C# code.
There is no configured numeric Unity/C# coverage runner here, so this task
reports actual named Unity/browser checks without a fabricated percentage.

The complete configured Testing section is quoted here to keep that limit
reviewable against the source profile:

> ## Testing
>
> Three test layers, by runtime:
>
> - **Engine / pure helpers** — deterministic harnesses in `scripts/checks/*.mjs`, run via `tsx`
>   (`npm run check`), asserting byte-identical replay of `(seed + ordered action log)`. Cover the
>   `shared/` engine and the pure client helpers (gaugeMath, browseLabels, inputGate, ringBuffer,
>   fastForward, strata, audioEdges, …).
> - **Edge Functions** — Deno `*.test.ts` (`npm run check:edge` → `deno test`), covering the pure
>   referee logic (validate/authorize/coerce/reap) extracted from the handlers.
> - **Client (DOM + fetch)** — **Vitest** `5.0.0` with the **jsdom** environment (`npm run test:client`),
>   giving the DOM- and `fetch`-heavy client code (Lobby, HUD, NetworkClient) a seam the tsx harnesses
>   cannot reach. **Coverage:** `@vitest/coverage-v8` `5.0.0` via
>   `npm run coverage:client` — this is the command the
>   `/ca:refactor` Phase-2 gate reads. Added 2026-07-03 to unblock the client refactor backlog
>   (#85/#87/#91); vitest/vite/esbuild are dev-only (not in the shipped bundle).
>   Coverage uses AST-aware v8 remapping, so percentages are not directly
>   comparable to Vitest 2 reports; the executable test set remains the governing
>   compatibility oracle until a global threshold is adopted.
> - CI runs all three layers (`.github/workflows/ci.yml`).
>
> ### Battle console asset verification
>
> Run `npm run test:assets:battle-console` for deterministic generation, source-bound geometry, responsive pixel preservation, and repaired instrument faces. Run `npx playwright test -c playwright.product-completion.config.ts` for the five-profile browser suite. CI runs this separately from the general game journeys. Local runs reuse the single preview at port 5198.

## Remaining acceptance and prototype boundaries

The save uses `singedTerra.lastStand.prototype.v1` in one browser origin.
Missing storage initializes a version-1 record; blocked or corrupt storage
preserves the record and presents Retry. This is a single-tab local prototype,
without cloud sync, cross-origin saves or concurrent-tab authority. The
`playable-prototype-v1` pacing and 20/30/40/50 damage and 1/2/3 price values
are provisional. Owner A/B art selection, normal-speed motion and sound
listening, whole-feature polish, and live-player feedback remain separate.
