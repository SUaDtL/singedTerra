# deps.audit.0002 sprint receipt

Date: 2026-08-08
Status: in progress

## SMARTS decision

Repair the newly published High nanoid advisory before the next player-facing
slice. It is Specific to the Vite/PostCSS transitive dependency, Measurable
through the existing zero-High audit gate, Attainable as a reviewed 3.3.x
lockfile bump, Relevant because every feature PR otherwise starts red,
Time-bounded to manifest and lockfile governance, and Strong because it adds no
runtime dependency or product behavior. Confidence: high.

## RED baseline and diagnosis

- Unchanged `origin/main` resolves `nanoid@3.3.16`.
- `npm run audit:deps` reports GHSA-2v37-7h3g-55p8 as one High vulnerability.
- The package is a dev/build transitive through PostCSS and Vite. No install
  script has been approved.
- Supply-chain review for 3.3.17 passed, but the approved plain install
  preserved the existing lockfile.
- Dry-run diagnosis proved `npm update nanoid` is the narrow transitive refresh
  path and currently proposes exactly one package change to 3.3.18.
- The exact 3.3.18 release and mutation command require follow-up dependency
  review before execution.

## Supply-chain verdict

The follow-up dependency review passed with Critical 0, High 0, Medium 0, Low
0. It verified MIT licensing, Node 24 compatibility, no dependencies or
lifecycle scripts, matching registry integrity, npm signature and SLSA
provenance, no current advisory range, and the exact published delta. It
approved the root 3.3.18 override plus the named `npm update nanoid` command
with scripts disabled.

## GREEN evidence

- The guarded dry run reported exactly `nanoid 3.3.16 => 3.3.18`.
- The actual update changed one package and reported zero vulnerabilities.
- `npm ls` and `npm explain` resolve `nanoid@3.3.18` only through
  PostCSS 8.5.24 and Vite 8.1.5.
- `npm audit signatures` verified 143 registry signatures and 64 attestations.
- `npm run audit:deps` passed with zero vulnerabilities.
- `npm run build` passed, including strict typecheck and the Vite production
  bundle.
- `npm run test:client` passed 137 files and 1,021 tests.
- `npm run check` passed the complete deterministic and contract harness chain.
- The dependency diff contains only the root override and nanoid's version,
  tarball, and integrity lock fields.

## Governance note

The historical `.codearbiter/sprint-log.md` contains legacy non-UTF-8 bytes and
cannot be safely changed through the required patch writer. The sanctioned
override in `.codearbiter/overrides.log` authorizes this UTF-8 report as the
append-only sprint record for this slice only; the historical log is preserved
byte-for-byte.

## Adversarial final review

The initial candidate passed adversarial review with Critical 0, High 0, Medium
0, Low 0, and zero merge blockers. The reviewer independently reproduced a
script-disabled `npm ci`, the exact Vite/PostCSS/nanoid graph, signature and
attestation verification, zero-vulnerability audit, production build, 137
client files and 1,021 tests, the complete deterministic checks, and diff
hygiene. No product, CI, deployment, auth, database, or runtime source is in
scope. Hosted exact-head CI remains a post-commit gate.

The later coverage gate correctly reopened the candidate with one High and one
merge-blocking Medium. The High identified an imprecise statement that could be
read as prohibiting the repository's unchanged clean-install lifecycle behavior,
although the reviewed dependency mutation itself used `--ignore-scripts` and
nanoid has no lifecycle script. The contract now states the exact boundary: no
new or changed script is approved or executed by this bump. A reviewer's extra
plain `npm ci` probe is not evidence for that no-script condition and is not
relied upon. The Medium identified that this separate receipt needed a sanctioned
override from the canonical sprint log. Both corrections require exact-diff
re-review before PR creation.

Coverage and designated adversarial re-review independently confirmed both
blockers resolved. Each returned Critical 0, High 0, Medium 0, Low 0, and zero
merge blockers. The dependency manifest and lockfile remained unchanged from
the fully tested commit; fresh graph, audit, diff-hygiene, and governance checks
passed on the corrected branch.

## Exact-head hosted gate

PR #336 head `f34b8661e081a732437e3e15ce691f1a08c5fcb4` cleared CI run
31284179117 (typecheck, deterministic harnesses, production build, Edge tests,
and rendering E2E), CodeQL run 31284179119 plus its status check, and the
CodeRabbit status. Supabase Preview was the expected skip. The standing
merge-to-default authority is now logged for this PR; this audit-only authority
head must independently re-clear exact-diff review and hosted CI before merge.

## Merge and production closeout

PR #336 exact authority head `85c12d04ad50481547c7dfd5e2e914834a903885`
cleared designated adversarial and coverage review with Critical 0, High 0,
Medium 0, Low 0, and zero merge blockers. CI run 31284426350, CodeQL run
31284426337 plus its status, and CodeRabbit passed on that exact head before the
PR was squash-merged to main as `4a44e692b5ac9c043ce94fbbd0cb55ab6cc5c33b`.

Post-merge CI run 31284841763, CodeQL run 31284841795, and Pages run
31284841748 passed on exact main. Pages verified current-main provenance and a
live render smoke. A separate production probe returned HTTP 200 for deployment
metadata, the page, and the current JavaScript asset; metadata identifies exact
main SHA `4a44e692b5ac9c043ce94fbbd0cb55ab6cc5c33b` and Pages run 31284841748.
No Supabase function, schema, configuration, secret, or backend deployment was
part of this slice. Task deps.audit.0002 is done.
