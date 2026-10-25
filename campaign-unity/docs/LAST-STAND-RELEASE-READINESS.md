# Last Stand release readiness

This inventory describes the release-foundation implementation on 2026-10-25.
It is not a publication, store-submission or device-qualification receipt. The
current Unity project declares player version `1.0`; the repository package is
`0.0.0`. Neither is a newly approved public game version.

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

## Delivery state on 2026-10-25

Build receipts below describe their recorded source inventories. The packaged
WebGL release uses source inventory
`cf8a8c748c0f5f2f041063663491bca0dba5590d554dd8107c5e652c68c2413e`.
The Windows release and first browser journey used inventory
`984c3cb12ed6a2274de7889079c44bb2e55149f3bf0e8b48c8accb9a1f1cccaf`;
the only subsequent source changes remove trailing whitespace from Unity metadata.
Runtime code is unchanged. No public
release, store submission, merge, deployment or live-host qualification is claimed.

| Target | Measured or observed evidence | Remaining proof |
| --- | --- | --- |
| WebGL | Final release export passed in [build-webgl-20261025T100855Z-3d64fe](../Evidence/last-stand-architecture/build-webgl-20261025T100855Z-3d64fe/result.json), then the [original export receipt](../Evidence/last-stand-playable-loop/t05/build-20261025T100855Z-3d64fe/result.json) was admitted and packaged. Production typecheck/build passed. In-app browser checks exercised tier/environment preview, settings, a live purchase, wave clears and reload/resume on the prior package with identical runtime code. | Funded/offline research, two-tab ownership, native/background/audio, endurance and exact-candidate hosted CI retain their separate qualification obligations. |
| Windows | Development build reported `Succeeded`, `174,822,523` bytes: [development receipt](../Evidence/last-stand-architecture/build-windows-20261025T093538Z-2a6afe/result.json). Final release configuration also succeeded, `112,304,539` bytes: [release receipt](../Evidence/last-stand-architecture/build-windows-20261025T095347Z-01cfb8/result.json). Both use x64 Mono, scene `LastStandPrototype`, version `1.0`. The executing agent observed both players launch and render. | Interaction qualification stopped at a Windows Security firewall dialog that the automation surface did not expose as a controllable window. No firewall permission was granted. Fresh/returning-player controls and save/relaunch remain unverified. |
| Android | Existing SDK reused; Java 17 and NDK r27c installed at the explicit paths below. The Android module installer had a valid Unity signature, but its UAC request was cancelled. The owner is unavailable; installation is paused without another attempt. | Unity Android module installation, source-bound APK build, installation on a declared real device and all native interaction/lifecycle/performance qualification. No APK success is claimed. |

Eight focused build/preflight checks pass. They cover source/toolchain/scene/
configuration rejection, modified/missing/extra artifact rejection, incomplete
Windows module variants, missing Android tools and wrong NDK version. Eleven
native file/process tests pass independently of PlayerPrefs, including surviving
writer contention, stale profile/settings protection, real Windows junction
refusal with unchanged target bytes and compiled guard-removal negative controls.
The maintained pure runner passed 33 checks under Roslyn (16.819 seconds) and mcs
(12.958 seconds). Six invalid imported-scene configurations were rejected by the
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

Frame pacing, process/device memory, thermal behavior, hardware audio and a full
long farming session have not been measured for these packaged candidates. Build
size is the only reported native build measurement here. Launch/render observation
does not establish input, save/relaunch, accessibility or performance acceptance.

## Android toolchain preparation

The current reviewed setup reuses
`C:/Users/brenn/AppData/Local/Android/Sdk`; command-line tools `16.0` were added to
that SDK. Separately installed task-local components are:

| Component | Installed path | Observed identity |
| --- | --- | --- |
| JDK | `C:/Users/brenn/singedTerra-engine-lab/tools/android-last-stand-20261025/jdk-17.0.21.0.2` | BellSoft Java `17.0.21.0.2+5-LTS`, Windows x86_64; its `release` metadata records version date `2026-10-22`. |
| NDK | `C:/Users/brenn/singedTerra-engine-lab/tools/android-last-stand-20261025/android-ndk-r27c` | `source.properties`: r27c, `27.2.12479018`. |

