# Store card containment plan

Date: 2026-08-09
Task: reliability.store.0001

- [x] Add a real-browser geometry assertion that every Store card contains its
  information and purchase children with no horizontal overlap; run it against
  the production bundle and capture the expected RED failure.
- [x] Add the focused DOM expectation for accessory price and bundle quantity;
  capture the expected RED failure against the current effect-copy button.
- [x] Replace duplicated accessory effect copy in the purchase control with the
  canonical bundle quantity, leaving the summary as the effect explanation.
- [x] Prove focused GREEN, then run the complete verification matrix and inspect
  the affected viewport visually.
- [x] Give one adversarial reviewer the spec, plan, sprint receipt, tests, and
  final diff; resolve every Critical, High, and merge-blocking finding.
- [ ] Commit through the gate, open a PR, clear exact-reviewed-head hosted CI,
  merge under standing authority, deploy Pages, and verify production health.
