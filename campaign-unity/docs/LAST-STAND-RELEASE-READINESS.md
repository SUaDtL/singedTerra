# Last Stand release readiness

## Current qualification matrix

Updated October 30 for the [consolidation and screen-clarity sprint](../../.codearbiter/plans/last-stand-consolidation-and-clarity.html).
This is the current index of acceptance work. Each row has one
responsible area and an existing plan owner; the dated records below retain the
evidence and original failures. A result covers only its recorded source, package,
host and scenario. Completing an implementation task does not close a row.

The current playable candidate is **`Web-20261030T202703Z-cf836c`**. Its
[local validation summary](last-stand-consolidation/validation.json) binds the final
source/package hashes and identifies the local receipts. Unity WebGL packaging,
source admission, strict TypeScript/Vite and the complete portable inventory pass
(71 modules, 478 declared cases). The refreshed Research browser journey passes 13
checks with 12 screenshots; Planner passes 15 with nine screenshots. Both enforce
zero browser errors. Six quote checks, four imported Research checks, 23 imported
Controls checks, five actual observation packets through both readers and the
selected Node guard suites pass. These suites overlap and their counts are not
additive. The scoped independent Auth/Crypto and Security reviews pass, including the
CI fixture follow-up. Game C# and package bytes are unchanged by that repair.

