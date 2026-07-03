# ci.yml has no explicit `permissions:` block — GITHUB_TOKEN runs with repo/org-default scope

**Severity:** low  |  **Confidence:** 0.7  |  **Effort:** S

**Where:**
- .github/workflows/ci.yml:1-44

**Evidence:** Read the whole file: no top-level or job-level `permissions:` key exists anywhere in ci.yml (contrast with deploy-pages.yml lines 21-24, which explicitly scopes to `contents: read`, `pages: write`, `id-token: write`, and codeql.yml lines 19-22, which scopes to `security-events: write`, `actions: read`, `contents: read`). Both `check` and `edge` jobs run `actions/checkout@v4` + `npm ci` + arbitrary tsx/deno scripts with whatever default token scope the repo/org has configured.

**Impact:** If the repo or org default GITHUB_TOKEN policy is "read and write" (the historical GitHub default), every CI run — including ones triggered by a PR from a fork once the repo goes public — gets a token with write access to contents/issues/PRs/packages it does not need, widening blast radius if a dependency in `npm ci`/tsx harnesses is ever compromised.

**Recommendation:** Add a `permissions: contents: read` block at the top of ci.yml (least privilege; neither job needs write access to anything).

**Acceptance criteria:**
- ci.yml declares an explicit top-level `permissions:` block scoped to `contents: read` (or narrower per-job)

<!-- dedup_key: infra:.github/workflows/ci.yml:missing-permissions-block · finding: infra-002 -->
