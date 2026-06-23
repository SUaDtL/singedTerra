// FASTFORWARD check — pins the pure view-pacing helper behind the fast-forward
// control (review #7). The helper decides how many engine.tick() calls a client's
// rAF loop runs per frame. It must (a) never accelerate an input-accepting phase
// (where tick() is a no-op), and (b) only multiply during a live FIRING/RESOLVING
// shot. Because fast-forward is pure local view pacing on a fixed-timestep engine,
// this contract is what keeps it determinism-safe — it changes frames drawn, never
// the tick COUNT a shot resolves in.
//
// Proves:
//   A. Fast-forward OFF returns 1 for every phase.
//   B. Fast-forward ON returns FF_TICKS_PER_FRAME for FIRING and RESOLVING only.
//   C. Fast-forward ON returns 1 for input-accepting phases (PLAYER_TURN/
//      ROUND_OVER/GAME_OVER/LOBBY) — no spinning on no-op ticks.
//
// Deterministic: pure function, no I/O. Run: npx tsx scripts/checks/fastforward.mjs

import { fastForwardTicks, FF_TICKS_PER_FRAME } from '../../client/src/client/fastForward.ts';

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log('FAIL: ' + m); };
const eq = (got, want, label) => { if (got !== want) fail(`${label}: expected ${want}, got ${got}`); };

const BUSY = ['FIRING', 'RESOLVING'];
const IDLE = ['PLAYER_TURN', 'ROUND_OVER', 'GAME_OVER', 'LOBBY'];

// --- A: OFF → always 1 ---
for (const p of [...BUSY, ...IDLE]) eq(fastForwardTicks(false, p), 1, `A off ${p}`);
if (!failed) log('PASS: fast-forward OFF runs exactly one tick per frame in every phase.');

// --- B: ON → FF multiplier for the busy phases ---
if (FF_TICKS_PER_FRAME <= 1) fail(`B: FF_TICKS_PER_FRAME must be > 1 to actually fast-forward, got ${FF_TICKS_PER_FRAME}`);
for (const p of BUSY) eq(fastForwardTicks(true, p), FF_TICKS_PER_FRAME, `B on ${p}`);
if (!failed) log(`PASS: fast-forward ON runs ${FF_TICKS_PER_FRAME} ticks/frame during FIRING/RESOLVING.`);

// --- C: ON → still 1 for input-accepting phases (no spinning) ---
for (const p of IDLE) eq(fastForwardTicks(true, p), 1, `C on ${p}`);
if (!failed) log('PASS: fast-forward ON does NOT multiply input-accepting phases.');

if (failed) { log('\nFASTFORWARD CHECK: FAILED'); process.exit(1); }
else { log('\nFASTFORWARD CHECK: PASSED'); process.exit(0); }
