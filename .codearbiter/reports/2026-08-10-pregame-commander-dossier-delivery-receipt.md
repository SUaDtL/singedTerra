# Commander Dossier Delivery Receipt

Task: `ux.pregame.0006`
PR: [#394](https://github.com/SUaDtL/singedTerra/pull/394)
Reviewed PR head: `efb83b42a729cccb72aba87735bd4e1b3ccb3622`
Merge commit: `86a8df1b8eb0f2aec5f41371e5970293462880e6`
Merged: 2026-08-10T22:51:13Z

## Player outcome

- The authenticated masthead now presents a structured Commander Dossier
  instead of truncating the commander identity into a single line.
- The full commander name, current level, and exact XP remaining to the next
  level stay visible before Local, Online, or Quick Duel deployment.
- Compact masthead and preview space increase only when the authenticated
  dossier is present. Anonymous pregame routes retain their prior geometry.
- The existing Player Account dialog, Auth flow, progression arithmetic,
  persistence, and gameplay behavior are unchanged.

## Review and prevention

- The required adversarial reviewer received the approved spec, plan, sprint
  evidence, tests, and exact staged implementation diff.
- Review first blocked a hash-command mismatch, then caught a transport
  truncation marker in the persisted package. The package was regenerated from
  independent per-file diffs and re-reviewed.
- The corrected 711-line package passed with zero Critical, High, Medium, Low,
  or merge-blocking findings.
- Coverage re-audit confirmed causal protection for the real trigger-only
  composition and the dossier-scoped compact layout selectors.
- Security and architecture reviews passed. The state-free scanner found only
  an unchanged mock password literal and the standard `new-password` HTML
  autocomplete token, with zero sensitive added lines.

## Exact-head CI and merge

- PR head `efb83b42` passed typecheck, deterministic harnesses, the production
  build, 1,178 client tests, 267 Edge tests, dependency audit, CodeQL,
  CodeRabbit status, and browser rendering guardrails.
- Hosted browser guardrails passed with 255 tests and 30 intentional
  project-conditional skips in 4m39s.
- Supabase Preview correctly skipped for the client-only diff. No Supabase
  function, schema, migration, configuration, or credential changed.
- GitHub reported the PR clean and mergeable before the squash merge.
- The reviewed PR-head tree and merge-commit tree are identical:
  `b77c3aad3ac6d1932b1715a100c99988bf2aba45`.

## Deployment and production health

- GitHub Pages run [31440007888](https://github.com/SUaDtL/singedTerra/actions/runs/31440007888)
  passed build, current-main verification, deploy, deployed-provenance
  verification, and one post-deploy live smoke test.
- Public `deploy-meta.json` reported merge
  `86a8df1b8eb0f2aec5f41371e5970293462880e6` and run `31440007888`.
- Independent production Playwright verification passed Commander Dossier
  front-door geometry on desktop-fine, Pixel touch, and small-window projects.

## Main-branch follow-through

- Main CodeQL run [31440007910](https://github.com/SUaDtL/singedTerra/actions/runs/31440007910)
  passed on merge commit `86a8df1b`.
- Main CI run [31440007886](https://github.com/SUaDtL/singedTerra/actions/runs/31440007886)
  passed Edge, audit, deterministic checks, 1,178 client tests, build, and
  browser guardrails on the merge commit.
- Hosted main browser results were 255 passed and 30 intentional skips in
  4m6s.
