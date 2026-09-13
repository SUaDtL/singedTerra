# P01 manual baseline evidence

P01's offline tooling is locally accepted against its four original criteria.
No real collection has occurred. Source baseline:
e49b424c67b2f1a09bd5593156f15117915e93df. Worker:
gpt-5.6-terra/medium, `/root/p01_manual_baseline`. Independent reviewer:
gpt-5.6-sol/high, `/root/p01_manual_independent_review`, final PASS with no findings.

The strict manual schema accepts only bounded shapes and enumerated outcomes,
generated session sequence IDs, dates, consent and numeric participant counts.
It rejects extra fields and free text. Aggregation preserves unknown history,
unknown outcomes and unknown eligibility; it reports raw counts without retention
claims. A known failed prerequisite makes later stages ineligible. Corrections
explicitly replace the same session ID; duplicates are refused.

No client, shared-engine or Supabase source imports the module. Offline reporting
cannot block gameplay. There is no telemetry adapter, endpoint, dependency,
package-script registration or collection path. The proposed owner-local30-day
retention policy requires owner confirmation before actual observations.

## Actual verification chronology

The initial missing module and later URL/path test-setup failure were not
behavioral REDs. Initial implementation test-first ordering is not established.
The review then found three bounded defects: session-0000 acceptance, unsafe
participant integers, and unknown eligibility overriding a known failed earlier
step. Separate regression cases produced six passes and three failures before
the minimal corrections; the unchanged assertions then passed nine of nine.

The independent reviewer reran all nine tests and separately checked all three
known-no dominance chains, ID boundaries, safe integers, malformed aggregates,
deduplication, correction and ID generation. It also reviewed the privacy and
application-import boundaries. No collection or personal data was used.

Parent integration3705c0 copied the six reviewed files byte-for-byte, ran
`node --test scripts/checks/manual_baseline.test.mjs` (9/9, exit0), then
`npm run build` (including strict shared/client typecheck, exit0). This resolves
the isolated author's earlier missing-tsc setup limit. The existing bundle-size
advisory remains. The parent corrected only plan wording/count afterward, without
changing the reviewed implementation or tests.

Coverage tooling in `.codearbiter/tech-stack.md` targets client Vitest:
"`vitest run --coverage --maxWorkers=4`". No coverage command exists for this
standalone Node script. Its evidence is the behavioral harness and independent
known-count/invalid-record probes, not an invented coverage percentage.

## Frozen implementation SHA-256

- scripts/product-evidence/manualBaseline.mjs:
  `1982455c04536efb71705cc2e564831006f02f188212b10b56f1fcaf436a6d04`
- scripts/checks/manual_baseline.test.mjs:
  `00d8bf648e6ae2f618d87ff99c2ec6f52a0fef4ca54bb51546e7a62a696dba92`

Rollback removes the offline module, tests and templates. No game state or real
player records are deleted by this change. Delivery is recorded separately in
the sole campaign ledger; P01 acceptance does not complete the product phase.
