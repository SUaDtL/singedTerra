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

The repository's [Testing profile](https://github.com/SUaDtL/singedTerra/blob/af17d905138c017822c802c658069223e97b5bf4/.codearbiter/tech-stack.md#testing)
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

The Campaigns entry packages the passing
`Web-20261005T005554Z-4472c0` Last Stand export under
`client/public/last-stand/`. Its manifest binds the original build receipt,
source inventory and unchanged Unity runtime asset bytes; the authored site
wrapper is hashed separately. The original 568-input source-inventory match
describes the export at capture time; later wrapper and site edits are outside
that snapshot. This menu integration did not recompile Unity. The normal site
build verifies the staged
payload and Vite copies it into `client/dist/last-stand/`. The Unity page uses
the fixed relative `../#campaigns/last-stand` return link. The lobby consumes
that exact fragment after selecting Last Stand, while explicit room invites
and validated imported ST1 challenges retain priority. The Unity save stays in
its own browser key and does not mutate the Ash Road campaign save.

Focused local checks passed for Web entry rendering, missing/corrupt payload
rejection, command selection, ST1 compatibility, TypeScript types and the
normal `npm run build` with `VITE_BASE=/singedTerra/`. A scoped V8 run passed
18 tests, but the numeric coverage report included only `registry.ts` (100%
statements/lines/functions, 93.54% branches); it gave no numeric result for
the new Last Stand view or this whole task.

The local Chrome integration run at `/singedTerra/` passed eight checks:
Campaigns presents Ash Road and Last Stand; Unity assets wait until launch;
the actual garage and deployed battle load; Return restores Last Stand without
reopening the splash; Ash Road still opens afterward; and a simulated wasm
request failure leaves Return usable. Captures cover wide 1600x900, standard
1280x720, compact 800x600, and narrow 390x844 and 320x700 layouts. The
thirteen screenshots show no nav overlap with the Unity controls; 390px and
320px Campaigns entries and launch stay visible without horizontal overflow.
The run records no Unity asset requests before launch and zero console errors.
The receipt and screenshots are retained only in ignored local
`campaign-unity/Evidence/last-stand-campaign-entry/`, with the result in
`browser-result.json`. This is local build and browser validation, not
current-head hosted CI, public Pages deployment or owner visual acceptance.

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


## T-05 complete source/export binding — 2026-10-05

The current staged payload is the single genuine saved-scene Unity 6000.3.24f1
export `Web-20261005T124312Z-041935`. Historical exports and evidence remain
unchanged. The older 568-input capture above is historical and is not the
freshness proof for this payload. No scene regeneration or art edits occurred.

The export inspected all 3,296 present inputs under Unity Assets, Packages and
ProjectSettings (including 2,771 ignored embedded URP files), plus the exporter
and its imported `unity_shader_log.py`. Of these, 3,091 are strict UTF-8 LF text
and 205 are raw binary. Recursive directory membership detects additions as
well as changed/deleted inputs. Python standard-library imports have no project
source dependencies. The editor executable, complete WebGLSupport module,
installed built-in URP origin and Python executable are a separate 17,396-file
raw toolchain pin. Before/after source and toolchain maps are identical.

`make_web_entry.py` and `web-index-template.html` are separately bound authored
wrapper inputs. Test drivers, browser drivers, governance and compatibility
metadata do not affect Unity export bytes and do not force a rebuild. Native
spec9/plan19 approval identities are caller-observed metadata, separate from
runtime source identity; the JSON CLI option does not grant approval authority.
Every Unity invocation rechecks editor ownership. Saved LastStand, Field and
review scene hashes remained unchanged, with the existing build/shader markers
accepted. Owner visual and listening acceptance remain pending.

Exact evidence: `campaign-unity/Evidence/last-stand-playable-loop/t05/build-20261005T124312Z-041935/`.
The immutable `result.json` raw SHA is
`417176ed65bc6631b018f6d8096c37f20d9ec8bce84ced19916c19510a364137`.
Before copying, `staging-plan.json` froze all 16 receipt-enumerated runtime
leaves, the wrapper hash, and prior staged membership. Staging verified the
frozen plan and source/toolchain again, copied only those leaves, and removed
only obsolete enumerated staged leaves. Local saves and historical Builds and
Evidence were untouched. Sanitized receipt and source-lock retain the complete
inspected maps. CI may admit an entirely absent ignored URP through this exact
verified complete pin; partial vendor trees and drift fail. This admission does
not claim CI inspected absent vendor or external toolchain bytes.

Hashes:

- Portable source: `6d7dbab02a2c689dc83b7fe22a618c6f89ba5eed723dd7d31d05b6d841df2ac3`.
- Raw toolchain: `d21e7a7c8c7d17c135989e9eb59162fefc2c151384450c364e1505e631e633d6`.
- Sanitized receipt: `2339884e235ad33e68ce1d4c67110984cc1c3714caed7975ba3f2a8b630c872c`.
- Source lock: `1ad495b1d5affe4d45fd4defd5e0445ee4ed2c0d7c13882d9bf5b778e4fb165b`.
- Asset manifest: `2e33284b7875519305a4421d7b3eee2eb509233986d78de185c20961a5301f75`.
- Authored staged wrapper: `4db8568f707b59fec416ef48b541f426e37b25d5b7c937c92dfba87998d5babb`.
- Wasm: `20cb8bf358ca255ba67f1851e89222c39c5e0f9f95595e1059700a7783c18cb8`.
- Data: `23f3caaff320f35048268b8a5f94b301128aaf9a4da865ed03a9dfff5542adb8`.

Regression-first observations rejected omitted vendor/toolchain inventories,
unexpected package additions, source/tool/wrapper drift, missing or changed pins,
partial vendor trees, and corrupt runtime bytes against the prior implementation.
All seven original build tests remain. Final focused commands from repository root:

```text
C:\Python314\python.exe -m unittest discover -s campaign-unity/Tools -p test_build_web.py -v
C:\Python314\python.exe -m unittest discover -s campaign-unity/Tools/last_stand_loop -p test_build_receipt_binding.py -v
node --test scripts/assets/verify-last-stand-source.test.mjs scripts/assets/verify-last-stand.test.mjs
node scripts/assets/verify-last-stand-source.mjs
node scripts/assets/verify-last-stand.mjs
node scripts/checks/seed_challenge_compatibility.mjs
```

Results: 9/9 Python build tests, 2/2 receipt tests, 14/14 Node tests;
source admission inspects 3,296 available inputs; payload admission verifies
16 runtime assets; ST1 compatibility passes 32 bound sources. Raw GREEN logs
are in the exact evidence directory. The package.json compatibility row alone
was refreshed; ST1 parsing, prices, combat and save formats were not changed.
The real staged receipt exposed mixed-case Windows path ordering: the verifier
now hashes recorded map order while exact inventory comparison uses sorted
membership. A retained prior-implementation regression fails on source closure
(`test-ordering-red.log`); its repaired case passes in the 14-test GREEN run.
No second export was used. These local tests do not establish hosted CI,
production delivery, independent campaign review or owner acceptance.


T-05 wrapper-only reuse follow-up: `package_last_stand_web.py RECEIPT
--refresh-wrapper` validates the unchanged export/source/toolchain and staged
runtime, checks original sanitized/source-lock/raw-receipt pins, freezes a new
append-only `wrapper-refresh-<uuid>.json` before destination writes, then changes
only index.html and asset-manifest.json. The manifest binds current wrapper
inputs and output separately; immutable original receipt/source-lock wrapper
identities remain historical. The initial staging-plan is never replaced.
The real packaging CLI regression preserves all original pins/runtime bytes;
3/3 receipt tests and 15/15 Node tests pass, including bound refresh admission
and subsequent unbound wrapper drift rejection. No actual wrapper refresh was
needed for the staged campaign, and no second export was performed.

Evidence trust boundary: normal source admission reads and hashes the referenced
tracked sanitized receipt and source-lock content, and compares their complete
maps/pins with available source and runtime bytes. `rawReceiptSha256` and the
ignored local `evidence` path identify the historical raw export receipt; normal
CI admission does not dereference that raw path or claim it exists. Local export
packaging and wrapper refresh do dereference and hash the raw receipt. A content
hash establishes integrity relative to retained pins, not independent authority
or proof of genuine execution; native observations and independent review own
that evidence assessment.

## T-06 bounded RED handoff — 2026-10-05

The maintained test is named exactly `Last Stand Campaigns journey preserves
no-award exit and a stronger redeploy`, with Playwright details tag `@last-stand`.
`e2e/helpers/lastStandJourney.mjs` owns the assertions and passive input, WebAudio,
rAF and CDP capture probes. The Playwright spec calls that helper; the standalone
JavaScript runner invokes the same production spec. The normal Python
`test_defeat_buy_reload_redeploy` invokes the standalone runner and does not build
Unity. Every historical constant and helper before `LastStandWebTests`, including
`SPEC`, `PLAN`, `ROOT`, `EVIDENCE`, `EDITOR`, `artifact_hashes` and `build_once`, is
unchanged from HEAD. Its normalized text SHA-256 is
`59aaf4b754395f774f4776560d472b9b4689f03ac073c4598cbbf0dff82c9602`.
Six existing Python console/cache-classification regressions pass; their raw log
is `campaign-unity/Evidence/last-stand-playable-loop/t06/historical-console-contracts.log`.

