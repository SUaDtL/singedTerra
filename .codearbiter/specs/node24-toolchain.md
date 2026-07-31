# Node 24 toolchain modernization

## Problem

The repository pins Node 20 even though the upstream Node.js release schedule now
marks that line end-of-life. Current releases of the existing Supabase browser
client and `concurrently` require Node 22 or newer, so the stale runtime contract
turns otherwise-green Dependabot changes into unsupported installs and leaves CI
on an unmaintained runtime.

## Scope

- Move the repository runtime contract from Node 20 to the supported Node 24 LTS
  line and make the manifest enforce that major.
- Align `@types/node` to Node 24 rather than accepting Dependabot's Node 26 types.
- Refresh the existing Playwright, tsx, concurrently, and Supabase packages to
  the reviewed current releases compatible with Node 24.
- Keep the browser and Edge Function Supabase clients on the same exact release,
  with the Edge import pinned.
- Update contributor and governance documentation that names the runtime.
- Preserve all game, deterministic engine, network action, database, auth, and
  deployment behavior.

## Dependency decision

Node 24 is the smallest maintained LTS target that matches the local development
runtime and supports every reviewed package. Node 22 would also satisfy package
engines, but it shortens the remaining support runway without reducing migration
risk. Node 26 is still Current rather than LTS and would unnecessarily widen the
runtime and type delta.

The coordinated package set is:

- `@types/node` 24.13.3
- `concurrently` 10.0.4
- `@playwright/test` 1.62.1
- `tsx` 4.23.1
- `@supabase/supabase-js` 2.110.9

These are upgrades of established project dependencies, not new capabilities.
The manifest and lockfile remain one atomic change. The Supabase browser package
and exact Edge Function import advance together to prevent runtime skew.

## Acceptance criteria

1. `.nvmrc` selects Node 24 and the root manifest declares a matching `24.x`
   engine contract.
2. `@types/node` resolves to the Node 24 line; no Node 26 type surface is adopted.
3. All five reviewed packages resolve to the intended versions without
   `EBADENGINE`, invalid-tree, lifecycle-script, license, provenance, or audit
   blockers.
4. Browser and Edge Function Supabase imports use exactly 2.110.9.
5. `npm ci`, `npm ls`, `npm audit --audit-level=high`, deterministic checks,
   client tests and coverage, Edge tests, production build, and the full
   Playwright suite pass under Node 24.
6. Contributor docs and `.codearbiter/tech-stack.md` consistently name Node 24.
7. Independent dependency and adversarial review return no blocking finding.
8. No application code, migration, backend deployment, merge, or deployment is
   performed in this sprint.
