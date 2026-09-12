# R09 archive-retirement evidence

## Accepted candidate and parent validation, 2026-09-12

R09 is locally accepted after correction of AC-034. The exact candidate comprises 23 task paths, including this receipt: the original 20 below plus `components/SemanticContractTree.tsx`, `pixi/chrome-topology.test.ts`, and `semantic-parity.test.tsx`. The additional production change only removes three unused type properties; the other two are fixture compatibility corrections. No interpreter behavior or test assertion was weakened.

Fresh independent reviewer `gpt-5.6-sol/high`, session `01a08a35-ff22-7f01-85ea-fc0edd01670d`, completed coverage, architecture, security/build-guard, and scope/behavior units, then separate triage and aggregate: PASS, zero findings, zero incomplete units. It independently passed 10 focused files / 41 tests and all five fallback browser profiles with external network denied. Review logs: `Temp/recovery-v2-r09-review-01a08a35-{focused-tests,fallback-browser}.log`.

Parent full product verification on September 10 passed 83 cases with 27 deliberate profile skips, exit 0, with external network denied. Wide-console, standard-settings, and compact-console captures were directly inspected. These are local fixture-build observations, not ordinary first-entry, human acceptance, or production evidence. Logs and artifacts: `Temp/recovery-v2-r09-corrected-parent-product.log` and `Temp/recovery-v2-r09-corrected-parent-product-artifacts`.

The parent integrated all 23 task paths byte-for-byte at `c7ab4912973cafaed529914890ff0781e41b1946`. All 60 emitted files matched the reviewed author build. September 12 resumed integration gates passed: full coverage (session 37784, 202 files / 1,820 tests, lines 93.74% = 8108/8649, branches 83.51% = 4804/5752), full deterministic check/typecheck (session 2080), and full release build/typecheck (chunk fbf1e3), all terminal exit 0. Logs: `Temp/recovery-v2-r09-resumed-integration-{coverage,check,build}.log`. Factual parent metadata added here does not change source or emitted bytes.

The corrected graph and same-method artifact measurements at the end of this receipt are authoritative. The original handoff, pending-review statements, and first candidate figures below describe historical stages. Governed integration commit identity is available from this receipt's Git history; this receipt does not claim a push, hosted release, or production deployment.

## Historical author handoff before correction and review

Base revision: `c7ab4912973cafaed529914890ff0781e41b1946`.

Task: R09. Worker: `gpt-5.6-terra/high`, verified session `01a089ff-251a-7d70-a6d8-27299d01bba2`. One transient model-capacity failure was retried with the same model and preserved working tree; no substitution. Branch: `codex/recovery-v2-r09`. Result: uncommitted frozen candidate, pending independent `gpt-5.6-sol/high` review and full parent gates. The final integration commit will be identified by Git and the canonical ledger.

Changed production paths: `client/vite.config.ts` and `client/src/ui/battleConsole/{runtimeData.ts,BattleConsoleRoot.tsx,mount.tsx,lifecycle.ts,modeAssets.ts,pixi/scene.ts,pixi/adapter.ts}`. Changed tests under that battleConsole directory: `BattleConsoleRoot.runtime.test.tsx`, `retirement-closure.test.ts`, `topology-lifecycle.test.tsx`, `compositor-failure-state.test.tsx`, `compositor-destroy.test.tsx`, `components/semantic-topology.test.tsx`, `components/compact-targets.test.tsx`, `pixi/dynamic-appearance.test.ts`, `pixi/layer-authority.test.ts`, `runtimeData.test.ts`, and `release-graph-guard.test.ts`. This receipt is the twentieth changed path. No contract, E2E, asset, package, lock, or other source path changed.

The author explicitly released every writer path including this receipt and reported all command handles terminal. Parent added this handoff metadata before independent review; source and the candidate build stayed frozen. Parent owns the sole localhost and will bind it to this candidate before browser execution. No browser PASS is claimed yet.

## Result

Production imports of the battle-console appearance, ownership, retirement, and
topology archives have been removed from the eight leased production paths. A
small typed `runtimeData.ts` projection supplies the retained semantic nodes,
regions, and chrome sockets. The existing semantic interpreter and real
lifecycle controller remain production code. The old fake lifecycle harness,
mount retirement marker, and Pixi test registries have been retired.

