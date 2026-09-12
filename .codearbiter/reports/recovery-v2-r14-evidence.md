# Recovery V2 R14 evidence

Date: 2026-09-12
Worker: GPT-5.6 Sol, high reasoning
Isolated branch: `codex/recovery-v2-r14`
Accepted backend base: `c04436489b29c83d3263fe249c7f10b36ca25716`

## Bounded result

This candidate adds a pinned, fail-closed backend release capability. It does
not deploy a backend, change GitHub or Supabase settings, mutate a database,
merge, commit, tag, release, or activate the R07 client path.

The checked-in manifest inventories 22 migrations, all 17 configured Edge
Functions, function shared source, verified-replay shared source, project
config, CLI 2.105.0, retained command/casual versions, verified deployment
tuples, historical tuple 1/1/3, and the fix-forward recovery class. It contains
no candidate/source SHA. The workflow dispatch binds the actual current-main
commit to the reviewed manifest digest instead.

The credential-free job checks the immutable checkout before Node setup or
repository-owned code, then requires the exact current-main SHA, manifest,
newest successful unsuperseded exact-SHA push-CI attempt, CLI, inventories, and
explicit environment policy. The protected job rechecks its approved checkout
before setup, revalidates the proposal after approval, performs credentialed
read-only observations and `db push --dry-run`, and only then runs migrations,
noninteractive config, and the exact function inventory. The helper parses the
two-job/ordered-step execution graph and closes the local import graph over the
manifest-hashed roots. Production credentials are referenced only by steps in
the `production-backend` environment job.

The follow-up independent review supplied three executable workflow graph
counterexamples and one alternate-entrypoint counterexample against the prior
candidate. They were accepted as behavioral RED evidence: `revalidate || true`,
`migration list ... || true`, and an extra credentialed migration step before
the read-only preflights all passed the prior oracle; a configured
`entrypoint = "../outside.ts"` escaped the function tree hash. The corrected
tests preserve these exact cases and require rejection.

The proposed environment settings remain unapproved: reviewer `SUaDtL`, an
explicit prevent-self-review choice, administrator bypass disabled, protected
branches only, production values stored at environment scope, and duplicate
repository-level production credential names removed. The workflow remains
fail-closed until the policy is configured. Settings approval and a later exact
SHA deployment approval are separate decisions.

## Source-bound regression

The earlier missing-module result was setup sequencing and is not counted as a
behavioral RED. The retained behavioral oracle reads the actual base workflow
with `git show HEAD:.github/workflows/deploy-backend.yml` and passes that source
to the new contract assertion. It exits 1 with:

```text
Error: Backend workflow must verify the immutable dispatch checkout before repository-owned code runs.
SOURCE_BOUND_RED_EXIT=1
```

That base workflow checked out a mutable default ref, selected partial phases,
and selected the latest CLI; it could not satisfy the required gate.

## R14-FINAL-01 portability correction

The final independent review found that file and tree digests used raw checkout
bytes and raw `stat.size`. With `core.autocrlf=true`, the Windows candidate's
config digest was
`06f80525018129364af49c2fdfc6dc59ca54908a4192039c85180521a6b83e50`,
while the same Git LF blob was
`a5080c168de7136e028b19fd699663d4e2a81d2cda7156a9195121dc4cdbe060`.
The defect affected config, migrations, all function trees, function-shared
source, `shared/src`, and the owner-supplied manifest digest.

The regression was written before the correction. A complete LF-authored
release fixture was copied to CRLF without changing source content and failed
at the intended boundary:

```text
node --test --test-name-pattern="release source digests" scripts/ci/backendRelease.test.mjs
exit 1
Error: Backend config digest does not match.
tests 1; pass 0; fail 1
```

Release source identity now permits only UTF-8 `.json`, `.toml`, `.sql`, and
`.ts`, preserves UTF-8 BOM bytes, rejects NUL bytes and bare CR, and converts
CRLF pairs to LF. Tree framing uses the canonical source byte length and bytes;
path sorting and path framing are unchanged. The existing BOM in
`shared/src/engine/AI.ts` is preserved and changes the digest if added or
removed. The closed workflow digest retains its existing LF normalization.
Manifest entry digests, the manifest candidate digest, and receipt
manifest/migration/function-set fields are canonical source identities.
Management snapshots hash raw API response bytes. JSON CLI observations retain
sanitized structured values without raw hashes or counts; non-JSON observations
retain their raw byte count and SHA-256.

