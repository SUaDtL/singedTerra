# Sprint spec — public-ready

**Created:** 2026-06-21
**Mode:** `/ca:sprint` (autonomous). Premium subagent path.
**Part 1 of 2** of "going public" (the user chose: full community-ready · CI gate+hygiene · implement
the limiter). This sprint is the SAFE half — CI, hygiene, and docs, with **zero backend/trust-boundary
changes**. The security-sensitive half (rate limiter, threat model, ADRs) is **Sprint B
`public-hardening`**, run next so it merges through the CI this sprint builds.

## Goal

Make the repository genuinely ready to be flipped public: a CI gate that protects the determinism
invariant on every PR, dependency/security hygiene, the standard community files, light README polish,
and a recorded pre-public exposure audit. The actual visibility flip stays the user's action.

## Context that constrains the work

- Git history is already **secret-clean** (verified 2026-06-21: no JWT-shaped tokens, no service-role
  key assignments, no `.env` ever committed across all branches).
- README is already polished (banner, badges, love-letter framing) — needs touch-up, not a rewrite.
  The "16 harnesses green" badge is **stale**; it is 41 now.
- `.nvmrc` exists — CI reads the Node version from it. Local toolchain: Node 24, npm 11.
- License is MIT. `private: true` in `package.json` is **intentionally KEPT** (it blocks accidental
  `npm publish`; it is unrelated to GitHub repo visibility — do NOT remove it).
- The full suite is `npm run check` (typecheck + 41 `tsx` harnesses) + `npm run check:edge`
  (`deno test`, 57 cases) + `npm run build`. `tsx` is now lockfile-pinned (PR #31).

## Scope (10 tasks)

1. **CI workflow** `.github/workflows/ci.yml` — on `pull_request` + `push: main`. Two jobs:
   (a) **check**: `actions/checkout`, `actions/setup-node` (version from `.nvmrc`, `cache: npm`),
   `npm ci`, `npm run check`, `npm run build`; (b) **edge**: `denoland/setup-deno`,
   `deno test supabase/functions/`. Pin action major versions. The workflow running green on THIS
   sprint's PR is the acceptance proof.
2. **Dependabot** `.github/dependabot.yml` — ecosystems `npm` (root) + `github-actions`; weekly;
   group minor/patch to reduce PR noise.
3. **CodeQL** `.github/workflows/codeql.yml` — JS/TS analysis on `pull_request` + a weekly schedule.
4. **CONTRIBUTING.md** — dev setup (`npm install`, `npm run dev`); the `npm run check` /
   `check:edge` gate expectation; the **determinism rule** (no `Math.random`/wall-clock in
   `shared/engine`); the **harness footgun** (a new `scripts/checks/*.mjs` MUST be appended to the
   `check` `&&`-chain or it silently never runs); Conventional-Commits note.
5. **SECURITY.md** — responsible-disclosure contact + the security model so researchers know scope:
   trust-client / ephemeral-identity by design, anon key is public-by-design, service-role never
   ships to the client, RLS locks all anon writes.
6. **Issue templates** `.github/ISSUE_TEMPLATE/{bug_report.md,feature_request.md,config.yml}` —
   align with the existing `Bug:` / `Investigate:` issue convention.
7. **PR template** `.github/PULL_REQUEST_TEMPLATE.md` — summary, the `check` + `check:edge` gate
   checkbox, the determinism-impact note.
8. **CODE_OF_CONDUCT.md** — Contributor Covenant (standard text), contact filled in.
9. **README polish** — fix the stale harness badge (16 → 41), add a CI status badge pointing at the
   new workflow, add CONTRIBUTING / SECURITY links, verify the play/deploy link. Light touch only.
10. **Pre-public exposure audit** `.codearbiter/checkpoints/going-public-audit-2026-06-21.md` —
    record the evidence the repo is safe to flip: history scan result, what is intentionally
    world-readable (project ref, table schema, anon key, Edge Function logic), the kept `private:true`
    rationale, and the residual items deferred to Sprint B (rate limiting, threat model).

## Acceptance criteria

- AC1: `.github/workflows/ci.yml` exists, is valid YAML, and runs **green** on this sprint's PR
  (both `check` and `edge` jobs).
- AC2: `dependabot.yml` and `codeql.yml` exist and are valid.
- AC3: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, the issue templates, and the PR
  template all exist with project-accurate content (not generic boilerplate).
- AC4: README harness badge reads 41 (not 16); a CI badge and CONTRIBUTING/SECURITY links are present.
- AC5: the exposure-audit doc exists and records the history-clean evidence + the kept-`private:true`
  rationale + the Sprint-B deferrals.
- AC6 (regression): `npm run check`, `npm run check:edge`, and `npm run build` stay green locally;
  no source/engine behavior changed; `private: true` still present.

## Explicitly EXCLUDED → Sprint B `public-hardening` or user action

- **Rate limiter (CONFIRM-04)** — migration 005 + Edge Function changes + deploy. Sprint B. The
  design fork (Postgres counter table [recommended] vs in-memory per-isolate) is resolved at B's
  spec gate.
- **STRIDE threat model** on the public surface — `/ca:threat-model`, in/before Sprint B.
- **ADRs (CONFIRM-05)** — formalizing the 6 invariants for public contributors; fold into Sprint B.
- **Branch protection requiring green CI** — a repo SETTING (`gh api` / GitHub UI), done AFTER CI has
  run once. User action / post-merge checklist.
- **Repo description + topics, and the actual flip to public** — outward-facing, irreversible. USER
  ACTION only; never autonomous.

## Risk / autonomy notes

- Every task is file creation under `.github/` or root docs + a light README edit. No `shared/`,
  no `client/` logic, no Edge Functions, no migrations → deterministic-safe by construction; the
  existing suite is the regression backstop.
- Self-verifying: the CI workflow proves itself by running on the sprint's own PR.
- No hard gates expected. The exposure-audit doc is informational (it records, it doesn't change posture).
