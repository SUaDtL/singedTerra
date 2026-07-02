# Third-party GitHub Actions pinned to floating major-version tags, not commit SHAs

**Severity:** medium  |  **Confidence:** 0.85  |  **Effort:** S

**Where:**
- .github/workflows/ci.yml:20-21,33,41
- .github/workflows/codeql.yml:24-29
- .github/workflows/deploy-pages.yml:37-38,54-55,68

**Evidence:** All action references across the 3 workflows use floating tags: `actions/checkout@v4`, `actions/setup-node@v4`, `denoland/setup-deno@v2`, `github/codeql-action/{init,autobuild,analyze}@v3`, `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4`. None are pinned to a commit SHA.

**Impact:** A compromised or re-tagged upstream action (tag-move attack) would run with the workflow's token/secrets on the next CI run or Pages deploy without any repo change to review — deploy-pages.yml in particular has `id-token: write`/`pages: write` and injects `VITE_SUPABASE_*` secrets into the build env, so a poisoned action there could exfiltrate them or tamper with the published bundle.

**Recommendation:** Pin each `uses:` reference to a full commit SHA (with a trailing `# vX.Y.Z` comment for readability), or adopt Dependabot/Renovate's SHA-pinning update mode so tags stay auditable per-commit rather than floating.

**Acceptance criteria:**
- Every `uses:` line in the 3 workflow files references a 40-character commit SHA instead of a bare `@vN` tag

<!-- dedup_key: infra:.github/workflows:actions-not-pinned-to-sha · finding: infra-001 -->
