// NETRETRY check — locks in the contract of postOnceWithRetry() in
// client/src/client/retry.ts, the pure retry helper used by callFinishGame.
//
// Proves:
//   1. FAIL-THEN-SUCCEED: mock fn that rejects call 1, resolves call 2 →
//      fn called exactly twice, result { ok: true, value }.
//   2. SUCCEED-FIRST: mock fn that resolves on call 1 →
//      fn called exactly once, result { ok: true }.
//   3. BOTH-FAIL (attempts=2): mock fn that always rejects →
//      fn called exactly twice, result { ok: false } and helper RESOLVES
//      (never rejects) — proven by wrapping in try/catch.
//
// Deterministic: no I/O, no network, no Math.random. Pure mock injection.
// Run: npx tsx scripts/checks/netretry.mjs

import { postOnceWithRetry } from '../../client/src/client/retry.ts';

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log('FAIL: ' + m); };

// -----------------------------------------------------------------------
// 1. FAIL-THEN-SUCCEED
// -----------------------------------------------------------------------
{
  let callCount = 0;
  const mockFn = async () => {
    callCount++;
    if (callCount === 1) throw new Error('transient error');
    return 'success-value';
  };

  const result = await postOnceWithRetry(mockFn, 2);

  if (callCount !== 2) {
    fail(`[fail-then-succeed] expected fn called exactly 2 times, got ${callCount}`);
  } else if (result.ok !== true) {
    fail(`[fail-then-succeed] expected { ok: true }, got { ok: ${result.ok} }`);
  } else if (result.value !== 'success-value') {
    fail(`[fail-then-succeed] expected value 'success-value', got '${result.value}'`);
  } else {
    log('PASS: fail-then-succeed — fn called twice, result { ok: true, value }.');
  }
}

// -----------------------------------------------------------------------
// 2. SUCCEED-FIRST
// -----------------------------------------------------------------------
{
  let callCount = 0;
  const mockFn = async () => {
    callCount++;
    return 42;
  };

  const result = await postOnceWithRetry(mockFn, 2);

  if (callCount !== 1) {
    fail(`[succeed-first] expected fn called exactly 1 time, got ${callCount}`);
  } else if (result.ok !== true) {
    fail(`[succeed-first] expected { ok: true }, got { ok: ${result.ok} }`);
  } else {
    log('PASS: succeed-first — fn called once, result { ok: true }.');
  }
}

// -----------------------------------------------------------------------
// 3. BOTH-FAIL (attempts=2)
// -----------------------------------------------------------------------
{
  let callCount = 0;
  const mockFn = async () => {
    callCount++;
    throw new Error(`always fails (call ${callCount})`);
  };

  let threwToCallerLevel = false;
  let result;
  try {
    result = await postOnceWithRetry(mockFn, 2);
  } catch {
    threwToCallerLevel = true;
  }

  if (threwToCallerLevel) {
    fail('[both-fail] helper must RESOLVE (never reject) on total failure — it threw instead');
  } else if (callCount !== 2) {
    fail(`[both-fail] expected fn called exactly 2 times (1 try + 1 retry), got ${callCount}`);
  } else if (result.ok !== false) {
    fail(`[both-fail] expected { ok: false }, got { ok: ${result.ok} }`);
  } else {
    log('PASS: both-fail — fn called twice, helper resolves to { ok: false } and never rejects.');
  }
}

if (failed) {
  log('\nNETRETRY CHECK: FAILED');
  process.exit(1);
} else {
  log('\nNETRETRY CHECK: PASSED');
  process.exit(0);
}
