# Last Stand playable loop validation

The saved `LastStandPrototype` scene now completes the local loop: deploy,
ordinary defeat, persist a pending salvage reward, reload, claim, purchase a
permanent Cannon Attack level, reload again, and redeploy stronger. The browser
journey used real pointer input and ordinary simulation time. At level 0 the
first cannon hit deals 20 damage and leaves the first enemy at 10 HP; after the
purchase, the same repair fitting deals 30 and destroys that enemy in one hit.

## Polish corrections

The Web build now supplies a texture-backed CoreCopy pass compatible with WebGL,
uses the existing non-MSAA fallback, and retains the real stencil-dither fragment
and stencil behavior at shader target 3.0. The dedicated Last Stand release
export strips inactive HDR debug resources before serialization. It restores the
native renderer and original global settings after building, verifies exact
settings bytes, and preserves the two original saved scenes. Pinned Unity package
sources are not patched. Shader compiler diagnostics and browser shader errors
now fail verification instead of being accepted as renderer limitations.

Combat sound now consumes each admitted simulation tick before the next tick
clears its events. Attack events retain their outcome at the time of impact, so
batched frames cannot drop a shot or mislabel an impact after a later kill.
Two focused Unity checks cover those failures and pause/resume replay behavior.

The recording preserves each captured frame and its timestamp, including the
video tail after the audio ends. A separate uninterrupted active-play clip starts
after the deliberate focus-loss check. Frame-cadence evidence measures browser
animation callbacks during active play; it does not claim GPU presentation FPS.
The owned Chrome profile now lives in a short temporary path, fixing the Windows
CacheStorage failure caused by nesting it below the evidence directory. The
checker also rejects failed Unity cache operations logged at ordinary severity.

## Executed checks

The final October 5, 2026 UTC local export and browser journey passed.

| Surface | Observed result |
| --- | --- |
| Compiled C# progression/save model | Six tests passed, including reward idempotence, uncertain writes, Retry, price/cap and next-run damage. |
| Imported Unity scene/session | Four checks passed, including natural defeat, UI/pause/terminal lifecycle, per-tick event dispatch and attack-time kill classification. The export runs all four. |
| Real Chrome journey | 57 checks passed with nine pointer actions; pending reward reload, exactly one salvage Claim, permanent purchase reload, and the stronger first hit are exercised. |
| Targeted harness regressions | Strict shader/cache/request classification, shader build-log rejection, build-receipt binding, owned Chrome launch/cleanup and actual CacheStorage put/match passed. |
| Repository static check | `npm run typecheck` passed; it measures the TypeScript project, not Unity C#. |

Run the focused tests from the repository root:

```powershell
C:/Python314/python.exe -m unittest discover -s campaign-unity/Tools/last_stand_loop -v
C:/Python314/python.exe -m unittest discover -s campaign-unity/Tools -p test_native_chrome.py -v
C:/Python314/python.exe -m unittest discover -s campaign-unity/Tools -p verify_last_stand_loop.py -v
```

The browser proof includes controls at 1280x720 and 800x600, actual rendered
WebAudio, mute, pause, real browser-tab focus loss and explicit resume without
combat catch-up. Isolated corrupt/blocked storage preserves data and offers Retry.

There are zero shader errors, JavaScript page errors, failed cache operations or
unclassified request failures. Successful HTTP 304 revalidation can emit Chrome
`net::ERR_ABORTED` for the network leg; the verifier accepts only the exact data
GET/fetch with matching HTTP 304 and same-load UnityCache success. It retains
those events separately and rejects other request failures.

Raw console output still contains six Unity startup WebGL capability warnings per
load. A bounded diagnostic traced them to `getInternalformatParameter` queries
for unsupported R/RG/RGBA 8/16-bit SNORM renderbuffer formats before readiness.
A separate WebGL2 context reproduced exactly those six invalid-enum responses.
They are not the repaired shader errors and do not occur during active play.
No GL calls, warnings or errors are suppressed. The console is not described as
literally empty or warning-free.

The prior acceptance of three shader errors as renderer limitations is
superseded, along with the original clean-console claim. Failed and intermediate
receipts remain intact; they are not relabeled as passing.

## Evidence and source identity

These links refer to local ignored evidence, not hosted downloads:

- [Final browser receipt](../Evidence/last-stand-playable-loop/t03/browser-20261005T005650Z-08865b/result.json), with raw console, request evidence, telemetry, pointer trace and timestamps beside it.
- [Uninterrupted active play with captured sound](../Evidence/last-stand-playable-loop/t03/browser-20261005T005650Z-08865b/active-play-review-with-audio.mp4).
- [Full normal-speed recording with captured sound](../Evidence/last-stand-playable-loop/t03/browser-20261005T005650Z-08865b/normal-speed-repair-with-audio.mp4).
- [Compact workshop](../Evidence/last-stand-playable-loop/t03/browser-20261005T005650Z-08865b/04-compact-workshop.png), [purchase](../Evidence/last-stand-playable-loop/t03/browser-20261005T005650Z-08865b/05-compact-purchased.png), [stronger first hit](../Evidence/last-stand-playable-loop/t03/browser-20261005T005650Z-08865b/07-upgraded-first-hit.png).
- [Final build receipt](../Evidence/last-stand-playable-loop/t03/build-20261005T005554Z-4472c0/result.json).
- [SNORM startup diagnosis](../Evidence/last-stand-playable-loop/t03/diagnostic-internalformat-20261005T004207Z-726d8b/result.json), [short-profile cache proof](../Evidence/last-stand-playable-loop/t03/diagnostic-cache-profile-20261005T004548Z-91d61d/result.json), and [304 reload diagnosis](../Evidence/last-stand-playable-loop/t03/diagnostic-cache-request-20261005T005307Z-232274/events.json).

The export uses Unity 6000.3.24f1 and URP 17.3.0, bound to approved
`ST-LS-LOOP-SPEC` revision 4 and `ST-LS-LOOP-PLAN` revision 6. The source
inventory SHA-256 is `67eb597e6496577ddcce21c8a04706f64768d0b0254e0379d6be50c19720dee9`.
It contains 568 inputs captured from
`e0823ce94937e09fbcd700acc2c0909c651a2413` plus the declared repairs, not a
clean-final-commit rebuild. Inputs matched before and after export; the browser
runner independently checks the complete inventory, pins, required checks and
all 17 export-file hashes before reusing that exact build.
Documentation and audit updates are outside the runtime/source inventory.

Protected saved-scene SHA-256 values remain:

- `BattlefieldReview`: `024013749d3d53cb32844715ec6f5013bea8144417424561681cbb2263d22c2f`.
- `FieldAssembly`: `5652aaba327cc7f26056a7ee033a98016a061e2de00e6176ea643441ca2adf65`.
- `LastStandPrototype`: `4c7d06b728b64b763a6a62e34abe212bdf56648ea24865df6aa7d9174de59b8f`.

The default export remains `field`; `last-stand` is an explicit route. Native
renderer/global settings are restored after the Web export, with byte checks.
Unity-serialized empty-field metadata whitespace is retained with the verified
assets rather than rewritten cosmetically after capture.

## Motion and sound evidence

Four active-play animation-callback windows have p95 intervals of
18.2-18.5 ms, a maximum of 35.5 ms, and no interval
over 50 ms. A separate real deployment without screen capture provides the
pre-impact comparison in the receipt. These are browser callback measurements,
not measured GPU presentation FPS or phone-performance claims. Deliberate pause
and hidden-tab intervals are reported separately.

The raw recording has 2,277 real captured frames over
81.804 seconds. Encoding retains all
2,277 frames; the audio mux retains
2,277 frames over 81.871 seconds.
The active-play clip retains 2,028 frames in a single trim
after explicit resume, with no interpolation or duplicate-frame smoothing.
The longer gap in the full recording coincides with the deliberate focus-loss
check, outside the uninterrupted active-play segment.

Actual WebAudio bytes are mirrored in the isolated test page and decoded to
verify non-silent cannon/impact, defeat and purchase output; event logs alone
are not the sound oracle. Mute, pause and focus-loss samples are silent.
Chrome 153.0.8010.50 ran in an owned headless profile without focus/visibility or
renderer overrides, using WebGL2 ANGLE/NVIDIA RTX 5070 Ti/D3D11. There is no
hardware-speaker loopback, owner listening, OS-window acceptance or phone result.

A late CDP screencast acknowledgment raised `TargetClosedError` during capture
teardown after its target closed. The test exited successfully; all 2,277 saved
frames, encoded frames, muxed frames and audio were finalized and independently
probed. This retained harness diagnostic caused no observed evidence loss.

## Governance and coverage limits

NU2Z approved the bounded spec and plan. The logged one-sprint exception in
[overrides.log](../../.codearbiter/overrides.log) permits delivery with actual
tests and available independent reviewers while the unavailable native reviewer
receipts remain pending. Fresh native approval checks passed; native task and
scope completion acceptance has **not** been recorded. The exception does not
authorize merge or replace owner acceptance.

T-01 retains actual behavioral failing-test evidence before implementation.
The later audio correction had an observed behavioral RED before its fix; the
subsequent GREEN Editor run overwrote that log, so no separately retained RED
log is claimed for it. The broader T-02 runtime was authored before its scene
tests; that task does not have a complete test-first history. Compile/environment failures and the repaired
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
are provisional. Owner A/B art selection and visual/listening acceptance remain
pending. The
reported shader, audio and capture defects are repaired; automated evidence
does not substitute for owner acceptance. Live-player feedback is deferred at
the user's explicit request while remote. No merge is authorized before acceptance.