The focused integration RED was observed before implementation: the Node CI
policy test failed on missing `@last-stand` exclusion/selection, and the maintained
entrypoint test failed its `Missing maintained Last Stand entry:
e2e/helpers/lastStandJourney.mjs` assertion. The original tool output remains in
the conversation; `red-20261005T194835-5df126/red-observation.txt` is an explicit
observation summary, not a raw runner log. After wiring, `node --test
scripts/ci/ciWorkflow.test.mjs` passes 5/5. Its raw output is
`red-20261005T194835-5df126/green-ci.log`. Ordinary CI selects the shared test
in the existing product matrix lane with `VITE_BASE=/singedTerra/` and
`E2E_DENY_EXTERNAL_NETWORK=1`; both core shards exclude `@live|@last-stand`.
Candidate/release workflow assertions and workflows are unchanged. The existing
candidate general-config core selection also includes the new spec; desktop-fine
owns its execution, while the pixel-touch and small-window executions are skipped
by the spec. Candidate participation is retained within this eight-path boundary.
The candidate byte verifier still runs before and after each existing candidate
lane; a preserved YAML file alone does not establish network isolation or a
passing candidate journey. Local policy tests do not establish hosted execution.

The eighth real trial exited 1 at `outer control reachable by native Tab`.
Raw named Playwright output is
`campaign-unity/Evidence/last-stand-playable-loop/t06/playwright-eighth.json`.
Its source-bound result, native input trace, telemetry and failure screenshot are
in `campaign-unity/Evidence/last-stand-playable-loop/t06/journey-2026-10-05T23-58-09-494Z-5461715d/`.
The actual ready scene focuses `unity-canvas`; one native Shift+Tab followed by
50 native Tab presses leaves focus on that canvas. No DOM focus, splash removal,
controller call, injected readiness/reward or simulation acceleration was used.
A prior diagnostic tried native pointer focus on the outer title and also failed;
that setup was removed. It is not the final keyboard oracle.

Before this blocker, the eighth trial verified the exact 16 runtime leaves and
separate wrapper served from the production base path against the existing fresh
`Web-20261005T124312Z-041935` receipt. Receipt, source-lock, manifest, wrapper and
runtime hashes match the T-05 identities above. Genuine `ST_LS_STATE ready`,
`ST_LS_HUD_LAYOUT`, wasm/data requests and actual WebGL renderer were observed
after native launch. Native splash dismissal emitted `st:splash-dismissed`.
Fresh global startup stayed First Salvo under Skirmishes; opening Campaigns
selected Last Stand without requesting Unity runtime assets. Ash Road remained
selectable and remembered, compatible Ash Road remained resumable, remembered
Skirmishes selected Standard Duel, exact Return outranked remembered Ash Road,
validated ST1 outranked remembered Ash Road, invite outranked ST1 and exact Return,
rejoin outranked ST1, and invalid mixed inputs retained remembered Ash Road.
The wide wrapper disclosure/Return and actual HUD controls were in bounds.

Obligation disposition on this source:

| Native obligation | Observed status |
| --- | --- |
| AC-07 route/default/Ash Road preservation | COVERED for the recorded route cases; viewport-wide entry proof remains partial. |
| AC-08 disclosure/no-award abandon/pending-save honesty | MISSING end-to-end: entry disclosure observed, but keyboard blocker stops unfinished exits, pending reload and storage probes. |
| AC-10 maintained entry/CI selection and runtime binding | COVERED for shared wiring, local policy selection, exact served bytes and genuine scene readiness. |
| AC-10 keyboard, full viewport matrix, no-award exit, one claim/purchase/stronger redeploy, faults, audio/cadence/CDP movie | MISSING in the new shared result: keyboard is RED and downstream checks are unexecuted. |

The new shared journey has no passing full-flow result, no measured new audio
energy/cadence/movie result, and no complete new viewport result. Older CP-01
captures and their counts above remain historical proof at their original source.
The original freeze did not rerun the exact normal Python entry. Root's subsequent
independent declared entrypoints both failed native Tab, as did the fresh author
corrective reruns below. This handoff is implementation and RED evidence, not
native task acceptance.

All eight diagnostic attempts are retained separately. The third and fourth
attempts ultimately report closed-target locator waits on the obsolete
`standard-quick-duel` item. The earlier author's IndexedDB-deletion/setup inference
is preserved as diagnostic attribution, not their recorded final failure or
cancellation proof. Their owned Chrome PIDs
were checked against their recorded temporary profiles and stopped manually to
trigger cleanup. Those manual stops are limitations of those earlier attempts,
not automatic cancellation proof. The setup now uses an ordinary store
transaction and explicit 10-second action timeout. The eighth failed trial
automatically closed its owned browser and removed its temporary profile in
`finally`; its `browser-profile.json` records `status: removed`. The Playwright
production server also stopped. No relevant listener remained at 4173, 5173,
5198, 5199 or 5200 at handoff. An `afterEach` cleanup hook covers the shared
driver's registered browsers; cancellation/forced-worker termination has not
been independently exercised and is not claimed proved.

Root owns the proposed wrapper correction and its scope/verification admission;
T-06 did not edit generator/template, wrapper, manifest, C#, scenes or art and did
not export Unity. No dependency install, stage, commit, push, PR mutation, merge,
publication or deployment occurred. Owner A/B keep/change/mix, normal-speed motion,
listening and whole-feature acceptance remain pending. Browser viewports do not
establish real device performance. Native review admission remains unavailable
because the installed contract requires the absent V1 reviewer producer; ordinary
independent coverage/security audits and fresh native verification remain pending.

TDD Phase 4 remains blocked. This JS/browser/Python verification surface is
unmentioned in the complete current tech-stack Testing/Coverage passage quoted
above under Governance and coverage limits. That passage declares client Vitest
coverage and browser checks, but no numeric profile for this shared harness.
No numeric coverage percentage or passed exemption is claimed. The independent
auditor's retained H-03 supplement corrects its original HIGH: test-support-only
T-06 does not alter the declared production denominator and has no additional
numeric gate. H-03 remains an advisory documentation gap; meaningful behavioral
and mutation evidence remains required, and Phase 4 still has MISSING obligations.
Stage 1 client coverage retains its declared line/branch profile and 60% floor.
The current tech-stack command table says lint is “**None.** No
ESLint/Prettier/Biome config or script. `tsc --noEmit` (strict) is the static
gate.” A fresh `npm run typecheck` passes; syntax checks for both new JavaScript
files pass. Fresh CI policy and exact named selection outputs are retained in
`campaign-unity/Evidence/last-stand-playable-loop/t06/freeze-20261005T200020-91dee7/`.
These static results do not clear the real keyboard failure or accept T-06.

## T-06 bounded corrective evidence — 2026-10-05 local / 2026-10-06 UTC

The independent security and coverage reports remain unchanged in the continuation
folder. The coverage H-03 supplement is also preserved separately; it does not
waive the native Tab failure or any missing gameplay outcome. Only the eight
T-06 paths were corrected. Generator/template, staged wrapper/manifest, runtime,
save schema and economy remain outside this author's edits.

All correction command outputs are retained in
`campaign-unity/Evidence/last-stand-playable-loop/t06/correction-20261006T010000/`.
`guards-and-proxy-red.log` reports 16 tests with seven genuine failures against
the wired JS owners: credentialed entry, missing startup proxy, external origin
before fixtures, broad backend fulfilment, followed redirects, response bounds
and whole-scope error masking. `guards-green.log` then reports 16/16.
`junction-red.log` separately proves an existing task-owned junction could escape
lexical evidence containment. The current resolved-ancestor guard rejects it
without writing outside the evidence root. `guards-final.stdout` reports 21/21,
zero skips, including the original five workflow policy tests and sixteen JS
boundary cases. Tests import the actual helper used by both entrypoints.

Native Chrome now receives the existing `127.0.0.1:9` deny proxy before startup,
with explicit loopback bypass, while retaining its sandbox, native default
context and `noDefaults:true` focus contract. Node byte preflight validates the
exact local origin/base, refuses credentials/navigation/path escape and every
redirect, and bounds each response to 15 seconds and 128 MiB. Fixture routing
checks origin first; only the exact same-origin GET rejoin query is fulfilled.
Unexpected backend methods/endpoints and award requests fail. Loader faults
target the exact current manifest leaf. Expected errors require exact scope,
load, request identity and specific message; unrelated console/page/HTTP/request
errors fail in every scope. Unknown future wasm/storage errors remain failures
until their actual evidence is classified; no broad fault exemption remains.

With `LAST_STAND_BOUNDARY_NATIVE=1`, the same Node test command additionally
registers three real transport/process probes, yielding 24/24 and zero skips.
Without that environment variable these probes are not registered. Raw
`boundaries-current.stdout` and `.stderr` are the current-source command output.
The calibrated owned nonloopback sink receives zero requests from real page
fetch, dedicated Worker fetch, WebSocket, rejected Node preflight and a redirect.
These measured transports and startup proxy are the proven boundary; this is
not exhaustive browser-background-service or packet-capture proof. No provider
or external backend was used. Sink, loopback page and browser/process identities
are recorded in each unique `boundary-*/boundary-result.json` and cleanup receipt.

