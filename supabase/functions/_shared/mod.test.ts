// Unit tests for nextCursor — the pure seat-decision function extracted from
// submit_action/index.ts.
//
// Run: "C:/Users/brenn/.deno/bin/deno.exe" test supabase/functions/_shared/mod.test.ts
//
// Uses Deno.test with manual assertions (no external import) so the suite is
// hermetic and does not require network access.

import { nextCursor } from './mod.ts'

// ---------------------------------------------------------------------------
// Helper: assert strict equality with a descriptive message
// ---------------------------------------------------------------------------
function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// ---------------------------------------------------------------------------
// AC5 – seat-decision branch coverage
// ---------------------------------------------------------------------------

// Turn-ending, valid reported seat differing from active → returns reported, turn+1
Deno.test('turn-ending: valid reported (different from active) is honored', () => {
  const result = nextCursor({
    activeIndex: 0,
    playersLength: 3,
    reported: 1,
    isRoundOver: false,
    currentTurn: 5,
  })
  assertEqual(result.index, 1, 'index')
  assertEqual(result.turn, 6, 'turn')
})

// Reported is the ACTING seat and NOT round-over → falls back to modulo (activeIndex+1)%playersLength
Deno.test('turn-ending: reported === activeIndex (not round-over) → modulo fallback', () => {
  const result = nextCursor({
    activeIndex: 2,
    playersLength: 3,
    reported: 2,        // same as activeIndex
    isRoundOver: false,
    currentTurn: 10,
  })
  // modulo = (2 + 1) % 3 = 0
  assertEqual(result.index, 0, 'index')
  assertEqual(result.turn, 11, 'turn')
})

// Round-over AND reported === acting seat (opener re-seat) → HONORS reported
// (the round-boundary exception relaxes the "can't keep your own turn" guard)
Deno.test('round-over: reported === activeIndex → opener is honored (round-boundary exception)', () => {
  const result = nextCursor({
    activeIndex: 1,
    playersLength: 4,
    reported: 1,        // same as activeIndex — valid only because isRoundOver=true
    isRoundOver: true,
    currentTurn: 7,
  })
  assertEqual(result.index, 1, 'index')
  assertEqual(result.turn, 8, 'turn')
})

// Reported out of bounds (>= playersLength) → modulo fallback
Deno.test('out-of-bounds reported (>= playersLength) → modulo fallback', () => {
  const result = nextCursor({
    activeIndex: 0,
    playersLength: 2,
    reported: 5,        // >= playersLength
    isRoundOver: false,
    currentTurn: 3,
  })
  // modulo = (0 + 1) % 2 = 1
  assertEqual(result.index, 1, 'index')
  assertEqual(result.turn, 4, 'turn')
})

// Reported negative → modulo fallback
Deno.test('negative reported → modulo fallback', () => {
  const result = nextCursor({
    activeIndex: 1,
    playersLength: 3,
    reported: -1,
    isRoundOver: false,
    currentTurn: 0,
  })
  // modulo = (1 + 1) % 3 = 2
  assertEqual(result.index, 2, 'index')
  assertEqual(result.turn, 1, 'turn')
})

// Reported null → modulo fallback
Deno.test('null reported → modulo fallback', () => {
  const result = nextCursor({
    activeIndex: 0,
    playersLength: 4,
    reported: null,
    isRoundOver: false,
    currentTurn: 2,
  })
  // modulo = (0 + 1) % 4 = 1
  assertEqual(result.index, 1, 'index')
  assertEqual(result.turn, 3, 'turn')
})

// Turn increments to currentTurn+1 in all turn-ending cases (extra cross-check)
Deno.test('turn always increments by 1 regardless of seat decision', () => {
  // Case A: reported honored
  const a = nextCursor({ activeIndex: 0, playersLength: 2, reported: 1, isRoundOver: false, currentTurn: 99 })
  assertEqual(a.turn, 100, 'turn (honored)')

  // Case B: modulo fallback
  const b = nextCursor({ activeIndex: 0, playersLength: 2, reported: 0, isRoundOver: false, currentTurn: 99 })
  assertEqual(b.turn, 100, 'turn (modulo fallback)')

  // Case C: round-over honored
  const c = nextCursor({ activeIndex: 1, playersLength: 2, reported: 1, isRoundOver: true, currentTurn: 99 })
  assertEqual(c.turn, 100, 'turn (round-over honored)')
})

// currentTurn = 0 (null/undefined in DB — the function receives it pre-coerced to 0)
Deno.test('currentTurn=0 → turn becomes 1', () => {
  const result = nextCursor({
    activeIndex: 0,
    playersLength: 2,
    reported: 1,
    isRoundOver: false,
    currentTurn: 0,
  })
  assertEqual(result.turn, 1, 'turn')
})

// 2-player edge: wrapping from last seat (index 1) → index 0 via modulo
Deno.test('2-player wrap: activeIndex=1 reported=1 (not round-over) → modulo → index 0', () => {
  const result = nextCursor({
    activeIndex: 1,
    playersLength: 2,
    reported: 1,        // same as active, not round-over → fallback
    isRoundOver: false,
    currentTurn: 4,
  })
  // modulo = (1 + 1) % 2 = 0
  assertEqual(result.index, 0, 'index')
  assertEqual(result.turn, 5, 'turn')
})

// round-over out-of-bounds → modulo even during round transition
Deno.test('round-over + out-of-bounds reported → modulo fallback', () => {
  const result = nextCursor({
    activeIndex: 0,
    playersLength: 3,
    reported: 99,
    isRoundOver: true,
    currentTurn: 1,
  })
  // modulo = (0 + 1) % 3 = 1
  assertEqual(result.index, 1, 'index')
  assertEqual(result.turn, 2, 'turn')
})
