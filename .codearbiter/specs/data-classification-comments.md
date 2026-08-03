# Legacy Table Data-Classification Comments

## User value

Make the existing data-classification convention visible on the three legacy
tables created before the convention was documented, so future maintainers and
security reviewers can identify the sensitivity of stored fields without
reconstructing it from application code.

## Scope

- Add one forward-only migration, numbered after `010`, containing only
  `COMMENT ON TABLE` and `COMMENT ON COLUMN` statements for `rooms`,
  `room_actions`, and `match_scores`.
- Classify public gameplay data as `PUBLIC` and operational metadata as
  `INTERNAL`; do not label any legacy field `SECRET` because these tables do
  not store seat tokens or other secret material.
- Preserve the existing schema, rows, RLS policies, grants, indexes, RPCs,
  action contract, and runtime behavior.
- Add a deterministic static migration-contract check to ensure the new file
  remains additive, targets exactly the intended tables/columns, and does not
  edit an applied migration.

Out of scope: data movement, schema changes, RLS or grant changes, auth,
secrets, crypto, dependencies, client code, Edge Function code, and deployment
of runtime services.

## Acceptance criteria

1. A new higher-numbered migration classifies all identity/gameplay and
   operational fields in the three legacy tables with bounded, reviewable
   comments.
2. No existing migration is modified and the migration contains no DDL other
   than comments.
3. The static contract check fails if a required classification is removed,
   an unexpected table/column is added, or executable schema-changing SQL is
   introduced.
4. Existing typecheck, deterministic harnesses, Edge tests, client tests,
   E2E, build, audit, secret scan, and diff checks remain green.

## SMARTS decision

Selected over stale completed review findings and the larger vote-kick/referee
redesign. It is the highest-value safe candidate: strong Signal for governance
and security review, Available with no dependency or schema mutation,
Maintainable as a small forward-only artifact, Reliable because comments have
no runtime effect, Testable through a deterministic contract harness, and
Small enough to review as one bounded slice. Confidence: high.