Owned browser and artifact process trees have detached supervision using observed
PID, creation identity, executable and ancestry, bounded stop/timeout, verified
descendant exit, and resolved temporary-profile containment before deletion.
Windows deletion uses native `Remove-Item -LiteralPath` after same-shell absolute
target validation. Cleanup errors are retained in a failed result before they
propagate. The real lifecycle probes cover native CDP admission failure, Python
timeout killing a task Node browser-owner, and supervisor timeout stopping an
actual child/grandchild HTTP listener. The ordinary teardown-error retention
branch is separately exercised. Exact forced Playwright-worker termination,
signal branches, spawn/fast-exit admission races and Linux lifecycle execution
remain MISSING; these probes do not claim those outcomes. Old manually stopped
trials 3/4 stay explicit limitations.

Fourteen focused removal/inversion mutants fail their corresponding named
assertions in `mutations-2026-10-06T00-42-54-190Z-7a4f253f/`. Its identical import
layout first passes the GREEN baseline; only the helper ROOT constant is rebased
to the actual checkout. Source/test hashes and the final freeze are bound by
`qualification-binding.json`. Mutants qualify locality, startup proxy, resolved
evidence containment, fixture origin, transport method, redirect/size refusal,
served bytes, readiness, input coordinates, same-load 304, fault-scope errors,
process ancestry and cleanup-result retention. The earlier input-coordinate
deletion produced a syntax failure; that trial remains retained and excluded.
The corrected inert replacement fails the actual coordinate assertion. These
support-boundary outcomes establish no global coverage percentage or gameplay
acceptance.

Both exact declared entrypoints were rerun on the corrected helper. Playwright
exits 1 at `outer control reachable by native Tab`; Python exits 1 from that same
named journey. Their raw `.stdout`, `.stderr` and `.exit.json` files use the
`declared-playwright` and `declared-python` prefixes. The maintained result is
`journey-2026-10-06T00-43-04-519Z-923b33ed/result.json`; the Python artifact runner
is `artifact-2026-10-06T00-45-20-010Z-db3f9df7/`, with its own nested journey and
honest `runner-result.json`. Both additionally retain an actual healthy
UnityCache `Cache.put()` NetworkError in `browser_evidence.consoleErrors`.
The same Cache.put error and missing Content-Length warning are present in the
retained eighth trial and root's first independent exact run. This is a preserved
earlier observation newly surfaced by the honest classifier, not evidence of a
correction-caused regression. Its cause remains unresolved / NEEDS-TRIAGE.
Neither result is healthy or a full-flow pass, and the
classifier does not exempt that error.

Before native Tab blocks progression, both current journeys observe the eleven
route cases plus wide/standard/compact Campaigns entry: Last Stand appears first,
has a rendered primary launch action, native keyboard Launch is reachable, and
the entry has no horizontal overflow. The compatible Ash Road record is read
from its existing IndexedDB owner, then preserved exactly through real Last Stand
launch: both serialized-byte hashes are
`5615103b4d621afdde68116438c0eeafa33c23dd265ef9525b0404ad5e1abef5`.
This binds the serialized record, not IndexedDB database-file bytes. Preservation
through native Return and actual Ash Road resume are authored downstream but
MISSING while the genuine keyboard gate is RED.

| Obligation | Current outcome |
| --- | --- |
| AC-07 recorded priorities, first/primary Campaigns placement and wide/standard/compact keyboard Launch | COVERED by current public-control observations. |
| AC-07 Ash Road record across Last Stand launch | COVERED for exact stored-record serialization; native Return and actual compatible resume MISSING. |
| AC-08 entry disclosure and native disclosure bounds | COVERED before the keyboard failure; no-award exits/pending-save/Retry MISSING. |
| AC-10 one shared entry, ordinary product CI policy, exact runtime16/wrapper/readiness | COVERED locally; no hosted CI or candidate execution pass. |
| AC-10 full Unity viewport/keyboard, abandon/reload, defeat/Claim/purchase/stronger redeploy | MISSING / RED. |
| AC-10 real load/storage recovery, rendered audio, cadence and CDP movie | MISSING; downstream unexecuted. |
| Harness network/refusal/mutation boundaries | COVERED for the explicitly named current tests; no exhaustive egress or numeric percentage. |
| Cleanup | COVERED for observed Windows lifecycle/failure/timeout branches; remaining branches listed above MISSING. |

Fresh static typecheck and JS syntax checks pass. Final correction freeze and
cleanup/hashes are retained separately under the same ignored t06 evidence root;
old freezes/results are preserved. This is a bounded RED implementation handoff,
not T-06 completion or native acceptance. Root owns wrapper recovery, independent
final verification/reviews and native state. Candidate workflow/config bytes and
their byte-verification requirements remain preserved. Native V1 review authority
is still unavailable here. Owner A/B/motion/listening/whole-feature decisions,
real-device performance, hosted CI, commit/push/merge/publication/deployment and
remote live-player acceptance remain separate and pending.

## 2026-10-07 diagnostic repair and current player result

The bounded audio diagnostic helper now retains current-document/context,
recorder/timer, sample-window and error observations before failure. Persistence
failure cannot replace the original journey error or an earlier cleanup error;
failed writes are retained honestly in memory, without claiming a saved report.
The final helper SHA256 is
`0e1872e19c8e3812d750053573c2de210555508b0d9009a7e13739db75b4a72c`;
the unchanged corrective RED/GREEN tests are
`ae1884aafc022801b8576ebab2e56f720509e22c04fb064acd1ed1e68e10cd9a`.
Strict typecheck passes. Fresh independent qualification passed 37 maintained
cases, the copied-layout baseline, 13 intended semantic mutations and a
13-case persistence matrix. The complete external corrective report is
`C:/Users/brenn/codearbiter-review-integration-20261006/t06-audio-diagnostics-persistence-coverage-20261007T111550Z-c0586484/report.md`
(SHA256 `e81c592c6feef7325d538d00b9ffd5c9aae1bead79221546fed84de0546a193d`).
This qualifies the diagnostic repair, not the whole player journey or numeric
coverage, native acceptance or hosted CI.

Root ran the unchanged Python entry on the actual packaged runtime from
2026-10-07T11:23:59Z; it failed after 160.24 seconds. Source pins remained
unchanged. Current evidence is under
`campaign-unity/Evidence/last-stand-playable-loop/t06/artifact-2026-10-07T11-23-59-625Z-dbad0bdc/`,
with journey `journey-2026-10-07T11-24-08-012Z-557c9b61/result.json`
(SHA256 `e1e080ae849b5025ada6323b7038b5d39c82fdc72a4c47936b524e4f8635291d`).
The 395 checks include 394 passing observations before the unchanged
`enough measured rendered WebAudio samples` failure at the real purchase.
Native Return and actual Ash Road resume, unfinished-run exit/reload without
reward, the layout matrix, defeat/pending reload/one Claim and a successful
one-salvage purchase committing level 1 and 30 damage now execute in this run.
Later purchase reload, stronger redeploy and load/storage-fault checks remain
unexecuted; earlier failure notes above retain their historical bindings.

At failing load 17, the page was focused and visible, its audio observer was
present and supported, and no observer error occurred. It retained zero captures
and zero samples in the exact inclusive 7054.5..8014.2ms purchase window, still
requiring five samples. This is distinct from the working load 16 recorder and
timer. Console retains `unlock=purchase` but no purchase event. A stale runtime
focus/audio latch is a source-supported hypothesis, not a proven observed cause:
the runtime suspended bit was not retained. No C#, focus/audio policy, capture
admission, timing, threshold or gameplay change was made for this diagnostic.
The actual first-run rendered recording decodes cannon/impact and defeat audio;
normal-speed movies remain retained with every owner-acceptance flag false.
Current browser error lists are empty. Owned cleanup reports no remaining
processes and no cleanup error; the separate user preview remains running.

The user requested a real in-game UI. The separate
[Field Console draft](../../.codearbiter/specs/last-stand-game-ui.html) records
the generated direction and bounded UI proposal. Its readiness is not approval
or implementation, and it cannot confer acceptance of this failed loop. Runtime
cause, full-loop/native/hosted qualification and owner visual/motion/listening
acceptance remain pending.

The owner's subsequent background-play request is recorded in revision 4 of the
same Field Console draft, with new AC-09/10/11 and a narrow dedicated-runtime
write boundary. This is a proposed behavioral change to focus/timing and feedback
admission, separate from the completed diagnostic helper repair. Its native ready
validation passes, but it has no implementation or approved plan yet. Only the
dedicated Last Stand focus-suspension assertions may be replaced under that
feature's future approved contract; original diagnostic evidence, real audio
capture requirements, storage/progression checks and legacy/review suspension
guards retain their original meaning. No new player-run PASS is claimed.


## 2026-10-08 Field Console T-11 qualification attempt — BLOCK

This current-source attempt is distinct from all historical results above. The
installed `ArtifactClient` freshly validated `ST-LS-UI-SPEC` revision 5 and
`ST-LS-UI-PLAN` revision 30 as approved and verified their exact binding. The
spec normative SHA256 is
`64bb97154ea7fdc8f5f3872663b995d270cd6f0a2bdb7f7fd87c6fdd6b14d958`;
the plan normative SHA256 is
`cf63498b21bc0d08d5c9054b16891dc3bc286672d97605ae05f8bf77ede7c4d6`.
The actual task permits documentation updates and inspection of the four
maintained journey paths. It grants no driver, reference or runtime repair.

