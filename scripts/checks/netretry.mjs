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
//   4. ATTEMPTS-CLAMP (attempts=0): clamped to 1 → fn called exactly once.
//   5. DELAY-ZERO (delayMs=0): retries with no pause (elapsed < 100ms).
//   6. DELAY-APPLIED (delayMs=25): one inter-attempt pause fires (elapsed >= ~25ms).
//
// Deterministic in outcome: no I/O, no network, no Math.random. Cases 5/6 use
// wall-clock only for loose delay bounds (setTimeout fires at-or-after its delay).
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

// -----------------------------------------------------------------------
// 4. ATTEMPTS CLAMP (attempts=0 -> still calls fn exactly once, never zero)
//    Guards the `total = attempts < 1 ? 1 : attempts` clamp: a non-positive
//    count must NOT skip the call entirely. Use an always-failing fn so a
//    zero-call bug would surface as callCount===0 (a false { ok:false }).
//    delayMs=0 because a single attempt incurs no inter-attempt delay anyway.
// -----------------------------------------------------------------------
{
  let callCount = 0;
  const mockFn = async () => {
    callCount++;
    throw new Error('always fails');
  };

  const result = await postOnceWithRetry(mockFn, 0, 0);

  if (callCount !== 1) {
    fail(`[attempts-clamp] expected attempts=0 clamped to exactly 1 call, got ${callCount}`);
  } else if (result.ok !== false) {
    fail(`[attempts-clamp] expected { ok: false } after the single failed attempt, got { ok: ${result.ok} }`);
  } else {
    log('PASS: attempts-clamp — attempts=0 still calls fn exactly once, resolves { ok: false }.');
  }
}

// -----------------------------------------------------------------------
// 5. DELAY SUPPRESSED (attempts=2, delayMs=0 -> retries with NO pause)
//    Proves delayMs=0 skips the inter-attempt wait while still retrying.
//    Elapsed must be far below the 200ms default (loose < 100ms bound).
// -----------------------------------------------------------------------
{
  let callCount = 0;
  const mockFn = async () => {
    callCount++;
    if (callCount === 1) throw new Error('transient error');
    return 'ok';
  };

  const start = Date.now();
  const result = await postOnceWithRetry(mockFn, 2, 0);
  const elapsed = Date.now() - start;

  if (callCount !== 2) {
    fail(`[delay-zero] expected fn called exactly 2 times, got ${callCount}`);
  } else if (result.ok !== true) {
    fail(`[delay-zero] expected { ok: true }, got { ok: ${result.ok} }`);
  } else if (elapsed >= 100) {
    fail(`[delay-zero] expected ~no delay with delayMs=0, but retry took ${elapsed}ms`);
  } else {
    log(`PASS: delay-zero — delayMs=0 retries with no pause (${elapsed}ms).`);
  }
}

// -----------------------------------------------------------------------
// 6. DELAY APPLIED (attempts=2, delayMs=25 -> a pause fires BETWEEN attempts)
//    setTimeout fires at-or-after its delay, so elapsed >= ~delayMs is a
//    non-flaky lower bound (asserted >=20ms for ms-rounding tolerance). The
//    delay sits between attempts only, so two attempts incur exactly one.
// -----------------------------------------------------------------------
{
  let callCount = 0;
  const mockFn = async () => {
    callCount++;
    if (callCount === 1) throw new Error('transient error');
    return 'ok';
  };

  const start = Date.now();
  const result = await postOnceWithRetry(mockFn, 2, 25);
  const elapsed = Date.now() - start;

  if (callCount !== 2) {
    fail(`[delay-applied] expected fn called exactly 2 times, got ${callCount}`);
  } else if (result.ok !== true) {
    fail(`[delay-applied] expected { ok: true }, got { ok: ${result.ok} }`);
  } else if (elapsed < 20) {
    fail(`[delay-applied] expected an inter-attempt delay >=~25ms, but retry took only ${elapsed}ms`);
  } else {
    log(`PASS: delay-applied — one inter-attempt pause fired (${elapsed}ms >= ~25ms).`);
  }
}

if (failed) {
  log('\nNETRETRY CHECK: FAILED');
  process.exit(1);
} else {
  log('\nNETRETRY CHECK: PASSED');
  process.exit(0);
}
