# R05 applied main-protection evidence

- Date: 2026-09-12
- Repository: `SUaDtL/singedTerra`
- Documentation worker: `gpt-5.6-terra/high`, session
  `01a09722-8dd4-7ae2-87e3-a7ffbebba818`; the parent verified this actual
  session identity.
- Source proposal: `recovery-v2-r05-policy-proposal.md`, SHA-256
  `fae51bc4910be0ed43e239bcc3ba8da04c62d027d66c473ec91dd43d01e2ead9`.
- Scope: the verified applied policy, its Pages rollback boundary, and this
  documentation. This worker made no remote settings mutation, test run,
  browser check, commit, staging change, or service operation.

## Receipts

### AC017: owner-approved application prerequisites

The owner approved the R05 policy before application, conditional on applying
it after the Pages evidence passed.
The merged recovery source is `10d6fe78409f8110cb25c2a484ae906656837f7d`
from PR #475. Push CI run `34713382257` completed successfully. Pages run
`34713382261` completed successfully for the same `main` source. The parent
also supplied the accepted independent R05 proposal review: `gpt-5.6-sol/high`,
PASS with zero findings.

The trusted Pages candidate is artifact `10304581142`, named
`github-pages-34713382261`, with 30-day retention. The artifact inventory
reported it unexpired and bound it to run `34713382261` and source
`10d6fe78409f8110cb25c2a484ae906656837f7d`. Its candidate payload SHA-256 is
`574b9623f00e97f8916776e86ff426213b07394835aadcd6b2744107bcba2354`.

### AC018: narrow main-protection application

The full before snapshot had strict required checks enabled, two app `15368`
checks, and administrator enforcement disabled. The applied request retained
strict mode and those two exact app-bound checks, then added only
`e2e · rendering guardrails` with app `15368`. Its result contains all three
checks. The subsequent administrator-enforcement result reports `enabled: true`.

The full after snapshot differs from the before snapshot only by that browser
check and `enforce_admins.enabled: true`. It retained zero required pull request
approvals; disabled stale-review dismissal, code-owner review, last-push
approval, signatures, force pushes, deletion, branch locking, and conversation
resolution; and the other recorded branch-protection fields. The snapshot did
not replace the complete protection object.

### AC019: read-only after-state assertion and Pages rollback boundary

The after-state main-enforcement observation identifies
`10d6fe78409f8110cb25c2a484ae906656837f7d` as protected, with protection
enabled and required-check enforcement level `everyone`. It lists the same
three exact app `15368` checks. The post-application rulesets observation is
an empty array.

The Pages log records the exact transported candidate by artifact ID, then the
general browser suite as 328 passed with 14 profile skips, the product suite as
81 passed with 19 profile skips, and the post-deploy live smoke as one pass.
Rollback may reuse only that exact unexpired trusted artifact through the
rollback-only manual workflow after a separate owner approval. The workflow must
reupload it unchanged, without rebuilding the client. A missing or expired artifact is a
recovery limitation, not a reason to relax branch protection.

## Applied backend-environment policy

The final post-merge environment snapshot lists `production-backend` as
environment `21804832739`. It has required reviewer `SUaDtL`,
`prevent_self_review: false`, `can_admins_bypass: false`, protected-branch
eligibility, and a zero wait timer. The owner approved these settings as a
separate policy decision. No credential inventory was read in this assignment;
the parent reported that the required environment credentials remain
unprovisioned. R14 backend deployment is still unapproved and incomplete. No
production Supabase deployment is established by this record.

## Evidence files and verification

This worker read the artifacts below with PowerShell `Get-Content -Raw` and
calculated the listed SHA-256 values with `Get-FileHash -Algorithm SHA256`.
Those read-only commands exited 0. Paths are under
`C:\Users\brenn\AppData\Local\Temp` unless noted.

| Evidence | SHA-256 | Observed purpose |
|---|---|---|
| `recovery-v2-r05-application-before.json` | `e5a734d6e7899ebcb536690e5ed470cdbccce3e75e6bc44d0563404021c683e4` | Full pre-application protection snapshot |
| `recovery-v2-r05-required-checks-request.json` | `6d0709b799f7c340456a249a0effbed89666933370201d79db2a40dc1c69e068` | Narrow required-checks body |
| `recovery-v2-r05-required-checks-result.json` | `f3f26b810f8545c72b09f2cf28c8f9721285aea640f5e9f77b94644d00331e90` | Applied three-check result |
| `recovery-v2-r05-enforce-admins-result.json` | `a38ca50016182d84b3d5c2c37a21026ef7413063488a1ae5a09f5dcb773a6a92` | Administrator enforcement result |
| `recovery-v2-r05-application-after.json` | `cedf456afad775cc7db62c64704d70ddb008b480e5be565ed87c01b0c1983a9d` | Full post-application protection snapshot |
| `recovery-v2-r05-main-enforcement.json` | `b599b537451b1bb8f81eb391f8b1541b0ec95912d06307b179fbc8907ea4b861` | Protected main and app-bound checks |
| `recovery-v2-r05-rulesets-after.json` | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` | No repository rulesets |
| `recovery-v2-merged-pages-success.json` | `fcb7f0cf5b59eba6c480a44e3dd6510d45bcb45946d354b7ae6843888eccf986` | Successful Pages run and source binding |
| `recovery-v2-merged-pages-artifact-inventory.json` | `4a6ed5dd07e21c53f3f41a3926fe6abf0f11316ee47ebc6aae645afd12113472` | Artifact identity and unexpired status |

The environment evidence is in `recovery-v2-production-environment-put.json`,
`recovery-v2-production-environment-put-result.json`, and
`recovery-v2-postmerge-environments-after.json`. The last file is the final
state used above. The candidate and complete Pages logs are
`recovery-v2-pages-candidate-job.log` and
`recovery-v2-merged-pages-full.log`.

## Limits and preservation

This is evidence of a GitHub branch-policy application and its recorded Pages
publication boundary. It is not a destructive enforcement test, a PR #415
mutation, a backend approval, a credential check, or proof of a production
Supabase deployment. The historical proposal remains preparation evidence, and
the before/after snapshots remain archived source records. No code changed.
