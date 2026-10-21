# T-RELEASE dependency repair — 2026-10-21

Local candidate evidence for the authorized first-session polish sprint. Base:
`62010d61afe24bf120e34730d5eed751dbe397d7`; Windows, Node 24.18.0, npm 11.16.0.
This records local dependency and build verification. It is not hosted CI,
merge, deployment, or public-version verification.

## Problem and bounded change

The baseline `npm audit --audit-level=high --json` reported one high-severity
Vite finding, covering three bundled launch-editor advisories:
[Windows percent escaping](https://github.com/advisories/GHSA-698v-4r3x-3vcv),
[editor argument interpretation](https://github.com/advisories/GHSA-r825-w8mm-5pxw),
and [Windows existence-check bypass](https://github.com/advisories/GHSA-587h-7wmj-h5pm).
Vite 8.3.0 was in the affected range; 8.3.4 is outside all three ranges.

The client Vite pin changes from 8.3.0 to 8.3.4. Required transitive resolution
updates PostCSS 8.5.28 to 8.5.31, Rolldown 1.2.8 to 1.2.14 and its 15 platform
bindings, Oxc types 0.149.0 to 0.154.0, and Nano ID 3.3.18 to 3.3.20. The root
Nano ID override is aligned to exact 3.3.20, retaining the explicit security pin
introduced by PR #336. The parent independently reviewed that one-line change.
The lock retains all 270 entries: 21 entries change, comprising the client
workspace record and those 20 package records. No package was added or removed.

Existing [PR #537](https://github.com/SUaDtL/singedTerra/pull/537), inspected at
`43c357456806b8fcf8686744326fcc574255fa35`, remains a separate 12-package bundle.
Its unrelated updates are not included here.

## Dependency review

- License: MIT for every changed package — PASS. The repository documents MIT;
  the read security-controls/tech-stack files do not enumerate a denied list.
- Provenance: npm HTTPS registry and matching upstream repositories — PASS.
  Vite, PostCSS, Rolldown, Oxc types, and Nano ID tarball SHA-512 values were
  checked against registry integrity before installation. Their published
  provenance points to the corresponding upstream release source. Vite 8.3.4
  binds to `vitejs/vite` commit `b6c20f6a8126d8561891e5fb9368e8fc9da37538`,
  matching the [upstream release](https://github.com/vitejs/vite/releases/tag/v8.3.4).
- Maintenance: current patch releases from active upstream projects — PASS.
- Known vulnerabilities: candidate package advisory queries were empty;
  complete post-install audit reports zero vulnerabilities — PASS.
- Supply chain: none of the changed published packages has a preinstall,
  install, or postinstall script; all changed native binding records have
  registry signatures and provenance metadata — PASS.
- CRITICAL/HIGH/MEDIUM/LOW findings: none. Gate status: PASS.

The final installed tree passed `npm audit signatures`: 163 verified registry
signatures and 70 verified attestations. Candidate Vite integrity:
`sha512-IftLE8phJhdNRIGNEV4JCCvfNScoZQVfcXaN8TQropWGJtOHcu+iAB9pHcuGvmEb/kddw0LBe/jS8ztdC6xdiQ==`.

## Installation and verification

The lock was generated with the exact workspace install and `--package-lock-only
--ignore-scripts`. An ordinary install left old package bytes even though npm's
hidden lock reported the new versions. This inconsistency was caught by reading
the installed package files. A clean `npm ci --ignore-scripts` then installed the
candidate; direct file reads confirmed Vite 8.3.4, PostCSS 8.5.31, Rolldown 1.2.14,
and Nano ID 3.3.20 before tests ran. No lifecycle scripts were executed by these
install commands.

| Command/check | Result |
| --- | --- |
| `npm run audit:deps` | PASS; zero vulnerabilities |
| `npm audit signatures` | PASS; 163 signatures, 70 attestations |
| `node --import tsx scripts/checks/dependency_contract.mjs` | PASS; 15 assertions |
| `npm run build`, `VITE_BASE=/singedTerra/` | PASS; ST1 compatibility, retained cq1, Last Stand source/runtime admission, shared/client typechecks, Vite production build |
| `npm run test:client -- --maxWorkers=4` | PASS; 269 files, 2,548 tests, 33.18 seconds |
| Semantic lock comparison | PASS; all 270 entries retained, only the declared 21 records change |
| `git diff --check` for package files | PASS |

The first full build correctly stopped at `ST1 source hash drift: package.json`.
The parent then reviewed the dependency-only change and updated only that source
hash and the factual disposition in `docs/compatibility/st1-source-manifest.json`.
The parent reported all three manifest negative controls passing. The rerun
independently passed the current 32-source ST1 check. No ST1 membership or
simulation source changed; no retained cq1 artifact was regenerated. The retained
cq1 verification hash remains
`c9e3c55636a6cc2407cbc338e674ebfa0a3dd1285f3a95f72dd354fd3c348c81`.

The build retains the existing large-chunk warning. Client tests print jsdom
canvas-not-implemented warnings but complete successfully. Detailed green run
output is retained beside this report in `dependency-build.log` and
`dependency-client-tests.log`. The red audit and first-build observations above
are recorded from their actual command output; the build log contains the green
rerun.

## Candidate input hashes

SHA-256 with UTF-8 CRLF/CR normalized to LF:

| Input | Hash |
| --- | --- |
| `package.json` | `aacf826f5f8a41407cc762749bef391a9a4bc6dea46e5f0830158640d8be2fa5` |
| `client/package.json` | `2178d7e2539c30c4abe4c181fdb32e8bf99cfd59b2ed86bcf76bf202160c02cf` |
| `package-lock.json` | `efa72f5a57e51de52562e603b72379e6a3b072d44134e3288073ab67d3dd70a7` |
| parent-owned ST1 manifest | `4232046ebf0880bdcb64a1045072354dcc772794daca82a5e16c408d9c8bd82b` |

Hosted CI and post-merge deployment still require a final committed candidate.
