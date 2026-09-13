# P10 backend proposal: disabled cq1 rollout

Prepared 2026-09-13. Status: **local proposal; no backend approval or execution**.
This proposal implements T28 of the approved P10 plan. It does not close T29
hosted validation or T30 first real award. The selected reward remains the
Crosswind Qualification medal plus 200 first-clear verified career XP.

## Final candidate binding: pending

The parent will integrate the reviewed P10 changes onto current main in a fresh
delivery worktree. Bind this proposal only after that candidate is frozen.

| Required field | Current value |
| --- | --- |
| Repository and production project identity | Pending live target verification before approval |
| Exact clean current-main source SHA | Pending final candidate |
| Backend manifest SHA-256 | Pending final candidate; derive with existing validator |
| Migration-set SHA-256 | Pending final candidate |
| Function-set SHA-256 | Pending final candidate |
| Retained cq1 artifact SHA-256 | Pending final candidate validation |
| Required exact-SHA CI run and attempt | Pending final candidate |
| Protected backend workflow run/environment approval | Not requested or executed |
| Hosted runtime/artifact binding and capacity evidence | Not available |
| Public cq1 enablement authority | Not granted |

`node scripts/verified-challenge-rollout.mjs inspect` prints actual local source
and manifest bindings without describing a dirty working tree as a release. Copy
the final clean values into this proposal only after review. Do not copy the old
development HEAD or substitute literal dummy hashes. The backend inventory is
22 functions and migrations 001 through 024, with the retained `.mjs` runtime and
`.d.mts` facade in the existing hashed shared closure. All digests come from
`scripts/ci/backendRelease.mjs`; there is no alternate release manifest.

## Proposed first authorized action

After explicit approval of the bound candidate, dispatch the existing protected
`deploy-backend.yml` workflow with its exact `candidate_sha`, `manifest_sha256`
and `DEPLOY` confirmation. Its `production-backend` approval, current-main/CI
revalidation and fixed migration/config/function inventory remain required.
Approval for this disabled deployment would not enable cq1 starts, approve an
ad-hoc hosted test account or authorize later public enablement.

Migration 024 adds a disabled cq1 catalog/control, immutable session descriptors,
append-only receipts and entitlement awards, current-career ledger reads, and
shared account computation leases/fenced RPCs. New functions serve start, get,
complete, abandon and verified career. Existing costly deployment completion and
probe handlers join the same lease; old RPC signatures remain for compatibility.
No migration edits or rewrites to historical receipts are proposed by T28.

The candidate does not atomically replace deployed handlers. Between schema
installation and verified replacement of both costly legacy handlers, old
instances can bypass the new lease and old finalization RPCs remain callable by
their trusted service path. **cq1 starts must remain disabled throughout this
window.** Exact candidate deployment records plus separately approved hosted
evidence must establish new-handler participation and account for old invocations.
Neither an empty lease table nor a successful source hash check proves that.

## Evidence needed before enablement

1. Final current-main source, validated manifest, exact CI and protected workflow
   outcomes; before/after provider function revision and migration observations.
2. Disabled cq1 control verified against the approved target, legacy V2/V3 and
   receipt compatibility, all three costly routes using current worker/fence
   checks, and no known old-handler bypass window.
3. Exact retained artifact and deployed-revision hosted samples: cold/warm
   duration, CPU/memory, `<1000ms` result acceptance, stale result/refusal behavior,
   account contention, cleanup and the approved 410-second uncertainty assumption.
   Keep all samples and limits; local warmed performance does not satisfy this.
4. Capable client publication and actual browser error/retry/receipt behavior,
   including exposed `Retry-After`; old clients retain their replay-only APIs.
5. Separate, explicit catalog enablement approval, followed by T30 real
   first-clear/repeat-clear/immutable-retry/current-career proof.

The candidate's authenticated `verified_replay_probe` supports empty-body POST
`?mode=cq1&fixture=first-clear`, with one of 21 fixed reviewed fixtures per call.
It uses the native account lease, validates exact retained output and work, and
reports elapsed time and cleanup without allocating sessions or writing rewards.
The default legacy probe remains unchanged. This supplies the mechanism for
separately authorized timing/lease observations while cq1 stays disabled.
Its artifact identity is explicitly `static-registry`, not measured hosted bytes;
deployment receipts and provider revisions must bind those observations separately.
Provider CPU/memory and real receipt writes require their own evidence. There is
no privileged challenge admission mechanism, and public production enablement
remains a separate decision.

## Read-only and control preparation

The [runbook](../../docs/deployment/verified-challenge-cq1.md) is located at
`docs/deployment/verified-challenge-cq1.md` in the repository. From its root:

```powershell
node scripts/ci/backendRelease.mjs validate-manifest
node scripts/verified-challenge-rollout.mjs inspect
node scripts/verified-challenge-rollout.mjs sql status
node scripts/verified-challenge-rollout.mjs assess .\cq1-observation.json
node scripts/verified-challenge-rollout.mjs sql disable
node scripts/verified-challenge-rollout.mjs sql enable
```

The helper never connects or executes SQL. `sql status` prints a database-owner,
repeatable-read query of cq1 controls, unexpired session/account counts and
account/session/edition-bound worker uncertainty. It emits only aggregate facts,
safe-after time and no credentials or user identifiers. `assess` fails closed on
unknown/malformed input and cannot turn a database observation into runtime proof
or approval. `sql disable`/`sql enable` only print the migration's actual
`set_verified_challenge_starts('cq1', false/true)` call for later approved execution.

Disable preserves active descriptors, bounded compatible completion, get/receipt
lookup, awards, retained artifacts and legacy verifiers. Drain requires fresh
observations of disabled admission, zero unexpired cq1 sessions, zero relevant
uncertain workers and no binding mismatch. Safe-after uses both session expiry
and worker uncertainty, not merely the shorter write lease. No schema/artifact
removal, manual lease clearing or automatic re-award/revocation is authorized.

## T28 local verification boundary

The new test command is `node --test scripts/verified-challenge-rollout.test.mjs`.
It covers exact parser shape, counts/deadline consistency, invalid and foreign
evidence, stale observations, disable/drain constraints, actual SQL controls,
print-only CLI refusal and binding through the existing release validator.
Missing-module RED preceded implementation. Independent review and final-candidate
full gates remain parent-owned. No SQL or backend operation was executed while
preparing these files; SQL execution against a real target remains unproven.
