import { performance } from 'node:perf_hooks';
import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { TANK_HEIGHT, TANK_WIDTH } from '../../shared/src/engine/Tank.ts';
import { surfaceAt } from '../../shared/src/engine/Terrain.ts';

let aiSearchModule;
try {
  aiSearchModule = await import('../../shared/src/engine/AiShotSearch.ts');
} catch {
  console.error('FAIL: AiShotSearch module is missing');
  process.exit(1);
}
const { searchShot, simulateImpact } = aiSearchModule;

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const BUDGETS = { easy: 300, medium: 400, hard: 500 };
const REFERENCE_GRIDS = Object.freeze({
  easy: Object.freeze({ angleStep: 3, powerStep: 4, exhaustiveProbes: 630 }),
  medium: Object.freeze({ angleStep: 2, powerStep: 2, exhaustiveProbes: 1804 }),
  hard: Object.freeze({ angleStep: 1, powerStep: 1, exhaustiveProbes: 6966 }),
});
const DIRECT_HIT_SCORE = Math.min(TANK_WIDTH, TANK_HEIGHT) / 2;
const RIGHT_NEAR_HARD_FULL_REFINEMENT_PROBES = 276;
const REGRET = {
  easy: (score) => Math.max(10, score * 0.25),
  medium: (score) => Math.max(6, score * 0.15),
  hard: (score) => Math.max(4, score * 0.10),
};
const SCENARIOS = [
  { label: 'right-near-calm', seed: 0x5eed1234, shooter: 0, wind: 0, sx: 190, tx: 480 },
  { label: 'right-far-headwind', seed: 0xc0ffee, shooter: 0, wind: -9.2, sx: 90, tx: 1050 },
  { label: 'right-far-tailwind', seed: 0xdeadbeef, shooter: 0, wind: 8.7, sx: 110, tx: 980 },
  { label: 'left-near-calm', seed: 0x1111cafe, shooter: 1, wind: 0, sx: 930, tx: 610 },
  { label: 'left-far-headwind', seed: 0x9999abcd, shooter: 1, wind: 9.4, sx: 1100, tx: 150 },
  { label: 'left-far-tailwind', seed: 0xabcd1234, shooter: 1, wind: -8.8, sx: 1030, tx: 220 },
  { label: 'ridge-right', seed: 0x0badf00d, shooter: 0, wind: 4.5, sx: 140, tx: 900 },
  { label: 'ridge-left', seed: 0x1234abcd, shooter: 1, wind: -4.5, sx: 1040, tx: 280 },
];

function axis(lo, hi, step) {
  const values = [];
  for (let value = lo; value <= hi; value += step) values.push(value);
  if (values.at(-1) !== hi) values.push(hi);
  return values;
}

function makeState(scenario) {
  const engine = new GameEngine({
    players: [
      { name: 'P1', color: '#e84d4d' },
      { name: 'P2', color: '#4d8ce8' },
    ],
    maxPlayers: 2,
    seed: scenario.seed,
  });
  const state = engine.getState();
  const me = state.tanks[scenario.shooter];
  const target = state.tanks[1 - scenario.shooter];
  me.x = scenario.sx;
  me.y = surfaceAt(state.terrain, me.x);
  target.x = scenario.tx;
  target.y = surfaceAt(state.terrain, target.x);
  state.wind = scenario.wind;
  return { state, me, target };
}

function exhaustive(state, me, target, difficulty, gravity = 0.15) {
  const profile = REFERENCE_GRIDS[difficulty];
  const rightward = target.x >= me.x;
  const angles = axis(rightward ? 5 : 90, rightward ? 90 : 175, profile.angleStep);
  const powers = axis(20, 100, profile.powerStep);
  const tx = target.x;
  const ty = target.y - TANK_HEIGHT / 2;
  let best = null;
  let probes = 0;
  for (const angle of angles) {
    for (const power of powers) {
      probes++;
      const impact = simulateImpact(state, me, angle, power, gravity);
      if (!impact) continue;
      const candidate = { angle, power, score: Math.hypot(impact.x - tx, impact.y - ty) };
      if (!best || candidate.score < best.score ||
          (candidate.score === best.score && (candidate.angle < best.angle ||
          (candidate.angle === best.angle && candidate.power < best.power)))) best = candidate;
    }
  }
  return { shot: best, probes };
}

function observeSearch(state, me, target, difficulty, gravity = 0.15) {
  const calls = [];
  const uniqueCalls = new Set();
  const probe = (probeState, probeMe, angle, power, probeGravity) => {
    const identity = `${angle}:${power}`;
    calls.push(identity);
    uniqueCalls.add(identity);
    return simulateImpact(probeState, probeMe, angle, power, probeGravity);
  };
  const outcome = searchShot(state, me, target, difficulty, gravity, probe);
  return { outcome, calls: calls.length, uniqueCalls: uniqueCalls.size };
}

function rescoreShot(state, me, target, shot, gravity = 0.15) {
  if (!shot) return null;
  const impact = simulateImpact(state, me, shot.angle, shot.power, gravity);
  if (!impact) return null;
  return Math.hypot(impact.x - target.x, impact.y - (target.y - TANK_HEIGHT / 2));
}