The portability regression also rejects substantive mutations in config, a
migration, a function, function-shared source, and `shared/src`; unsupported
tree types, invalid UTF-8, NUL/bare-CR representations, and BOM changes remain
fail closed. A second test rebuilds every current manifest file and tree from
`git show HEAD:<path>` and `git ls-files`, then compares LF and CRLF copies of
those actual blobs. It requires at least one raw representation difference, so
the proof exercises the repository's real source inventory rather than only a
synthetic config. The ordinary manifest validation continues to hash working
source, so an uncommitted substantive change cannot be masked by the `HEAD`
blob proof.

## Complete-review corrections

The next fresh independent review reported three blocking findings, all
corrected without waiver.

`R14-REVIEW-01` found that the legacy profile harness still owned the former
interactive deploy string. Its integration RED was:

```text
node scripts/checks/profile_identity.mjs
exit 1
FAIL: deploy:backend must exactly match the reviewed pinned-CLI and interactive-config command
```

The harness now imports the complete R14 package-script validator and validates
the manifest-derived function inventory. Its negative probes retain rejection
for masked, unpinned, partial, interactive-config, and implicit-function
commands while every existing auth/profile assertion remains intact. The same
command now exits 0 with its original PASS receipt.

`R14-REVIEW-02` found that a valid escaped TOML table could evade the prior
function-table scanner. The exact regression was RED before the parser change:

```text
node --test --test-name-pattern="closed bare-name subset" scripts/ci/backendRelease.test.mjs
exit 1
AssertionError: Missing expected exception.
tests 1; pass 0; fail 1
```

Python `tomllib` independently parses that unchanged fixture as
`functions.submit_action.env.FILE`. The replacement parser accepts the actual
config's closed subset: bare dotted table names and bare assignment keys, with
function tables limited to `[functions.name]` and one `verify_jwt` boolean.
Quoted/escaped names, array tables, nested function tables, dotted assignments,
and inline function objects now fail closed. The focused regression exits 0.

`R14-REVIEW-03` identified an evidence-description overstatement. Development
guidance and this receipt now distinguish raw management-response hashes,
sanitized structured JSON observations, and raw byte count/hash evidence for
non-JSON observations. No receipt schema or runtime field changed.

`R14-REVIEW-04` found a second TOML lexical escape: outside a function table,
the parser checked only the assignment key and ignored its value. This valid
TOML therefore made a fake header look real to the line scanner:

```toml
[auth.email.template.confirmation]
subject = """
[functions.submit_action]
verify_jwt = false # """
```

Python `tomllib` independently parsed the fixture with no `functions` table;
the apparent header and policy are part of `subject`. The checked-in
`supabase/config.toml` contains no multiline values, so this finding is not
evidence of a credential bypass in the current config. The regression was RED
against the prior parser at the intended boundary:

```text
node --test --test-name-pattern="supported single-line value grammar" scripts/ci/backendRelease.test.mjs
exit 1
AssertionError: Missing expected exception.
tests 1; pass 0; fail 1
```

Every assignment line now has to match one anchored value grammar. Its complete
supported subset is booleans, integers, escaped double-quoted strings, and
single-line arrays of those strings; comments are accepted only after a
complete value, while hashes inside strings remain data. Multiline basic and
literal strings, multiline or non-string arrays, literal strings, floats,
unsupported escapes, trailing text, quoted keys, dotted keys, array tables,
and unsupported table forms fail closed. Function tables remain limited to one
boolean `verify_jwt` assignment. The exact multiline basic/literal forgeries,
fake headers in strings and comments, malformed tails, multiline arrays, and
supported quote/backslash/hash handling are retained as regression cases.

## Verification

Fresh package bootstrap, with no pre-existing worktree `node_modules`:

```text
npm ci --ignore-scripts
added 178 packages; audited 181 packages; 0 vulnerabilities
npx --no-install supabase --version
2.105.0
```

Focused release gate:

```text
npm run backend:release:check
42 tests passed; 0 failed
manifestSha256 357eb0bdb5bc7e7d0ff40d92ee99d42e0dfeb7d87d7f7e6f9e46a8a6055aa543
migrationSetSha256 04e870421aec9f78d94143b7cd3921f739a002f2c0b529e7d5deb78273fa388e
functionSetSha256 c77aba15e0edcb5991e5c35e2406eb890a8c5be6a5fd6e9d9f03c82b1199fc43
supabaseCliVersion 2.105.0
```

The broader non-database release precheck and the repository static gate also
passed after the portability correction:

```text
npm run precheck
exit 0
41 tests passed; 0 failed
PASS: Verified Deployment migration enforces private atomic persistence, idempotency, and authoritative drain semantics.
PASS: Verified Deployment drain CLI is credential-safe and refuses unsafe rollout readiness.
verified deployment V2 transition: PASS

npm run typecheck
exit 0
@singedterra/shared tsc --noEmit: PASS
@singedterra/client tsc --noEmit: PASS

git diff --check
exit 0
```

