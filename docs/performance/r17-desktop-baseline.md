# R17 desktop performance baseline

This document defines and records the first R17 browser measurements. It does
not set a performance budget.

## Candidate and command

The initial candidate is the P03 preview at
`http://127.0.0.1:5198/singedTerra/`, based on `e49b424`. Before running, the
parent must independently verify the served bytes before and after the run,
record the dirty-source patch hash when present, and supply an identity label.
The initial expected bundle hash is
`bb9a84258781d58fe0b6ffe0d91c5b11994232fef6024edc5247fab10a96572f`.
The harness records these as external operator claims; it does not verify that
an identity string is a clean Git commit. If identity or bytes differ, retain
the output as a separate candidate rather than comparing it to this baseline.

For canonical timing, run only after the P03 browser review releases the sole
preview:

```powershell
$env:E2E_LIVE_URL = 'http://127.0.0.1:5198/singedTerra/'
$env:E2E_DENY_EXTERNAL_NETWORK = '1'
$env:R17_MEASURE = '1'
$env:R17_EXPECTED_BUNDLE_HASH = 'bb9a84258781d58fe0b6ffe0d91c5b11994232fef6024edc5247fab10a96572f'
$env:R17_SOURCE_IDENTITY = '<parent-supplied source SHA plus dirty patch hash, if any>'
$env:R17_OS_VERSION = '<operator-observed Windows version>'
$env:R17_POWER_STATE = '<operator-observed AC/battery state>'
npx --no-install playwright test e2e/performance-baseline.spec.ts --project=desktop-fine --workers=1 --retries=0 --headed --trace=off
```

`E2E_LIVE_URL` suppresses the configured build/web-server and targets the
already-running candidate. `E2E_DENY_EXTERNAL_NETWORK` keeps the local hot-seat
scenario from reaching the candidate's compiled Supabase endpoint. The browser
must be the only active browser-performance job. `R17_MEASURE=1` is a required
opt-in: without it the harness is skipped so ordinary `test:e2e` and CI runs do
not create an uncontrolled headed benchmark. No required regression test is
skipped or relaxed. Do not run the Node replay benchmark in the same measurement
window.

Trace-on runs are diagnostic setup proof only; their performance numbers are
not canonical. When that evidence is needed, run it separately with the same
environment above but replace the final `--trace=off` with `--trace=on`, and
preserve it apart from canonical JSON.

## Recorded environment and raw artifact

The harness writes and attaches
`test-results/**/r17-desktop-baseline.json`. It retains the warm-up and all five
samples for every scenario, exact browser version, user agent, platform,
language, viewport, DPR, hardware concurrency, device-memory hint when the
browser exposes it, reduced-motion setting, timezone, candidate URL, expected
bundle hash, and externally supplied source identity. It also records the
actual `observedAt` timestamp plus nullable externally supplied OS-version and
power-state fields. The harness does not invent host identity: unavailable
external fields remain `null`.

Each sample has its own browser context and its complete before/after Chrome
DevTools `Performance.getMetrics` values for `TaskDuration`,
`ScriptDuration`, `LayoutDuration`, `RecalcStyleDuration`, `JSHeapUsedSize`,
and `JSHeapTotalSize`. It also retains the browser-visible
`PerformanceResourceTiming` transfer, encoded-body, and decoded-body byte
fields. `windowDurationMs` is browser-clock elapsed time for the named window.

Every manually-created browser context applies its own loopback proxy and route
guard. The harness rejects any `E2E_LIVE_URL` except the exact
`http://127.0.0.1:5198/singedTerra/` candidate before navigation, and aborts any
HTTP request outside that origin. This is necessary because manually-created
contexts do not inherit the configured Playwright fixture context.

No sample is discarded. A Tukey-IQR flag marks an unusual retained
`TaskDuration` delta only; it is descriptive and never changes a summary.

## Scenarios

All scenarios use the existing `?e2e=hotseat` entrypoint. It creates the fixed
two-player hot-seat game through the ordinary game startup path, with no
backend. The existing first-salvo preference is set before navigation, then the
existing `gotoRunningGame` helper confirms a running HUD. The 1440x900 viewport
is selected inside the harness and is labelled desktop standard.

| Scenario | Window | Actual measurement |
|---|---:|---|
| Idle | 10 seconds after the existing one-second opening-effect settle | Main-thread/layout/heap deltas while the static `PLAYER_TURN` scene remains open |
| Aim | 20 real `Aim barrel right` Playwright clicks, each followed by a 100 ms wait, then two animation frames | The browser work of the existing displayed-angle aim/render path; not input-to-photon latency |
| Impact | Existing fire control click through disabled firing state to re-enabled control | The full local hot-seat fire, flight, resolve, and handoff window |

The diagnostic trace and canonical raw sample sequence are the evidence. A low
`TaskDuration` does not prove low GPU time, energy use, thermal behavior, frame
presentation, or mobile performance.

## 2026-09-13 measured record