let failed = false;
const fail = (message) => { failed = true; console.error(`FAIL: ${message}`); };
const observedCases = new Map();
for (const scenario of SCENARIOS) {
  for (const difficulty of DIFFICULTIES) {
    const { state, me, target } = makeState(scenario);
    const expected = exhaustive(state, me, target, difficulty);
    const observed = observeSearch(state, me, target, difficulty);
    const repeat = observeSearch(state, me, target, difficulty);
    const actual = observed.outcome;
    const actualScore = rescoreShot(state, me, target, actual.shot);
    if (expected.probes !== REFERENCE_GRIDS[difficulty].exhaustiveProbes) {
      fail(`${scenario.label}/${difficulty}: exhaustive count ${expected.probes} != independent reference ${REFERENCE_GRIDS[difficulty].exhaustiveProbes}`);
    }
    if (JSON.stringify(actual) !== JSON.stringify(repeat.outcome)) fail(`${scenario.label}/${difficulty}: nondeterministic outcome`);
    if (observed.calls !== observed.uniqueCalls) fail(`${scenario.label}/${difficulty}: duplicate production probe calls ${observed.calls} != ${observed.uniqueCalls} unique`);
    if (actual.probes !== observed.uniqueCalls) fail(`${scenario.label}/${difficulty}: reported ${actual.probes} probes != ${observed.uniqueCalls} observed unique calls`);
    if (actual.probes > BUDGETS[difficulty]) fail(`${scenario.label}/${difficulty}: ${actual.probes} probes > ${BUDGETS[difficulty]}`);
    if (!!expected.shot !== !!actual.shot) fail(`${scenario.label}/${difficulty}: exhaustive/optimized resolution mismatch`);
    if (actual.shot && actualScore === null) fail(`${scenario.label}/${difficulty}: optimized coordinates did not independently resolve`);
    if (actual.shot && actualScore !== null && Math.abs(actual.shot.score - actualScore) > 1e-9) {
      fail(`${scenario.label}/${difficulty}: reported score ${actual.shot.score} != independent score ${actualScore}`);
    }
    if (expected.shot && actual.shot && actualScore !== null) {
      const regret = actualScore - expected.shot.score;
      if (regret > REGRET[difficulty](expected.shot.score)) fail(`${scenario.label}/${difficulty}: regret ${regret.toFixed(2)}px`);
    }
    observedCases.set(`${scenario.label}/${difficulty}`, { expected, actual, actualScore, observed });
    console.log(`${scenario.label}/${difficulty}: exhaustive=${expected.probes} optimized=${actual.probes} observed=${observed.uniqueCalls}`);
  }
}

const directHit = observedCases.get('right-near-calm/hard');
if (!directHit?.expected.shot || !directHit.actual.shot || directHit.actualScore === null) {
  fail('right-near-calm/hard: known direct-hit case did not resolve');
} else {
  const regret = directHit.actualScore - directHit.expected.shot.score;
  const regretLimit = REGRET.hard(directHit.expected.shot.score);
  if (directHit.actualScore > DIRECT_HIT_SCORE) {
    fail(`right-near-calm/hard: direct-hit score ${directHit.actualScore.toFixed(2)}px > ${DIRECT_HIT_SCORE}px`);
  }
  if (directHit.actual.probes >= RIGHT_NEAR_HARD_FULL_REFINEMENT_PROBES) {
    fail(`right-near-calm/hard: direct-hit did not short-circuit (${directHit.actual.probes} probes)`);
  }
  if (regret > regretLimit) fail(`right-near-calm/hard: direct-hit regret ${regret.toFixed(2)}px > ${regretLimit.toFixed(2)}px`);
  console.log(
    `DIRECT HIT right-near-calm/hard score=${directHit.actualScore.toFixed(2)}px ` +
    `regret=${regret.toFixed(2)}px probes=${directHit.actual.probes}`,
  );
}

if (process.argv.includes('--benchmark')) {
  const benchmarkScenario = SCENARIOS.find((scenario) => scenario.label === 'ridge-right');
  if (!benchmarkScenario) throw new Error('Missing ridge-right benchmark scenario');
  const { state, me, target } = makeState(benchmarkScenario);

  searchShot(state, me, target, 'hard', 0.15);
  exhaustive(state, me, target, 'hard', 0.15);

  const optimizedSamples = [];
  const exhaustiveSamples = [];
  const timed = (fn) => {
    const start = performance.now();
    fn();
    return performance.now() - start;
  };
  for (let pair = 0; pair < 20; pair++) {
    if (pair % 2 === 0) {
      optimizedSamples.push(timed(() => searchShot(state, me, target, 'hard', 0.15)));
      exhaustiveSamples.push(timed(() => exhaustive(state, me, target, 'hard', 0.15)));
    } else {
      exhaustiveSamples.push(timed(() => exhaustive(state, me, target, 'hard', 0.15)));
      optimizedSamples.push(timed(() => searchShot(state, me, target, 'hard', 0.15)));
    }
  }
  optimizedSamples.sort((a, b) => a - b);
  exhaustiveSamples.sort((a, b) => a - b);
  const optimizedMedian = (optimizedSamples[9] + optimizedSamples[10]) / 2;
  const exhaustiveMedian = (exhaustiveSamples[9] + exhaustiveSamples[10]) / 2;
  const speedup = exhaustiveMedian / optimizedMedian;
  console.log(
    `BENCH hard ${benchmarkScenario.label} alternated pairs=20 optimized median=${optimizedMedian.toFixed(2)}ms ` +
    `exhaustive median=${exhaustiveMedian.toFixed(2)}ms speedup=${speedup.toFixed(2)}x`,
  );
  if (optimizedMedian > 8) fail(`benchmark optimized median ${optimizedMedian.toFixed(2)}ms > 8ms`);
  if (speedup < 7) fail(`benchmark speedup ${speedup.toFixed(2)}x < 7x`);
}

if (failed) process.exit(1);
console.log('AI SEARCH CHECK: PASSED');