The exact command was `C:/Python314/python.exe -m unittest discover -s
campaign-unity/Tools -p verify_last_stand_loop.py -v`, with cwd
`C:/Users/brenn/st-art-pr`, HEAD
`61b0c9a3a2854597bdfdb5c1f667e2e78f3e20dd` and
`E2E_LIVE_URL=http://127.0.0.1:5198/singedTerra/`. The unchanged historical
adapter selected one worker and zero retries. This was one predeclared trial,
started at 2026-10-08T17:18:01Z. The Python command exited 1 after 6.4956 seconds;
its actual named test was
`test_defeat_buy_reload_redeploy (verify_last_stand_loop.LastStandWebTests.test_defeat_buy_reload_redeploy)`.
The Playwright child also failed its actual maintained journey title,
`Last Stand Campaigns journey preserves no-award exit and a stronger redeploy`.
No retry or later passing attempt replaces this result.

The original immutable runner is
`campaign-unity/Evidence/last-stand-playable-loop/t06/artifact-2026-10-08T17-18-01-261Z-6c284be4/`;
its original journey is
`journey-2026-10-08T17-18-03-187Z-008b17ea/`. Raw Python stdout/stderr,
exact argv/environment/source/tool identities, fresh SDK contextual pages,
the pre-run obligation checklist, diagnosis and final file seals are indexed
outside the checkout in
`C:/Users/brenn/codearbiter-review-integration-20261006/ui-t11-player-qualification-20261008-a1/`.
The driver retains its original unique evidence directories under its admitted
historical t06 root; no containment rule or evidence location was weakened.

The first assertion fails in `buildEncounterOracle` at
`e2e/helpers/lastStandJourney.mjs:261`: “Fresh actual model output differs from
portable reference”. Its existing source-bound production C# model/profile
compiled and executed successfully through the pinned Mono/Roslyn tools. The
failure precedes browser startup and all player checks. It is an oracle
serialization admission defect; it is neither gameplay RED nor a qualifying
player run. No production implementation was changed to create a failure.

Read-only byte diagnosis finds one exact three-byte difference. The decoded
packaged reference starts with UTF-8 BOM `EF BB BF` and has SHA256
`0109fbc1295db5045a7c884bfaf4f19c54d501ff2b2bee270831915f6bc7162e`
(654882 bytes). Fresh redirected output has no BOM and has SHA256
`30da268ba2ff52a27fd6819fc9e2dd59788eaf7a6531a925421a33f9a6cf8923`
(654879 bytes). Removing only that leading BOM from the reference produces
byte-for-byte equality with the actual output, including all 13904 CRLF rows,
every fitting/damage/tick/hull/counter field and every status. The first raw CSV
field differs as `\ufeffrepair` versus `repair`; there is no differing model
field after UTF-8 signature decoding. The embedded reference, fresh raw output,
all assertions and their original raw digests remain unchanged. The concrete
repair boundary is the shared T-09 helper's serialized output comparison and its
focused guards; T-11 does not edit that inspect-only path or regenerate reference
data. The helper's post-compile tool/source guard and final model binding file
are downstream of this assertion and were not reached.

Source admission still passes before and after the whole failed command:
`node scripts/assets/verify-last-stand-source.mjs` verifies 3304 available inputs
against source closure
`a561edc39aa3f7a110cd983bbb775d852dbcd0b9c14075a878816fff99844a40`.
The candidate remains `Web-20261008T143017Z-1ca66b`, with manifest SHA256
`4151c7885e0cbe9ba1279f842fc2e044c8c03cd6312aa0ea50ba9def36c1d03c`,
sanitized receipt SHA256
`5f9e3b5efb49be88dca1ca2a4a696c01d4a20967ba3524cc6aa2f47b80482fb9`,
source-lock SHA256
`c6aff05422554b40c181124a78bd39e8c56618c47ef608bf549bd2ef60f678c0`
and wrapper SHA256
`b6f948ef1c3be329e6fae9a558552f340ffa41ce6c3b333ecc178401b3c90b01`.
The maintained result binds identical packaged before/after bytes and checks
all 16 runtime leaves plus wrapper against actual served bodies during failure
cleanup. Its initial served preflight was not reached, so no before/after served
pair is claimed. The separately observed T-12 delivery remains its own evidence.
All captured task/runtime/source and executable hashes are unchanged during
the attempt. External export toolchain bytes were not remeasured here.

| T-11 obligation | Actual current attempt |
| --- | --- |
| AC-01 garage/fitting/Deploy hierarchy | MISSING; player branch unexecuted. |
| AC-02 live battle instruments, centre-clear and chrome limits | MISSING; no browser state, geometry or rendered capture. |
| AC-03 settling, pending reload and exactly-once Claim | MISSING; unexecuted. |
| AC-04 purchase/reload/stronger redeploy, cap/insufficient state | MISSING; unexecuted. |
| AC-05 genuine loader/wasm/storage recovery and honest status | MISSING; unexecuted. |
| AC-06 five-profile phases, target/text/contrast/state appearance | MISSING; no screenshots or measured fields. |
| AC-07 native keyboard/pointer/Return, no-award exits, Ash Road | MISSING; unexecuted. |
| AC-08 exact source/package admission and honest journey outcome | PARTIAL: source/package parity and cleanup served bytes pass; journey FAIL, full runtime/player readiness blocked. |
| AC-09 actual visible window blur/hidden elapsed/model equivalence | MISSING; unexecuted. |
| AC-10 explicit Pause/hidden terminal/manual Claim/save ownership | MISSING; unexecuted. |
| AC-11 nonempty rendered audio, silence/no replay/current purchase | MISSING; unexecuted. The original purchase-audio failure is unresolved by this attempt. |
| T-11 fresh independent scoped reviews and full passing journey | BLOCK; no passing completion-verification receipt or review authority is claimed by the author. |

The original journey report has zero checks, actions, keyboard actions,
screenshots, audio captures and lifecycle observations. Its failure diagnostic
explicitly reports absent page/capture with null sample fields, not measured
silence. There is no current motion, audio, cadence, five-profile geometry or
owner-review capture. Merely initializing `normal_speed:true` in the report
does not establish a recording. All listening, visual, motion and window owner
flags remain false/pending. The owned adapter cleanup retains zero remaining
processes and no profile was created. The separate preview PID 13656 remains
the existing task-owned listener on 127.0.0.1:5198.

Governance maturity remains Stage 1. The complete current tech-stack
Testing/Coverage passage is retained verbatim in the external
`coverage-profile-quote.txt`. It declares client Vitest V8 coverage with
`npm run coverage:client`, and does not name numeric coverage for this
JS/browser/Python harness or Unity surface. This documentation-only result
changes no production denominator. No numeric coverage, no-tooling exemption,
independent mutation PASS, lint/typecheck PASS, native completion or owner
acceptance is inferred. The tech-stack lint entry is “None. No
ESLint/Prettier/Biome config or script. `tsc --noEmit` (strict) is the static
gate.” No typed/runtime source changed in T-11. The documentation's whitespace
check is recorded separately and cannot clear the failed player gate.

Root owns any admitted T-09 recovery and fresh composed/delivered independent
coverage/native completion review. Whole-loop readiness and CP-01 acceptance
remain blocked; matching preview availability remains separately reviewable.
No staging, commit, push, PR, merge, dependency installation, publication,
deployment or owner-acceptance action occurred.


## T-11 corrected-source qualification — 2026-10-08, retained bootstrap failure

The single newly predeclared corrected-source real browser trial **FAILS**. The
unchanged historical command
`C:/Python314/python.exe -m unittest discover -s campaign-unity/Tools -p verify_last_stand_loop.py -v`
ran in `C:/Users/brenn/st-art-pr` against
`E2E_LIVE_URL=http://127.0.0.1:5198/singedTerra/`; its sole named
`test_defeat_buy_reload_redeploy (verify_last_stand_loop.LastStandWebTests.test_defeat_buy_reload_redeploy)`
failed and Python exited 1 after 20.054499 seconds. No retry, helper change or
synthetic focus/state was attempted. This is a bootstrap visibility timeout
before Last Stand gameplay; it cannot establish a gameplay defect or PASS.
The preceding failed serialization trial and every historical assertion remain
unchanged. The approved T-09 repair is changed evidenced input for this one new
trial, with separately refreshed T-10 normal proof; it does not erase trial one.

The complete original artifact is
`campaign-unity/Evidence/last-stand-playable-loop/t06/artifact-2026-10-08T18-40-48-448Z-d7082421`,
with child `journey-2026-10-08T18-40-50-496Z-5f5ec654`.
The external frozen packet is
`C:/Users/brenn/codearbiter-review-integration-20261006/ui-t11-player-qualification-20261008-b1`.
Its `REPORT.md`, complete original copy, raw Python/Playwright/Chrome streams,
source/result/tool indices, phase/profile index and seal retain the actual
failure. This ordinary author evidence grants no native completion/review receipt.

The actual stack is `focused` at `e2e/helpers/lastStandJourney.mjs:841`, called by
`goto` at line 876, `runLastStandJourney` at line 901 and the e2e spec at line 37.
After `page.bringToFront()`, the first `goto('')` waited 10000 ms for
`!document.hidden && document.hasFocus()` and timed out. Original diagnostics
report `/singedTerra/`, `hidden:true`, `focused:true`; both observed focus edges
also report hidden. Neither splash dismissal, public input, Campaigns selection,
storage fixture nor Unity launch was reached. The underlying OS/browser cause
is unqualified; root owns the next diagnosis after author lease release.

