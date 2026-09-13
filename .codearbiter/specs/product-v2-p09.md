# P09 function-hotspot diagnostic

**Status:** Approved by the maintainer's bounded P09 implementation dispatch on 2026-09-13
**Governs:** `e2e/performance-baseline.spec.ts`, `e2e/performanceCpuProfile.ts`, `scripts/checks/performance_profile.mjs`

## Problem

R17 records repeatable aggregate browser work for idle, aim, and impact, but it cannot identify a JavaScript function or prove that any one long task dominates. The P09 worker needs retained function-level evidence before choosing an optimization or accepting a no-change result.

## Approach

Extend the existing manual R17 harness with one explicit diagnostic opt-in. In that mode, CDP CPU sampling and the browser Long Tasks API surround the unchanged scenario window, while a pure helper validates and summarizes the raw CPU profile. This is the smallest seam because it reuses R17's bound candidate, environment, contexts, and real controls without instrumenting production code or creating a second scenario runner.

The trade-off is profiler overhead: profiled durations are diagnostic and cannot replace canonical uninstrumented timing. Raw profiles and long-task entries are retained so later analysis can describe repeatability and observed dominance without inventing a universal percentage threshold.

## Scope

- Add a typed, pure CPU-profile validator and summarizer for same-origin first-party self time.
- Add `P09_CPU_PROFILE=1` to the existing manually gated R17 harness.
- Capture one raw CPU profile and one long-task observation window for each existing warm-up and retained sample: six idle, six aim, and six impact.
- Write only bounded Playwright output artifacts and attach them to the manual test result.
- Write one summary receipt that binds every raw profile to its SHA-256, scenario identity, candidate identity, environment, and diagnostic method.
- Preserve the accepted R17 tracked JSON artifacts byte-for-byte.

Out of scope: production client/shared/backend changes, choosing or implementing an optimization, worker/offscreen/WASM migration, source-map generation, performance budgets, canonical timing replacement, physical-device claims, reconnect measurement, build/server/browser execution in this implementation turn, commit, push, merge, or deployment.

## Decided parameters

- Diagnostic opt-in: exact value `P09_CPU_PROFILE=1`; all other values preserve the existing R17 path.
- CPU sampling interval: 1,000 microseconds, set before each profile starts.
- Capture boundary: immediately around the existing scenario operation, with no change to its controls, waits, assertions, warm-up count, or retained count.
- Raw profile names: `p09-<scenario>-<two-digit ordinal>-<warmup|retained>.cpuprofile` under `testInfo.outputPath`.
- Receipt name: `p09-function-hotspot-diagnostic.json` under `testInfo.outputPath`.
- Long-task support is explicit: unsupported browsers record `supported: false`; absence is never relabeled as zero observed long tasks.
- First-party attribution requires an exact URL origin match with the validated candidate. Browser, Playwright, extension, empty-URL, and other-origin samples remain in total sampled time but outside first-party time.
- Malformed profiles fail closed on sample/delta length mismatch, unknown sampled node IDs, non-finite or negative deltas, duplicate node IDs, and invalid candidate origin.
- CDP `timeDeltas` are converted to cumulative sample timestamps. The
  start-to-first-sample interval is reported as unassigned startup time; each
  sample receives the forward interval to the next sample, and the final sample
  receives the explicit tail to `endTime`. Every cumulative timestamp must be
  finite and inside the declared profile interval.
- Per-sample hotspots are ordered by estimated self time and retain function
  name, URL, zero-based line/column, independently counted sample count,
  estimated self time, and estimated first-party share. A zero-width sample is
  counted when the same function has an attributed interval; a function
  observed only at zero-width timestamps is not ranked as a hotspot.
- Scenario summaries report which top hotspot recurs across retained samples and its observed counts and medians. They do not declare a fixed dominance threshold or an optimization decision.
- SHA-256 is used only to bind diagnostic artifact bytes, within the project's approved build/source-provenance control.

## Acceptance criteria

1. With `P09_CPU_PROFILE` absent or not exactly `1`, the existing R17 measurement path produces no P09 profile or receipt and retains its current schema, scenarios, assertions, and output.
2. With `P09_CPU_PROFILE=1`, a successful manual run captures and attaches exactly 18 raw profiles, one for every existing scenario/ordinal pair, plus one diagnostic receipt; every output path is created through `testInfo.outputPath`.
3. Every receipt sample contains the scenario, ordinal, warm-up status, raw-profile filename and SHA-256, candidate base URL/bundle hash/source identity, long-task support and entries, and a diagnostic-only statement that forbids canonical timing comparison.
4. Given a typed CPU profile, the pure analyzer rejects malformed or
   out-of-interval sample streams and correctly computes the explicit forward
   timestamp estimate, unassigned startup and final-sample tail, same-origin
   first-party estimated self time, stable ordering, and descriptive
   retained-sample recurrence without a hard dominance threshold.
5. Profiler and long-task capture stop before the context closes, including cleanup after a scenario error; the original scenario failure still propagates.
6. The final diff changes only the P09 spec/plan, the R17 manual harness, the pure diagnostic helper, and its focused check; accepted R17 raw artifacts and all production paths remain unchanged.

## Open questions

None. The parent owns the exclusive headed diagnostic run and the later P09 optimization/no-change decision after separate Astra/high review.
