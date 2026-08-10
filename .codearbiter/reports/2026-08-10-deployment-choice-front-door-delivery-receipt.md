# Deployment Choice Front Door Delivery Receipt

Task: `ux.pregame.0005`
PR: [#392](https://github.com/SUaDtL/singedTerra/pull/392)
Reviewed PR head: `156aad0870ec702773380e0174ab4c5e3039a320`
Merge commit: `1b7ef2d934b37a1fa1cee7105200684388a4e79d`
Merged: 2026-08-10T21:08:46Z

## Player outcome

- The lobby now opens on one focused choice between Quick Duel, Local Battle,
  and Play Online instead of exposing setup before the player chooses a mode.
- Quick Duel remains the dominant new-match action. A validated Rejoin becomes
  the sole primary action for a returning player.
- Local and Online create/join preparation preserve working values and restore
  focus after a chooser round trip.
- Browse Back stops polling and resets Online to Create. A committed Waiting
  Room requires its existing Leave action, so room cleanup cannot be bypassed.
- Compact Back navigation retains a measured 44.44px Pixel-touch target while
  four-player Local preparation remains fully contained.

## Review and prevention

- The required adversarial reviewer received the approved spec, plan, sprint
  evidence, tests, and exact staged diff.
- Initial review blocked background Browse polling, a Waiting Room cleanup
  bypass, a 33px compact Back target, and a visually demoted Rejoin action.
- Each blocker received a causal failing test before correction. The final
  exact staged hash passed with no Critical, High, Medium, Low, or
  merge-blocking findings.
- Secret handling confirmed zero sensitive added lines. The scanner's only
  match was an unchanged mock-only password placeholder already present on the
  base commit.
- The PR coverage audit returned PASS with no findings. Client coverage reached
  95.50% of lines.

## Exact-head CI and merge

- PR head `156aad0` passed typecheck, deterministic harnesses, the production
  build, 1,177 client tests, 267 Edge tests, dependency audit, CodeQL,
  CodeRabbit status, and browser rendering guardrails.
- Hosted browser guardrails passed in 4m30s on Linux.
- Supabase Preview correctly skipped for the client-only diff. No Supabase
  function, schema, migration, configuration, or credential changed.
- GitHub reported the PR clean and mergeable before the squash merge.
- The reviewed PR-head tree and merge-commit tree are identical:
  `ab200c5dc5275a6fc1854a653b027a20faf231d5`.

## Deployment and production health

- GitHub Pages run [31432467463](https://github.com/SUaDtL/singedTerra/actions/runs/31432467463)
  passed build, current-main verification, deploy, deployed-provenance
  verification, and post-deploy live smoke.
- Public `deploy-meta.json` reported merge
  `1b7ef2d934b37a1fa1cee7105200684388a4e79d` and run `31432467463`.
- Independent production Playwright verification passed 20 applicable chooser
  contracts with one expected desktop-only compact skip across desktop,
  Pixel touch, and compact fine-pointer projects.
- The slice-owned Vite preview process 123816 was verified and stopped. The
  unrelated services on other ports were untouched.

## Main-branch follow-through

- Main CodeQL run [31432467427](https://github.com/SUaDtL/singedTerra/actions/runs/31432467427)
  passed on merge commit `1b7ef2d`.
- Main CI run [31432467467](https://github.com/SUaDtL/singedTerra/actions/runs/31432467467)
  passed Edge, audit, deterministic checks, 1,177 client tests, build, and
  browser guardrails on the merge commit.
- Hosted main browser results were 252 passed and 30 intentional skips in
  4m0s.