The complete repository check was also run in this corrected task worktree:

```text
npm run check
exit 0
profile_identity: PASS
verified-duel exhaustive cases: 73124
verified replay benchmark tests: 7 passed; 0 failed
verified CPU corpus and policy: PASS
final edge CI retry check: PASS
```

After the assignment-grammar correction, the directly affected and static
checks were rerun:

```text
node --test --test-name-pattern="supported single-line value grammar" scripts/ci/backendRelease.test.mjs
tests 1; pass 1; fail 0
node --test scripts/ci/backendRelease.test.mjs
tests 42; pass 42; fail 0
node scripts/checks/profile_identity.mjs
PASS: password auth and owner-private progression storage satisfy ADR-0011 plus its bounded ADR-0012 exception.
npm run typecheck
exit 0
@singedterra/shared tsc --noEmit: PASS
@singedterra/client tsc --noEmit: PASS
```

The root `.mjs` release tooling has no numerical coverage command. The
`tech-stack.md` coverage entry is client-only (`npm run coverage:client`), and
its lint entry says `None` with `tsc --noEmit` as the static gate. The
release-tooling obligations are therefore verified by the 42-test focused
suite and the successful static gate; no percentage is invented.

The named rejection cases cover automatic dispatch, mutable or insufficiently
verified gate/deploy checkouts, missing approval-time revalidation, missing
environment and administrator-bypass evidence, job-scope or early credentials,
latest CLI and partial phase selectors, missing migration/config phases,
implicit function deployment, unbound receipts, candidate/workflow/manifest
mismatch, failed/superseded/changed-attempt CI, reviewer/branch/self-review/admin
environment policy, symbolic links, incomplete package release commands, and a
real entrypoint rejection before network access. The three reviewed graph
mutations (`continue-on-error`, detached `needs`, and credentials before
revalidation) fail. An explicit Bash pipe-failure probe exits before its
mutation marker. The actual package config script reaches a credential-free
fake CLI with exactly `config push --yes`. That test launches the validated npm
CLI through `process.execPath` and a fixed argument array with `shell: false`,
using a separate fixture package and fixture-local CLI executable.

The workflow validator also requires the normalized source to match the closed
reviewed workflow digest after its graph checks. This closes command suffixes,
extra credentialed steps, and other syntax the narrow graph model does not
support, rather than treating substring presence as execution semantics.

The import-closure fixture accepts regular contained static imports, then
rejects a reachable `../../../outside.ts`, a nonliteral dynamic import, an
unpinned external URL, an import map, and a malformed inventory. The production
entrypoints accept only resolved local inputs inside the hashed function,
function-shared, or `shared/src` trees and pinned HTTPS dependencies. Function
config permits only the default `index.ts` entrypoint and an explicit
`verify_jwt`; alternate entrypoints, import maps, static files, nested tables,
root-level function objects, and unknown fields fail closed.

Disposable PostgreSQL rehearsal:

```text
node scripts/checks/backend-release-postgres.mjs
Backend release PostgreSQL rehearsal PASS: full 001-020 -> interrupted 021 -> fix-forward 022, legacy/V2/V3 compatibility, immutable verified/casual retry, mixed-tuple rejection.
DISPOSABLE_CONTAINERS=0
```

The rehearsal uses pinned `postgres:15-alpine` with no host port and network
disabled. It loads the full actual 001–020 chain with a declared minimal auth
bootstrap, persists active 1/1/3, 2/2/4 and 3/3/4 state plus a completed receipt,
and applies 021. At that defined interrupted-release boundary it proves 022's
surface is absent and exercises the actual retained abandon/completion RPC
seams referenced by the Edge handlers. Applying pending 022 is the compatible
fix-forward repair. State and a receipt written before repair remain unchanged
and immutable afterward. The repaired schema also proves legacy casual
classification, current casual completion and immutable retry, mixed-tuple
rejection, and immutable historical verified receipts.

Static checks:

```text
PyYAML parse: YAML PASS: gate,deploy
git diff --check: exit 0
Supabase 2.105.0 help: db push --linked --dry-run, migration list --linked,
functions list/deploy --project-ref, and config push --yes are supported
```

No production credentials were read and no credentialed remote preflight was
run. The environment/settings policy, exact deployment SHA, environment
approval, backend capability proof, and later client activation remain outside
this candidate. The already-passed disposable PostgreSQL rehearsal and complete
repository check were not rerun for the assignment-grammar correction because
it changes only credential-free config parsing, its unit regression, and this
receipt; the rehearsal harness, migrations, engine, and client remain
unchanged.