Chrome 154.0.8037.99 started in the unchanged native default context. The one
original diagnostic `failure-screen.png` visibly shows the undismissed classic
splash at 1280x720 (SHA256
`dfd26bfe3a2120881598aff7e2cdbd1f1a7ef70c53abd94783f469d10533bad7`).
It is separate from the empty matched screenshot array and qualifies no Last
Stand phase/profile. Browser console contains only two focus probe logs; all
14 page requests are classic shell/assets, with no Last Stand loader/data/wasm
request. No page/request/HTTP error was recorded. Native Chrome stderr retains
two missing registry-extension path warnings. Unity/player/loader diagnostics
are missing because their branch was unexecuted; absence is not a clean pass.

The repaired compiler admission now succeeds on actual naturally no-BOM output:
fresh compile/run exits 0, 654879 bytes, SHA256
`30da268ba2ff52a27fd6819fc9e2dd59788eaf7a6531a925421a33f9a6cf8923`.
The immutable 654882-byte reference retains SHA256
`0109fbc1295db5045a7c884bfaf4f19c54d501ff2b2bee270831915f6bc7162e`.
Original model binding retains 13904 rows, 13 fields, eight model profiles,
source/compiler/driver/executable/raw-output pins and exactly one optional
leading UTF-8 marker comparison. Every historical reference byte remains intact.

All 22 recorded checks pass: five source/export/inventory admissions and 17
served runtime/wrapper byte checks. Complete packaged before/after and served
before/after maps match exactly. Build remains `Web-20261008T143017Z-1ca66b`,
source closure
`a561edc39aa3f7a110cd983bbb775d852dbcd0b9c14075a878816fff99844a40`,
current UI binding
`6e9ac7cda982171ffe11ef56dbab89506ff2de340ec188838458e7f3d2f38318`.
Manifest, sanitized receipt, source lock and wrapper keep the previously listed
exact hashes. Source validators before/after each exit 0 and inspect 3304
available inputs. Selected source and actual Python/Node/Chrome/ffmpeg/ffprobe
pins remain unchanged; actual model compiler/run pins are retained. This is
runtime admission and preservation proof, not player qualification.

| Current T-11 obligation | Actual corrected-source trial |
| --- | --- |
| AC-01 garage/fitting/Deploy | UNEXECUTED; no Last Stand launch. |
| AC-02 battle state, HULL/time/kills/damage, clear center/chrome | UNEXECUTED; no runtime state or HUD geometry. |
| AC-03 settling, pending reload, one manual Claim | UNEXECUTED. |
| AC-04 purchase/reload/stronger redeploy, cap/insufficient state | UNEXECUTED. |
| AC-05 genuine loader/wasm/storage recovery | UNEXECUTED; startup splash is not a loader-fault fixture. |
| AC-06 five-profile phases, targets/text/contrast/control appearance | UNEXECUTED; no matched Last Stand capture or measured field. |
| AC-07 native keyboard/pointer/Return, no-award exit, Ash Road | UNEXECUTED; storage fixtures and public actions were never reached. |
| AC-08 source/package/served admission and journey | PARTIAL admission/parity PASS; current actual journey FAIL blocks readiness. |
| AC-09 visible window blur/hidden elapsed/model equivalence | UNEXECUTED; initial hidden bootstrap state is not the required interval. |
| AC-10 Pause >=10sec, background terminal/manual Claim/save ownership | UNEXECUTED. |
| AC-11 actual audio, silence/no replay/current first purchase | UNEXECUTED; zero captures/samples and null bounds are unmeasured output. |
| Full passing journey, fresh independent/native reviews | BLOCK; root owns current review and completion boundaries. |

All action, keyboard-action, matched-screenshot, audio and lifecycle arrays are
empty, as are states/encounters/hits/layouts/cues. `phase-profile-index.json`
retains every required phase at 1366x768, 1920x1080, 390x844, 844x390 and 720x640
as unexecuted. No actual normal-speed frames/movie/cadence or decoded PCM exist.
The initialized `normal_speed:true` is not recording evidence. The capture probe
is present/supported with zero errors, captures and samples; it cannot prove
silence or sound. Current source's single layout projection and font conversion
were inspect-only; without measured current HUD/canvas dimensions they establish
no rendered font, panel/chrome, contrast or focus bound. The original helper's
UNMEASURED fields remain untouched. All owner listening/visual/motion/window
acceptance flags remain false/pending.

Current SDK context ends complete:true across seven pages (62 records), with
approved spec r5 and plan r30. Legacy contracts and the complete current
Testing/Coverage passage are retained directly. No numeric coverage, exemption,
independent mutation PASS, native review receipt or subjective acceptance is
inferred. Only this documentation appendix is authored. The old 48 external and
19 original failed-trial leaves remain exact; the historical document prefix is
byte-identical. The unchanged cleanup removed the task-created profile and left
no owned processes. PID 13656 preview remains preserved. No task-start, lifecycle,
authority, definition, Git mutation, install, package/publication or human approval
action occurred. Whole-loop readiness and CP-01/owner acceptance remain blocked
or pending as applicable; root owns delivery and subsequent diagnosis/review.


## 2026-10-08 — current visible-console player trial: failed parent rejoin configuration

The single predeclared current-runtime trial used the unchanged command `C:/Python314/python.exe -m unittest discover -s campaign-unity/Tools -p verify_last_stand_loop.py -v` at `C:/Users/brenn/st-art-pr`, with `E2E_LIVE_URL=http://127.0.0.1:5198/singedTerra/` and the maintained default evidence parent. The named `test_defeat_buy_reload_redeploy` failed: one test, 28.311 seconds, exit 1. No retry ran. The retained original attempt is `C:/Users/brenn/st-art-pr/campaign-unity/Evidence/last-stand-playable-loop/t06/artifact-2026-10-08T21-47-43-627Z-7c34ab1f`; the complete copied record and indices are `C:/Users/brenn/codearbiter-review-integration-20261006/ui-t11-visible-console-player-20261008`.

The current source-bound package is `Web-20261008T211101Z-4edf12`, manifest SHA-256 `85371e9a71f0fcb3682562065235aae23beeee26bfbc741896fde28b0f4a96d7`. The recorded source/runtime preflight, genuine native focus/visibility, actual public pointer actions, eight completed route fixtures and fresh model compiler admission produced 64 passing recorded checks. The model comparison retains 13,904 rows, 13 fields per row, and only the previously admitted optional leading UTF-8 BOM normalization. These passing preconditions do not qualify the failed journey.

The first unmet route was **rejoin before validated ST1**, load 9. The unchanged locator for `[data-command-item="online"][aria-current="true"]` timed out after 10,000 ms at `lastStandJourney.mjs:887` / the route loop at line 924. Before that timeout the actual parent app emitted `supabaseUrl is required` from the lazily loaded Supabase initializer. The original locator error retains precedence. At failure the genuine document was visible and focused; this is different from the preserved earlier initial-visibility failure.

Bounded read-only diagnosis confirms both browser-public keys `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` exist and are nonempty in the primary checkout's `client/.env`. The owned worktree has only `.env.example`, no actual client production env file, and its inherited process lacked both keys. The served parent chunk initializes Supabase with `la(void 0,void 0)`. Existing intended public configuration was omitted from the normal parent build. Values and endpoints were neither printed nor copied; validity and usability of the existing values were not tested. No correction ran. The minimal proposed correction is a normal parent build with only those existing public keys in its build environment, preserving the current Unity export/package/source/tests and old loaded assets, followed by a verified owned preview refresh. Root owns that correction.

Unity launch was not reached: zero browser Unity payload requests, zero Unity state/layout/cue telemetry, and no gameplay-specific pointer/keyboard actions. Garage, Deploy, battle, actual five-profile HUD geometry, native background/hidden progression, explicit Pause, settling/Claim, purchase/reload/redeploy, load/storage recovery, cadence and Last Stand audio windows remain unexecuted. The sole 1280x720 failure image is a parent Command Center image, not a Last Stand phase capture. The parent-document audio observer was present, supported, error-free and recording, with 550 diagnostic samples; no Last Stand measured cue, decoded PCM, silence/no-replay interval or normal-speed movie was exported. All five-profile matched captures and owner visual/motion/listening/window decisions remain pending. Numeric C#/harness coverage remains unmeasured; the actual Testing contract is retained separately.

The maintained runner and owned Chrome cleanup report `stopped`, empty remaining process lists and removal of the isolated temporary profile. User tabs/storage and the owned preview listener were preserved. Full authored/source/tool/package/served inventories are unchanged except this append-only validation record; all earlier failed trials and sealed evidence remain exact. This entry records a genuine failed qualification, without native task completion or owner acceptance.


## 2026-10-08 — configured-parent player trial: failed stock fixture interception

Exactly one fresh changed-input trial ran through the unchanged `C:/Python314/python.exe -m unittest discover -s campaign-unity/Tools -p verify_last_stand_loop.py -v` in `C:/Users/brenn/st-art-pr`, with `E2E_LIVE_URL=http://127.0.0.1:5198/singedTerra/` and the maintained default evidence root. The named `test_defeat_buy_reload_redeploy` failed: one test, 29.305 seconds, exit 1. There was no retry. The original attempt is `C:/Users/brenn/st-art-pr/campaign-unity/Evidence/last-stand-playable-loop/t06/artifact-2026-10-08T22-34-41-674Z-b0638789`; exact originals/copies and indices are frozen in `C:/Users/brenn/codearbiter-review-integration-20261006/ui-t11-configured-parent-player-20261008`.

