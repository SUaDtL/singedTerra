// SESSION check — proves the contract of isLiveSession() in
// client/src/lib/sessionDescriptor.ts, the pure predicate that decides
// whether a persisted rejoin-after-refresh session descriptor is still live.
//
// Proves:
//   A. LIVE: room.status === 'active' AND descriptor.playerId is present in
//      room.players → true.
//   B. FINISHED: room.status === 'finished' (seat still present) → false.
//   C. DELETED: room is null (deleted room row) → false.
//   D. SEAT ABSENT: room.status === 'active' but descriptor.playerId is not
//      in room.players → false.
//
// Pure, no I/O, no Math.random, no Date.
// Run: npx tsx scripts/checks/session.mjs

import { isLiveSession } from '../../client/src/lib/sessionDescriptor.ts';

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log('FAIL: ' + m); };

const descriptor = { roomId: 'room-1', roomCode: 'ABCD', playerId: 'seat-1' };

// --- Check A: LIVE ---
{
  const room = { status: 'active', players: [{ id: 'seat-1' }, { id: 'seat-2' }] };
  const result = isLiveSession(descriptor, room);
  if (result !== true) {
    fail(`A: expected true for active room with seat present, got ${result}`);
  } else {
    log('PASS: A — active room with descriptor.playerId present in players → true.');
  }
}

// --- Check B: FINISHED ---
{
  const room = { status: 'finished', players: [{ id: 'seat-1' }, { id: 'seat-2' }] };
  const result = isLiveSession(descriptor, room);
  if (result !== false) {
    fail(`B: expected false for finished room, got ${result}`);
  } else {
    log('PASS: B — finished room (seat still present) → false.');
  }
}

// --- Check C: DELETED ---
{
  const result = isLiveSession(descriptor, null);
  if (result !== false) {
    fail(`C: expected false for null (deleted) room, got ${result}`);
  } else {
    log('PASS: C — null room (deleted) → false.');
  }
}

// --- Check D: SEAT ABSENT ---
{
  const room = { status: 'active', players: [{ id: 'seat-2' }, { id: 'seat-3' }] };
  const result = isLiveSession(descriptor, room);
  if (result !== false) {
    fail(`D: expected false when descriptor.playerId is absent from players, got ${result}`);
  } else {
    log('PASS: D — active room but seat absent from players → false.');
  }
}

if (failed) { log('\nSESSION CHECK: FAILED'); process.exit(1); }
else { log('\nSESSION CHECK: PASSED'); process.exit(0); }
