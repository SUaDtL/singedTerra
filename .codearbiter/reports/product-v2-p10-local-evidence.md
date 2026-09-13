# P10 local delivery evidence

Prepared 2026-09-13 for the Crosswind Qualification implementation. This report
records local evidence, not production deployment, hosted capacity or a real
reward. The candidate was integrated in `product-v2-p10-delivery` from main
`561e4918ce7e4d2ee2fcfd2b3a445a78c5f1bd96`; that base SHA does not identify the
uncommitted implementation. The original checkout and old implementation worktree
were preserved. Final release identity comes from the delivery commit and CI.

## Delivered behavior

The separately admitted cq1 trial uses seed 42, wraparound walls, Baby Missile
only and at most three human salvos. A fully settled human salvo damaging the CPU
qualifies. Browser play and backend verification consume the same retained
artifact. Only an immutable server receipt can present the permanent medal and
200 first-clear career XP; later clears grant zero. Career projection keeps
replay and challenge contributions distinct. Ordinary practice and ST1 remain
outside reward admission.

The existing Verified Deployment top tab now contains explicit Deployment orders
and Crosswind Qualification choices. Only the selected operation and its action
render. Selection does not allocate a trial. Returning from gameplay selects and
focuses the challenge action. Retry countdowns update in place without replacing
controls or stealing focus. Uncertain completion remains recoverable after the
session deadline because the server may already have committed a receipt.

## Identity and runtime bounds

- Retained cq1 JavaScript: 126,328 bytes, SHA-256
  `c9e3c55636a6cc2407cbc338e674ebfa0a3dd1285f3a95f72dd354fd3c348c81`.
- Migration 024 raw SHA-256:
  `dbce599cdab94e581bac55ea8e904835167a963ba8b957f2fde40851ad123f70`.
- Backend manifest: 22 functions, 24 migrations; validated SHA-256
  `fcf39c775aaccad92347db32aa6b1582faecc0d115b511769c679bd84288d8d0`.
- Native result acceptance is strictly below 1000 ms. The write fence is 10 s;
  an uncertain invocation retains a 410 s account cooldown. Exact cleanup after
  synchronous execution ends can release that cooldown. No forced CPU termination
  or strict CPU exclusion is claimed.

## Executed verification

| Evidence | Observed result |
| --- | --- |
| Full Edge suite, `npm run check:edge` | 476 tests and 2 nested steps passed |
| Full engine/integration suite, `npm run check` | Passed, including legacy CPU policies, profile boundary, migration guards and retained cq1 corpus |
| Full database suite, `npm run check:database` | All four PostgreSQL harnesses passed |
| Backend release and rollout tooling | 53 tests passed; manifest validated |
| Client coverage | 221 files, 2,119 tests passed; 90.77% statements, 83.17% branches, 89.19% functions, 93.82% lines |
| Subsequent countdown correction | Failing focus regression reproduced; 99 focused main/Lobby/view tests passed after fix |
| ST1 compatibility | 31 bound sources passed after independent incremental review |
| Dependency audit | Zero vulnerabilities |
| Final production build | Passed; existing large-chunk advisory remains |
| P10 browser journeys | 24 passed across desktop, touch landscape and small desktop |
| General browser suite | 419 passed, 24 existing conditional skips; the remaining proxy check passed on focused rerun after supplying the missing expected backend origin |
| Five-profile HUD suite | 83 passed, 27 existing viewport-specific skips |

The real PostgreSQL checks cover historical 001–020 upgrade through interrupted
021 and fix-forward 022, existing action/receipt and room cleanup behavior,
immutable first-clear rewards, rollback and ACL enforcement. Six new races use
separate connections and observed PostgreSQL blocking to prove start/resume,
challenge/probe exclusion, same-receipt retry, competing first clears and both
legacy/challenge orderings. A mock RPC assertion alone was not counted as this
transactional proof.

