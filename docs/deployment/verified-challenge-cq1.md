# Crosswind Qualification backend rollout

Status: preparation only. Production deployment, hosted validation and cq1 admission
enablement each require the separately reviewed authority recorded in
`.codearbiter/reports/product-v2-p10-backend-proposal.md`. No command in this document
has been executed against a backend as part of T28. Local implementation or a client
publication does not authorize a backend write.

The approved contract is the P10 specification, AC-03 through AC-10, and the
recorded reward/runtime decisions. ADR-0019 remains proposed.
The retained edition is `cq1`, the entitlement is `crosswind-qualification`, and
only its first verified clear awards the medal and 200 verified career XP. Existing
V2/V3 completion and historical receipts remain supported.

## Candidate binding

Run these **local, read-only** commands from the final delivery checkout:

```powershell
node scripts/ci/backendRelease.mjs validate-manifest
node scripts/verified-challenge-rollout.mjs inspect
node --test scripts/verified-challenge-rollout.test.mjs
```

`inspect` uses the existing backend release validator and reports the actual HEAD,
working-tree cleanliness, manifest digest, migration-set digest, function-set
digest and retained artifact digest. It validates all 22 functions, 24 migrations,
shared inputs and the `.mjs`/`.mts` import closure. A dirty checkout's HEAD does not
identify its working bytes. Freeze a clean, reviewed, current-main delivery commit
and record its fresh output in the proposal before asking for backend approval.
The source/manifest fields in that proposal are **pending final candidate** until
then. Do not replace them with the current development branch's HEAD.

Source hashes identify local release inputs. They are not credentials, hosted
runtime identity, approval, worker-death evidence or provider capacity evidence.
The helper always reports `enablementReady: false` and `runtimeIdentity: not-proven`.

## Disabled schema and handler deployment

Use the existing `.github/workflows/deploy-backend.yml` protected workflow with
the reviewed exact current-main `candidate_sha`, `manifest_sha256` and its `DEPLOY`
confirmation after explicit approval. The existing `production-backend`
environment approval remains a separate protected step. Do not substitute direct
CLI deployment, unreviewed function subsets, or a different manifest.

The workflow's existing order is migration dry-run, migrations, config, then the
explicit manifest inventory of functions. Migration 024 is additive and inserts
`verified_challenge_controls('cq1')` with `starts_enabled = false`. It preserves
the legacy deployment RPC signatures and adds the fenced wrapper. Tables deny
direct access to browser roles and `service_role`; exposed RPCs enforce owner and
service boundaries. The five new endpoints are `start_verified_challenge`,
`get_verified_challenge`, `complete_verified_challenge`,
`abandon_verified_challenge`, and `verified_career_summary`.

There is a **mixed-handler bypass window** after migration 024 and during handler
replacement. Old deployed `complete_verified_deployment` and
`verified_replay_probe` instances can still perform costly work without the new
lease, and the preserved legacy completion RPC can still accept their old calls.
Database migration success, the new challenge handler alone, and an empty lease
table do not close this window. Keep cq1 starts disabled throughout it.

Both existing costly handlers must be replaced by the exact candidate, alongside
the new handlers. Confirm the protected workflow's exact source/manifest receipt,
successful phases, recorded migration inventory, and provider function revision
observations. Retain any failure/interrupted rollout evidence and finish forward
with a reviewed candidate; never remove migration 024 to undo a partial deployment.
Account for already running old invocations and provider rollout propagation
before claiming all new admissions use the lease. The approved 410-second crash
cooldown is a conservative native-runtime assumption, not positive acknowledgement
that an old isolate has stopped. Fresh provider limits and hosted observations
must support that assumption; unknown old-handler residency blocks enablement.

## Read-only database observation

There is **no challenge drain/status RPC** in migration 024. Do not invent one or
use browser credentials to inspect tables. An approved operator can print the
following bounded aggregate query and execute it using a separately verified
database-owner connection:

```powershell
node scripts/verified-challenge-rollout.mjs sql status
```

The helper prints SQL only. It opens no connection and executes no statement.
The SQL uses one repeatable-read, read-only transaction and database time. Capture
only the single `rollout_observation` JSON object, without table headings or command
tags, to an operator-owned file. Keep the target/project identity and capture time
in the separate restricted operational evidence record. Do not place credentials,
account IDs, session IDs, worker IDs or raw user transcripts in shared evidence.

```powershell
node scripts/verified-challenge-rollout.mjs assess .\cq1-observation.json
```

The parser requires the exact schema produced by the printed SQL, rejects unknown
fields/editions, missing controls, invalid UTC timestamps, impossible counters and
inconsistent maxima. It accepts a maximum 4,096-byte UTF-8 file. An observation more
than 60 seconds old or more than five seconds ahead of the local clock cannot
establish drain readiness; recapture rather than editing its timestamp. An
assessment's `observedDrained` is true only for a fresh snapshot with cq1 starts
disabled, zero unexpired active sessions, zero relevant guarded workers, and zero
binding mismatches. It is not an enablement approval.

