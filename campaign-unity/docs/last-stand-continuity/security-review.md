# Player continuity security review

Recorded October 31, 2026 UTC for the work in PR #547. The independent
Security/Auth-Crypto reviewer reported **PASS**, with no remaining Critical,
High, Medium or Low findings in the reviewed application scope. This is separate
from the [Unity dependency review](unity-dependency-review.md), and neither review
is a release approval.

The reviewer read the complete native security policy and both reviewer contracts.
The policy remains unchanged. Backups contain local gameplay progress, not account
data, credentials, cloud state or verified entitlements. No application encryption,
signing scheme, cryptographic dependency or new authentication path was introduced.

## Confirmed findings and fixes

Three Medium findings were fixed and rechecked:

| Finding | Resulting behavior |
| --- | --- |
| A retained version-5 backup could expose fewer upgrade slots than the current preview expects. | The preview projects permanent levels to the current track count while preserving the original imported bytes and retained run rules. |
| Android provider close could block completion on the main thread. | The operation settles before provider close, and close runs away from the main thread. |
| An Android operation deadline could disappear when its Activity was recreated. | The deadline belongs to the request and survives Activity recreation. |

The independent reviewer initially ran 16 domain and nine transport checks, then
reran the 16 domain checks after the retained-save preview fix. The Android
verification script was run twice using the installed Corretto 17.0.21.0.11 and
Android 36 API jar. It compiled the real Java sources, exercised five byte-I/O
cases and the bridge's lifecycle, stale-callback and bounded-worker behavior, and
rejected negative controls that restored synchronous close or removed the
request deadline. Those fixtures do not qualify a physical Android device.

The reviewer initially inspected the imported Unity Controls receipt with 27
passes, then independently rechecked the final UI delta: read-only preview
availability, validated research comparisons, cancellation cleanup and completion
text. That delta introduced no new transaction or authority. The review retained
the three expected failing regressions before the fix, then inspected the
30-pass receipt, independently matching all 126 source hashes, editor identity
and log digest. The reviewer did not launch those Editor processes. The
[validation index](validation.json) preserves the original review and final
15-source identity set from before the development-profile follow-up. The reviewer
also inspected its 30-pass Controls and observation reruns, matching source
identities, editor and log hashes. That
Controls run includes explicit recovery of a bounded damaged save from a valid
predecessor, with preview, confirmation and preservation of rejected bytes.

## Separate observed verification

The root agent operated the real Windows OS dialogs for the compiled production
adapter using an explicit retained test profile. Export, import and cancellation
all passed with exit zero and unchanged bound sources. Export readback matched
all 2,912 fixture bytes; import selected that exported file and returned the same
bytes; cancellation returned no document. The hidden console harness loaded no
player profile. This qualifies the Windows adapter's observed paths, not the
complete native player, an Android picker or other device behavior.

The final complete portable run passes all 74 modules and 531 cases with zero
skips. Imported Controls pass 31 checks; eight actual observation packets pass
both maintained readers. The final source-bound builds are WebGL release
`Web-20261031T021631Z-098558`, Windows development
`build-windows-20261031T022146Z-c8c3e5` and Android development
`build-android-20261031T022514Z-409a70`. Frozen packaging, source admission and the
production site build also pass. The earlier CP1252 reporting-wrapper failure
is retained separately from its successful child build and the later clean run.

Android deliberately reimported the exact reviewed Editor baking shader. Its
receipt retains 36 diagnostics classified as reviewed Editor-import warnings,
zero blocking diagnostics, matched target phases and completed resource cleanup.
This is not a warning-free claim. APK Signature Scheme v2 verifies with one
signer using the explicit reviewed Corretto JDK. No physical device was tested.

The sixth packaged browser journey passes 89 checks with zero browser errors,
including real file export/import, read-only preview, explicit replacement,
checkpoint continuation, previous-save recovery, invalid-file refusal, writer
ownership and transfer to a second empty isolated profile. Five failed browser
attempts remain recorded. They separately expose the input-event timing and
runner selection defects, actual short-screen game defects, and a viewport-sizing
fixture error; later success does not erase them.

The earlier actual Windows player journey remains **blocked**. Its fresh isolated
garage rendered, but Computer Use twice routed the intended input to a different
reported window, including after activation and a fresh screenshot. No game
control input was confirmed. All four normal save-slot hashes stayed unchanged,
and only the verified task-owned player was stopped. That attempt used the
identified earlier development build; final native builds do not supply a new
native-player journey. The separate adapter GUI checks retain their own scope.

## Reviewed boundaries

