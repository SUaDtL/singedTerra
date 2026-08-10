# Compact Pre-game Command Legibility Delivery Receipt

Task: `ux.pregame.0004`
PR: [#390](https://github.com/SUaDtL/singedTerra/pull/390)
Reviewed PR head: `f15e74b14b754124a31ebacd7c46640c2111eb1c`
Merge commit: `3a1919725e08d6a8b5d7e186c675b8642d74a5ba`
Merged: 2026-08-10T19:24:09Z

## Player outcome

- Compact Hot Seat and Online commands render at measured physical legibility
  floors instead of shrinking into postcard-sized labels.
- The obsolete generated battlefield plane is disabled, so the real Vehicle Bay
  is the only preview surface.
- Quick Duel and both route tabs remain visible, keyboard navigable, and at least
  24 physical pixels tall while customization is open.
- Vehicle part names remain complete, and compact Online setup stays inside the
  stage on Windows and hosted Linux Chromium.

## Review and prevention

- The required adversarial reviewer received the spec, plan, sprint evidence,
  tests, and exact final diffs.
- Initial review blocked a hidden Quick Duel action, undersized route targets,
  and a contradictory secret-scan claim. All three were corrected and re-reviewed.
- The PR coverage audit blocked a non-causal `main.ts` oracle. Removing token
  publication now fails both compact profiles before restoration returns GREEN.
- The first hosted browser run (`31422534149`) caught Linux font-metric overflow
  in Vehicle Bay labels and compact fine-pointer Online setup. The exact repair
  received adversarial PASS before push.
- Final review verdict: no Critical, High, Medium, Low, or merge-blocking findings.
- Exact staged state-free secret scans returned no findings. No dependency,
  Auth, Supabase schema, function, migration, or backend deployment changed.

## Exact-head CI and merge

- PR head `f15e74b` passed typecheck, deterministic harnesses, production build,
  Edge tests, CodeQL, CodeRabbit, and browser rendering guardrails.
- Hosted browser guardrails passed in 4m43s on Linux after the platform-metric
  correction.
- Supabase Preview correctly skipped for the client-only diff.
- GitHub reported the PR clean and mergeable before the squash merge.
- The reviewed PR-head tree and merge-commit tree are identical:
  `f38f78d9eec1832707486ed6c78806f1e7902f73`.

## Deployment and production health

- GitHub Pages run [31423905649](https://github.com/SUaDtL/singedTerra/actions/runs/31423905649)
  passed build, current-main verification, deploy, deployed-provenance verification,
  and post-deploy live smoke.
- Public `deploy-meta.json` reported merge
  `3a1919725e08d6a8b5d7e186c675b8642d74a5ba` and run `31423905649`.
- Independent production Playwright verification passed 6/6 across `pixel-touch`
  and `small-window`: compact target publication and route choices, Online route
  hierarchy, one preview plane, complete part labels, containment, and reachability.
- Local preview process 114976 was verified as this slice's Vite server and stopped;
  the unrelated port-4173 process was untouched. The agent-created browser tab was
  finalized.

## Main-branch follow-through

- Main CodeQL run `31423905615` passed on merge commit `3a19197`.
- Main CI run [31423905648](https://github.com/SUaDtL/singedTerra/actions/runs/31423905648)
  passed Edge, audit, deterministic checks, 1,171 client tests, build, and browser
  guardrails on merge `3a19197`; hosted browser results were 262 passed and
  32 intentional skips in 4m0s.