The query counts distinct active accounts and sessions for `cq1`, joins challenge
worker leases by both account and session, checks edition bindings, and keeps
other endpoint workers separate. `safeAfter` is the latest of observation time,
unexpired cq1 session expiry and outstanding cq1 worker uncertainty expiry. An
expired 10-second write lease with an outstanding 410-second uncertainty interval
still blocks observed drain. An expired session row awaiting lazy reconciliation
has no remaining admission authority and is reported separately. SQL observation
does not invoke reconciliation or erase the retained fence counter.

Disabling cq1 cannot drain unrelated legacy/probe work. Conversely, zero recorded
workers does not show that old handlers which bypassed the lease have stopped.
Even a drained observation does not authorize deleting retained artifacts, old
receipts, awards, descriptors or schema.

## Hosted evidence and explicit enablement

Before enabling starts, bind the exact approved deployment and retained artifact
to hosted observations of cold/warm replay durations, CPU/memory, the strict
elapsed `<1000ms` result acceptance boundary, account-wide cross-endpoint lease
contention, stale fences, cleanup, 410-second uncertain cooldown, and bounded
request rejection. Preserve every sample. The full local warmed corpus passing
`<100ms` is not hosted capacity proof. The native synchronous verifier does not
promise CPU interruption at the result deadline.

The candidate extends `verified_replay_probe` with an authenticated, empty-body
POST selector: `?mode=cq1&fixture=first-clear`. Each call accepts exactly one of
the 21 reviewed fixture IDs in `scripts/checks/fixtures/verified_challenge_workload.json`.
The handler supplies the fixed shots itself; arbitrary transcripts, configuration
and batches are refused. Calls share the existing probe rate limits and the
account-wide native verification lease. No challenge session, receipt, award or
career row is created. The default request without selectors retains the legacy
probe contract. This allows authorized cq1 timing and lease observations while
public trial admission stays disabled.

For an approved target and authenticated test account, call the selected fixture
through the existing Supabase endpoint with its bearer token kept out of logs.
Record HTTP status and provider revision for every sample, including refusals.
Retain fixture/probe version, exact result and work counters, `nativeElapsedMs`
and cleanup outcome when present; missing fields remain absent, never zero.
Auth, rate, busy and selector refusals do not supply replay timing or output.
`nativeElapsedMs` covers setup, replay and validation/serialization within the
acceptance gate. It excludes module loading, authentication, RPC/HTTP time and
final response metadata; collect end-to-end request, cold-start and provider
timing separately. Success requires the exact retained golden output and gate
elapsed time below 1000 ms. Rate-limited samples must be retained and rescheduled within the
existing limits; do not bypass the limiter to collect a corpus faster.

The returned artifact SHA and manifest integrity are explicitly
`artifactIdentity: static-registry`: declared provenance, not a measurement of
hosted source bytes. Bind observations to the protected deployment receipt and
provider revision separately. The probe does not measure provider CPU/memory,
prove forced termination, or exercise real challenge receipt writes. Those
evidence boundaries remain explicit in T29/T30. Disabled admission does not
allocate test sessions; do not seed production sessions or temporarily enable
public starts without the separate enablement approval.

Verify unchanged V2/V3 payloads, completed receipt retries, historical XP, and the
new responseVersion 1 contracts before publishing the capable client. In
particular a busy completion must expose `Retry-After` through CORS, with the
same bounded delay in its JSON body. The current implementation uses HTTP 503
for retryable `verification_busy`; it never treats that infrastructure refusal
as an invalid player transcript.

Only after the exact deployment, hosted evidence and capable client are reviewed,
and the owner separately approves cq1 enablement, print the actual control call:

```powershell
node scripts/verified-challenge-rollout.mjs sql enable
```

Its only mutation, when an approved operator later executes it, is:

```sql
SELECT public.set_verified_challenge_starts('cq1', true);
```

No approval or readiness flag supplied to this helper can execute that mutation.
After authorized enablement, capture a fresh control observation and conduct the
separately scoped first-clear, repeat-clear, immutable-retry and current-career
proof. T30 closes only with real server receipts, never a local objective result.

## Stop new admission and drain

The rollback is to stop **new** cq1 admissions while preserving compatible active
sessions and immutable receipts. Print the disable command for the approved
operator:

```powershell
node scripts/verified-challenge-rollout.mjs sql disable
```

```sql
SELECT public.set_verified_challenge_starts('cq1', false);
```

Start intentionally resumes an existing compatible active session before it checks
the new-start control; disabling does not revoke that descriptor. Keep get,
complete, abandon, career projection, retained cq1 and both legacy verifiers
available. Recapture aggregate status until the database reports no unexpired
cq1 sessions and no guarded cq1 workers. Do not clear leases by hand or treat the
10-second fence expiry as worker termination. Existing receipt lookup remains
available after session expiry and does not need replay.

For a correctness incident, separately review a fail-closed completion refusal or
fix-forward handler while retaining evidence and ownership boundaries. No
automatic re-award, revocation, receipt rewrite or destructive rollback is part of
this runbook.