Four affected trust roots were removed from this task-local JDK's active
`lib/security/cacerts`, following the [Oracle eMudhra advisory](https://ops.java/emudhra).
The prior store is retained beside it as `cacerts.pre-emudhra-removal`; it is a
backup, not the active trust store. This change is scoped to this JDK, not a claim
that every Java installation on the host was remediated. The build receipt must
bind these modified JDK bytes. It does not certify the toolchain against every
security issue.

The missing component is the pinned Unity Android player module. The reviewed
installer's valid signature did not complete installation: UAC was cancelled and
the owner cannot attend the machine. Do not retry the elevation or change Hub
registration to bypass that stop. Resume this installation step when the owner
can complete it, then rerun preflight with the explicit JDK/SDK/NDK roots and
produce a real APK receipt.

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

## Remaining qualification and release gaps

This is the delivery/readiness assessment required by `ST-LS-ARCH-SPEC#CR-DELIVERY`
and `CR-PLATFORM`, under the existing plan's `T-DELIVERY`. It does not create new
backlog tasks or change retained task state. "High" means the named readiness
decision cannot be supported until the exit evidence exists; an unmeasured gap
is not automatically a confirmed product defect. Owners below are responsible
areas, not an assignment to an unavailable person.

| Gap and severity | Evidence / current limit | Responsible area | Exit evidence |
| --- | --- | --- | --- |
| High: remaining browser qualification | Final source-bound package, live purchase, wave progression, settings and reload/resume passed in the in-app browser. Funded/offline research and two-tab qualification remain pending from the base sprint. | Delivery / browser verification | Complete the remaining funded-research and ownership journeys on the identified package. Preserve the recorded successful basic journey and keep only the latest local preview. |
| High — native player interaction | Windows build and rendering observed; the uncontrollable Windows Security dialog blocked interaction. No firewall permission granted. Adapter tests do not exercise the player UI. | Host operator + delivery / platform verification | Owner-resolved OS dialog followed by an actual source-identified player journey, controls/settings checks and shutdown/relaunch persistence. Record the OS choice explicitly; do not infer or grant network permission from a launch. |
| High — Android development artifact | SDK/JDK/NDK present; Unity module installation stopped at cancelled UAC. No APK exists as qualification evidence. | Host operator + build/toolchain | Complete the reviewed module installation when the owner is available, pass effective-tool preflight and retain a successful source/toolchain-bound APK build receipt. |
| High — Android lifecycle and durability | No real-device session, suspend/resume, research-clock, interrupted-write or hardware-audio evidence for this candidate. Windows tests cannot qualify Android behavior. | Platform / device verification | Install the identified APK on a recorded device/OS, exercise fresh and returning profiles, background/foreground, forced termination/relaunch, clock behavior, preferences and audio; retain before/after save and observation evidence. |
| High — performance and long-run reliability | No candidate frame-time, memory, thermal or real-duration farming measurements. Accelerated model tests are available but are not endurance proof. | Performance / platform / game design | Recorded target/device measurements and a real farming/endurance run against the approved pacing and stability goals, including save/recovery observations; retain existing background/audio obligations. |
| High — content and economy release depth | The foundation preserves frozen behavior and supplies typed definitions; this does not establish sufficient progression depth or long-term balance. | Game design / economy / content | Review supported tiers, waves, rewards, research and armaments against the maintained progression goals; retain representative play/farming evidence and explicit release-scope acceptance. |
| High: first-session clarity and accessibility | Shared layouts, focused controls and one packaged desktop first/returning session passed. Touch accessibility and player comprehension acceptance remain unmeasured. | Product UX / accessibility | Recorded checks on supported viewport/input targets, including readable states, focus, navigation, settings, prompts and recovery, with remaining issues dispositioned. |
| High — visual/audio quality and rights | Rendering and source assets exist; hardware listening, final visual acceptance and a complete release-rights decision are not supplied by the build receipts. | Art / audio / product | Asset provenance and license review for the shipped content plus target visual/listening acceptance; retain any known exceptions explicitly. |
| High — player support and recovery | Adapter corruption/ownership safeguards pass; the packaged failed-save/retry/recovery experience and support diagnostics are not qualified. | Platform / support UX | Exercise understandable failures and safe retry/recovery on actual targets, preserving existing progress, and demonstrate useful support diagnostics without sensitive data. |
| High — candidate review and distribution | Local tests/builds do not establish hosted CI, independent review, merge, deployment or live-host success. | Delivery / release owner | Exact-candidate checks and review, authorized branch disposition, then separately authorized publication/deployment and live-host evidence where required. Store release needs its own version/signing/submission decision. |

Browser development, Android development and public/store release retain separate
readiness decisions. Windows is useful native development evidence, not a
substitute for Android device qualification. Account, cloud-save and purchases
require real implemented services before those controls are presented to players.
