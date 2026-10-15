# Last Stand qualification allocation

PR #524 uses one maintained journey and two closed execution profiles. This is
the explicit owner-recorded exception to the dual-entrypoint allocation in LOOP
AC-10/VERIFY-10/T-06 and UI AC-08/T-09/T-11. The audit row is
`PR524-dual-host-verification-allocation`. Existing approved artifact states and
missing native receipts are retained; this document does not replace them.

`windows-player` is the default and refuses other hosts. It runs the entire
functional journey plus actual rendered WebAudio, decoded cue recordings, native
visible-window blur, motion encoding/muxing, animation callback cadence and capture
overhead checks. Original sample minimums, inclusive windows, RMS thresholds,
50/100/250 ms cadence limits, frame/mux checks and capture-overhead limits remain.
These are measurements on the recorded environment, not universal presentation
FPS, owner listening or visual acceptance. Run one native test at a time.

`linux-functional` is selected explicitly by hosted product CI and refuses other
hosts. It runs the entire gameplay, layout, normal-time model/background/pause,
pending-save/reload/manual Claim, purchase/stronger redeployment, recovery,
input and browser-error journey. Cue admission remains telemetry. PCM, native
visible-window blur and capture/cadence qualification are explicitly unexecuted
here and separately required from Windows. No silent samples or media passes
are synthesized. The former Linux run genuinely failed: a busy software-rendered
main thread delivered only three passive samples in the fixed 1,462 ms window.

Both profiles freshly compile the actual current C# model and compare every one
of its 13,904 rows and 13 fields with the immutable reference. Both bind the
current source/export/served bytes before and after execution. Raw authored-file
hashes remain recorded; a closed seven-file LF-normalized text map compares the
same authored inputs across Windows CRLF and Linux LF checkouts. Runtime, media
and model output hashes retain their raw-byte semantics.

Before merge, exact-head hosted required checks must pass **and** the ordinary
combined evidence check must pass:

```
node scripts/ci/lastStandQualification.mjs WINDOWS_RESULT LINUX_RESULT EXACT_HEAD
```

The check requires both profiles on the candidate HEAD, unchanged authored and
runtime inputs, every assigned obligation and functional branch, retained raw
media digests and actual model parity. Either result alone is insufficient. It
checks execution consistency; it does not create authority or prove execution
merely by reading JSON. Independent review must inspect the genuine runs and
raw evidence. Any relevant candidate change requires fresh matching execution.

Windows tests the candidate branch commit. GitHub's default PR checkout tests
its generated merge commit. Preserve that observed Linux SHA: the reader admits
it only when the fetched Git object has exactly two ordered parents, current
`origin/main` and the exact candidate. The collector itself must be on the
candidate. Fetch the observed merge commit before offline collection; an absent,
stale, reversed or additional parent fails. Hosted run/check identity still must
match the candidate, and all authored/runtime byte comparisons remain required.

Native ownership probes and media work get up to 1,200 seconds of test wall
time. Linux gets 1,800 seconds: its observed software-rendered partial journey
already took 515 seconds, with several mandatory branches still remaining.
The central host budget derives browser, standalone timer and supervisor bounds.
Standalone clocks start before Playwright's separate 180-second web-server
startup allowance; browser/test clocks start afterward. The Python outer
wrapper admits startup and supervised cleanup (1,480/2,080 seconds).
Gameplay time, transient settling, audio windows and every behavioral deadline
are unchanged. The settling input prepares native focus/geometry/hover before
the brief phase, dispatches the actual pointer hold there, and requires paused
settling before subsequent native verification or layout capture.
Prepared input resolves the latest observed enabled button rectangle immediately
before dispatch, so disappearing Shop controls cannot leave a stale Pause target.
It refuses document, viewport or Canvas drift and records the actual resolved
point; native probes and extra result-file writes stay outside the brief input
window.

Linux pauses through the actual public Pause control before its five-viewport
battle layout inspection, then resumes through that control. It records this
as paused battle layout coverage, requires unchanged tick, hull, kills and
terminal elapsed time through the Resume acknowledgement, and validates fresh
normal-time progression against the compiled model. The genuine previous
Linux run reached defeat during live layout capture; this changes observation
strategy, not combat duration. Windows retains live battle layouts and all
original player checks.