`client/vite.config.ts` now includes a release-only Vite `generateBundle` guard.
It examines every emitted chunk module ID and fails if it contains
`.codearbiter/contracts/battle-console/`; it has no fixture or mode bypass.

The archives themselves were not changed. For example,
`.codearbiter/contracts/battle-console/state/dynamic-appearance.json` remains
SHA-256 `426FB13F4E0FECF37960E77A7E3BD04EB028168A5F556A03E8F7E986629D1738`.

## Required RED then GREEN evidence

| Step | Command | Exit | Evidence |
| --- | --- | ---: | --- |
| New-feature RED | `npm -w @singedterra/client run test -- src/ui/battleConsole/runtimeData.test.ts src/ui/battleConsole/release-graph-guard.test.ts` | 1 | Before implementation, the runtime module could not resolve and `createReleaseArchiveGuard` did not exist. |
| Real release-graph RED | `npm -w @singedterra/client run build` | 1 | After the guard was added while `pixi/scene.ts` still imported `dynamic-appearance.json`, Vite failed with `battle-console archive reached the production graph: .codearbiter/contracts/battle-console/state/dynamic-appearance.json`. |
| Focused GREEN | `npm -w @singedterra/client run test -- src/ui/battleConsole/BattleConsoleRoot.runtime.test.tsx src/ui/battleConsole/retirement-closure.test.ts src/ui/battleConsole/topology-lifecycle.test.tsx src/ui/battleConsole/compositor-failure-state.test.tsx src/ui/battleConsole/compositor-destroy.test.tsx src/ui/battleConsole/components/semantic-topology.test.tsx src/ui/battleConsole/components/compact-targets.test.tsx src/ui/battleConsole/pixi/dynamic-appearance.test.ts src/ui/battleConsole/pixi/layer-authority.test.ts src/ui/battleConsole/runtimeData.test.ts src/ui/battleConsole/release-graph-guard.test.ts` | 0 | 11 files, 27 tests passed. |
| Typecheck | `npm run typecheck` | 0 | Shared and client `tsc --noEmit` passed. |
| Candidate release build | `npm -w @singedterra/client run build` | 0 | 2,730 modules transformed; the release guard completed. |

The intentional failing build cleared the previous `client/dist` JavaScript
output. To retain an honest same-settings comparison without reverting the
candidate, a preserved baseline artifact was created at
`C:/Users/brenn/projects/singedTerra-worktrees/recovery-v2-r09-baseline-artifact`
from `git archive c7ab4912973cafaed529914890ff0781e41b1946`, using a junction
to reuse this worktree's already-installed `node_modules`. Its build command
was `npm -w @singedterra/client run build` and exited 0.

## Release graph and size measurements

The baseline graph SHA-256 is
`2ACA19BC495407ECB6ECAAEC9FF3339047724E7A5DCAFC3EA8E2B79073A19F19`; it
contains nine battle-console archive modules. The candidate graph SHA-256 is
`81F3A191392FB8CA06417F99CA676494FF771D0BC14F36D1DA5431627CE903A3`; it
contains zero. The candidate result comes from the emitted Vite graph, not from
a source-text scan; the retained public asset manifest may still describe source
reference-image paths.

| Measurement | Baseline | Candidate | Difference |
| --- | ---: | ---: | ---: |
| All emitted files, raw bytes | 15,720,453 | 11,719,663 | -4,000,790 |
| All emitted files, individually gzipped bytes | 10,633,316 | 9,980,421 | -652,895 |
| Entry `mount` raw bytes | 4,202,115 | 246,856 | -3,955,259 |
| Entry `mount` gzip bytes | 680,757 | 35,519 | -645,238 |
| Entry `index` raw bytes | 629,549 | 595,210 | -34,339 |
| Entry `index` gzip bytes | 150,534 | 146,957 | -3,577 |

Raw and gzip figures above use the same PowerShell/.NET method for both builds:
each emitted file was compressed separately with
`System.IO.Compression.GZipStream` and `CompressionLevel.SmallestSize`.
They are artifact measurements, not a network-transfer or memory-savings claim.
Vite's own separately advertised gzip values were baseline `mount` 635.09 kB /
`index` 152.00 kB and candidate `mount` 36.34 kB / `index` 148.17 kB; its
implementation/settings are not asserted to be the custom measurement above.

