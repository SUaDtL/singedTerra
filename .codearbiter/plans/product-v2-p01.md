# P01 implementation sequence

This plan implements [P01](../specs/product-v2-p01.md) without changing the
game or creating an analytics pipeline.

| Step | Owned paths | Verification | Criteria |
| --- | --- | --- | --- |
| P01.1 | `scripts/checks/manual_baseline.test.mjs` | Controlled invalid-record and known-count oracles expose behavioral defects. Missing-module/setup failures do not establish behavioral proof. | AC1-AC4 |
| P01.2 | `scripts/product-evidence/manualBaseline.mjs` | `node --test scripts/checks/manual_baseline.test.mjs` validates records, corrections, aggregation, empty data, and the application import boundary. | AC1-AC4 |
| P01.3 | `docs/product-evidence/p01-manual-observation-template.md`, `docs/product-evidence/p01-manual-report-template.md` | Manual document review confirms the exact schema, segmentation, prohibited data, consent, proposed retention, and honest limits. | AC1, AC2, AC4 |
| P01.4 | All P01 paths | Run the focused test plus applicable typecheck/build checks; inspect the diff for any client/shared/Supabase/package changes. | AC1-AC4 |

The offline script has no package registration and no app import. Its failure is
therefore confined to explicit evidence work, not a live match. Rollback is
removing the P01 tooling and documentation paths; no historical record, game state, dependency, or
production data is affected.