Fresh SDK contextual reads at budget 65,536 matched all 62 records across both complete pages and ticket `33832753de0a34649ed415d7a3b4163e03b3d8e52253718aa9331afc2f04ab46`, source epoch `360bcf87cc05250094d9c0347f976713bcff8e2505c3e2688bf34fb841c50211`. Current source, tools, 714 normal inputs, unchanged 18-leaf `Web-20261008T211101Z-4edf12` package, configured parent graph, 236 served leaves, predecessor backups and 120 fresh HTTP bodies were admitted. Both existing public values are present in the new parent initializer without printing them. T12's prior two delivery PASS and pending-media RED remain separate truth. Historical mutable preview-review/roadmap documents map to genuine exact retained pre-repair snapshots and their separately bound authorized current documents. Ordinary preflight mapping and helper-syntax failures occurred before the trial and remain preserved.

The original online-selection locator timed out after 10,000 ms at the **rejoin before validated ST1** fixture, load 9. The previous `supabaseUrl is required` error is absent. Genuine focus/startup, actual public pointer actions, eight earlier route cases and fresh model admission produced 64 passing recorded checks; the model retains 13,904 rows and 13 fields, with only the admitted optional leading UTF-8 BOM normalization. These preconditions do not qualify the failed journey.

Bounded read-only diagnosis identifies the exact isolated-test boundary: `routeLastStandRequest` in `lastStandJourney.mjs:666` requires the request origin to equal the loopback product origin **before** its stock rejoin fixture at line 669 can fulfil the matching GET `/rest/v1/rooms` and exact query. The actual configured Supabase origin differs from loopback. Four matching requests were locally aborted as `net::ERR_BLOCKED_BY_CLIENT.Inspector`; the route catch at line 832 records the boundary refusal. No backend request completed. The original selection timeout retains error precedence. This establishes fixture interception ordering in the deliberate isolated test, not a demonstrated user-game defect. No network policy, fixture, assertion, timeout or source change ran. Root owns the minimal helper correction: fulfil only the exactly declared fixture locally under a bound configured-origin/method/path/query check before general egress denial, retaining denial for everything else.

Unity launch remains unreached: zero browser Unity payload requests and zero state/layout/cue telemetry. All garage/Deploy/battle, five-profile geometry/screenshots, native background/hidden progression, explicit Pause, settling/manual Claim, purchase/reload/redeploy, recovery, rendered Last Stand cue/PCM/silence/no-replay, movies and cadence obligations remain unexecuted. The sole 1280x720 failure image shows the parent Command Center. The parent audio observer was supported, running and error-free with 550 diagnostic samples; no Last Stand measured audio or PCM was exported. Source/default visual metadata does not count as actual rendered measurement. Owner visual/motion/listening/window decisions and numeric C#/harness coverage remain pending/unmeasured.

Runner/Chrome cleanup reports `stopped`, empty remaining lists, and removal of the owned isolated profile. The user tabs/storage, listener PID 13656, current source/package/parent/preview, previous backups and all failed history remain preserved. Only this validation appendix changed; its 62,754-byte prior prefix (SHA-256 `6726efc9b8865570c4f6e3c3213de03dea9bd4364dd481d5084de0c99619f2c0`) remains exact. This is ordinary failed qualification evidence, not task completion or acceptance.


## 2026-10-08 — source-bound configured-parent player trial: failed visible-window transition

Exactly one fresh changed-input trial ran through the unchanged `C:/Python314/python.exe -m unittest discover -s campaign-unity/Tools -p verify_last_stand_loop.py -v` in `C:/Users/brenn/st-art-pr`, with `E2E_LIVE_URL=http://127.0.0.1:5198/singedTerra/` and the maintained default evidence root. `test_defeat_buy_reload_redeploy` failed: one test, 100.644 seconds, exit 1. No retry occurred. Original attempt: `C:/Users/brenn/st-art-pr/campaign-unity/Evidence/last-stand-playable-loop/t06/artifact-2026-10-09T00-08-04-770Z-18eebf0a`. Complete originals/copies, command streams, screenshots, raw frames, model/tool/process receipts and indices are frozen in `C:/Users/brenn/codearbiter-review-integration-20261006/ui-t11-source-bound-parent-player-20261008`. All prior failed trials remain preserved.

The fresh SDK read used budget 65,536, all 62 records/two complete pages, ticket `33832753de0a34649ed415d7a3b4163e03b3d8e52253718aa9331afc2f04ab46`, source epoch `651af9ecf948e0c9da69509535dbb9a326f6af54cb3e468d072f146d9b7f0c1c`, and the unchanged approved identities. Source, tools, 18-leaf `Web-20261008T211101Z-4edf12` package, configured parent, 236 served leaves, three predecessor inventories, listener PID 13656 and 120 fresh HTTP bodies were bound. The historical normal-build 714-input receipt remains immutable: 713 current inputs match and only the already admitted T09 guard transition differs; no current whole-normal-check PASS is inferred or producer rerun performed. The helper/guard correction and its finite boundary checks are separately frozen. The prior numeric infrastructure question is now reported by root as inapplicable; separate C# numeric/profile qualification remains unmeasured, with no coverage or readiness claim.

The configured rejoin fixture now passes. Unity genuinely loaded and the real public controls produced 707 passing recorded checks before the next original wait failed. Eleven route cases, three native Deploy activations, two native keyboard Pause activations, actual no-award Return/reload, compatible Ash Road Resume, baseline damage 20 and first-foe hull 10 were reached. Actual garage/battle captures and HUD control bounds converted once from backing pixels to CSS passed across 1366x768, 1920x1080, 390x844, 844x390 and 720x640, with 44-pixel targets, non-overlap, wrapper overflow and reachable Return/disclosure checks. There are 51 phase/focus screenshots; garage and battle cover 10 of 25 required base phase/profile pairs, plus paused battle at all five profiles. Source panel/font math is not rendered panel/font/contrast measurement; those remain unmeasured and focus treatment awaits rendered review.

Explicit Pause held across the genuine hidden-tab interval: 17,992.2 ms were excluded from combat with no automatic resume, and deliberate resume produced 27 ticks. Its no-replay window retained 517 rendered audio samples, maximum/mean RMS 0, and no cue events. Measured cannon/impact output was nonempty (39 samples, maximum RMS 0.1995176531); mute and paused sound each measured RMS 0; resume had no deferred burst under the unchanged threshold. The observer remained supported, running and error-free; failure diagnostics retained 1,913 samples. This is actual rendered-energy/silence evidence, not decoded PCM or complete cue qualification. No audio export completed.

The original failure is `TimeoutError: page.waitForFunction: Timeout 10000ms exceeded.` at `lastStandJourney.mjs:1104`, `away('blur',6000)`, called at line 1175. The helper creates an owned second native window with `Target.createTarget(newWindow:true)`, navigates `about:blank` and calls `bringToFront()`, then requires `!document.hidden && !document.hasFocus()`. That wait never completed, so the active blur interval had not begun. The retained failure diagnostic is visible/focused. Its outer catch runs after the `away` finally closes the other page; this final diagnostic cannot prove no transient blur occurred. The original stack/timeout retains precedence. No transition HWND/second-window focus receipt establishes the OS-versus-browser activation cause, and no game background-clock defect is inferred. The smallest next boundary is real owned native-window activation/observation in the maintained helper, retaining the genuine predicate and timeout. No focus/visibility emulation, source/test change, network enablement, fresh browser experiment or extra trial ran.

Active blur/hidden progression equivalence, hidden terminal/manual persisted Claim, settling/defeat/workshop/recovery geometry, purchase/reload/stronger redeploy, loader/wasm/storage faults, all five cues, defeat/purchase-after-focus PCM and final cadence checks remain unexecuted. The original screencast retained 846 raw independent CDP frames and timestamps; encoding/final normal-speed movie/audio mux did not run. Owner visual/motion/listening/window decisions and whole-loop qualification remain pending. The real model oracle retained 13,904 rows/13 fields under the original optional-leading-UTF-8-BOM-only comparison.

Runner and Chrome cleanup both report stopped with empty remaining lists and the owned isolated profile removed. User tabs/storage, listener and predecessor copies remain untouched. Only this validation appendix changed; its 67,168-byte prior prefix remains exact with digest recorded in the preservation index. This frozen failed qualification is ordinary evidence, not task completion, native acceptance or owner approval.


## 2026-10-08 — current-window diagnostic-input original player trial: failed visible-window transition

Exactly one predeclared changed-diagnostic-input original trial ran through the unchanged `C:/Python314/python.exe -m unittest discover -s campaign-unity/Tools -p verify_last_stand_loop.py -v` in `C:/Users/brenn/st-art-pr`, with `E2E_LIVE_URL=http://127.0.0.1:5198/singedTerra/` and the maintained default evidence root. The sole named test failed: one test, 100.478 seconds, exit 1 (external elapsed 100.617 seconds). No retry occurred. Original attempt: `C:/Users/brenn/st-art-pr/campaign-unity/Evidence/last-stand-playable-loop/t06/artifact-2026-10-09T01-19-36-900Z-3e800816`. All 965 original leaves and exact copies, raw Python/Playwright/input/event/runtime streams, captures and bindings are frozen in `C:/Users/brenn/codearbiter-review-integration-20261006/ui-t11-current-window-diagnostic-player-20261008`. All prior failed trials remain preserved.