The candidate entry hashes are `assets/mount-B_nOz_Wy.js`
`1A4D15BA9F52DFFC1CFEACD60CC653E3E756D253177FAC5A01579D3413A5D10E` and
`assets/index-CSHr0j_p.js`
`023C6A869594555E4728A2BEA9B582E925ADCAEDF4E27857690561693579FBC9`.

## Limits and rollback

The runtime projection preserves archive payload field values; its one explicit
`unknown` bridge isolates a legacy string-valued `expanded` source field that is
narrower in the existing semantic-node TypeScript type. The focused tests prove
the retained-field projection and the release-graph rule, while browser proof
remains parent-owned on the frozen integration preview.

Rollback is to remove the `runtimeData` imports and release guard, then restore
the direct production archive imports and deleted test-only fixtures from this
working diff. No commit, remote, server, lockfile, archive, or governance marker
was written by this worker.

## AC-034 correction (2026-09-10)

Worker model and effort: `gpt-5.6-terra/high`. A fresh independent review found
three source-record fields and two geometry labels that were still projected but
had no production consumer. This correction removes `haspopup`, `hidden`, and
`inert` from all 396 runtime semantic source records (1,188 field removals), and
removes `assembly` from the 15 semantic regions and 11 chrome sockets. The
semantic interpreter remains unchanged; its `SemanticSourceRecord` type now
matches the retained runtime projection. The two fixture-only compatibility
changes remove the deleted fields from an existing Power fixture and from the
archived chrome-registry expected shape; their behavior assertions remain.

The original candidate measurements above are historical pre-correction values,
preserved at
`C:/Users/brenn/AppData/Local/Temp/recovery-v2-r09-pre-correction-0098e3b024f44275b9ca3964f1c54ad2/dist`.
No preserved artifact was deleted or cleaned.

| Correction step | Command | Exit | Evidence |
| --- | --- | ---: | --- |
| Omission RED | `npm -w @singedterra/client run test -- src/ui/battleConsole/runtimeData.test.ts` | 1 | The revised projection assertions found the three fields on all 396 semantic records and `assembly` on both retained geometry collections. |
| Projection/fix GREEN | `npm -w @singedterra/client run test -- src/ui/battleConsole/runtimeData.test.ts src/ui/battleConsole/pixi/chrome-topology.test.ts src/ui/battleConsole/semantic-parity.test.tsx` | 0 | 3 files, 6 tests passed. |
| Full client suite | `npm run test:client` | 0 | 202 files, 1,820 tests passed. jsdom emitted known Canvas `getContext` notices without failing the suite. |
| Deterministic product checks | `npm run check` | 0 | Includes shared/client typecheck and deterministic engine checks. |
| Corrected release build | `npm run build` | 0 | Includes typecheck and guarded Vite build. |

The same .NET per-file `GZipStream` / `CompressionLevel.SmallestSize` method was
used for the baseline, historical pre-correction candidate, and corrected
candidate. These remain artifact measurements, not transfer or memory claims.

| Measurement | Baseline | Historical pre-correction | Corrected candidate |
| --- | ---: | ---: | ---: |
| Graph SHA-256 | `2ACA19BC495407ECB6ECAAEC9FF3339047724E7A5DCAFC3EA8E2B79073A19F19` | `81F3A191392FB8CA06417F99CA676494FF771D0BC14F36D1DA5431627CE903A3` | `14894E7FFEFB9C131978141155F80F6980B11877DC62D8961F7EFBF7C0B4D6EA` |
| Archive module count | 9 | 0 | 0 |
| All emitted files, raw bytes | 15,720,453 | 11,719,663 | 11,706,048 |
| All emitted files, individually gzipped bytes | 10,633,316 | 9,980,421 | 9,980,175 |
| `mount` raw bytes | 4,202,115 | 246,856 | 233,241 |
| `mount` gzip bytes | 680,757 | 35,519 | 35,276 |
| `index` raw bytes | 629,549 | 595,210 | 595,210 |
| `index` gzip bytes | 150,534 | 146,957 | 146,957 |

Corrected Vite-advertised gzip sizes are separately `mount` 35.89 kB and
`index` 148.17 kB. Corrected emitted entry hashes are
`assets/index-CPnIAu80.js`
`98AD39651756614720175D7D229334A1622E13825352909B037AD0FF2C10E1C8` and
`assets/mount-BkscwWRB.js`
`3DACA16AB585162B1F304F6222A1C6B9A379B394CA75E5D9C6445F212AD824A5`.
