# Plan — public-ready

Spec: `.codearbiter/specs/public-ready.md`. Each task carries its file path and a concrete
verification. `status`: PENDING → ACCEPTED (the ledger; interrupted sprint re-enters on the first
non-ACCEPTED row). MVP slice = T1 (CI), the load-bearing deliverable.

| # | Task | File(s) | Verification | AC | status |
|---|------|---------|--------------|----|--------|
| T1 | CI workflow: `check` job (setup-node from `.nvmrc`, npm cache, `npm ci`, `npm run check`, `npm run build`) + `edge` job (setup-deno, `deno test`) | `.github/workflows/ci.yml` | valid YAML; runs green on the sprint PR (both jobs) | AC1 | ACCEPTED |
| T2 | Dependabot config (npm + github-actions, weekly, grouped) | `.github/dependabot.yml` | valid YAML; ecosystems present | AC2 | ACCEPTED |
| T3 | CodeQL workflow (JS/TS, PR + weekly) | `.github/workflows/codeql.yml` | valid YAML | AC2 | ACCEPTED |
| T4 | CONTRIBUTING.md (setup, the check gate, determinism rule, harness-chain footgun, commits) | `CONTRIBUTING.md` | content references `npm run check`, determinism, the `&&`-chain footgun | AC3 | ACCEPTED |
| T5 | SECURITY.md (disclosure contact + security model: trust-client, anon-public, service-role server-only, RLS) | `SECURITY.md` | content names the model + a contact | AC3 | ACCEPTED |
| T6 | Issue templates (bug, feature, config) aligned with `Bug:`/`Investigate:` convention | `.github/ISSUE_TEMPLATE/*` | three files present, valid front-matter | AC3 | ACCEPTED |
| T7 | PR template (summary, check+check:edge checkbox, determinism note) | `.github/PULL_REQUEST_TEMPLATE.md` | file present, references both gates | AC3 | ACCEPTED |
| T8 | CODE_OF_CONDUCT.md (Contributor Covenant, contact filled) | `CODE_OF_CONDUCT.md` | file present | AC3 | ACCEPTED |
| T9 | README polish: harness badge 16→41, add CI badge, CONTRIBUTING/SECURITY links | `README.md` | badge reads 41; CI badge + links present; no other content lost | AC4 | ACCEPTED |
| T10 | Pre-public exposure audit doc (history-clean evidence, intentionally-public list, kept-`private:true` rationale, Sprint-B deferrals) | `.codearbiter/checkpoints/going-public-audit-2026-06-21.md` | file present with all four sections | AC5 | ACCEPTED |
| V | Regression | — | `npm run check` + `npm run check:edge` + `npm run build` green; `private: true` still in package.json | AC6 | ACCEPTED |

## Dependencies / ordering

- T1 first (MVP). T9 depends on T1 existing (the CI badge points at `ci.yml`).
- T1, T2, T3 all create files under `.github/workflows` or `.github/` — independent files, no collision.
- T4–T8, T10 are independent docs. T9 is the only edit to an existing file (README) — solo, no collision.
- No backend, no migration, no engine change — V is the existing suite, unchanged.

## Note on CI-green verification (AC1)

The `ci.yml` workflow triggers on the sprint's own `pull_request`, so opening the PR runs it. AC1 is
confirmed by the PR's checks going green (watch via `/ca:watch` or `gh pr checks`). `npm ci` requires
the lockfile in sync — it is (post-PR #31 `tsx` pin). If the first CI run reveals an environment gap
(e.g. a harness assuming a local-only path), that is a real finding to fix on the branch, not a
hard-gate stop.

## Sprint B `public-hardening` (queued — NOT this sprint)

Outlined here so nothing is lost; its own spec gate runs when we start it.
- **Rate limiter (resolves CONFIRM-04).** Recommended design: a Postgres `rate_limits` counter table
  (migration 005) + a pure `checkRateLimit()` in `_shared/mod.ts` applied to the write-side Edge
  Functions, with Deno unit tests (mirrors the `validate.ts` extraction pattern). Alternative
  (in-memory per-isolate) is weaker — leaks across edge instances. Decide at B's spec gate. Needs a
  backend deploy.
- **STRIDE threat model** on the now-public surface — `/ca:threat-model`.
- **ADRs (resolves CONFIRM-05).** Formalize ADR-001..006 (two-context physics, deterministic lockstep,
  seeded PRNG, HUD-as-DOM, thin referees, no-auth/ephemeral-identity) for public contributors.
- Order: run AFTER this sprint's CI is merged, so B's PR is gated by it. Hardening should land BEFORE
  the user flips the repo public.