Fresh installed SDK reads consumed all 62 records and two complete pages at budget 65,536, retaining ticket `33832753de0a34649ed415d7a3b4163e03b3d8e52253718aa9331afc2f04ab46` and current source epoch `cd521abcd43c5d2ac66ea99d1def960ad523907e9c39c284853e8f193f7c24d2`. The unchanged approved SPEC5/PLAN30 identities, selection and actual critical contracts were verified. Current helper 03b5/guard 680, 3,304 Unity sources, the 18-leaf `Web-20261008T211101Z-4edf12` package, configured source-bound parent, 236 served leaves, three backups and listener PID 13656 were bound, including 120 fresh HTTP bodies. The 714-input historical normal proof retains its admitted 90a-to-6b-to-680 guard transitions. No current T10 normal PASS is inferred; its binding remains untouched and ROOT owns refresh. An external preflight lookup failure after successful SDK capture was preserved, corrected only in that external wrapper, and read-only preflight resumed before player execution. It is not a target RED or native authority.

All 707 recorded checks passed before the original visible-unfocused predicate failed. Eleven routes, three native Deploy activations, two keyboard Pause activations, native Return/no-award Return/reload, actual Ash Road Resume, baseline damage 20 and first-foe hull 10 were reached. Actual garage/battle and paused-battle control bounds and captures passed across 1366x768, 1920x1080, 390x844, 844x390 and 720x640 under unchanged 44-pixel target, overlap, wrapper and Return oracles. The 51 captures cover 10 of 25 required base phase/profile pairs, plus paused battle at all five. Rendered panel area, fonts and contrast remain unmeasured; focus treatment awaits rendered review.

Explicit Pause excluded 18408.4 ms across a genuine hidden-tab interval; deliberate resume produced 36 ticks with no automatic resume. The actual no-replay window retained 517 audio samples, maximum/mean RMS 0 and no cues. Cannon/impact output was nonempty (39 samples, maximum RMS 0.1995176531); mute and paused sound measured RMS 0. Resume passed the unchanged no-deferred-burst threshold. The actual observer remained supported, running and error-free; failure diagnostics retained 2033 samples. These rendered-energy observations do not establish decoded PCM or complete cue qualification. Audio export was not reached.

The exact failure is `TimeoutError: page.waitForFunction: Timeout 10000ms exceeded.` at `lastStandJourney.mjs:1218`, `away('blur',6000)`, called at line 1297. After creation/navigation/bringToFront of the owned second native window, `!document.hidden && !document.hasFocus()` never completed; the active-away begin clock had not been recorded. The new actual snapshot precedes auxiliary cleanup: targets 7B3EA1CFD5ACA865581AB8ECC366A574 and E013A427AA48F7ACB82DA73D835F2F85 remained open in context 3C88EBBFA269132601D463836F7EFAF0, with distinct CDP windows 1728149012/1728149016 uniquely bound to visible, nonminimized HWNDs 18156752/18744640 under owned Chrome PID 59584. Sequential original and auxiliary document samples were both visible/focused; they are not simultaneous. Passive native foreground HWND 18680872/PID 61724 was outside owned Chrome. A motion handle was present; actual CDP capture state remains unknown. Diagnostic and auxiliary cleanup errors are empty, and the original timeout/stack retains precedence. No late original focus/visibility edge was recorded after the pre-away observation.

The independent capture OFF/ON inert comparisons both passed document handoffs while native foreground remained outside owned Chrome. They established no original-timeout cause or repair. This current failure establishes the owned-window/document boundary, not why it failed. OS activation versus browser/CDP/document semantics and any gameplay/capture contribution remain unknown. No game-clock defect, guessed correction, source/config/test/timeout/flag change, focus emulation or additional trial is inferred or performed. ROOT owns any evidence-supported scoped correction.

Active blur/hidden equivalence, hidden terminal/manual persisted Claim, settling/defeat/workshop/recovery geometry, purchase/reload/stronger redeploy, loader/wasm/storage faults, defeat/first-purchase-after-focus PCM, all five cues and final cadence remain unreached. The 883 actual independent CDP frames and timestamps survive; final normal-speed movies/audio mux were not reached. Initialized normal_speed metadata and source-only font/panel math are not rendered or motion acceptance. The actual model oracle retained 13,904 rows/13 fields under the unchanged optional-leading-UTF-8-BOM-only comparison. Owner visual/motion/listening/window decisions, numeric C# coverage, native acceptance and whole-loop readiness remain pending or unasserted.

Runner and browser cleanup report stopped with empty remaining lists; the exact isolated owned profile is removed. User tabs/storage, listener and predecessor assets are untouched. Only this validation appendix changed. Its 72,737-byte historical prefix remains exact at SHA256 902b1617df6e30730dc3f971bd6f17caf037159d8be0aca8b53fb3ffaafdb0cd. This frozen failed qualification is ordinary evidence. The SDK/source/native-browser lease returns to ROOT for strict integrity, T12 media and native/all12 review.

## 2026-10-09 physical-caption T-11 gameplay trial: FAIL

The single predeclared unchanged `C:/Python314/python.exe -m unittest discover -s campaign-unity/Tools -p verify_last_stand_loop.py -v` invocation ran in `C:/Users/brenn/st-art-pr` against `http://127.0.0.1:5198/singedTerra/`, with the default evidence parent unset and existing public configuration present only in its subprocess environment. The named test `test_defeat_buy_reload_redeploy (verify_last_stand_loop.LastStandWebTests.test_defeat_buy_reload_redeploy)` failed, exit1 after 102.772s. Playwright ran its one maintained title with retry0. Original 660/605/600s deadlines, 10000ms focus wait and all model/economy/save/input/audio/frame assertions remain unchanged. No second trial or repair occurred.

All707 recorded checks passed before `away('blur',6000)` timed out on the actual visible-unfocused predicate at `e2e/helpers/lastStandJourney.mjs:1545`, callsite1626. The primary timeout and original stack retain precedence. This attempt has one actual auxiliary owned-caption SendInput activation: verified native foreground HWND42208540/PID50976, one separately measured physical move/down/up, INPUT40/sent3/balanced true/cleanup0, physical cursor/root/PID/HTCAPTION2 proofs before each button event and PMv2 enter/verify/restore true. The original-window return activation was not reached. Before auxiliary cleanup, both distinct owned targets remained open in the same browser context; sequential original and auxiliary document samples both reported visible/focused, while native foreground remained the auxiliary owned HWND. Motion handle was present; CDP capture state was unknown. Diagnostic and auxiliary-cleanup errors are empty. These are preserved observations. Their underlying cause, any gameplay/capture contribution and OS/document semantics remain unresolved.

The final actual browser classifier also retains three UnityCache `Cache.put()` network-error messages at loads15/16; request/HTTP error arrays are empty. They remain secondary failures, neither suppressed nor substituted for the original timeout. No cache diagnosis or corrective action occurred.

Reached: eleven routes, real Unity load, actual native no-award Return/reload and public Ash Road Resume with exact record preservation, native Deploy/mute/Pause, baseline20 damage leaving the first foe10 HP, five-profile garage/battle/paused geometry, and explicit Pause excluding 17991.7ms with23 deliberate-resume ticks. Measured cannon/impact output and mute/Pause silence/no replay passed their executed windows. The51 screenshots cover10/25 required base phase/profile pairs. Active blur/hidden progression equivalence, settling/result/Claim/pending reload, purchase/audio/reload/stronger redeploy, background terminal, loader/wasm/storage recovery and remaining profiles are unreached. All846 raw CDP frames remain. No completed movie, exported recorded audio, decoded PCM or final cadence evidence exists. Rendered panels/fonts/contrast remain unmeasured. The supported active audio observer had2119 samples at failure; that metadata cannot qualify unreached cues or decoded audio.

The original attempt is `campaign-unity/Evidence/last-stand-playable-loop/t06/artifact-2026-10-09T05-24-27-320Z-4c3c4dc8/journey-2026-10-09T05-24-29-458Z-cbf62dbc`. All928 actual original leaves and hash-exact copies, raw Python/Playwright streams, runtime/input/event/route receipts, before-cleanup observations, phase/profile index and source/tool/preservation records are frozen at `C:/Users/brenn/codearbiter-review-integration-20261006/ui-t11-physical-caption-gameplay-20261009`. The fresh actual SDK read consumed62 complete contextual records/two pages, ticket33832753de0a34649ed415d7a3b4163e03b3d8e52253718aa9331afc2f04ab46, original approved SPEC5/PLAN30 and source epochaad5b1d63106d85a3cb3e02e63518c5bf517b394161fefb4c9df28fe5cafed41. Actual legacy/frontend/TDD/verification/coding/security contracts resolve the packet's missing-provenance flags; the optional code map is absent.

Current source3389 has only this append; the78984-byte prior document prefix SHAff41266eb737a68d4947aaf6059829438c3e0259a8a022e752e165bb7cb57b89 remains exact. Unity3304/normal714/package18/served244/backup236, current four-source pins, documentary binding2d119add22e5b27fe29358df550afec8b11b3f56a63e1d3f05098e617d727144/current normal receipt73a511e5fc2a1b1510ff20afdfcc85d8f7b6c8d2a1055a6f4f9ad960328ea01a, bound tools, historical5734 and earlier seals/evidence remain exact. Existing preview listener13656 remains. Original runner/Chrome cleanup stopped with empty remaining lists and removed only the exact task profile. User IAB tab5 and its save were untouched. Whole-loop readiness, current broad/native/independent/numerical and owner visual/motion/listening/window acceptance remain pending. This failed ordinary evidence supplies no authority or task/scope transition. No Git/install/publication or SDK lifecycle action occurred.

