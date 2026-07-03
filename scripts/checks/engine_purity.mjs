// Determinism-invariant guard for the singedTerra shared engine.
//
// The prime invariant (CLAUDE.md): shared/src/engine/* runs bit-identically in
// hot-seat AND in every networked client. Any wall-clock read or unseeded
// randomness inside the engine breaks lockstep. This check fails the build if
// `Math.random(`, `Date.now(`, `performance.now(`, or `new Date(` appears in
// ANY engine source — so the invariant (verified clean as of 2026-06-25,
// reliability-009) cannot regress silently. Seeded RNG lives in Random.ts
// (mulberry32) and is the only sanctioned randomness source.
//
// Run: npx tsx scripts/checks/engine_purity.mjs

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath (not URL.pathname): on Windows .pathname yields "/C:/..." which
// readdirSync mangles into a doubled-drive "C:\C:\..." path (ENOENT), silently
// disabling this guard for Windows contributors. fileURLToPath returns a native path.
const ENGINE_DIR = fileURLToPath(new URL('../../shared/src/engine/', import.meta.url));

// Forbidden CALL-SITE patterns (require the open paren so prose in identifiers
// can't trip it). Checked against comment-stripped source so doc-comments that
// merely MENTION these (e.g. "no Math.random mid-flight") are not flagged.
const FORBIDDEN = [
  { re: /\bMath\s*\.\s*random\s*\(/, name: 'Math.random()' },
  { re: /\bDate\s*\.\s*now\s*\(/, name: 'Date.now()' },
  { re: /\bperformance\s*\.\s*now\s*\(/, name: 'performance.now()' },
  { re: /\bnew\s+Date\s*\(/, name: 'new Date()' },
];

/** Strip block and line comments so commented-out mentions don't false-positive.
 *  Good enough for engine source (no such tokens live inside string literals here). */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // /* ... */
    .replace(/\/\/[^\n]*/g, ''); // // ...
}

const files = readdirSync(ENGINE_DIR).filter((f) => f.endsWith('.ts'));
let violations = 0;

for (const file of files) {
  const raw = readFileSync(join(ENGINE_DIR, file), 'utf8');
  const lines = stripComments(raw).split('\n');
  lines.forEach((line, i) => {
    for (const { re, name } of FORBIDDEN) {
      if (re.test(line)) {
        violations++;
        console.log(`FAIL: ${name} in shared/src/engine/${file}:${i + 1}`);
        console.log(`  ${line.trim()}`);
      }
    }
  });
}

if (violations > 0) {
  console.log(
    `\nENGINE PURITY CHECK: FAILED — ${violations} non-deterministic call(s) in the engine.\n` +
      'Wall-clock / Math.random break lockstep determinism. Use the seeded RNG (Random.ts) ' +
      'and pass wind/terrain seeds in as inputs.'
  );
  process.exit(1);
} else {
  console.log(
    `ENGINE PURITY CHECK: PASSED — no wall-clock / unseeded randomness in ${files.length} engine file(s).`
  );
  process.exit(0);
}
