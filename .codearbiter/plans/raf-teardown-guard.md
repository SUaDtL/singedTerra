# RAF teardown guard implementation plan

**Task:** `reliability.teardown.0001`

## Task 1: TDD and local verification

- [x] Add failing public-behavior assertions for duplicate state preservation and
  post-stop RAF scheduler inertness.
- [x] Reproduce RED for the scheduler assertion against the current unconditional
  reschedule.
- [x] Add the minimal `_disposed` guard before RAF rescheduling and verify GREEN.
- [x] Run `npm run check`, `npm run check:edge`, `npm run test:client`,
  `npm run typecheck`, `npm run build`, `npm run test:e2e`, diff hygiene, and the
  state-free secrets scan.

## Task 2: Review and landing obligations

- [x] Give one adversarial reviewer the complete spec, plan, sprint log, tests, and
  final diff; resolve every blocking finding.
- [ ] Open the PR, require all hosted checks green on the exact reviewed head, and
  merge under standing authority.
- [ ] Deploy the associated client change through the normal Pages workflow and
  verify the production asset and health smoke.
- [ ] Mark `reliability.teardown.0001` done and append the final delivery receipt.
