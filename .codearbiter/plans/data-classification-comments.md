# Plan: Legacy Table Data-Classification Comments

- [x] Add the static migration-contract test first and prove the intended RED
  failure against the current repository.
- [x] Add migration `011_data_classification_comments.sql` with only the
  approved table and column comments.
- [x] Run focused and full client/harness/Edge/E2E/build/audit/secret/diff
  verification; package spec, plan, sprint log, tests, and final diff for the
  adversarial review.
- [ ] Pass exact-head hosted checks, merge, verify production health, and
  close the task-board receipt. No runtime deployment is expected; migration
  deployment remains a required delivery check if hosted Supabase accepts the
  additive comment migration.
