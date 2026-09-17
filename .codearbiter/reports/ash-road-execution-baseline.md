# Ash Road Chapter One — execution baseline and authority receipt

**Task:** T-01 / packet AR00

**Status:** complete

**Recorded:** 2026-09-16

**Acceptance coverage:** AC-23, AC-24

## Authoritative execution surface

- Checkout: `C:\Users\brenn\projects\singedTerra`
- Branch: `codex/ash-road-chapter-one-current`
- Upstream: `origin/main`
- `HEAD`: `ea574def3e8810c3eb9cf5c9ebe6905dd5ab9f23`
- `origin/main`: `ea574def3e8810c3eb9cf5c9ebe6905dd5ab9f23`
- Package source checkpoint: `0019bc456c455d37379f268759cdfc4196b1bcf8`

The package checkpoint is an ancestor of the execution checkout. The checkout is two commits ahead of that checkpoint; the source comparison reports two files changed with 12 insertions. The current checkout and accepted repository decisions govern all implementation details. The package is product direction and candidate evidence, not executable authority.

At the start of T-01, the working tree contained only the approved Ash Road preparation artifacts: modified append-only `.codearbiter/sprint-log.md` plus untracked `.codearbiter/specs/ash-road-chapter-one.md` and `.codearbiter/plans/ash-road-chapter-one.md`. T-01 adds this report and appends its receipt to the sprint log. No superseded branch or stash was reintroduced, and the package remains outside the source tree.

## Runtime and repository gates

- Declared and active Node: `24.18.0` (`.nvmrc` and `node --version` agree)
- npm: `11.16.0`
- Python: `3.14.6`
- Git: `2.55.0.windows.3`
- Existing repository gates inspected: `npm run typecheck`, `npm run check`, `npm run test:client`, `npm run check:edge`, `npm run build`, campaign/browser journeys when added, and the retained artifact/source-integrity checks already composed into the root scripts.
- No self-hosted runner may be registered. CI must use existing hosted project infrastructure.

## Package validation and its limits

Fresh read-only evidence on 2026-09-16:

| Probe | Result |
|---|---|
| `MANIFEST.sha256` recomputation | 29/29 entries matched |
| `node tools/verify-evidence.mjs` | exit 0; 126 published declarations reconstructed exactly |
| `node evidence/witnesses.mjs` | exit 0; seven baseline witnesses |
| `node evidence/balance-screen.mjs` | exit 0; 48 baseline rows |
| source-mode witnesses against this checkout | exit 0; seven witnesses; source SHA `ea574def…` |
| source-mode balance screen against this checkout | exit 0; 48 rows |
| `python tools/validate_packet.py` | exit 1 by design because packet-only `jsonschema` is not installed |

The missing schema-validator run is an explicit preflight limit, not a passing check. Installing that packet-only dependency was rejected because the package validator does not justify changing the game dependency surface. The checked-in `validation-results.json` reports structural validation at package creation, but it is not substituted for a fresh local validator execution.

The successful probes certify only packet integrity, reconstruction of its isolated published-engine baseline, seven legal default-profile witnesses, and a 48-row diagnostic screen. They do **not** certify campaign implementation, candidate solvability, campaign balance, browser integration, database behavior, audio/art quality, human acceptance, or physical-device acceptance. Source-mode probes also reported the checkout as dirty because the approved spec, plan, and sprint log are local work; they made no source mutation.

## Model substitution and final-review boundary

The packet recommends ASTRA/high for AR00 and broader orchestration. That recommendation is superseded by the user's explicit model policy:

- T-01 through T-42: ASTRA prohibited.
- T-43 only: one fresh ASTRA independent final campaign review.
- T-44: non-ASTRA handoff.
- T-01 actual author: Sol; no ASTRA invocation.

The current host catalog exposes `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna` with the needed high-effort support; Sol also supports xhigh where the ordered-effects work requires it. Availability in the host catalog is recorded without consuming ASTRA. Intermediate implementation and review use Sol or Terra according to engine/lifecycle versus presentation/content risk; Luna is limited to bounded read-only inventories or exact fixture comparisons. If delegation is unavailable or unnecessary, work proceeds sequentially and records the substitution rather than inventing a reviewer.

AC-24 remains open until T-43 and T-44: only the completed implementation may receive the single ASTRA review, and the subsequent non-ASTRA receipt must separate machine evidence from owner, subjective visual/audio, and physical-device evidence. Pending human checks must end as `ready for owner playtest`, never `released`.

## Delegated decision authority

The user delegates reversible direction and implementation decisions not fixed by the package. SMARTS is the decision record when genuine alternatives remain. The work should continue through the complete Ash Road chapter; incompleteness, ordinary test failures, and routine implementation choices are not blockers. Stop conditions are limited to an emergency, required spending, or completion of the whole sprint, while repository hard gates still prohibit secrets, direct default-branch writes, silent conflicts, and unsupported evidence claims.

Standing merge authority applies only after the entire sprint is implemented, the completion audit is satisfied, and required CI is green. It does not authorize production deployment, release/tag publication, paid services, a self-hosted runner, or fabricated device/owner evidence. Visual implementation must be checked against the game's existing authored-industrial battle-console style, while Canvas, Preact, Pixi, engine, session, persistence, and account/network owners retain their documented separation of duties.

## T-01 verification and mutation boundary

Verification commands:

```text
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
git merge-base --is-ancestor 0019bc456c455d37379f268759cdfc4196b1bcf8 HEAD
git rev-list --count 0019bc456c455d37379f268759cdfc4196b1bcf8..HEAD
git diff --shortstat 0019bc456c455d37379f268759cdfc4196b1bcf8..HEAD
node --version
npm --version
python --version
git --version
python tools/validate_packet.py
node tools/verify-evidence.mjs
node evidence/witnesses.mjs
node evidence/balance-screen.mjs
node --import tsx evidence/witnesses.mjs --repo C:\Users\brenn\projects\singedTerra
node --import tsx evidence/balance-screen.mjs --repo C:\Users\brenn\projects\singedTerra
```

The package commands were run from its extracted directory. T-01 changed only this report and appended `.codearbiter/sprint-log.md`. It performed no commit, push, merge, release, deploy, production/backend write, dependency installation, runner registration, or remote-ref mutation.
