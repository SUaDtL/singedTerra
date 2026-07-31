# Node 24 toolchain modernization implementation plan

## Task 1: Establish and vet the runtime contract

- [x] Confirm the repository's Node 20 pin and all documentation/workflow consumers.
- [x] Confirm from the upstream release schedule that Node 20 is end-of-life and
  Node 24 is LTS.
- [x] Inspect exact package licenses, provenance, engines, repositories, and
  registry integrity metadata before any install.
- [x] Receive a clean independent dependency review for the coordinated package set.

## Task 2: Apply the atomic dependency refresh

- [x] Change `.nvmrc` and root `engines` to Node 24.
- [x] Align `@types/node` to 24.13.3.
- [x] Update Playwright, tsx, concurrently, and Supabase to the reviewed targets.
- [x] Pin the Edge Function Supabase import to the browser client's exact version.
- [x] Add a deterministic guard that parses the live Edge import and prevents
  browser/Edge Supabase version drift.
- [x] Generate one coherent lockfile and reject unrelated dependency drift.

## Task 3: Verify compatibility

- [x] Prove `npm ci`, `npm ls`, and the high-severity audit are clean with no
  engine warnings.
- [x] Run deterministic/typecheck checks.
- [x] Run the full client unit and coverage suites.
- [x] Run all Edge Function tests.
- [x] Run the production build and complete Playwright suite.
- [x] Obtain an independent adversarial review of the exact diff.

## Task 4: Governed delivery

- [x] Update runtime and dependency documentation.
- [x] Append exact receipts and SMARTS decisions to the sprint log.
- [x] Run diff hygiene, secret scan, and the commit gate.
- [x] Commit and open ready PR #229 against `main`.
- [x] Require exact-head hosted CI and CodeQL success on reviewed product head
  `9880c4c5142b9718bb734cdb8c147fc190ef47e2`; do not merge or deploy.
