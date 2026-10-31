# Unity security patch dependency review

Reviewed October 30, 2026 for PR #547. The independent dependency reviewer returned
**PASS for the selected configuration**, subject to checking the downloaded bytes
before execution. This is a dependency decision, not installation or player proof.

## Selected configuration

- Unity **6000.3.27f2**, revision **22188f149405**, Windows x64 Editor.
- Matching WebGL support and Android core support.
- Windows uses the existing Mono player target; no additional Windows IL2CPP module.
- Android uses the existing **Amazon Corretto 17.0.21.0.11** JDK, SDK platform 36 /
  build-tools 36.0.0, and NDK r27c (27.2.12479018), explicitly selected by the build.
  The optional bundled OpenJDK 17.0.18+8 is not selected.
- Preserve the existing embedded URP 17.3.0 modifications and UGUI 2.0.0; test
  compatibility against the patched editor.

## Security basis

[Unity's Brotli advisory](https://unity.com/security/unity-brotli-decoder-vulnerability)
fixes CVE-2026-111497 in 6000.3.27f2. The package manager is affected independently
of whether the game calls the Brotli API. No authored campaign source references
to BrotliStream, BrotliDecoder or HttpClient were found; that search is not a
whole-binary reachability analysis. Unity identifies ordinary WebGL build-file
decompression as browser-owned and unaffected by this Unity decoder defect.

[Unity's certificate advisory](https://unity.com/security/unity-emudhra-compromise)
fixes CVE-2026-114406 in the same editor patch. The Android JDK is a separate
dependency: the installed Corretto version's
[official changelog](https://github.com/corretto/corretto-17/blob/17.0.21.0.11/CHANGELOG.md)
records CVE-2026-114820's fix. Its installed metadata and Amazon Authenticode
signature were inspected. Do not switch to the older installed BellSoft
17.0.21.0.2 or Unity's optional OpenJDK 17.0.18+8.

The previous editor, 6000.3.24f1, already addresses
[CVE-2025-59489](https://unity.com/security/sept-2025-01); that older advisory is
not the reason for this upgrade.

## Acquisition and licensing

Use Unity's [official release API](https://services.api.unity.com/unity/editor/release/v1/releases?version=6000.3.27f2&limit=1)
and its HTTPS download host. All selected endpoints returned HTTP 200 with the
published lengths during review. The API publishes MD5 for these installers;
verify length and MD5, then require a valid Unity Authenticode signature and
record SHA-256 before executing each installer.

| Installer | Bytes | Published MD5 |
| --- | ---: | --- |
| UnitySetup64-6000.3.27f2.exe | 4236703648 | 744bc44034de6ee230656232e186fb6e |
| UnitySetup-WebGL-Support-for-Editor-6000.3.27f2.exe | 930219208 | f9ac7bb5497232f3bb49cca9ba14cd5a |
| UnitySetup-Android-Support-for-Editor-6000.3.27f2.exe | 1549421200 | 0c8cb612dae3bbe789dfe8e3f3bdd26e |

The editor is under the existing [Unity Editor Software Terms](https://unity.com/legal/editor-terms-of-service/software),
and URP retains the Unity Companion License. The repository MIT license does not
relicense those dependencies. Existing Google SDK/NDK authorization remains
applicable. No new package, service, registry, credential or licensing model is
introduced. Complete native security policy and technology/license records were
reviewed; no policy prohibition was found. npm dependency auditing cannot certify
Unity or Java binaries.

## Separate follow-up and verification limits

The first patched-editor import automatically updated the lock to **Burst 1.8.31**
and **Collections 2.7.1**. This expanded dependency review occurred after that
automatic restore and before subsequent builds; it is not represented as prior
clearance. The independent expanded review passed. The editor's bundled package
manifest raises both minimum versions, and both exact archives ship inside the
reviewed editor installer. Their SHA-1 values match the official Unity registry:
Burst `bfa84123c21a3f0463163b6dbc1112f2f6da87e6`, Collections
`88d5bf65ce666aa2dd0127d0a84e7bbf758a76e6`.

| Bundled package | Bytes | Observed SHA-256 |
| --- | ---: | --- |
| Burst 1.8.31 | 431940366 | 05030ee30ceffef62d08f2340b4e768dcb6d2256cbc97557eb5ab2624e2b9cae |
| Collections 2.7.1 | 986560 | 78a92413b2117dac99b324a3a3c82bc836ad1e0203f12d8ba98840bc812f72fa |

Burst source and Collections retain Unity Companion licensing; Burst binaries
retain Unity Package Distribution licensing. Burst changes the default LLVM
version from 21 to 23, so package provenance does not replace rebuilt-player
regressions. Reverting the old transitive versions would violate the patched
editor's minimum-version declarations.

The installed Unity Hub 3.21.3 remains outside the patched Hub versions described
by Unity. Use the reviewed direct installers. An editor patch does not establish
a Hub upgrade. This review authorizes neither publication nor a claim that old
distributed players have been rebuilt. Rebuild and source-bind new players,
record actual compatibility checks, and retain device/audio/endurance gaps.

## Android JNI built-in module review — October 30, 2026

**Package:** `com.unity.modules.androidjni@1.0.0`, supplied by the already reviewed
Unity **6000.3.27f2 / 22188f149405** installation. **Gate: PASS**, scoped to enabling
this exact bundled module and retaining the resulting manifest/lock change.
This review preceded that enablement; it does not establish an Android build pass.

The actual Android player build
`Evidence/last-stand-architecture/build-android-20261031T012711Z-70082d/result.json`
failed its `unity-player` stage with exit 1. Its compiler reported CS1069 at
`LastStandUnityBackupTransport.cs:50`: `AndroidJavaProxy` is forwarded to
`UnityEngine.AndroidJNIModule`, and the Android JNI built-in package must be
enabled. The project manifest and lock did not contain that module at review time.
The failed target build remains RED evidence; enabling the module must be followed
by a new successful actual Android build, without disabling the adapter or tests.

| Review dimension | Finding |
| --- | --- |
| License | PASS — proprietary Unity Editor/Runtime software under the existing [Unity Software Terms](https://unity.com/legal/editor-terms-of-service/software); not a separately licensed registry library. The built-in descriptor has no separate license field/file. No new terms or license model are introduced. |
| Provenance | PASS — installed under `Editor/Data/Resources/PackageManager/BuiltInPackages/com.unity.modules.androidjni` in the reviewed editor. The editor package index declares version and minimumVersion `1.0.0`, `isDefault: true`, and introduction in `2019.2.0a4`. This inherits the verified official editor/Android-support installer provenance recorded above; the individual managed DLLs do not have separate published installer checksums. |
| Maintenance | PASS — supported Unity 6.3 LTS engine component, delivered with the current patched editor. [Unity's 6000.3 module documentation](https://docs.unity.com/en-us/engine/6000.3/manual/packages-list/packages-all/pack-build/com-unity-modules-androidjni) identifies this exact package and states that built-in versions match the editor. |
| Known CVEs | PASS — no additional unresolved critical/high advisory identified for this bundled module in the bounded official Unity security/release review. The earlier editor/JDK advisory decisions remain applicable. This is not a claim that undisclosed defects cannot exist; the npm audit command does not audit Unity engine modules. |
| Supply chain | PASS — descriptor declares `type: module` and an empty dependency object. Its directory contains only the descriptor, Unity metadata and an empty module-compilation trigger. Enabling it selects engine-provided JNI assemblies; no new registry dependency, remote installer, package lifecycle script, JDK, credential or Android permission is introduced by this package. |

Observed local identities, all from `C:/Program Files/Unity 6000.3.27f2/Editor/Data`:

| Input | Bytes | SHA-256 |
| --- | ---: | --- |
| `Resources/PackageManager/BuiltInPackages/com.unity.modules.androidjni/package.json` | 322 | 9bfac0cf176cbe7f88dcd26a086e8ee493f8371e944d254776e7ec8eb0875c08 |
| `Managed/UnityEngine/UnityEngine.AndroidJNIModule.dll` | 115200 | 1aacbd2ff0e512175be3f4e761f5f0ccffa61948e369f30eea2d0a487412ad32 |
| `PlaybackEngines/AndroidPlayer/Variations/mono/Managed/UnityEngine.AndroidJNIModule.dll` | 117248 | 446de349f2aef56c82d1ee4a48962c636439f7c70491cf9dfa73f51e9a6a6e50 |
| `PlaybackEngines/AndroidPlayer/Variations/il2cpp/Managed/UnityEngine.AndroidJNIModule.dll` | 117248 | f51a8b7ffe40b96e199efdd8c9a5bc3e40dd9cdbb8508fbbdd9b34058114cbaf |

The full format-selected security policy and technology/license declarations
already reviewed in this session remain unchanged. Current findings: CRITICAL 0,
HIGH 0, MEDIUM 0, LOW 0. The reviewer did not install or enable anything and changed
only this review record. The build owner must add `"com.unity.modules.androidjni":
"1.0.0"` to the project manifest, resolve the matching built-in lock entry through
Unity, and retain the exact-target rebuild result separately from this PASS.

## Reviewed Editor import diagnostics and build-resource ownership

The Android build `build-android-20261031T014640Z-52f672` produced an APK and a
successful Unity player result, but the wrapper correctly retained a failed
receipt under its then-current whole-log warning rule. Lines 481–502 contain
18 warnings: two copies of nine precision conversions in the upstream
`TraceVirtualOffset.urtshader` import, before `InitialRefreshV2` completes.
There are no later shader diagnostics in that log. The same import warnings
predate this upgrade (`.codearbiter/sprint-log.md`, Android attempt
`210423Z-ce3ee6` on October 28); its cache-dependent retry did not prove clean
import repeatability. Neither failed receipt has been relabeled.

The current core package source identifies this asset as a
`ProbeVolumeBakingResources` resource. Its active
`ProbeVolumeBakingResourceStripper.CanRemoveSettings` returns `true` for player
builds. These are Editor baking diagnostics, with an explicit reviewed source
boundary; they are not classified as harmless compiler warnings. Microsoft
documents [minimum precision](https://learn.microsoft.com/en-us/windows/win32/direct3dhlsl/using-hlsl-minimum-precision)
as a possible loss of accuracy. No vendor statement declaring this exact warning
set harmless was found in the bounded official-source review.

The build owner now records the complete shader diagnostic text and line numbers,
and classifies only these exact nine `d3d11` conversion signatures during the
matching Editor import. Every shader error, unknown warning, later importer,
player-build diagnostic, changed source identity, malformed phase, or mismatched
target remains blocking. An explicit producer marker binds these seven files
in order, using SHA-256 of UTF-8 text with LF line endings:

| Relative path in `com.unity.render-pipelines.core@17.3.0` | SHA-256 |
| --- | --- |
| `Editor/Lighting/ProbeVolume/VirtualOffset/TraceVirtualOffset.urtshader` | 9d77a920a1f53b09a9b6bac00540f357f700151dfffbf61520833bb354c8cd4a |
| `Editor/Lighting/ProbeVolume/ProbeVolumeResourceStripper.cs` | 472dd50162bb14b99fb707d35ba880607a70f8d5f9db4ece3383fdf88b2f420b |
| `Runtime/Lighting/ProbeVolume/ProbeVolumeGlobalSettings.cs` | 27ff6a287c3b8e4c7d979cfcd5964ea2e94b341e6c32407d70396a6ff88d250f |
| `ShaderLibrary/Sampling/Fibonacci.hlsl` | 142f2411b6854a4d68077fda893c3ac90ec13f9a94fe429b2bac8ab7d9cd0048 |
| `ShaderLibrary/Sampling/Hammersley.hlsl` | 69ec8e738afd4641c24976fbe8f07da1cdea6ef012ff21daef4f573ad56f7f88 |
| `ShaderLibrary/Sampling/Sampling.hlsl` | 2ac6f764056f27d70d62570ef00dd26f38be61d1f8d7701737445ce48981309f |
| `ShaderLibrary/Common.hlsl` | 0a6a5fcf220db789b3cebf0421b71ba19a0fca9846bc6036f776f0254571c035 |

The SHA-256 of the concatenated `path=hash\n` records is
`6dd0b39320f30fca7b8d6fcc067820f469beab2480f977861f22e46225e78a3d`.
All seven inputs match the retained 6000.3.24f1 bundled core after newline
normalization. The finite diagnostic paths retain the observed old cache
fingerprint `0bb36005e9ba` and current `6c7e6aba313a`; a folder fingerprint alone
does not confer source approval. This is a diagnostic disposition, not a new
dependency installation, upstream source patch, or blanket package certification.

`--refresh-editor-shader-import` forces a synchronous reimport of only the named
asset using `ForceUpdate | ForceSynchronousImport`, with begin/end evidence
required by admission. It does not delete Library or claim that every shader
compiler cache was empty. A new actual target build must establish this path;
the focused tests alone do not qualify Android or the device.

The installed performance framework 3.5.0 also writes
`Assets/Resources/PerformanceTestRunInfo.json` and
`PerformanceTestRunSettings.json` during ordinary builds, and removes them in its
post-build callback. A failed/killed build may bypass that callback. The shared
build owner now refuses pre-existing files at those four JSON/meta paths, owns
only newly generated outputs, waits for confirmed child exit, preserves original
folder metadata, and removes a newly owned directory only when empty. It records
cleanup hashes and failures. Linked paths, unexpected assets and unconfirmed
child exit preserve data and block admission. No Resources-wide ignore or
recursive deletion is introduced.

The author of this build-owner repair ran its focused regressions; independent
review and fresh target-build evidence belong to the parent build owner. This
section does not self-certify those implementation or platform gates.