**Local consolidation verification is complete within those scopes. Release
qualification remains incomplete.** The Windows native-background timeout,
current native/device, hardware audio, real-duration endurance and owner acceptance
remain open below. Exact final-head hosted CI remains pending. The pre-sprint head
`e0a71becc44143d1393206299521005c0a87ebde` passed
[CI 41088994426](https://github.com/SUaDtL/singedTerra/actions/runs/41088994426) and
[CodeQL 41088994464](https://github.com/SUaDtL/singedTerra/actions/runs/41088994464);
those results cover that baseline, not the new consolidation changes.
The first consolidation head `97b15c7a684d8f9fa86e2a7a524c3690c183135d` failed
[CI 41125483235](https://github.com/SUaDtL/singedTerra/actions/runs/41125483235):
three browser-matrix fixtures still depended on moved source. The repair and its
pre-install dependency regression now pass the exact local classifier cohort
(534 checks), affected verification cohort (492 checks), and independent import
policy cohort (51 checks). Research, Planner and the portable inventory were
rerun against the changed helpers. These local passes do not replace a successful
hosted run for the repair.
The player's declared `1.0` and repository `0.0.0` are not newly approved public
versions. Publication and store submission remain separate decisions.

| Acceptance obligation | Responsible area / plan owner | Current evidence and limit | Evidence needed to close |
| --- | --- | --- | --- |
| <a id="q-package"></a>**Q-PACKAGE — matching playable candidate** | Build delivery / [Architecture T-DELIVERY](../../.codearbiter/plans/last-stand-architecture-foundations.html#T-DELIVERY) | **Complete for this local candidate.** The [source lock](last-stand-web/source-lock.json), [packaging receipt](last-stand-web/receipt-sanitized.json) and [validation summary](last-stand-consolidation/validation.json) bind `Web-20261030T202703Z-cf836c`. Build, asset/source admission and production build pass; the sole reported preview at verification is port 4174 (PID 50400). | Rebind and recheck if source or package bytes change. This local export does not establish hosted CI, deployment or a native-platform qualification. |
| <a id="q-browser"></a>**Q-BROWSER — actual browser loop and background behavior** | Browser verification / [Waves T-QUALIFY](../../.codearbiter/plans/last-stand-waves-and-resume.html#T-QUALIFY) | [Final local browser receipts](last-stand-consolidation/validation.json) pass 13 Research and 15 Planner checks against the matching package, including closed-tab research completion, cross-tab ownership, queue/switch/suspend, bulk buying and pause. Ordinary fresh-profile and seeded cases are identified separately. The owned-Windows-browser native-background snapshot timeout remains unresolved. | Resolve the native-window background failure and complete remaining current-package ordinary earn/buy/clear/resume/invest and audio-admission branches. Headless passes do not replace the owned-window check or hide its failed branch. |
| <a id="q-windows"></a>**Q-WINDOWS — current native player** | Windows platform verification / [Architecture T-PLATFORM](../../.codearbiter/plans/last-stand-architecture-foundations.html#T-PLATFORM) | [Earlier native observations](#delivery-state-on-2026-10-28) cover controls, purchases and checkpoint/preferences restart on identified older players. [Combat-depth builds](last-stand-combat-depth/validation.json) do not prove current-player interaction. | Current native-player input/display checks, ordinary and abnormal termination/relaunch, research-clock behavior and retained checkpoint/preferences observations on an isolated profile. |
| <a id="q-android"></a>**Q-ANDROID — physical-device lifecycle** | Android device verification / [Architecture T-PLATFORM](../../.codearbiter/plans/last-stand-architecture-foundations.html#T-PLATFORM) | [Android build evidence](last-stand-combat-depth/validation.json) identifies a development APK and debug signature. No physical-device session qualifies the current candidate. | Install the identified candidate on a recorded device/OS; exercise fresh/returning profiles, background/foreground, forced termination, clocks, interrupted writes, preferences and hardware audio. |
| <a id="q-recovery"></a>**Q-RECOVERY — understandable save failure and retry** | Recovery/support UX / [Mechanics Shop T-22](../../.codearbiter/plans/last-stand-mechanics-shop.html#T-22) | [Architecture adapter checks](last-stand-architecture/validation.json) and browser ownership tests cover bounded corruption/conflict cases. They do not establish the complete packaged failure/retry/support experience on every supported target. | Actual-target failed-save, safe retry, conflict and restart journeys showing understandable status, preserved progress and useful diagnostics without sensitive data. |
| <a id="q-endurance"></a>**Q-ENDURANCE — real-duration farming and performance** | Performance verification / [Research T-QUALIFY](../../.codearbiter/plans/last-stand-research-and-farming.html#T-QUALIFY) | The [180-second smoke](last-stand-combat-depth/validation.json) is a development-profile diagnostic. Its frame/JavaScript-heap samples exclude full WebAssembly/native memory and thermal qualification. | Real elapsed farming against the approved 5x pacing goal, including sustained frame/memory/thermal measurements on declared targets and repeated save/recovery observations. Accelerated model runs and short smoke tests do not close this row. |
| <a id="q-balance"></a>**Q-BALANCE — earned progression and release content** | Game design/economy / [Combat depth T-BALANCE](../../.codearbiter/plans/last-stand-combat-depth.html#T-BALANCE) | The [balance summary](last-stand-combat-depth/balance.md) records earned paths, spending limits and unavailable/hypothetical cases. It does not establish mature earned farming, long-term feel or accepted release depth. | Representative earned research/Workshop/fitting choices and farming observations, with explicit scope acceptance for tiers, waves, rewards and armaments. |
| <a id="q-ux"></a>**Q-UX — screen clarity, input and accessibility** | Product UX/accessibility / [Clarity T-MODALS](../../.codearbiter/plans/last-stand-consolidation-and-clarity.html#T-MODALS) | [Current UI checks and browser captures](last-stand-consolidation/validation.json) cover four imported Research checks, 23 Controls checks including the compact-selector regression, five actual observation packets through both readers, and 21 browser screenshots. Locked Research now identifies its unlock path; shared quotes and actions replace the misleading AVAILABLE state. These checks establish bounded behavior and layout, not owner comprehension. | Owner review of corrected Research, Planner and sibling screens; retain actual-target checks of locked/empty/shortfall/failed-save states, focus/scroll and 44px targets as platform qualification proceeds. |
| <a id="q-audio"></a>**Q-AUDIO — rendered sound and listening** | Audio verification / [Player controls T-AUDIO](../../.codearbiter/plans/last-stand-upgrade-payoff.html#T-AUDIO) | [Audio and background observations](#delivery-state-on-2026-10-28) and source regressions remain bounded to their recordings. Logs, cue counters and inert fixtures do not prove hardware audibility or listening acceptance. | Source-bound normal-play media and target listening checks for master/effects/music controls, silence, background admission, no replay/bursts and stable pitch at game speeds; record owner feedback separately. |
| <a id="q-art"></a>**Q-ART — visual treatment and shipped rights** | Art/product / [First-session DEC-VISUAL](../../.codearbiter/specs/last-stand-first-session-polish.html#DEC-VISUAL) | [Plan-closure report](../../.codearbiter/reports/last-stand-plan-closure-2026-10-30.md) retains the unresolved visual-treatment choice. Later garage/chrome feedback is not that decision. Existing assets/builds do not establish final rights and visual acceptance. | Record the actual visual-treatment decision and matched normal-speed review, plus provenance/license review for shipped art/audio and explicit exceptions. |
| <a id="q-delivery"></a>**Q-DELIVERY — final review, hosted CI and distribution** | Delivery/release owner / [Architecture T-DELIVERY](../../.codearbiter/plans/last-stand-architecture-foundations.html#T-DELIVERY) | [Refreshed local checks and scoped reviews](last-stand-consolidation/validation.json) pass for the bound repair. First-head [CI 41125483235](https://github.com/SUaDtL/singedTerra/actions/runs/41125483235) failed three stale browser fixtures; local regression/repair and dependency-free import checks now pass. Exact repair-head hosted CI remains pending. The [maintenance record](../../.codearbiter/reports/project-maintenance-2026-10-29.md) preserves ADR acceptance and the true-merge requirement. | Exact repair-head hosted checks and final commit gates; separately authorized merge retaining ADR source ancestry, then separately authorized deployment/publication and live-host checks. Store signing, version and submission require their own decisions. |

The historical plans retain their own criteria, implementation progress and check
records. Their new current-qualification pointers map overlapping obligations to
this matrix; they do not recreate tests, close unrun acceptance, or revive retired
Ash Road/manual-claim behavior. The [new sprint specification](../../.codearbiter/specs/last-stand-consolidation-and-clarity.html)
owns the current consolidation changes. Account, cloud-save and purchase controls
still require real implemented services before being presented to players.


## Dated evidence history

Everything below is retained historical evidence with its original scope. Words
such as “current” and “pending” inside a dated record refer to that record's
candidate, not automatically to today's branch. Use the matrix above for the
current outstanding work.

## Progression planning candidate, October 30

The [new sprint](../../.codearbiter/plans/last-stand-progression-intelligence.html)
adds advisory goal pins, Workshop/Research budget alternatives and conservative
run-history comparisons through existing shared owners. It changes neither the
version-6 progression save nor a combat, economy or reward edition. The
[plan closure report](../../.codearbiter/reports/last-stand-plan-closure-2026-10-30.md)
records 69 completed implementation obligations while retaining unresolved player,
device and owner-decision work.

Local model checks pass: six planner, fourteen preferences, eighteen history,
two architecture-boundary and two export-binding checks (overlapping the broader
inventory). The complete portable run exercised 71 modules/476 cases: 70 modules
passed and the crowded-wave module rejected the newly extended closure helper.
The correction separately binds that helper, requires exactly the original 32
measured C# inputs, and preserves all eight historical maps/constants. All nine
affected checks pass, including new add/omit/duplicate/redirect and execution-drift
controls. The current inventory contains 477 portable cases; this is not a fresh
all-477 result.

Actual imported Unity controls pass all 21 named cases. A packaged-browser check
found that its page header left only 142px of game height in a 568x266 window.
The new regression failed with the scroll viewport below the canvas; the shared
modal now places Planner and History status text in scroll content, retaining the
fixed Close control and full 44px targets. The unchanged regression passes at
142px, 196px, portrait and landscape sizes. Independent model, UI and evidence
reviews pass. The actual Unity observation emitter also passes both maintained
readers, including rejection of an omitted control. The frozen v1 observation
contract is unchanged; current planner/history controls use v2.

WebGL release `Web-20261030T161006Z-530738` passes source/toolchain checks, official
packaging, asset/source admission and the production site build. The new package
is the sole local preview on port 4174. No new Windows or Android player build is
claimed for this sprint. The final isolated, empty-profile browser journey passes
11 checks with six screenshots and zero browser errors: pin/reload/clear, real
Workshop/Lab budget descriptions, mouse/touch/keyboard navigation at desktop,
portrait and 142px canvas height, existing Shop routing, provisional-history
disclosure and unchanged checkpoint/currency/manual pause. All 13 recorded Tab
actions retain both trusted key edges. The browser uses real input; it supplies
no earned mature-farming or physical-device evidence. Player labels replace raw
serialized build identities without changing comparison keys. Exact-head hosted
CI remains separate; existing device/audio/performance/endurance gaps remain.

The earlier Linux CI audio-fixture failure is corrected by giving its inert
Windows-capability fixture an explicit platform. An additional actual-caller
regression proves Linux/macOS refusal before auxiliary-window creation. Focused
audio-boundary checks pass. The full local background run retains its separate
Windows native-window snapshot timeout; fixture success does not qualify that
native boundary. No timeout or native ownership check was relaxed.

The old caption refusal and later snapshot timeout are distinct: the earlier host
refused an obstructed caption without inserting input; the later setup activation
succeeded before an observation-only snapshot timed out. A bounded read-only phase
probe completed in 1.44 seconds but did not reproduce the owned-Chrome boundary.
The responsible helper bodies are unchanged. No source defect is asserted from
that unresolved timeout, and no native qualification is inferred from the probe.

Current follow-up, October 28: CI run `40625861839` at `c6b32cde` completed
with failed Last Stand lifecycle checks; CodeQL passed. The retained shard 3
trace reaches its deferred terminal result, then the idle-result validator
includes an earlier transition to that result in its observation window. No
post-finalization callback or played cue appears in that inspected trace.
The corrected validator passes its regression, 15 focused audio/observer checks
and 62 related checks. A replay accepts the complete unchanged shard 3 trace;
this is recorded-data validation, not fresh hosted or rendered-audio proof.
All nine matching failure stacks were checked. Shard 5 instead fails the
stronger-cannon first-hit assertion: delayed-callback audio suppression also
omits the first hit diagnostic. Captured combat counters agree with the model;
the first retained diagnostic refers to a later shot and reused enemy slot.
The actual-controller regression fails on the original source and passes after
separating authoritative hit observations from audio admission. The final Unity
background sweep passes all six wrappers and seven Editor cases, including both
damage values under delayed, hidden and retained-debt callbacks. Independent
review verified the retained source, assembly and log hashes. Browser callers
now distinguish first-impact evidence from fresh played audio. The related
browser suite passes 149 checks; both independent reviews pass after correcting
timestamp, event-order and duplicate-admission checks. The source fix is
committed as `9ec44f05`. All three players have been rebuilt from matching
source inventories; fresh hosted proof remains required. These results do not
clear the other gaps below.
The fresh package's isolated headless browser research journey passes 13 checks
with zero browser errors and 11 retained screenshots. It observes completion
during a real close/reopen, shared-wallet research transitions, two-tab writer
ownership and transfer, bulk purchase, locked fresh Labs, speed controls through
5x and exactly-once abandonment/history. Its declared development profiles use
gifted funding and synthetic prior research. This establishes those browser
behaviors, not ordinary earned progression, native audio or endurance.
Follow-up CI `40766130825` at `62f60b53` passes all 23 individual jobs, including
the ten lifecycle shards. Its final matrix aggregate still rejects a saved
Salvage/observed-wallet comparison (`3` versus `2`). A legitimate wave committed
between the running observation and the durable read. The observer repair in
`3ae1a017` preserves that running observation and captures a separate paused
checkpoint witness, bound to the actual committed state and source oracle.
Its actual-caller regression and malformed-boundary controls pass; the final
related suite passes 154 checks. Independent review passes after closing two
persisted-boundary validation gaps. Fresh hosted aggregate proof is pending.
A fresh 5x smoke observation also stopped after its first periodic purchase
because the observer exceeded its five-second sampling-gap bound. It remains a
failed observation and supplies no performance or endurance acceptance.
The same repair keeps one fresh sampler active during awaited shop/report/run
transitions. All 22 focused checks and independent review pass, retaining the
exact five-second bound. An isolated seeded rerun passes 180.767 active seconds,
176 samples and a rendered 29-level purchase. There are 96 matching storage
write/readbacks from page start through the final summary (91 between the first
and final summaries). The final summary shows wave 83; the latest observation
during cleanup reaches wave 84. No errors are reported, and final source
bindings are verified. Cleanup adds no active-time credit.
This smoke precedes the final wallet-only review correction; its retained input
hashes identify that exact driver snapshot. Its headless frame mean is 73.812 ms
and sampled renderer JavaScript heap peaks at 11,165,320 bytes. These diagnostic
measurements exclude WebAssembly memory and do not qualify device performance,
CPU step cost, hardware audio or ten-hour endurance.
Current hosted follow-up: foundation head `1893bbd9` passes CI run
`40775828783`, all 24 jobs including ten lifecycle shards and the final combined
rendering-guardrails check `123136622229`. CodeQL `40775828731` also passes.
The PR head was freshly confirmed unchanged after both workflows completed.
This clears the combat-depth sprint's browser integration dependency; the
platform, audio and endurance gaps below remain open. Earlier pending/failure
observations above retain their original historical scope.

## Combat-depth candidate, October 29

The approved combat-depth implementation adds Mortar and Railgun, three enemy
roles, Cinder Basin and Storm Foundry, and saved-rule compatibility. Its
[validation inventory](last-stand-combat-depth/validation.json) binds current
source, builds, browser observations and representative review images.

WebGL and Windows release builds and an Android ARM64 development build passed
with source inventory `68935f3aa6e0d5663730caff05195997ee42e60419bd60c3bd4aa0159a2f551b` unchanged through all three builds.
The Android APK is 52,076,242 bytes and has a verified Android Debug v2 signature.
The first Android import was rejected for 18 inherited probe-shader warnings;
an unchanged-source retry passed the unchanged strict scanner. Warning-free
clean-import repeatability and store signing remain unproven.

The calibrated packaged-browser combat journey passed 31 checks with 53
screenshots: five fittings, four environments, desktop/portrait/short landscape,
touch and keyboard, quoted Mortar/Railgun purchases, saved-wave reload,
retained-version recovery, and wave-50 elite statistics and rendering with
reduced effects. The research journey passed 13 checks, including completion
during an actual closed tab and writer-lock handoff. Both report zero browser
errors and verify their source, fixture and package bindings. These development
profiles establish the observed browser behaviors; their gifted funding is not
ordinary earned progression or native/endurance evidence.

Current local verification includes 82 combat/domain checks, 48 pure architecture
checks, six retained economy checks, 14 independently rerun armament regressions,
and a passing production build/typecheck. The expanded CI/tooling run passed
441 of 443 named checks. Both failures then passed focused reruns: one stale
extracted-caller fixture was corrected to use the actual impact/audio helpers;
one passive Windows helper timeout did not recur under the unchanged 10-second
limit. This is not a fresh all-443 run. Existing independent review closed the three new browser
evidence findings and passed the CI security review. Final combat-model and
observer checks are recorded in the validation inventory and balance report.

The full calibrated actual-model measurement preserves earned funding, research
and saved seeds. Current-edition Scattergun uses 22m interception with unchanged
damage growth; Mortar uses a 10m radius and the measured level-growth correction.
Legacy saved runs retain their original rules. The
[balance report](last-stand-combat-depth/balance.md) separates earned observations,
bounded survival limits and hypothetical mature pacing. It does not establish
real-duration farming, globally optimal builds or device performance.

Two ordinary first-session browser journeys also pass, starting from empty saves
with repair and launcher at normal speed. Each records five checks and 15
screenshots with no errors, covering earned first-wave rewards, purchases, return
to Campaigns, paused checkpoint resume and confirmed abandonment. The first
local attempt exposed a mismatched preview base path; rebuilding with
`VITE_BASE=/singedTerra/` corrected local assets without changing navigation code.

Initial combat-depth CI at `414fca7d` failed 12 lifecycle jobs because the
historical compiler caller omitted new dependencies, and the tier journey used
stale milestone labels. CodeQL and all 80 Linux combat/domain checks passed.
The repaired compiler shares the full 16-source list and matches the unchanged
13,904-row, 13-field historical reference. Current combat/research browser
journeys have been rerun with the repaired drivers. Hosted CI at `8543e883`
then passed all 24 jobs, including 12 lifecycle shards and the final aggregate;
CodeQL also passed, with the head freshly confirmed unchanged. The subsequent
verifier-only follow-up requires its own exact-head checks after push; the PR's
current checks are authoritative.

The subsequent `ce0cbf58` run failed all 12 lifecycle jobs because frozen balance
admission still required the original compiler helper. Correction `3433c0a5`
preserves all four reports and all 35 historical identities, keeps 34 model,
policy and closure inputs pinned, and records the current helper separately.
All 82 combat-domain checks pass. A fresh five-run, 100-wave observer execution
exactly matches the complete retained outcomes; source drift, altered outcomes
and overwriting frozen references are refused. Independent review passes. Its
corrected-head hosted CI and the supplementary full-model repeat are separate
checks; neither result is asserted by this pre-push record.

The final verifier follow-up passes 33 focused Node checks and preserves the
48-check architecture and five-check portable compiler results on their unchanged
inputs. It requires current save envelopes and complete retained editions, binds
all 33 milestone generator inputs, and supports an explicit compiler when
automatic discovery is unavailable. Actual browser milestone cases pass for both
Repair and Launcher at waves 100 and 300, from declared accelerated earned setup.
The final stricter timing validator separately accepts all four complete captures
and rejects altered paused activity; recorded replay is not a new live journey.

The current standalone 180-second 5x smoke passes with a rendered purchase,
verified source/package bindings and successful checkpoint write/readback checks.
This is a bounded development-profile diagnostic, not real-duration farming or
device performance qualification. The earlier parallel attempt exhausted purchase
retries; its cause remains unproven. Another attempt correctly refused a verifier
source change during observation. Both failures are retained, and the passing
repeat uses unchanged sampling, timing and purchase bounds.

Current Windows interaction, physical Android, hardware audio and real-duration
farming/performance qualification remain pending. One current preview is retained
on port 4174. No merge, publication or store acceptance follows from these results.

## Target-aware build entry

`Tools/build_last_stand.py` supports `webgl`, `windows` and `android`, with
`development` or `release` configuration. The latter selects optimized player
flags; it does not imply signed store distribution. No dependency install,
credential request, scene generation, publication or deployment occurs here.

```powershell
python campaign-unity/Tools/build_last_stand.py --target windows --configuration development --preflight-only
python campaign-unity/Tools/build_last_stand.py --target windows --configuration development
python campaign-unity/Tools/build_last_stand.py --target android --configuration development --preflight-only
```

The pinned editor is Unity `6000.3.24f1`, changeset `4e7b9b5b6244`, with embedded
URP `17.3.0`. The default local executable is
`C:/Users/brenn/singedTerra-engine-lab/tools/unity-6000.3.24f1/Editor/Unity.exe`.
An explicit `--editor` can select that same pinned version at another location.
Preflight reads availability without launching Unity. A build also checks the
actual editor executable version and refuses another Unity process for this
project. Missing modules/tools fail before building, with no automatic install.

Android also accepts explicit `--jdk-root`, `--sdk-root` and `--ndk-root` paths;
omitting each option uses that component under the pinned editor's Android module.
The selected JDK must report Java 17, and the NDK must be r27c (`27.2.12479018`).
The pinned Unity parser accepts two to four numeric Java version components;
preflight rejects incompatible vendor versions before hashing tools or launching
Unity. Select a compatible patched distribution without rewriting its metadata.
The SDK requires platform tools, build tools `36.0.0`, platform `android-36`,
command-line tools `16.0`, CMake `3.22.1` and owner-managed license acceptance.
These options select already installed tools; they do not install them or certify
their provenance. Ambient `ST_LS_*_ROOT` variables cannot silently select inputs.
The receipt binds the complete chosen JDK and NDK bytes and the listed SDK
component closure, including licenses, before and after the build. The Editor
temporarily selects these paths for the build and restores its prior tool paths.

Every target builds exactly `Assets/Scenes/LastStandPrototype.unity`. Native and
WebGL entries share the saved scene preparation and existing encounter/loop
checks through `LastStandLoopBuild.PreparePlayerScene`. Native development uses
Windows x64 Mono or Android ARM64 IL2CPP; Android uses SDK API 36 and a local APK
with Unity's default debug signing, without reading custom keystore credentials.
Native output uses product `Last Stand` and identifier `com.singedterra.laststand`.
Temporary native player/graphics settings are restored before source comparison.

Development selects only `BuildOptions.Development`; release selects
`BuildOptions.None`. Neither adds script debugging, profiler connection, auto-run
or extra scripting defines. These are explicit repeatable inputs, not a claim
that Unity emits byte-for-byte reproducible binaries across clean builds.

Each run creates a fresh stamped directory under `Builds/` and an append-only
`Evidence/last-stand-architecture/build-<target>-<stamp>/result.json` record. It
refuses an existing output directory. The record includes:

- source commit plus complete before/after source inventories, including the
  target wrapper and exporter, Unity assets/settings/packages and authored content;
- pinned editor/module/URP/Python toolchain bytes before and after the build;
- a separate hash inventory of typed content definitions and catalogs;
- actual target, scene, configuration, flags, project player version and build report;
- process stage results, logs and a complete hash inventory of produced files.

The verifier rejects changed sources/toolchains, wrong scenes/flags/configuration,
failed/missing build stages, and missing, added or changed output bytes. An
inventory checksum detects accidental substitution; it is not a signature or
proof of who produced a receipt. Tests use clearly labeled temporary bytes and
do not claim that those bytes are playable binaries.

WebGL delegates to the existing `build_web.py`, retaining its shader checks,
saved-scene protection, source/toolchain closure and browser wrapper. Supply the
caller-observed native spec/plan identity JSON using `--approval-binding`; the
exporter now recognizes the ARCH pair as well as earlier maintained pairs. The
result includes the original web export receipt path and digest. Continue using
that **original web receipt** with `package_last_stand_web.py` for staging and
the established source-lock/admission checks; the new target summary does not
replace or weaken that packaging contract.

## Delivery state on 2026-10-28

Build receipts below describe their recorded source inventories. A hosted Linux
failure exposed process-local file-sharing behavior in Mono. Native storage now
uses an explicit OS range lock and a process registry that protects its lifetime.
Save format and checkpoint semantics are unchanged. Windows release and WebGL
were rebuilt after that repair; earlier interaction results remain historical.
No public release, store submission, merge, deployment or live-host qualification
is claimed.

| Target | Measured or observed evidence | Remaining proof |
| --- | --- | --- |
| WebGL | Hit-observation release [receipt](../Evidence/last-stand-architecture/build-webgl-20261028T205905Z-90afa9/result.json) passed, then its original export receipt was admitted and packaged. Source/toolchain unchanged; 3,453 source inputs and 16 payload assets verified; strict TypeScript and production build passed. Port 4174 serves the matching manifest. The isolated research/ownership/speed journey passes 13 checks with a real closed-tab completion. | Fresh hosted lifecycle, native audio, ordinary earned progression and endurance remain separate qualification obligations. The new journey uses declared development profiles; earlier journeys below identify their older packages. |
| Windows | Hit-observation release [receipt](../Evidence/last-stand-architecture/build-windows-20261028T210240Z-789ab9/result.json) reports Succeeded and 112,305,051 bytes. Uses x64 Mono and the same source inventory as current WebGL. | Earlier rendered journeys below predate the heartbeat and hit-observation corrections. Current player interaction, hardware audio, performance, abnormal termination and endurance remain unmeasured. |
| Android | ARM64 IL2CPP development [receipt](../Evidence/last-stand-architecture/build-android-20261028T210711Z-0d1bb4/result.json) passed. APK 51,393,788 bytes; Android Debug v2 signature verified; source/toolchain unchanged and the source inventory matches Windows/WebGL. | Real-device interaction, lifecycle, durability, audio and performance qualification. The preceding import attempt was rejected for 18 probe-baker shader warnings; the unchanged-source retry passed the unchanged scanner. Warning-free clean imports and store qualification remain unproven. |

Nine focused build/preflight checks pass. They cover source/toolchain/scene/
configuration rejection, modified/missing/extra artifact rejection, incomplete
Windows module variants, missing Android tools, wrong NDK version and Unity's
Java-version parsing boundary. The updated pure architecture suite passes all
38 checks (24.551 seconds). Fourteen
native file/process tests pass independently of PlayerPrefs, including surviving
writer contention, stale profile/settings protection, real Windows junction
refusal with unchanged target bytes and compiled guard-removal negative controls.
The maintained pure runner passed 37 checks under Roslyn (18.217 seconds) and mcs
(13.942 seconds). The lease checks include an independent OS-lock holder,
same-process observer disposal and a compiled lock-removal negative control.
The wave oracle also compiles its complete hashed source list with real Mono.
Six invalid imported-scene configurations were rejected by the
actual Unity build hook without saving the temporary scenes. The focused
BattleShop check passed after correcting its legacy test funding fixture.
These local checks do not establish Android filesystem behavior.

The browser journey used package `Web-20261025T095204Z-3f937d` on the single existing preview at
`127.0.0.1:4174`. A first-session profile earned six wave rewards and bought one
Cannon Attack level for five Scrap. Reload offered wave 7, and Resume Run restored
it paused with hull 120/120, Cannon Attack level 1 and 103 Scrap. Ambient Music
Off survived the same reload; the check then restored its original On setting.
No save seeding or game-method injection was used. This short journey is not a
funded-research, long-session, physical audio or device qualification.
After metadata cleanup and repackaging, the executing agent reloaded the final
package and used its rendered Resume Run and Run Upgrades controls. The same
paused wave 7, hull 120/120, Cannon Attack level 1 and 103 Scrap were restored.
The lease-repair package `Web-20261025T161237Z-583e89` passed the same rendered
checkpoint and run-shop recheck. The temporary browser viewport was reset;
at that check, port 4174 was the only game server.

The Windows development-player follow-up used rendered native input, with no
save seeding. It cleared five waves, bought one Cannon Attack level, then exited
during wave 6 with 97 Scrap. Relaunch restored wave 6 paused, hull 120/120,
Cannon Attack level 1, 85 Scrap and five banked Salvage. The 12 Scrap earned
during unfinished wave 6 was replayed from the completed-wave checkpoint.
Music Off persisted through process exit; the original On setting was restored.
Read-only inspection found four valid native save slots and no exception/error
lines in that session's log. Evidence is retained in
`Evidence/architecture-foundations/native-followup-20261025/`.

The release-player follow-up resumed that same checkpoint, opened the run shop
and bought the next Cannon Attack level for ten Scrap. Exiting before completing
wave 6 restored both the prior level 1 and its 85 Scrap on relaunch, consistent
with completed-wave recovery. Music Off persisted separately and was restored
to On. The release player was closed after these checks. This does not establish
live-combat or performance parity between the two configurations.

After the lease repair, release `LastStand-windows-20261025T161123Z-81ff23`
resumed the existing checkpoint paused at wave 6 with hull 120/120, 85 Scrap
and Cannon Attack level 1. Music Off was saved, the process exited, and relaunch
restored both the checkpoint and that preference. The original On preference
was restored and the player closed. Screenshots are retained as
`native-followup-20261025/lease-release-*.png` in the evidence directory above.

Hosted CI on `1c56a7b1` passed classification, then exposed the native Mono lease
defect, an omitted `LastStandSelection.cs` wave-oracle input and dependency
advisories. All three received scoped repairs. The reviewed development-tool
closure updates Vitest/coverage to 5.0.5 and Undici to 8.12.3 without changing
runtime dependencies or jsdom. Audit reports zero vulnerabilities; 2,405 client
tests and typecheck pass. Current hosted Linux and full CI results remain a
separate obligation recorded on the PR.

The browser-driver repair at `c4cc8022` passes 367 focused checks and retains
full-target visibility and input guards while revealing scrollable controls.
Hosted CI passes engine/build, core/product/tier browsers and Last Stand shards
11 and 12. Several lifecycle shards now pass the earlier scroll gate but time
out awaiting a runtime observation after a keyboard action. The source-bound
artifact showed a genuine stale purchase: the 15-second research heartbeat
advanced profile revision without refreshing the displayed quote. Commit
`d977d228` refreshes after reconciliation returns. Actual Unity regression
assertions fail before and pass after the change, covering one durable purchase,
old-intent refusal, failed-save disablement and unchanged run accounting.
Independent coverage/security reviews pass. Fresh hosted qualification at
`405fb92f` remains pending; no driver retry conceals the refusal.

The owner reported approving the popup. Subsequent read-only firewall inspection
found two enabled Allow/Public rules for the development executable. The agent
did not create or change those rules. The unrelated Docker Desktop crash dialog
closed before the successful checks; no factory reset was performed.

Frame pacing, process/device memory, thermal behavior, hardware audio and a full
long farming session have not been measured for these packaged candidates. Build
size is the only reported native build measurement here. The native-player
journeys establish only the specific input and persistence behavior above;
launch/render observation alone does not establish broader target acceptance.

## Android toolchain preparation

The current reviewed setup reuses
`C:/Users/brenn/AppData/Local/Android/Sdk`; command-line tools `16.0` were added to
that SDK. Separately installed task-local components are:

| Component | Installed path | Observed identity |
| --- | --- | --- |
| JDK | `C:/Users/brenn/singedTerra-engine-lab/tools/android-last-stand-20261027/jdk17.0.21_0` | Amazon Corretto `17.0.21.0.11`; original `JAVA_VERSION="17.0.21"`, runtime `17.0.21+11-LTS`, Windows x86_64. |
| NDK | `C:/Users/brenn/singedTerra-engine-lab/tools/android-last-stand-20261025/android-ndk-r27c` | `source.properties`: r27c, `27.2.12479018`. |

For the earlier BellSoft installation, four affected trust roots were removed from its
`lib/security/cacerts`, following the [Oracle eMudhra advisory](https://ops.java/emudhra).
The prior store is retained beside it as `cacerts.pre-emudhra-removal`; it is a
backup, not the active trust store. This change is scoped to this JDK, not a claim
that every Java installation on the host was remediated.

The current Corretto distribution needs no local metadata or truststore change.
Its [tagged changelog](https://github.com/corretto/corretto-17/blob/17.0.21.0.11/CHANGELOG.md)
includes both current certificate fixes. The downloaded archive matches SHA-256
`59d6514305f6fab3b18955fb17185562f0a0bbf20e1466eda33a5429f3b31618`,
and `java.exe` has a valid Amazon Authenticode signature. All four revoked
certificate fingerprints are absent from its 141-certificate store. These
bounded checks and the original Java version are retained in
`Evidence/architecture-foundations/android-followup-20261027/corretto-verification.json`.

The pinned Unity Android module installation completed with exit 0 on October 27,
after the owner authorized reopening its normal Windows elevation prompt.
The earlier October 25 attempt was canceled. No elevation bypass or
Hub-registration change was used. The replacement-tool build uses the explicit
Corretto, SDK and NDK roots above and completed successfully. The earlier APK SHA-256 is
`e941e6e6db999cc135d5767ba2625aa65a71ff5d88bb3381b05ea8de4ed7df42`.
The receipt records source inventory
`ef7f9c04d3d1050c01dc289279325995ce55981dcaef9a6793d370da1259dc94`
at commit `c4cc8022`. It includes the updated target-build wrapper; the earlier
Windows/WebGL inventories retain their own recorded wrapper bytes. Unity's build
report counts 541,582,682 bytes of build content, separately from the measured
39,799,485-byte APK. Neither figure is a device performance measurement.

The corrected heartbeat candidate was rebuilt as
`build-android-20261028T021504Z-e86444`: 51,393,644 APK bytes, SHA-256
`b064a65b6f4a7502539a1811d0c924a3fc7a4723892fe809ba9aa4a671188241`.
Its source inventory `43642e15341c075f695de8d01740b108733017f7cb00ed314076c7bdd4f6defe`
matches that earlier Windows/WebGL candidate set. The APK debug signature verifies.
The first rebuild was rejected for 18 D3D11 conversion warnings from the
Editor-only TraceVirtualOffset probe baker during initial import; that shader
is absent from the Android used-asset list. The unchanged-source Android retry
passed the same strict whole-log scanner. No warning filtering or receipt
rewriting was used. Clean-import warning-free repeatability remains unproven.

The hit-observation rebuild at `9ec44f05` repeated the same initial-import
limitation. Attempt `20261028T210423Z-ce3ee6` remains rejected with 18
TraceVirtualOffset warnings. The unchanged-source retry `20261028T210711Z-0d1bb4`
passed: 51,393,788 APK bytes, SHA-256
`587be690d6b1c776bc9559ae1c11de0b86d1eeff8d86040a90c06ada477beef7`.
The common Windows/WebGL/Android player source inventory is
`9c57a2b0f6ff04f28c5d75ebf3deb374fa81ef7d16ba8814b04c6e55aa5bddfe`.
This is a build and debug-signature result, not physical-device qualification.

The earlier Android logs also contained a shutdown Gradle cleanup error after
restoring missing embedded tools. Completing the authorized host setup changed
only three per-user Unity UseEmbedded toggles to false, selecting the existing
reviewed custom JDK/SDK/NDK paths. All six raw preference values were backed up
and compared before the write; path bytes stayed unchanged. Independent review
and read-back checks passed. The current build retains those preferences and
contains no JDK cleanup error. Backup and conditional rollback metadata are in
`Evidence/architecture-foundations/android-followup-20261027/unity-tools-preferences-*.json`.

For comparison, a full embedded toolchain installation would be larger than the
reused setup above. The following numbers are vendor estimates, not bytes
actually downloaded or installed by this sprint:

The local pinned editor's `modules.json` describes Android support plus its
children as 2,930,612,609 download bytes (about 2.73 GiB) and 10,281,302,772 installed
bytes (about 9.58 GiB), before extraction caches and build output. These are
installer estimates, not a measured download. Components include Android Build
Support, OpenJDK 17.0.18+8, NDK r27c, SDK build tools 36.0.0, platform tools 36.0.0,
command-line tools 16.0, CMake 3.22.1 and several Android platforms. The build entry requires
the pinned API-36 subset and never accepts licenses itself.

The installed Hub's read-only `help` and `editors -i` commands work when its child
environment includes the normal Windows `ProgramData` and `ALLUSERSPROFILE`
variables. Its installed-editor list includes the exact pinned lab editor.
Unity documents this module command:

```powershell
& "C:/Users/brenn/singedTerra-engine-lab/tools/unity-hub/Unity Hub/Unity Hub.exe" -- --headless install-modules --version 6000.3.24f1 --module android --childModules
```

This command has **not** been executed by the build work item. The dependency
review found `manual: true` for this exact editor in Unity Hub's `editors-v2.json`;
the existing lab editor therefore does not meet the documented Hub-managed
prerequisite for this command. A separately reviewed installation plan is needed;
do not relabel Hub metadata or replace the working editor automatically. Unity's
current documentation deprecates the older Hub CLI from
Hub 3.18 in favor of Unity CLI. The installed help still exposes the command.
See [Hub CLI reference](https://docs.unity.com/en-us/hub/hub-cli-reference) and
[adding editor modules](https://docs.unity.com/en-us/hub/add-modules).

The pinned SDK/NDK module metadata explicitly requires reviewing and accepting
its license terms before download/install. That owner decision and dependency
review are separate from compiling this repository. No authentication or store
signing material is needed for the local development APK. Reviewed existing tools
can be selected with the explicit component flags above; this lets the build use
an existing compatible SDK while installing only missing reviewed components.
Installation and actual target qualification need their own current receipts as
delivery proceeds; presence of the SDK/JDK/NDK does not supply the Unity module.

## Historical release-gap assessment — October 28

This earlier assessment is retained for traceability. Its status is not maintained
in parallel with the [current qualification matrix](#current-qualification-matrix).

This is the delivery/readiness assessment required by `ST-LS-ARCH-SPEC#CR-DELIVERY`
and `CR-PLATFORM`, under the existing plan's `T-DELIVERY`. It does not create new
backlog tasks or change retained task state. "High" means the named readiness
decision cannot be supported until the exit evidence exists; an unmeasured gap
is not automatically a confirmed product defect. Owners below are responsible
areas, not an assignment to an unavailable person.

| Gap and severity | Evidence / current limit | Responsible area | Exit evidence |
| --- | --- | --- | --- |
| High: remaining browser qualification | The earlier heartbeat package restored the existing paused wave7 checkpoint; that user profile remains untouched by the hit-observation follow-up. The new package passes 13 isolated browser checks for closed-tab research completion, funded transitions, tab ownership/transfer, bulk buying, speed and history. Focused background and first-hit regressions pass. Current hosted lifecycle and combined evidence qualification passed at `1893bbd9`; native and endurance checks remain separate. | Delivery / browser verification | Retain the green hosted result, declared seed limits and earlier journeys; requalify affected behavior on the next candidate. Keep only the latest local preview. |
| High: remaining native player qualification | Earlier pre-heartbeat Windows players passed controls, purchase, saved preference and checkpoint restart at 1024 by 768. Current-candidate interaction and broader device behavior remain unmeasured. | Delivery / platform verification | Recheck the current candidate and record supported input/display targets, abnormal termination and lifecycle behavior. Preserve both earlier native journeys as historical evidence. |
| High â€” Android lifecycle and durability | No real-device session, suspend/resume, research-clock, interrupted-write or hardware-audio evidence for this candidate. Windows tests cannot qualify Android behavior. | Platform / device verification | Install the identified APK on a recorded device/OS, exercise fresh and returning profiles, background/foreground, forced termination/relaunch, clock behavior, preferences and audio; retain before/after save and observation evidence. |
| High â€” performance and long-run reliability | A 180-second headless diagnostic frame/renderer-JS-heap baseline exists. Actual target frame time, full memory, thermal behavior and real-duration farming remain unmeasured. Accelerated model tests and this short smoke are not endurance proof. | Performance / platform / game design | Recorded target/device measurements and a real farming/endurance run against the approved pacing and stability goals, including save/recovery observations; retain existing background/audio obligations. |
| High â€” content and economy release depth | The foundation preserves frozen behavior and supplies typed definitions; this does not establish sufficient progression depth or long-term balance. | Game design / economy / content | Review supported tiers, waves, rewards, research and armaments against the maintained progression goals; retain representative play/farming evidence and explicit release-scope acceptance. |
| High: first-session clarity and accessibility | Shared layouts, focused controls and one packaged desktop first/returning session passed. Touch accessibility and player comprehension acceptance remain unmeasured. | Product UX / accessibility | Recorded checks on supported viewport/input targets, including readable states, focus, navigation, settings, prompts and recovery, with remaining issues dispositioned. |
| High â€” visual/audio quality and rights | Rendering and source assets exist; hardware listening, final visual acceptance and a complete release-rights decision are not supplied by the build receipts. | Art / audio / product | Asset provenance and license review for the shipped content plus target visual/listening acceptance; retain any known exceptions explicitly. |
| High â€” player support and recovery | Adapter corruption/ownership safeguards pass; the packaged failed-save/retry/recovery experience and support diagnostics are not qualified. | Platform / support UX | Exercise understandable failures and safe retry/recovery on actual targets, preserving existing progress, and demonstrate useful support diagnostics without sensitive data. |
| High â€” candidate review and distribution | Local tests/builds do not establish hosted CI, independent review, merge, deployment or live-host success. | Delivery / release owner | Exact-candidate checks and review, authorized branch disposition, then separately authorized publication/deployment and live-host evidence where required. Store release needs its own version/signing/submission decision. |

Browser development, Android development and public/store release retain separate
readiness decisions. Windows is useful native development evidence, not a
substitute for Android device qualification. Account, cloud-save and purchases
require real implemented services before those controls are presented to players.