## Exact file scope

- `.github/workflows/deploy-backend.yml`
- `package.json`
- `docs/DEVELOPMENT.md`
- `supabase/backend-release-manifest.json`
- `scripts/ci/backendRelease.mjs`
- `scripts/ci/backendRelease.test.mjs`
- `scripts/checks/backend-release-postgres.mjs`
- `scripts/checks/profile_identity.mjs`
- `.codearbiter/reports/recovery-v2-r14-evidence.md`

## Final snapshot-comparison policy correction

A fresh independent complete-candidate review found a policy violation in the
disposable PostgreSQL rehearsal: its four before/after snapshot queries invoked
PostgreSQL `md5` at eight sites. This is a test-tooling policy correction, not a
new production vulnerability or a change to the database release behavior.

The finding was reproduced from the leased source before correction:

```text
rg -n "md5" scripts/checks/backend-release-postgres.mjs
exit 0
8 matches at lines 82, 85, 90, 93, 108, 111, 117, and 120
harness SHA-256 7a28bc98080ad35dc10bdc1a5f7a4d084842e3fd8a146de861d21ba7e58f1444
```

Before the correction, the unchanged behavioral oracle also passed against the
real disposable database:

```text
node scripts/checks/backend-release-postgres.mjs
Backend release PostgreSQL rehearsal PASS: full 001-020 -> interrupted 021 -> fix-forward 022, legacy/V2/V3 compatibility, immutable verified/casual retry, mixed-tuple rejection.
exit 0
DISPOSABLE_CONTAINERS=0
```

The correction removes only the eight `md5` wrappers. The same selected
verified-deployment fields and every verified-match-result field are serialized
with `row_to_json`, aggregated in the same explicit row order, and compared
directly by the same two `assert.deepEqual` calls. All migration, retained-RPC,
compatibility, immutable-retry, mixed-tuple, and history assertions are
unchanged. No production source, migration, workflow, manifest, client, or
shared-engine file changed in this correction.

The corrected harness was rerun using the existing pinned
`postgres:15-alpine@sha256:fe0737ba566a2c5b2a28f34433c0a423261900ec17b9bf7ad115e1aae7e57f1b`
image. The harness itself supplied the unique container name, `--network none`,
no published port, and `finally` cleanup:

```text
docker version --format client/server
client=29.7.2 server=29.7.2
docker image inspect <pinned image> --format image
image=sha256:fe0737ba566a2c5b2a28f34433c0a423261900ec17b9bf7ad115e1aae7e57f1b
node scripts/checks/backend-release-postgres.mjs
Backend release PostgreSQL rehearsal PASS: full 001-020 -> interrupted 021 -> fix-forward 022, legacy/V2/V3 compatibility, immutable verified/casual retry, mixed-tuple rejection.
exit 0
DISPOSABLE_CONTAINERS=0
node --check scripts/checks/backend-release-postgres.mjs
exit 0
rg -n "md5" scripts/checks/backend-release-postgres.mjs
exit 1 (expected: no matches)
```

The no-coverage-tooling statement above remains applicable: this root `.mjs`
harness has no numerical coverage command, and its unchanged real PostgreSQL
rehearsal is the direct parity proof. A broad engine/client check was not rerun
because this correction changes only the test-tooling comparison representation.

Correction completion accounting:

- Task ID: `R14`
- Base and unchanged HEAD: `c04436489b29c83d3263fe249c7f10b36ca25716`
- Result commit SHA: none; the bounded lease prohibits staging and commits.
- Worker: GPT-5.6 Sol, high reasoning.
- Changed paths in this correction: `scripts/checks/backend-release-postgres.mjs`
  and `.codearbiter/reports/recovery-v2-r14-evidence.md`.
- Full R14 candidate path set remains the nine paths listed in `Exact file
  scope`; the other seven paths were frozen and byte-preserved.
- Proof artifacts:
  `C:\Users\brenn\AppData\Local\Temp\singedterra-r14-md5-correction-e868e251a3044fdaa45a20d0d8a95dbd\source-finding.txt`,
  `pre-change-rehearsal.txt`, `post-change-rehearsal.txt`, and
  `post-change-static.txt` in that same directory.
- Review result: the HIGH policy finding is corrected locally; the parent owns
  fresh independent complete-candidate review after integration.
- Remaining risk: no production database or remote release was exercised or
  authorized; that evidence boundary is unchanged.
- Rollback: restore the leased harness at its recorded pre-correction SHA-256;
  database state requires no rollback because both rehearsals were disposable.
