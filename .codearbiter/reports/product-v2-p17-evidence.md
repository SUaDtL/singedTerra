# P17 inventory evidence

P17 inventory is locally accepted against the original plan. Author:
gpt-5.6-luna/medium (`/root/p17_inventory_corrections`, following the initial Luna
inventory). Independent reviewer: gpt-5.6-terra/medium
(`/root/p17_inventory_review`), final PASS. Source: e49b424c67b2f1a09bd5593156f15117915e93df.

The two inventory artifacts classify 27 runtime visuals, two public nonvisual
files and four documentation images. All 33 recorded byte counts and SHA-256
values match disk. All 20 direct dependency/development declarations across the
root and workspaces have locked versions, declared licenses, provenance and
notice status. No assets, dependencies or notices were changed or removed.

Nine generated derivatives have complete recorded source/transform evidence.
Six more have documented project attribution but explicitly unresolved master
hashes and transform settings. Twelve runtime visuals have unresolved provenance.
These are permitted explicit inventory statuses, not commercial rights clearance.
Notice version discrepancies and unresolved rights remain inputs to P16's later
owner decision.

The review corrected incomplete dependency coverage, overclaimed derivative
traceability and an invented rights-closure acceptance gate. A final correction
also distinguished an earlier absent-dependency `npm ls` result from the later
cross-worktree junction result. Both exited1 for different reasons. The installed
graph is not validated by either result, and no install occurred.

Fresh validation: JSON parse PASS; 33/33 asset byte/hash matches; 20/20 direct
dependency version/license matches against the lockfile; original battle-console
recipe/output hash checks PASS. Independent review reconfirmed the final hashes
and chronology correction. No runtime tests or production proof are claimed by
this documentation-only inventory.

| Artifact | SHA-256 |
| --- | --- |
| docs/ASSET_DEPENDENCY_INVENTORY.md | 7a52d0b3baee2fa1f80c00269742c9988311215eb98870bdfebe2193d67fa4ed |
| docs/asset-dependency-inventory.json | 2059ffa770ad9eda835dab94ae62476a6ba31e08681eec10e867bcf00b47d429 |

Rollback removes these inventory documents. It does not remove assets, change
licenses, or alter runtime behavior. Commit/PR delivery is recorded in the sole
campaign ledger after it occurs; P17 is not completion of the overall campaign.