The review covered the progression backup transaction and save owner, the
controller's restore/garage integration, restored session speed, the shared
transport, Windows picker, WebGL file/storage adapters, and Android bridge,
Activity, document I/O and non-exported Activity manifest. It checked ownership,
raw-byte and revision comparison, verified predecessor preservation, readback,
ambiguous-write retry, bounded corrupt-save repair, UTF-8/file limits, fixed
browser callbacks and cancellation/stale-result handling.

The confirmed source identities in `validation.json` distinguish the original
review from later independent reviews of profile isolation, compact UI recovery
and build ownership. The UI and observation receipts predate changes to two
Editor build producers only; their game, UI, emitter and reader inputs still
match. Those producer changes have separate source review and actual target-build
evidence. Full native-player input, Android device lifecycle, hardware audio,
endurance and owner acceptance remain open. This report predates feature
delivery; [PR #547 checks](https://github.com/SUaDtL/singedTerra/pull/547/checks) and
its delivery record carry later hosted outcomes. Merge, publication and deployment
remain separate delivery states.


## Development profile isolation follow-up

For actual Windows player qualification, the implementation now selects one
process-stable native storage root. Only a development build accepts the exact
`--last-stand-test-profile` option and an ASCII identifier of 1 to 32 characters. Gameplay,
preferences and the pre-restore record consume the same root beneath
`VerificationProfiles`. No-option behavior remains unchanged. Malformed,
repeated, release-build and linked-directory requests are refused without
falling back to the normal save. The existing file adapter retains its lease,
ancestor/link and write/readback checks.

The earlier security reviewer implemented this bounded follow-up; it is not a
self-approved extension of that review. The root agent independently inspected
the resolver, both record adapters and actual-source fixtures, and ran all eight
native-profile checks successfully. Those checks compile both release and
development configurations and perform real temporary-file writes/readbacks,
including preservation of default records and two junction refusal cases. The
root's first run exposed a Windows path-length failure at a 64-character
identifier; the implementation now admits 32 characters, rejects 33 and proves
that accepted boundary through complete writes and reads. That failed attempt
is retained as an observed earlier result. This source review qualifies neither
an actual native-player journey nor an Android device session by itself.


## Compact UI and build-owner follow-up

The root independently reviewed the shared recovery-summary scrolling, keyboard
routing, compact caption and Return to Garage status fix. Actual Controls pass
31 cases after retaining the earlier game regression and camera-rebind fixture
failure. Five production UI identities are recorded separately from the original
security review; these changes add no authentication or persistence authority.

The root also independently reviewed the eight-file build-owner repair and reran
17 build and seven shader checks. The author's retained focused log records 43
Python and 17 Node checks. The repair admits only exact reviewed source-bound
Editor-import signatures before matched target phases; unknown warnings, shader
errors, later importers and malformed phases remain blocking. Temporary-resource
cleanup owns four fixed generated paths and requires confirmed child exit.
The original Android compile and shader-guard rejections, Web source-drift
rejection and pre-Unity caller-payload refusal remain failed attempts. The
[dependency appendix](unity-dependency-review.md) records the upstream resource
and stripper evidence without claiming precision warnings harmless.

## Build-owner Auth/Crypto and secrets review, October 31

The continuity reviewer independently reviewed the eight-file build-owner delta,
which that reviewer did not author. The complete live `CTX-SECURITY-CONTROLS`
policy at revision 16, operative scope file, installed Security and Auth/Crypto
contracts, `T-UNITY` at plan revision 36 and the dependency-review appendix were
read. Bounded context selection admitted the required references before the
verdict; native policy and task records were not changed.

**Gate status: PASS. Critical 0, High 0, Medium 0, Low 0.** The new use of SHA-256
is confined to unkeyed build/source and temporary-resource identities. The C#
producer extends the existing Editor SHA-256 use; it adds no application crypto
library, authentication mechanism, key, signature or gameplay authority.
`POLICY-CRYPTO` and `POLICY-SECRETS` remain unchanged. Inspection of the actual
source and added diff found no secret read or logging path, credential literal,
disabled TLS verification, shell execution of untrusted text or banned primitive.

The reviewer independently recomputed the seven-file normalized source digest
`6dd0b39320f30fca7b8d6fcc067820f469beab2480f977861f22e46225e78a3d`.
The eight reviewed implementation hashes are recorded in the validation index;
their combined review epoch is
`104c3a235a8a587d6b0dec2d69181d9eb551adcee092d3ee668ccf79de95d291`.
This specialized policy review is separate from the root's independent build
behavior review and 24 focused checks. It does not qualify a player or device,
declare the upstream precision warnings harmless, or relabel a failed build.