## 2026-10-09 original-foreground T-11 gameplay trial: FAIL

T11 original-foreground gameplay: FAIL

One unchanged original Python invocation failed, exit1 after 186.044s; maintained Playwright retry0. The primary error is `AssertionError: enough measured rendered WebAudio samples` at helper1300, measurement1266, journey1651. There are472 recorded checks:471 pass/1 fail. No second trial or repair occurred.

The actual healthy load16/document origin1791536368822 observer was present/supported/error_count0, with0 captures and0 samples. Its failed inclusive window is20994..22250.09999999404ms, minimum5 samples; the final before-cleanup document diagnostic repeats0 captures/samples and visible/focused true. This establishes no observed mirrored rendered audio, and does not establish a cause. The recorded first-hit PASS consumes load15/origin1791536308831.7; final Deploy is load16/new origin/runId3/sessionRun1. Complete telemetry retains one hit and two cannon/impact cues, all old load15; current-document hit/cue rows are empty, including the failed window. Current console rows867–871 contain five AudioContext/autoplay warnings, followed by row887's AudioContext resume after2.427seconds, absolute1791536371666/current t2844ms, before the measurement window. Autoplay and cross-document selection remain observations, not causal proof. Exact diagnostic/window/event/console/source records are in bounded-audio-failure-observations.json and original-attempt.

Eight original HWND/PID foreground preconditions verified with activationNeeded=false. Last actual native sample binds original HWND168496426/PID48896 and visible/focused document before final Deploy. No auxiliary activation/away failure record was produced; that branch was unreached. Full actual CDP transport has one successful start/stop screencast and47 raw retained frames. All18,890 original reporter stderr chunks (18,888 text/two base64 buffers) are preserved losslessly as a full51MB worker stream. Strict UTF8/full line+JSON parsing closes18,888 messages/5,078 command-response pairs/8,732 events with no duplicate/unmatched/pending response. The empty runner stderr is a different stream. Original JSON and full chunk/line/message indexes remain; no raw protocol/media was printed. Earlier offline reader setup errors remain ordinary diagnostics, not target RED or new trials.

Reached eleven routes, real Unity, native no-award Return/reload and exact Ash Road record/public Resume, garage five-profile geometry and final Deploy.26 screenshots cover5/25 required base phase/profile pairs. Qualified current cannon/impact audio, mute/Pause/no replay, explicit Pause, active blur/hidden progression, terminal/Claim/purchase/redeploy/recovery and all later media/cadence assertions are unreached. Three actual UnityCache Cache.put console errors remain secondary; no request/HTTP errors. No exported movie/audio/decoded PCM exists. Owner visual/motion/listening/window and overall/native/numerical qualification remain pending.

Fresh actual SDK62 complete records/two pages, SPEC5/PLAN30, ticket33832753de0a34649ed415d7a3b4163e03b3d8e52253718aa9331afc2f04ab46 and source epochc99945eb8fc4064424a967cad605933568dc0f7550c6541469b5619b9746c9ac match. Full immutable contract/canonical body equality preserves prior consumption. The unchanged command retains660/605/600s,10000ms waits,6000/10500ms intervals and every maintained assertion. DEBUG=pw:protocol/PYTHONUTF8=1 were the authorized diagnostic settings, DEBUG_FILE/MAX_LOG_LENGTH/default evidence parent unset; public config was subprocess-only.

Only the validation appendix changes among3389 authored leaves, preserving exact83958-byte prefix SHA9d00a2ad6aa06d5a4ab70c540ff00537a37ea0624c8f7acf9d822da53a3405e2. Unity3304/normal714/package18/served244/backup236/current four-source/tools/binding4760a35c.../normalf3cbde51.../listener13656 and all prior5734 history/10712 protected records/prior seals stay exact except the explicitly retained current validation append. Owned Chrome/runner stopped with empty remaining lists and exact task profile removed; user tab5/save untouched. ROOT receives the lease after strict freeze. This failed ordinary evidence cannot advance T12, readiness or acceptance; no authority/lifecycle/Git/install/publication action occurred.

Frozen evidence: `C:\Users\brenn\codearbiter-review-integration-20261006\ui-t11-original-foreground-gameplay-20261009`; actual original attempt: `C:\Users\brenn\st-art-pr\campaign-unity\Evidence\last-stand-playable-loop\t06\artifact-2026-10-09T08-56-48-873Z-a800fb9c`. Full original source/transport remains external evidence; no supporting-body truncation replaces it.

## 2026-10-09 current-hit T-11 gameplay trial: FAIL

T11 current-hit gameplay: FAIL

One unchanged original Python invocation failed, exit1 after 261.031s, maintained Playwright retry0. The exact primary error is `AssertionError: Rendered background/return audio must be silent without replay` at helper201, noReplay1572, away1593, journey1670. All708 recorded checks passed; the direct no-replay validator then threw. These are distinct results. No additional trial or repair occurred.

The current deployment's first hit now matches load16/origin1791542182711.4, damage20/hull10; current cannon/impact output has39 measured samples/maxRMS0.20757977085784127. Mute/Pause silence and earlier no replay passed. Explicit Pause excluded33832.6ms with31 resumed ticks. The active visible-blur predicate genuinely reached, followed by two verified auxiliary/original owned-caption activations, separately measured move/down/up, INPUT40/count3/sent3/balanced true/cleanup0, cursor/root/PID/HTCAPTION2 proof and PMv2 enter/verify/restore. The earlier original foreground and stale-hit/audio failures remain immutable; this attempt makes no retrospective whole-loop causal claim.

The failed current audio window is91230.09999999404..99716.40000000596ms, load16/origin1791542182711.4. Its425 actual samples yield maximumRMS0.20270964742307307/meanRMS0.007404723487007595, failing unchanged0.0005 silence threshold. The actual existing global document blur is88118.59999999404 and original focus97038.40000000596. Complete original snapshot has446 samples in that unfocused interval, maxRMS0. All29 nonzero samples inside the asserted window are after original focus, first97676.40000000596/last99713; all six current cannon/impact/destruction cues in the window likewise follow that focus event. The asserted window includes134 post-focus samples until the recovered mark99716.4. This is an offline partition of actual recorded bytes, not an altered oracle or established runtime replay cause. Exact selected samples, full decoded snapshots/events, marks/response IDs/hashes, focus/visibility trace and source/native boundaries remain in full external records; the compact diagnostic is47152 bytes. ROOT owns subsequent cause/oracle diagnosis.

Before auxiliary cleanup, original/auxiliary are distinct open targets in the owned context: original visible/focused, auxiliary visible/unfocused. Native foreground is original HWND56429894/PID68244. Diagnostic and auxiliary-cleanup errors are empty. Motion handle is present/CDP capture state unknown in that original diagnostic. Full transport independently retains successful actual screencast commands and frames; no state is invented. The current supported recorder is still running, one capture/3775 samples at failure/finish_count0. No finalized audio/video/decode branch reached.

Reached eleven routes, actual Unity/native no-award Return/reload, exact Ash Road save/public Resume, garage/battle/paused five-profile geometry and the obligations above.51 screenshots cover10/25 required base phase/profile pairs;848 raw CDP frames remain. Active blur/hidden model-equivalence, terminal/manualClaim/purchase/redeploy/recovery, remaining profiles and final cadence/media are unreached. Three actual UnityCache Cache.put console errors remain secondary; request/HTTP errors are empty. Owner visual/motion/listening/window, native/numerical/overall qualification remain pending.

Original worker stderr text/base64 chunks are losslessly retained in full201658618-byte transport and original Playwright JSON. Strict UTF8/every complete line/JSON closes27489 messages/7637 command-response pairs/12215 events with no duplicates/unmatched/pending responses; no raw protocol/media was printed. The empty runner stderr is a separate stream. Fresh actual SDK62 full records/two pages, SPEC5/PLAN30 and current source epoch7abb4a6630aea6c5be5cff1328cba85bdb0ee7b60dbfdc1759b9e39c0ed50ac4 match the complete counted9993-byte input. Immutable full contracts/context bodies match prior consumption; no lifecycle/reset/reapproval or numerical waiver.

Only validation append changes among3389 authored leaves, preserving exact88638-byte prefix SHA4a4cd4d635df542d98facca30e5a7055c19c6fe8a3b1760b0313f3524f1132b2. Unity3304/normal714/package18/served244/backup236/helper23da6376/guardd5f577eb/current binding37dbb48a/normal9fdd9fdd/tools/listener13656/history5734/current T10 strict102 and11282 protected targets plus all prior failures/seals remain exact except the explicit live validation append. Owned Chrome/runner stopped, remaining lists empty, exact task profile removed; user tab5/save untouched. ROOT receives the LIVE lease after final append/preservation; final sealing uses standard-library frozen external files only. Failure blocks T12/readiness. No source/runtime/test/config, save/storage/backend/Git/install/publication/SDK authority action occurred.

Frozen evidence: `C:\Users\brenn\codearbiter-review-integration-20261006\ui-t11-current-hit-gameplay-20261009`; original attempt: `C:\Users\brenn\st-art-pr\campaign-unity\Evidence\last-stand-playable-loop\t06\artifact-2026-10-09T10-33-47-314Z-a4d4770e`.
