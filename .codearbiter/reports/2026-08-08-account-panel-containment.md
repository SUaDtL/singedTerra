# reliability.account.0001 sprint receipt

Date: 2026-08-08
Status: in progress

## SMARTS decision

Collapse authenticated progression into a self-identifying account trigger and
show details in an intentional popover. This is Specific to the overlay shown in
the production screenshot, Measurable through DOM state and compact geometry,
Attainable within the existing account-panel state owner, Relevant to readable
persistent progression, Time-bounded to one view and its scoped styles/tests,
and Strong because it preserves every server-derived value while removing the
permanent obstruction. Confidence: high.

## Scope

AccountPanelView authenticated composition, Lobby's account-panel styles,
focused DOM/browser tests, and governance artifacts only. No progression rule,
account session, Auth, Supabase, Edge, schema, migration, dependency, lobby-flow,
or gameplay change is authorized.

## TDD evidence

- RED component: `AccountPanelView.test.ts` failed 2 of 12 because the
  authenticated trigger and open state did not exist.
- RED compact browser: both `pixel-touch` and `small-window` proved the
  collapsed fixture still exposed progression details; the open fixture also
  overflowed its card horizontally.
- GREEN focused: AccountPanelView and Lobby composition passed 17 of 17;
  compact progression geometry passed 6 of 6.
- GREEN full client: 137 files and 1,030 tests passed. Final corrected-tree
  coverage is 92.61% statements, 82.81% branches, 85.51% functions, and
  94.64% lines.
- GREEN repository: the complete deterministic/typecheck harness passed;
  production build passed; 255 Edge tests passed; dependency audit found zero
  vulnerabilities; full Playwright passed 197 with 28 intentional skips.

## Steering captured

The user's signed-in hot-seat win did not earn progression because current
server attribution is network-match based. The separate trust-boundary task
`mvp2.progression.0006` is queued through `$ca-task`; it is intentionally not
bundled into this presentation-only fix.

## Adversarial review

Zeno's first complete-package review reported Critical 0, High 0, Medium 2,
Low 1, and two merge blockers. The disclosure control disappeared when open,
so focus and expanded-state semantics were incomplete; the canonical sprint
log also lacked this slice because its historical bytes are not valid UTF-8.

Both blockers were corrected test-first. The account trigger now remains the
real disclosure in both states, reports `aria-expanded` true/false, and Lobby
restores focus to the replacement disclosure after open and Close renders.
Focused remediation proof is 17 of 17 DOM/composition tests and 6 of 6 compact
browser tests; one initial Pixel browser attempt timed out reading a visible
element, then the exact case passed 2 of 2 in isolation and the complete compact
file passed 6 of 6. A scoped `$ca-override` entry preserves the invalid canonical
sprint log byte-for-byte and designates this UTF-8 receipt for this slice only.
The untracked task-writer lock remains explicitly excluded from the candidate.

The first two corrected-tree full-browser attempts reused a verified stale Vite
listener from the manual visual inspection and therefore built requests under
`/undefined/functions/`; those runs are rejected as invalid gate evidence. After
terminating exactly that worktree-owned listener and proving port 4173 clear,
canonical Playwright passed 197 with 28 intentional skips. The corrected
deterministic/typecheck harness, production build, dependency audit, 255 Edge
tests, and 1,030-test coverage run all independently passed.

## Delivery

PR #346 exact final head `3e44ad4defec8ee24cffac97fff1c64ea6326b6a`
received adversarial CLEAR with zero findings and cleared CI run `31293462561`,
CodeQL run `31293462556` plus its success status, and CodeRabbit before squash
merge to `main` as `d12de375d99c7064c8e05fd71f3b68ad05366342`.

Post-merge CI `31293626133`, CodeQL `31293626128`, and Pages
`31293626136` passed on that exact main SHA. The production page, deployment
metadata, and current JavaScript asset return HTTP 200; metadata reports the
exact main SHA and Pages run, and the live asset contains the authenticated
account disclosure and expanded-state markers. No Supabase file changed, so no
backend deployment was required. Task `reliability.account.0001` is done;
`mvp2.progression.0006` remains queued as the separate signed-in hot-seat
progression trust-boundary slice.
