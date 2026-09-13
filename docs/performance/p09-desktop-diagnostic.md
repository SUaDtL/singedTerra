# P09 desktop CPU diagnostic decision

Observed 2026-09-13. Decision: no production optimization for this measured
desktop candidate. Independent Astra review accepted this bounded outcome.

The exclusive headed Chromium run captured one warmup and five retained
windows each for idle, aim, and impact. All 18 windows supported the Long Tasks
API and recorded zero entries. The recurring leading sampled functions were:

| Scenario | Leading function | Median estimated aggregate self time per window |
| --- | --- | --- |
| Idle | battleConsoleLayout | 26.642 ms over a 10-second idle window |
| Aim | battleConsoleLayout | 19.235 ms over the scenario window |
| Impact | Anonymous bundle function | 18.576 ms over the scenario window |

Each led five of five retained samples in its scenario. These are aggregate
window estimates, not single-frame durations or evidence that a function
caused a blocking task. The evidence does not identify a dominant long task
that warrants changing production code. The impact function remains anonymous;
its bundle location is retained without guessing a TypeScript attribution.

## Reproducible evidence

The archive [p09-desktop-cpu-diagnostic-v1.zip](artifacts/p09-desktop-cpu-diagnostic-v1.zip)
contains 18 raw CPU profiles, the diagnostic receipt, the corresponding raw
R17 sample output, both source/bundle bindings, and the execution log.
Archive SHA-256:
`078f2c2587095506692df600b2f244522c5bf4fe18ca61be146d494c54ae5eea`.

The runtime source is `5455eb5f918db0d19dd5709aa2d9ceb74edd9019`.
The five diagnostic source files are bound by inventory SHA-256
`726b84a07971e1e477e14c28a8b5a9ef9a977f91df6b2d6abe78f605794eee15`.
All 60 served build files matched disk; their retained inventory SHA-256 is
`59dcf7ac1711b17d42a97f4bdd88bdcbf12f33e90f933a7da1a7ea337cde0564`.
The diagnostic receipt binds every sample to these identities.

The run used Windows 11 Pro 10.0.26200, the sole loopback preview, one headed
desktop-fine worker, no retries, external network denied, and tracing disabled.
Power state is unknown: the host reported no battery record. Parent paused
other heavy local work throughout capture. Pure analyzer regressions, strict
types, build, and the manual diagnostic passed. Independent verification
recomputed all summaries/recurrence and verified every raw-profile and binding
hash. Canonical tracked R17 artifacts remain unchanged.

The opt-in harness uses a 1,000-microsecond CPU sampling interval. Its explicit
forward-interval estimator leaves startup time unassigned and assigns the
final tail to the last sample. Zero-width observations are counted separately.
CPU samples and Long Tasks have no common-clock causal mapping here.

This accepts only the observed desktop candidate. It does not establish the
performance of the newer combined P04/P06/P11 bundle, physical mobile devices,
thermal behavior, or that jank never occurs. Profiled timings must not replace
the uninstrumented canonical R17 timings. A future repeatable long-task trace
can reopen the optimization decision with its own exact candidate evidence.
