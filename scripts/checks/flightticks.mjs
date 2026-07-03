// FLIGHTTICKS check — proves real ballistic flights reach rest WELL UNDER the
// 10_000-tick NetworkClient.tickToCompletion cap, so the cap can never be silently
// hit. Hitting the cap leaves the engine in FIRING and desyncs networked clients.
//
// POWER_SCALE was retuned for the 1200×600 field (larger canvas = shorter arcs in
// absolute ticks than you might expect at full power), but napalm-fire weapons hold
// FIRING open through burnTicks. This harness pins the worst-case margin across:
//   - 5 fixed seeds (different terrain shapes)
//   - 4 angles: 15°/45°/75°/90° (low arc / medium / high / lofted)
//   - 3 power levels: 25 / 65 / 100 (short / medium / max range)
//   - 10 weapons: every non-shield default-loadout type (baby_missile, missile,
//     heavy_missile, cluster_bomb, bouncing_betty, funky_bomb, napalm, dirt_bomb,
//     riot_bomb) + premium weapons granted for completeness (nuke, mirv,
//     deaths_head, hot_napalm). Shield is not a projectile — excluded.
//
// The threshold is 500 ticks. The ORIGINAL comment here claimed napalm stays
// "well under 500 ticks and under 300 for every ballistic weapon" — but Bouncing
// Betty's hopBoost skip (a ballistic, bouncing weapon) ran 702 ticks at angle≥75/
// power=100, silently violating that stated intent, and the old 5_000 threshold was
// far too loose to ever catch it. The MAX_FLIGHT_TICKS cap in GameEngine now
// force-detonates any shell past 240 flight ticks, bringing Betty back in line;
// this 500-tick bar ENFORCES the design intent (napalm burn <500, ballistic <300)
// and is the regression guard for that cap — remove the cap and Betty's 702 fails
// here. (Note: this is NOT a network-watchdog budget; the fire watchdog clears on
// the committed echo, not on animation length — see NetworkClient.setFiring.)
//
// Deterministic: no Math.random / Date. Run: npx tsx scripts/checks/flightticks.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';

const PALETTE = ['#e84d4d', '#4d8ce8'];

// Five fixed seeds spanning a range of terrain shapes.
const SEEDS = [0xc0ffee, 0x5eed1234, 0x1a3, 0xbeef, 0xfade];

// Spread of launch angles in degrees (0=right, 90=up).
const ANGLES = [15, 45, 75, 90];

// Spread of power levels (0–100).
const POWERS = [25, 65, 100];

// Weapons in the default non-premium loadout (ammo > 0 at spawn, or unlimited).
// Shield is not a projectile weapon — excluded from this check.
const DEFAULT_WEAPONS = [
  'baby_missile',   // unlimited — the baseline
  'missile',
  'heavy_missile',
  'cluster_bomb',
  'bouncing_betty',
  'funky_bomb',
  'napalm',
  'dirt_bomb',
  'riot_bomb',
];

// Premium weapons (START_AMMO = 0 at spawn — must be granted in test setup).
const PREMIUM_WEAPONS = [
  'nuke',
  'mirv',
  'deaths_head',
  'hot_napalm',
];

// All weapons under test.
const ALL_WEAPONS = [...DEFAULT_WEAPONS, ...PREMIUM_WEAPONS];

// Safety cap on the per-shot loop — mirrors the production cap; a flight that
// reaches this is a bug, not a normal shot.
const LOOP_CAP = 10_000;

// The threshold we assert: worst-case ticks must stay BELOW this value.
// 500 enforces the original design intent (napalm burn <500, ballistic <300) and
// is the regression guard for GameEngine's MAX_FLIGHT_TICKS cap — see top comment.
const TICK_THRESHOLD = 500;

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log('FAIL: ' + m); };

/** Grant the premium weapon enough ammo to fire it. */
function grant(engine, weapon) {
  const inv = engine.getState().tanks[0].inventory[weapon];
  inv.count = 1;
  inv.unlimited = false;
}

/**
 * Fire one shot (weapon, angle, power) from the active tank of a fresh engine
 * and tick until FIRING exits or the loop cap is reached.
 * Returns { ticks, hitCap }.
 */
function flyShot(seed, weapon, angle, power) {
  const engine = new GameEngine({
    players: [{ name: 'P1', color: PALETTE[0] }, { name: 'P2', color: PALETTE[1] }],
    maxPlayers: 2,
    seed,
  });

  // Grant ammo for premium weapons (default loadout already has non-premiums).
  if (PREMIUM_WEAPONS.includes(weapon)) grant(engine, weapon);

  engine.applyAction({ type: 'select_weapon', weapon });
  engine.applyAction({ type: 'set_angle', angle });
  engine.applyAction({ type: 'set_power', power });
  engine.applyAction({ type: 'fire' });

  let ticks = 0;
  while ((engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') && ticks < LOOP_CAP) {
    engine.tick();
    ticks++;
  }

  return { ticks, hitCap: ticks >= LOOP_CAP };
}

// --- Sweep the grid and collect all tick counts ---

let worstTicks = 0;
let worstLabel = '';
let totalRuns = 0;
let capHits = 0;

for (const seed of SEEDS) {
  for (const weapon of ALL_WEAPONS) {
    for (const angle of ANGLES) {
      for (const power of POWERS) {
        const label = `seed=0x${seed.toString(16)} weapon=${weapon} angle=${angle} power=${power}`;
        let result;
        try {
          result = flyShot(seed, weapon, angle, power);
        } catch (err) {
          fail(`${label} threw: ${err && err.message}`);
          totalRuns++;
          continue;
        }

        totalRuns++;

        if (result.hitCap) {
          capHits++;
          fail(`${label} hit the ${LOOP_CAP}-tick loop cap — flight never resolved (possible infinite loop)`);
          continue;
        }

        if (result.ticks > worstTicks) {
          worstTicks = result.ticks;
          worstLabel = label;
        }
      }
    }
  }
}

// --- Summary ---
log('');
log(`[flightticks] grid: ${SEEDS.length} seeds × ${ALL_WEAPONS.length} weapons × ${ANGLES.length} angles × ${POWERS.length} powers = ${totalRuns} runs`);
log(`[flightticks] weapons swept: ${ALL_WEAPONS.join(', ')}`);
log(`[flightticks] cap hits: ${capHits}`);
log(`[flightticks] WORST-CASE ticks: ${worstTicks}  (${worstLabel})`);
log(`[flightticks] threshold: ${TICK_THRESHOLD}  (production cap: ${LOOP_CAP})`);
log(`[flightticks] margin: ${LOOP_CAP - worstTicks} ticks below production cap (${((LOOP_CAP - worstTicks) / LOOP_CAP * 100).toFixed(1)}%)`);

// --- Assert ---
if (worstTicks >= TICK_THRESHOLD) {
  fail(`worst-case tick count ${worstTicks} >= threshold ${TICK_THRESHOLD} (runaway flight/burn — check GameEngine MAX_FLIGHT_TICKS cap, napalm burnTicks, or POWER_SCALE)`);
}

if (failed) {
  log('\nFLIGHTTICKS CHECK: FAILED');
  process.exit(1);
} else {
  log(`\nPASS: worst-case flight resolved in ${worstTicks} ticks — safely below the ${TICK_THRESHOLD}-tick threshold (production cap ${LOOP_CAP}).`);
  log('\nFLIGHTTICKS CHECK: PASSED');
  process.exit(0);
}