The sole preview was measured in the released exclusive headed-browser window.
The canonical raw artifact is
`docs/performance/artifacts/r17-desktop-canonical-trace-off.json`
(SHA-256 `490f7c7e713b8ecd349073205950fc0f772e9f7b84c744d768f407aa93d210be`).
It records `observedAt` `2026-09-13T03:03:51.355Z`, Chromium
`153.0.8010.12`, 1440x900 CSS pixels, DPR 1, 32 reported logical processors,
and 32 GiB browser device-memory hint. The external operator fields identify
Windows 11 Pro `10.0.26200` build 26200; power source was not inferred and
thermal state is unknown. Candidate hash and source identity are externally
verified operator evidence recorded verbatim in the raw artifact: they are not
verified Git identity claims made by this harness.

The canonical command used `--trace=off`. It is the only desktop timing record
here suitable for later like-for-like comparison, still without a budget. The
earlier trace-instrumented diagnostic JSON is retained at
`docs/performance/artifacts/r17-desktop-trace-instrumented.json`
(SHA-256 `f768422cbf6d09d5806c13abdb300f0e1b6693004a94ba2aa6c7ac95de9132e5`).
Its 88,907,106-byte trace contains continuous screencast frames and DOM
snapshots, so its numbers remain workload provenance only.

All six idle samples retained `player-turn` before and after the 10-second
window. All six aim samples changed the displayed angle from 45 degrees to 65
degrees after 20 `Aim barrel right` clicks. All six impact samples completed
the normal disabled-firing-to-reenabled-control path. The first sample of each
scenario is a retained warm-up; the table summarizes the other five. It is
descriptive only and sets no budget.

| Scenario | Browser window, min / median / max (ms) | CDP TaskDuration delta, min / median / max (ms) | CDP ScriptDuration delta, min / median / max (ms) |
|---|---:|---:|---:|
| Idle | 10,006.3 / 10,017.6 / 10,020.2 | 319.155 / 349.392 / 451.123 | 125.836 / 137.288 / 182.962 |
| Aim | 2,850.7 / 2,865.9 / 2,886.0 | 196.828 / 204.341 / 213.090 | 79.006 / 86.169 / 89.181 |
| Impact | 1,389.3 / 1,396.1 / 1,412.3 | 167.112 / 172.904 / 200.282 | 118.145 / 120.453 / 140.853 |

CDP reports the four duration metrics in seconds; the table converts only
their deltas to milliseconds. `windowDurationMs` is already milliseconds.
`JSHeapUsedSize` and `JSHeapTotalSize`, plus their deltas, remain raw bytes in
the JSON. They are endpoint occupancy/capacity snapshots and can move with GC;
they do not measure allocated bytes. The diagnostic trace is retained locally,
outside tracked artifacts, at `test-results/r17-desktop-trace-instrumented.trace.zip`
(88,907,106 bytes; SHA-256
`3dd4a245c9257af12996f7b9e0675cfba7d9d38c92535cd7bc5be39813251456`). It
includes manually created contexts, candidate navigation, DOM snapshots, and
screencast frames.

Each fresh-page post-window `PerformanceResourceTiming` snapshot is identical:
6,571,228 transfer bytes, 6,558,928 encoded-body bytes, and 7,873,903 decoded
response-body bytes. This is the page lifetime resource snapshot for each
fresh context, not scenario-specific traffic, decoded image memory, GPU
residency, or a network budget.

Two earlier attempts are preserved as setup-only traces: the first asserted an
incorrect phase spelling; the second used keyboard input that did not change
the displayed angle. They contain no retained performance measurements.

The trace-instrumented harness recorded binding fields but permitted them to
be null. The canonical trace-off record was produced after the prospective
revision requiring both fields before it opens a measurement context or page.

## Executed commands and unavailable checks

| Command | Result and evidence boundary |
|---|---|
| `npx --no-install tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --types node,@playwright/test e2e/performance-baseline.spec.ts` | Exit 0; syntax and type validation of the harness. |
| Canonical environment from the command block above, plus `R17_TRACE_MODE=off`, then `npx --no-install playwright test e2e/performance-baseline.spec.ts --project=desktop-fine --workers=1 --retries=0 --headed --trace=off` | Exit 0; canonical 18-sample raw artifact. |
| Same environment with `--trace=on` | Exit 0; diagnostic 18-sample artifact and trace only, not canonical timing. |
| `npm -w @singedterra/client run test -- src/client/NetworkClient.botRetry.test.ts` | Exit 0, 35 passing tests; logical planner-call counts under fake transport, not browser CPU duration. |
| `npx --no-install tsx scripts/checks/verified_cpu_corpus.mjs --policy=3` | Exit 0; deterministic 32-seed work counts. |
| `npx --no-install tsx scripts/checks/verified_duel_benchmark.mjs` | Earlier overlapping attempt: exit 1, 105.5054–135.9616 ms, non-exclusive and not comparable. Repeated once in the released exclusive Node window: exit 0, 55.4517–69.0216 ms. |

