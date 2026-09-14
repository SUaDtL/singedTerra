import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRequiredResult } from './requiredResult.mjs';

test('required checks accept only successful required work or deliberate docs-only skips', () => {
  assert.doesNotThrow(() => assertRequiredResult('success', 'false', 'success'));
  assert.doesNotThrow(() => assertRequiredResult('success', 'true', 'skipped'));
});

test('classification failure, missing output and skipped or cancelled required work fail closed', () => {
  for (const scope of ['failure', 'cancelled', 'skipped', 'timed_out', 'action_required', 'stale', 'startup_failure', undefined]) {
    assert.throws(() => assertRequiredResult(scope, 'true', 'skipped'));
  }
  for (const docs of ['', undefined, 'TRUE', 'anything']) {
    assert.throws(() => assertRequiredResult('success', docs, 'success'));
  }
  for (const result of ['failure', 'cancelled', 'skipped', 'timed_out', 'action_required', 'stale', 'startup_failure', undefined]) {
    assert.throws(() => assertRequiredResult('success', 'false', result));
  }
  for (const result of ['failure', 'cancelled', 'success', 'timed_out', 'action_required', 'stale', 'startup_failure', undefined]) {
    assert.throws(() => assertRequiredResult('success', 'true', result));
  }
});
