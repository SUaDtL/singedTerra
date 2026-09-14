import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

// A skipped dependency is green only when the successful classifier explicitly
// selected the docs-only lane. Failure/cancellation must never satisfy protection.
export function assertRequiredResult(scopeResult, docsOnly, workResult) {
  assert.equal(scopeResult, 'success', 'Change classification must succeed');
  assert.ok(docsOnly === 'true' || docsOnly === 'false', 'Missing change classification');
  assert.equal(workResult, docsOnly === 'true' ? 'skipped' : 'success', 'Required work did not complete as classified');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertRequiredResult(process.env.SCOPE_RESULT, process.env.DOCS_ONLY, process.env.WORK_RESULT);
  console.log(process.env.DOCS_ONLY === 'true' ? 'PASS: classified documentation-only change' : 'PASS: all required work succeeded');
}