Parent supplied P03 client-suite and `npm run check` completions with exit 0;
their exact invocations are not in the R17 execution log. R17 did not run a
build. It also has no physical-device, GPU, energy, thermal, radio, or
input-to-photon check, and no disposable-Supabase reconnect browser check.
These unavailable checks remain unavailable rather than being substituted with
audit probes or source-integration claims.

The raw idle samples include the console phase before and after the 10-second
window and reject anything other than the rendered stable `player-turn`. Aim samples retain
the displayed angle before and after all 20 inputs and reject an unchanged or
non-numeric reading. These prevent either window from silently measuring a
clamped/no-op control state.

## Historical byte-span comparison scope

Preserve the prior exact byte spans and rerun an equivalent candidate
measurement before making an improvement claim. The archived
`mount-D4lvbT_o.js` is 4,208,428 bytes uncompressed and contains 4,114,878
bytes of direct top-level contract initializers (retirement 2,730,917 bytes /
4,002 records). The measured candidate's `mount-BRKaczPr.js` is 234,989 bytes
uncompressed, and all eight historical schema identifiers have zero
occurrences. Its per-page resource entry reports 36,308 encoded-body bytes,
36,608 transfer bytes, and 234,989 decoded response-body bytes. These chunk
and response byte spans are not heap occupancy, decoded image residency, GPU
memory, or guaranteed end-user savings.

After the canonical run, all 60 files served from
`http://127.0.0.1:5198/singedTerra/` byte-matched
`product-v2-p03/client/dist` at P03 commit
`05b2bf162efb994f99746d1ab93692b3d9ce2988` (zero mismatches; recorded
inventory SHA-256
`bb9a84258781d58fe0b6ffe0d91c5b11994232fef6024edc5247fab10a96572f`). That
commit retains the measured `e49b424` base plus tracked-diff identity
`c268683f28e7903e6afad18b4e68b016930993903eb0bfa36eae14da7b2f31b0`; parent
confirmed its subsequent changes were report appendix and whitespace only.

## Separate bounded CPU evidence

The browser harness does not instrument production code. Existing
`NetworkClient.botRetry.test.ts` counts calls to the real planner through a
test module seam. Its relevant cases establish one plan through 60 frames with
an unresolved submit, and one plan through an accepted weapon-plus-accessory
preparation followed by fire. These are logical invocation counts under a fake
transport, not browser CPU-duration results.

The immutable v2 audit's F33 baseline recorded 60 real planner calls and one
request across 60 repeated callbacks while submission was pending
(`singedterra-plan-v2.json`, F33 evidence). The current source test records one
planner call for the equivalent 60 pending frames. The historical count was
not rerun against the retired source in this task; current accepted preparation
and pending-guard counts were rerun as described above.

`scripts/checks/verified_cpu_corpus.mjs --policy=3` provides deterministic
work-count evidence only. At this candidate its pinned corpus maximum is 49
probes, 5,074 simulated ticks, 92 human-opening ticks, and 138 CPU-shot ticks.
`verified_duel_benchmark.mjs` is a warmed Node replay wall-clock check, not a
browser benchmark. Run either only outside the desktop-browser measurement
window and report it as Node-host evidence.

The corpus command passed its 32 seeds with observed maxima of 49 probes,
5,074 simulated ticks, 92 human-opening ticks, and 138 CPU-shot ticks. In the
released exclusive Node window, the unchanged warmed `verified_duel_benchmark`
completed 12 measured samples below its existing 100 ms limit (55.4517–69.0216
ms) on Node v24.18.0 / Windows x64. An earlier overlapping 12-sample attempt
(105.5054–135.9616 ms) failed that existing limit; it is preserved as
non-exclusive and is not comparable timing evidence.

Parent independently verified that the relevant Node measurement sources did
not change between `e49b424` and P03 commit `05b2bf1`: `shared`,
`client/src/client/NetworkClient.ts`,
`client/src/client/NetworkClient.botRetry.test.ts`,
`scripts/checks/verified_cpu_corpus.mjs`, and
`scripts/checks/verified_duel_benchmark.mjs` had an empty scoped diff. This
binds the R17 worktree's Node counts and benchmark to the measured P03 build
for those sources only.

## Reconnect status

No reconnect browser timing result is produced here. Existing lockstep tests
use a fake Supabase/Realtime and fetch seam, so they establish reconnect/resync
semantics rather than live browser transport cost. A reconnect measurement
requires an explicitly disposable local Supabase stack, a candidate compiled
for that stack, two controlled browser contexts, and a recorded outage/resume
interval. Do not use production rooms or reinterpret the fake transport test
as a browser or physical-network result.

## Scope limits

Resource timing is an observed transfer/encoded-body value. It does not expose
decoded image memory or GPU residency; `width * height * 4` is at most a
separately labelled estimate when image dimensions are observed. This desktop
browser run does not measure physical mobile CPU/GPU, battery, radio, thermal
behavior, accessibility, or human response. No optimization decision follows
until a dominant measured scenario remains after the completed CPU/pacing work.