The retained benchmark ran 21 fixtures with five warmed samples each: all 105
passed, 2.8849–57.8396 ms on this Windows host. Earlier failing baselines were
retained before meter optimization. These are local measurements, not Supabase
capacity or cold-start evidence. Artifact verification, fixed objective goldens,
21 workload fixtures, legacy CPU corpora and 602 career boundary comparisons
were exercised separately.

Browser tests use a built candidate at the sole preview
`http://127.0.0.1:5198/singedTerra/`, with explicitly mocked Auth/Edge responses
and external network denied. Native angle/power/fire controls drive the actual
retained engine; tests do not inject a terminal result. They cover first/repeat
receipts, pending/busy/receipt recovery, disabled starts, persisted-shot resume,
career availability and practice isolation. Screenshots were directly inspected
for desktop and compact selection, launch and result layouts. Compact selection
and the action are reachable at separate scroll positions; simultaneous fit is
not claimed. An initial assertion incorrectly measured the selector after
scrolling to the action; both containment assertions remain and now run at their
respective scroll positions, with separate screenshots.

The general browser run's only failure was the operator omitting
`E2E_EXPECTED_BACKEND_ORIGIN`. With the actual compiled loopback origin supplied,
the unchanged test proved that route fixtures succeed while unmocked external
traffic fails through the deny proxy. No runtime or test change was needed.
The retained file LF rule was also verified through actual temporary Git
stage/checkout with `core.autocrlf=true`: all three hashes drift without the rule
and remain exact with it. Both control and corrected checkout evidence remain.

Logs and screenshots are retained under the operator's temporary evidence paths
with prefix `product-v2-p10-`, including `edge-probe-final.log`,
`database-all-final.log`, `rollout-final.log`, `client-coverage-final.log`,
`countdown-red.log`, `countdown-green.log`, `build-final.log`, and
`browser-final2/` plus its log. They contain no production credentials.

## Independent review

PR497's initial Linux CI exposed a real legacy replay slowdown: four of twelve
warmed samples exceeded the unchanged 100 ms limit (maximum111.5366 ms).
Comparative local runs and a CPU profile traced avoidable per-pixel optional
metering in fixed-length terrain loops. The correction charges each complete
column before its loop, keeping the same loop and exact successful work totals.
It leaves the frozen cq1 artifact untouched. The base local twelve-sample run
measured57.0078–73.7151 ms, the initial candidate61.7543–85.1831 ms, and the
corrected candidate57.6894–72.6303 ms. Every sample is retained in
`product-v2-p10-perf-compare/`; no ceiling or sample selection changed.
Post-correction full engine checks, production build, terrain/clone/meter/workload
checks and all476Edge tests pass.
Hosted CI still has to validate the corrected candidate.

Additional pre-rollout rehearsal used an isolated existing Supabase PostgreSQL
17.6 image, matching production's major version. The unchanged SQL and all six
concurrent races passed. The image build143 differs from production155; this is
local compatibility evidence, not hosted proof. The temporary script, exact input
hashes and log remain in `product-v2-p10-pg17-acbc7dc859c14f0f8fc2bdffb0ffc9f4`.

Astra reviewed integration, retained-output validation, probe, UI behavior and
rollout boundaries. Sol reviewed migration/auth/security, the fixed probe,
legacy compatibility, dependencies and coverage. Findings corrected before
delivery include shared rather than per-operation challenge rate buckets,
terminal result ordering, uncertain receipt recovery after expiry, exposed
Retry-After, competing launch actions and countdown focus loss. Secret scan
candidates were classified as inert test fixtures or password autocomplete
attributes. Migration and sensitive-line pass markers bind the reviewed content.

ADR-0019 remains proposed; recorded owner decisions authorize the reward and
Supabase architecture. No ADR acceptance, backend rollout or public enablement
was inferred. The disabled rollout proposal and runbook are separate artifacts.
Hosted timing/lease observations and real first/repeat reward proof remain T29
and T30 after their exact rollout and enablement approvals.
