import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function assertReleaseWorkflow(ci, pages, generalConfig, productConfig, lobbySpec) {
  assert.match(ci, /Migration-history disposable Git regressions[\s\S]*node --test scripts\/checks\/migration_classification\.test\.mjs/);
  assert.match(ci, /Release-candidate policy and digest regressions[\s\S]*node --test scripts\/ci\/releaseCandidate\.test\.mjs scripts\/ci\/releaseWorkflow\.test\.mjs/);
  assert.doesNotMatch(pages, /pull_request_target|workflow_run/);
  assert.match(pages, /push:\n\s+branches: \[main\]/);
  assert.match(pages, /workflow_dispatch:[\s\S]*rollback_run_id:[\s\S]*rollback_source_sha:[\s\S]*expected_current_main_sha:[\s\S]*confirmation:/);
  assert.equal(pages.match(/npm run build/g)?.length, 1);
  assert.match(pages, /releaseCandidate\.mjs gate/);
  assert.match(pages, /required_ci_run_attempt: \$\{\{ steps\.release\.outputs\.required_ci_run_attempt \}\}/);
  assert.equal(pages.match(/github-pages-\$\{\{ github\.run_id \}\}/g)?.length, 2);
  assert.match(pages, /artifact-ids: \$\{\{ needs\.build\.outputs\.artifact_id \}\}/);
  assert.match(pages, /needs: \[gate, build, candidate-test, freshness\]/);
  assert.match(pages, /E2E_LIVE_URL: http:\/\/127\.0\.0\.1:4173\/\$\{\{ github\.event\.repository\.name \}\}\//);
  assert.match(pages, /VITE_BASE: \$\{\{ needs\.build\.outputs\.base_path \}\}/);
  assert.equal(pages.match(/VITE_SUPABASE_ANON_KEY: \$\{\{ secrets\.VITE_SUPABASE_ANON_KEY \}\}/g)?.length, 2);
  assert.match(pages, /npm run test:e2e -- --grep-invert @live --workers=2/);
  assert.match(pages, /playwright test -c playwright\.product-completion\.config\.ts/);
  assert.match(pages, /artifact_name: github-pages-\$\{\{ github\.run_id \}\}/);
  const publishStart = pages.indexOf('\n  publish:');
  const smokeStart = pages.indexOf('\n  live-smoke:');
  const publish = pages.slice(publishStart, smokeStart);
  assert.match(publish, /pages: write/);
  assert.match(publish, /id-token: write/);
  assert.doesNotMatch(pages.slice(0, publishStart), /pages: write|id-token: write/);
  assert.doesNotMatch(pages, /needs\.build\.outputs\.supabase_origin/);
  assert.match(pages, /candidate_metadata_sha256: \$\{\{ steps\.built\.outputs\.candidate_metadata_sha256 \|\| steps\.rollback-meta\.outputs\.candidate_metadata_sha256 \}\}/);
  assert.match(pages, /CANDIDATE_METADATA_SHA256: \$\{\{ needs\.build\.outputs\.candidate_metadata_sha256 \}\}/);
  assert.match(pages, /E2E_EXPECTED_BACKEND_ORIGIN="\$\(node -e/);
  assert.match(publish, /releaseCandidate\.mjs revalidate-ci/);
  assert.match(publish, /REQUIRED_CI_RUN_ATTEMPT: \$\{\{ needs\.gate\.outputs\.required_ci_run_attempt \}\}/);
  assert.match(
    publish,
    /releaseCandidate\.mjs revalidate-ci[\s\S]*?\n      - id: deployment/,
  );
  assert.match(generalConfig, /process\.env\['E2E_DENY_EXTERNAL_NETWORK'\] === '1'/);
  assert.match(generalConfig, /server: 'http:\/\/127\.0\.0\.1:9'/);
  assert.match(productConfig, /process\.env\['E2E_LIVE_URL'\]/);
  assert.match(productConfig, /webServer: externalURL/);
  assert.match(productConfig, /process\.env\['E2E_DENY_EXTERNAL_NETWORK'\] === '1'/);
  assert.match(lobbySpec, /process\.env\['E2E_EXPECTED_BACKEND_ORIGIN'\]/);
  assert.match(lobbySpec, /candidate verification denies unmocked external traffic/);
}

const ci = readFileSync('.github/workflows/ci.yml', 'utf8').replace(/\r\n/g, '\n');
const pages = readFileSync('.github/workflows/deploy-pages.yml', 'utf8').replace(/\r\n/g, '\n');
const generalConfig = readFileSync('playwright.config.ts', 'utf8').replace(/\r\n/g, '\n');
const productConfig = readFileSync('playwright.product-completion.config.ts', 'utf8').replace(/\r\n/g, '\n');
const lobbySpec = readFileSync('e2e/lobby-layout.spec.ts', 'utf8').replace(/\r\n/g, '\n');

test('release graph gates and tests the exact trusted candidate', () => {
  assert.doesNotThrow(() => assertReleaseWorkflow(ci, pages, generalConfig, productConfig, lobbySpec));
});

test('policy rejects missing gates, untrusted triggers, and alternate artifacts', () => {
  const mutations = [
    pages.replace('needs: [gate, build, candidate-test, freshness]', 'needs: [build]'),
    pages.replace('workflow_dispatch:', 'pull_request_target:\n  workflow_dispatch:'),
    pages.replaceAll('github-pages-${{ github.run_id }}', 'github-pages-pr'),
    pages.replace('artifact-ids: ${{ needs.build.outputs.artifact_id }}', 'name: github-pages'),
    pages.replace('npm run test:e2e -- --grep-invert @live --workers=2', 'echo skipped-general-suite'),
    pages.replace('npx playwright test -c playwright.product-completion.config.ts', 'echo skipped-product-suite'),
    pages.replace('node scripts/ci/releaseCandidate.mjs revalidate-ci', 'echo skipped-final-ci-check'),
    pages.replaceAll('CANDIDATE_METADATA_SHA256: ${{ needs.build.outputs.candidate_metadata_sha256 }}', 'CANDIDATE_METADATA_SHA256: omitted'),
  ];
  for (const mutated of mutations) {
    assert.throws(() => assertReleaseWorkflow(ci, mutated, generalConfig, productConfig, lobbySpec));
  }
});

test('policy rejects a candidate config that silently rebuilds', () => {
  const mutated = productConfig.replace('webServer: externalURL', 'webServer: false && externalURL');
  assert.throws(() => assertReleaseWorkflow(ci, pages, generalConfig, mutated, lobbySpec));
});

test('policy rejects removal of the candidate-only external network deny boundary', () => {
  const mutated = generalConfig.replace("server: 'http://127.0.0.1:9'", "server: 'http://example.invalid:9'");
  assert.throws(() => assertReleaseWorkflow(ci, pages, mutated, productConfig, lobbySpec));
});
