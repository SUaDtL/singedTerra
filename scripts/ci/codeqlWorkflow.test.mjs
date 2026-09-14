import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { classifyPaths } from './changeScope.mjs';

function assertCodeqlScope(workflow) {
  assert.match(workflow, /pull_request:\s*\n\s+push:\s*\n\s+branches: \[main\]\s*\n\s+schedule:/);
  assert.doesNotMatch(workflow, /pull_request_target|workflow_run|paths(?:-ignore)?:/);
  const scopeStart = workflow.indexOf('\n  scope:');
  const analyzeStart = workflow.indexOf('\n  analyze:');
  assert.notEqual(scopeStart, -1);
  assert.notEqual(analyzeStart, -1);
  const scope = workflow.slice(scopeStart, analyzeStart);
  const analyze = workflow.slice(analyzeStart);
  assert.match(scope, /outputs:\n\s+docs_only: \$\{\{ steps\.classify\.outputs\.docs_only \}\}/);
  assert.match(scope, /actions\/checkout@[\s\S]*?persist-credentials: false/);
  assert.match(scope, /actions\/setup-node@[\s\S]*?node-version-file: \.nvmrc/);
  assert.match(scope, /EVENT_NAME: \$\{\{ github\.event_name \}\}[\s\S]*?PR_BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}[\s\S]*?PR_HEAD_SHA: \$\{\{ github\.sha \}\}[\s\S]*?PUSH_BASE_SHA: \$\{\{ github\.event\.before \}\}[\s\S]*?PUSH_HEAD_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(scope, /pull_request\)\s*base="\$PR_BASE_SHA"\s*head="\$PR_HEAD_SHA"/);
  assert.match(scope, /push\)\s*base="\$PUSH_BASE_SHA"\s*head="\$PUSH_HEAD_SHA"/);
  assert.match(scope, /schedule\)[\s\S]*?docs_only=false/);
  assert.match(scope, /fail_scope\(\)[\s\S]*?docs_only=false/);
  assert.match(scope, /-z "\$base"[\s\S]*?-z "\$head"[\s\S]*?"\$base" =~ \^0\+\$[\s\S]*?"\$head" =~ \^0\+\$/);
  assert.match(scope, /\*\) fail_scope "Unsupported CodeQL event: \$EVENT_NAME"/);
  assert.match(scope, /if ! git fetch[\s\S]*?; then\s*fail_scope "Unable to fetch immutable base\/head evidence for CodeQL scope"/);
  assert.match(scope, /CI_BASE_SHA="\$base" CI_HEAD_SHA="\$head" node scripts\/ci\/changeScope\.mjs/);
  assert.match(analyze, /needs: scope/);
  assert.match(analyze, /if: needs\.scope\.result == 'success' && needs\.scope\.outputs\.docs_only == 'false' && github\.event\.repository\.visibility == 'public'/);
  assert.doesNotMatch(scope, /security-events: write/);
  assert.match(analyze, /security-events: write/);
  assert.equal(workflow.match(/security-events: write/g)?.length, 1);
}

const workflow = readFileSync('.github/workflows/codeql.yml', 'utf8').replace(/\r\n/g, '\n');

test('CodeQL runs only for successful full-scope changes while preserving event and permission boundaries', () => {
  assert.doesNotThrow(() => assertCodeqlScope(workflow));
});

test('CodeQL policy rejects reduced-scope analysis, source-branch PR binding, unsafe triggers, and scope privilege', () => {
  const mutations = [
    ['analyzer permits docs-only', workflow.replace("needs.scope.outputs.docs_only == 'false'", "needs.scope.outputs.docs_only == 'true'")],
    ['PR binds source branch', workflow.replace('PR_HEAD_SHA: ${{ github.sha }}', 'PR_HEAD_SHA: ${{ github.event.pull_request.head.sha }}')],
    ['unsafe PR trigger', workflow.replace('pull_request:', 'pull_request_target:')],
    ['schedule permits docs-only', workflow.replace('            schedule)\n              echo "docs_only=false"', '            schedule)\n              echo "docs_only=true"')],
    ['scope receives security write', workflow.replace('contents: read\n    outputs:', 'contents: read\n      security-events: write\n    outputs:')],
    ['scope ignores .nvmrc', workflow.replace('node-version-file: .nvmrc', 'node-version: 24')],
    ['scope persists credentials', workflow.replace('persist-credentials: false', 'persist-credentials: true')],
    ['scope permits zero SHAs', workflow.replace('[[ "$base" =~ ^0+$ ]] || [[ "$head" =~ ^0+$ ]]', 'false')],
    ['scope permits an unsupported event', workflow.replace('*) fail_scope "Unsupported CodeQL event: $EVENT_NAME"', '*) echo "unsupported"')],
    ['scope does not fail closed on fetch error', workflow.replace('fail_scope "Unable to fetch immutable base/head evidence for CodeQL scope"', 'exit 1')],
  ];
  for (const [label, mutated] of mutations) assert.throws(() => assertCodeqlScope(mutated), label);
});

test('the shared classifier keeps runtime, lockfile, and unknown paths out of CodeQL reduction', () => {
  for (const path of ['client/src/main.ts', 'package-lock.json', 'unknown/notes.md']) {
    assert.equal(classifyPaths(['docs/guide.md', path]).docsOnly, false, path);
  }
});
