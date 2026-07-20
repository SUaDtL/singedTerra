# Deterministic AI Shot-Search Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Status:** APPROVED — autonomous execution authorized 2026-07-20.

**Goal:** Replace the exhaustive synchronous AI trajectory sweep with a deterministic multi-basin coarse-to-fine search that stays within strict probe and quality budgets.

**Architecture:** Move plain-ballistic probing and candidate search into `shared/src/engine/AiShotSearch.ts`. Keep targeting, loadout, aim jitter, fallback behavior, and the `computeAiPlan()` API in `AI.ts`; prove the new seam against an independent exhaustive reference in `scripts/checks/ai_search.mjs`.

**Tech Stack:** TypeScript 5.5, Node 20, `tsx` deterministic harnesses, existing shared engine physics; no new dependency.

## Global Constraints

- Determinism is hard: no `Math.random()`, wall clock, worker, concurrency, I/O, or mutable cross-turn cache in `shared/src/engine/`.
- Quality parity is required; exact historical shot coordinates are not.
- Probe ceilings: hard 500, medium 400, easy 300 unique simulations per plan.
- Quality-regret ceilings: hard `max(4 px, exhaustive × 10%)`; medium `max(6 px, exhaustive × 15%)`; easy `max(10 px, exhaustive × 25%)`.
- Existing shield, target, loadout, seeded jitter, and sensible-lob fallback behavior remain unchanged.
- No package, package upgrade, audit fix, backend change, migration, deployment, or trust-boundary change.
- The current six npm audit findings are pre-existing and out of scope.
- codeArbiter owns commits: tasks update the ledger and receive two-pass review, but no task commits independently; one final commit follows `commit-gate`.

---

## File map

- Create `shared/src/engine/AiShotSearch.ts`: deterministic candidate generation, multi-basin refinement, probe statistics, and reusable ballistic probing.
- Create `scripts/checks/ai_search.mjs`: independent exhaustive oracle, scenario corpus, probe/quality/determinism assertions, optional local timing report.
- Modify `shared/src/engine/AI.ts`: delegate search while preserving strategy and seeded jitter.
- Modify `package.json`: include `ai_search.mjs` in the canonical `npm run check` chain.
- Leave the legacy prose entry in `.codearbiter/open-tasks.md` unchanged; GitHub issue #63 is the durable completion record because the board gate accepts only structured task transitions.
- Modify this plan ledger and the sprint spec status as work advances.

## Ledger

| ID | Deliverable | Depends on | Proof | Status |
|---|---|---|---|---|
| T1 | Search seam plus red/green exhaustive-oracle harness | — | `npx tsx scripts/checks/ai_search.mjs` | ACCEPTED |
| T2 | `computeAiPlan()` integration and behavior parity | T1 | AI, determinism, purity, replay harnesses | ACCEPTED |
| T3 | Performance receipt, task tracking, and full fresh verification | T2 | benchmark + check + client tests + build | ACCEPTED |
| T4 | Final-review oracle hardening and benchmark cleanup | T3 | focused mutation guard + paired benchmark + re-review | ACCEPTED |

---

### Task 1: Build the search seam against an exhaustive oracle

**Files:**
- Create: `scripts/checks/ai_search.mjs`
- Create: `shared/src/engine/AiShotSearch.ts`
- Modify: `package.json` (`scripts.check`)

**Interfaces:**
- Consumes: `GameState`, `TankState`, `AiDifficulty`, `launchVelocity`, `stepProjectile`, `sweepCollide`, `barrelTip`, and existing tank/physics constants.
- Produces:

```ts
export interface ShotSearchProfile {
  angleStep: number;
  powerStep: number;
  coarseAngleStep: number;
  coarsePowerStep: number;
  basinCount: number;
  refinementRadius: number;
}

export interface ShotCandidate {
  angle: number;
  power: number;
  score: number;
}

export interface ShotSearchOutcome {
  shot: ShotCandidate | null;
  probes: number;
}

export const SHOT_SEARCH_PROFILES: Readonly<Record<AiDifficulty, ShotSearchProfile>>;

export function searchShot(
  state: GameState,
  me: TankState,
  target: TankState,
  difficulty: AiDifficulty,
  gravity: number,
): ShotSearchOutcome;

export function simulateImpact(
  state: GameState,
  me: TankState,
  angle: number,
  power: number,
  gravity: number,
): { x: number; y: number } | null;
```

- [ ] **Step 1: Write the failing exhaustive-oracle harness**

Create `scripts/checks/ai_search.mjs` with fixed scenarios, an independent exhaustive loop,
probe budgets, regret limits, deterministic-repeat assertions, and benchmark-only timing:

```js
import { performance } from 'node:perf_hooks';
import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { TANK_HEIGHT } from '../../shared/src/engine/Tank.ts';

let aiSearchModule;
try {
  aiSearchModule = await import('../../shared/src/engine/AiShotSearch.ts');
} catch {
  console.error('FAIL: AiShotSearch module is missing');
  process.exit(1);
}
const { SHOT_SEARCH_PROFILES, searchShot, simulateImpact } = aiSearchModule;

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const BUDGETS = { easy: 300, medium: 400, hard: 500 };
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
  me.y = state.terrain.surfaceAt(me.x);
  target.x = scenario.tx;
  target.y = state.terrain.surfaceAt(target.x);
  state.wind = scenario.wind;
  return { state, me, target };
}

function exhaustive(state, me, target, difficulty, gravity = 0.15) {
  const profile = SHOT_SEARCH_PROFILES[difficulty];
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

let failed = false;
const fail = (message) => { failed = true; console.error(`FAIL: ${message}`); };
for (const scenario of SCENARIOS) {
  for (const difficulty of DIFFICULTIES) {
    const { state, me, target } = makeState(scenario);
    const expected = exhaustive(state, me, target, difficulty);
    const actual = searchShot(state, me, target, difficulty, 0.15);
    const repeat = searchShot(state, me, target, difficulty, 0.15);
    if (JSON.stringify(actual) !== JSON.stringify(repeat)) fail(`${scenario.label}/${difficulty}: nondeterministic outcome`);
    if (actual.probes > BUDGETS[difficulty]) fail(`${scenario.label}/${difficulty}: ${actual.probes} probes > ${BUDGETS[difficulty]}`);
    if (!!expected.shot !== !!actual.shot) fail(`${scenario.label}/${difficulty}: exhaustive/optimized resolution mismatch`);
    if (expected.shot && actual.shot) {
      const regret = actual.shot.score - expected.shot.score;
      if (regret > REGRET[difficulty](expected.shot.score)) fail(`${scenario.label}/${difficulty}: regret ${regret.toFixed(2)}px`);
    }
    console.log(`${scenario.label}/${difficulty}: exhaustive=${expected.probes} optimized=${actual.probes}`);
  }
}

if (process.argv.includes('--benchmark')) {
  const { state, me, target } = makeState(SCENARIOS[0]);
  searchShot(state, me, target, 'hard', 0.15);
  const samples = Array.from({ length: 20 }, () => {
    const start = performance.now();
    searchShot(state, me, target, 'hard', 0.15);
    return performance.now() - start;
  }).sort((a, b) => a - b);
  const median = (samples[9] + samples[10]) / 2;
  console.log(`BENCH hard optimized median=${median.toFixed(2)}ms`);
}

if (failed) process.exit(1);
console.log('AI SEARCH CHECK: PASSED');
```

Append `&& npx tsx scripts/checks/ai_search.mjs` immediately after `ai_determinism.mjs` in
the root `package.json` `check` script.

- [ ] **Step 2: Run the harness and prove the red state**

Run: `npx tsx scripts/checks/ai_search.mjs`

Expected: exit non-zero with `FAIL: AiShotSearch module is missing`. This is a controlled
feature-missing assertion, not an unhandled import error. Record it in the task review evidence.

- [ ] **Step 3: Implement the minimal deterministic search module**

Create `shared/src/engine/AiShotSearch.ts` with the declared interfaces and these named
profiles and mechanics:

```ts
import type { AiDifficulty, GameState, ProjectileState, TankState } from '../types/GameState';
import { launchVelocity, stepProjectile, sweepCollide } from './Physics';
import { BARREL_LENGTH, TANK_HEIGHT, TANK_WIDTH, barrelTip } from './Tank';
import { clamp } from './math';

const SIM_MAX_TICKS = 1600;
const DIRECT_HIT_SCORE = Math.min(TANK_WIDTH, TANK_HEIGHT) / 4;

export interface ShotSearchProfile {
  angleStep: number;
  powerStep: number;
  coarseAngleStep: number;
  coarsePowerStep: number;
  basinCount: number;
  refinementRadius: number;
}
export interface ShotCandidate { angle: number; power: number; score: number }
export interface ShotSearchOutcome { shot: ShotCandidate | null; probes: number }

export const SHOT_SEARCH_PROFILES: Readonly<Record<AiDifficulty, ShotSearchProfile>> = {
  easy: { angleStep: 3, powerStep: 4, coarseAngleStep: 12, coarsePowerStep: 16, basinCount: 3, refinementRadius: 3 },
  medium: { angleStep: 2, powerStep: 2, coarseAngleStep: 10, coarsePowerStep: 10, basinCount: 3, refinementRadius: 3 },
  hard: { angleStep: 1, powerStep: 1, coarseAngleStep: 8, coarsePowerStep: 8, basinCount: 3, refinementRadius: 3 },
};

function axisValues(lo: number, hi: number, step: number): number[] {
  const values: number[] = [];
  for (let value = lo; value <= hi; value += step) values.push(value);
  if (values[values.length - 1] !== hi) values.push(hi);
  return values;
}

function compareCandidate(a: ShotCandidate, b: ShotCandidate): number {
  return a.score - b.score || a.angle - b.angle || a.power - b.power;
}

function distinctBasins(candidates: ShotCandidate[], profile: ShotSearchProfile): ShotCandidate[] {
  const basins: ShotCandidate[] = [];
  for (const candidate of candidates) {
    const overlaps = basins.some((basin) =>
      Math.abs(candidate.angle - basin.angle) <= profile.coarseAngleStep &&
      Math.abs(candidate.power - basin.power) <= profile.coarsePowerStep);
    if (!overlaps) basins.push(candidate);
    if (basins.length === profile.basinCount) break;
  }
  return basins;
}

export function searchShot(
  state: GameState,
  me: TankState,
  target: TankState,
  difficulty: AiDifficulty,
  gravity: number,
): ShotSearchOutcome {
  const profile = SHOT_SEARCH_PROFILES[difficulty];
  const rightward = target.x >= me.x;
  const angleLo = rightward ? 5 : 90;
  const angleHi = rightward ? 90 : 175;
  const tx = target.x;
  const ty = target.y - TANK_HEIGHT / 2;
  const visited = new Set<string>();
  let probes = 0;

  const evaluate = (angle: number, power: number): ShotCandidate | null => {
    const key = `${angle}:${power}`;
    if (visited.has(key)) return null;
    visited.add(key);
    probes++;
    const impact = simulateImpact(state, me, angle, power, gravity);
    return impact ? { angle, power, score: Math.hypot(impact.x - tx, impact.y - ty) } : null;
  };

  const coarse: ShotCandidate[] = [];
  for (const angle of axisValues(angleLo, angleHi, profile.coarseAngleStep)) {
    for (const power of axisValues(20, 100, profile.coarsePowerStep)) {
      const candidate = evaluate(angle, power);
      if (candidate) coarse.push(candidate);
    }
  }
  coarse.sort(compareCandidate);
  let best = coarse[0] ?? null;

  for (const basin of distinctBasins(coarse, profile)) {
    for (let da = -profile.refinementRadius; da <= profile.refinementRadius; da++) {
      for (let dp = -profile.refinementRadius; dp <= profile.refinementRadius; dp++) {
        const angle = clamp(basin.angle + da * profile.angleStep, angleLo, angleHi);
        const power = clamp(basin.power + dp * profile.powerStep, 20, 100);
        const candidate = evaluate(angle, power);
        if (candidate && (!best || compareCandidate(candidate, best) < 0)) best = candidate;
      }
    }
    if (best && best.score <= DIRECT_HIT_SCORE) break;
  }
  return { shot: best, probes };
}

export function simulateImpact(
  state: GameState,
  me: TankState,
  angle: number,
  power: number,
  gravity: number,
): { x: number; y: number } | null {
  const velocity = launchVelocity(angle, power);
  const tip = barrelTip({ ...me, angle }, BARREL_LENGTH);
  const projectile: ProjectileState = {
    x: tip.x, y: tip.y, vx: velocity.vx, vy: velocity.vy,
    weaponType: 'missile', age: 0, hasSplit: true, bounces: 0,
  };
  for (let tick = 0; tick < SIM_MAX_TICKS; tick++) {
    const previousX = projectile.x;
    const previousY = projectile.y;
    stepProjectile(projectile, state.wind, gravity);
    const hit = sweepCollide(projectile, previousX, previousY, state.terrain, state.tanks);
    if (hit.type === 'ground' || hit.type === 'tank') return { x: projectile.x, y: projectile.y };
    if (hit.type === 'oob') return null;
  }
  return null;
}
```

If the initial profiles miss an exhaustive-resolving scenario or exceed a regret limit,
adjust only `coarseAngleStep`, `coarsePowerStep`, `basinCount`, and `refinementRadius`.
Every adjustment must remain under the probe ceilings and be SMARTS-scored in
`.codearbiter/sprint-log.md`; do not relax the acceptance limits.

- [ ] **Step 4: Run the focused harness to green**

Run: `npx tsx scripts/checks/ai_search.mjs`

Expected: exit 0, every scenario/difficulty reports optimized probes below its ceiling,
and final line `AI SEARCH CHECK: PASSED`.

- [ ] **Step 5: Run shared typecheck and source purity**

Run: `npm -w @singedterra/shared run typecheck`

Expected: exit 0.

Run: `npx tsx scripts/checks/engine_purity.mjs`

Expected: exit 0 with `ENGINE PURITY CHECK: PASSED`.

- [ ] **Step 6: Review Task 1**

Spec review must confirm AC-2, AC-3, and the `simulateImpact()` seam. Quality review must
check explicit ordering, unique-probe accounting, endpoint handling, immutable state, and
that the harness's exhaustive loop does not call production `searchShot()` internally.
Mark T1 `ACCEPTED` only after both reviews pass.

---

### Task 2: Integrate the search seam into `computeAiPlan()`

**Files:**
- Modify: `shared/src/engine/AI.ts:16-25,53-69,112-122,269-340`
- Test: `scripts/checks/ai.mjs`
- Test: `scripts/checks/ai_determinism.mjs`
- Test: `scripts/checks/ai_search.mjs`

**Interfaces:**
- Consumes: `searchShot()` and `ShotSearchOutcome` from Task 1.
- Produces: unchanged `computeAiPlan(state, aiTankId, difficulty, gravity): AiPlan | null`.

- [ ] **Step 1: Capture the covered pre-refactor green state**

Run the existing behavior and determinism oracles before changing `AI.ts`:

```powershell
npx tsx scripts/checks/ai.mjs
npx tsx scripts/checks/ai_determinism.mjs
```

Expected: both exit 0. Task 1 already supplied the failing feature test; Task 2 is a
behavior-covered refactor and follows green-refactor-green rather than manufacturing a compiler
failure.

- [ ] **Step 2: Complete the behavior-preserving integration**

In `AI.ts`:

```ts
import type { GameState, TankState, AiDifficulty } from '../types/GameState';
import { GRAVITY } from './Physics';
import { TANK_HEIGHT } from './Tank';
import { searchShot } from './AiShotSearch';

interface Tuning {
  angleError: number;
  powerError: number;
}
const TUNING: Record<AiDifficulty, Tuning> = {
  easy: { angleError: 3.5, powerError: 4 },
  medium: { angleError: 1.6, powerError: 2 },
  hard: { angleError: 0.5, powerError: 0.8 },
};
```

Use the new result at the existing call site:

```ts
const { shot: best } = searchShot(state, me, target, difficulty, gravity);
if (!best) {
  const toward = target.x >= me.x ? 60 : 120;
  return { weapon, angle: toward, power: 70, ...buyField };
}
```

Delete `SIM_MAX_TICKS`, the old local `searchShot()`, the old local `simulateImpact()`, and
their no-longer-used physics/projectile imports. Do not change target selection, loadout,
shield behavior, seeded jitter, fallback values, or `AiPlan`.

- [ ] **Step 3: Run focused AI verification**

Run: `npx tsx scripts/checks/ai_search.mjs`

Expected: exit 0 with `AI SEARCH CHECK: PASSED`.

Run: `npx tsx scripts/checks/ai.mjs`

Expected: exit 0 with `AI CHECK: PASSED`, including hard-over-easy difficulty ordering,
shield, loadout, and restock cases.

Run: `npx tsx scripts/checks/ai_determinism.mjs`

Expected: exit 0 with every scenario/difficulty byte-identical.

Run: `npx tsx scripts/checks/replay_determinism.mjs`

Expected: exit 0 with `REPLAY DETERMINISM CHECK: PASSED`.

- [ ] **Step 4: Run the local timing receipt**

Run: `npx tsx scripts/checks/ai_search.mjs --benchmark`

Expected: exit 0, optimized hard median no greater than 8 ms. Compare against the recorded
62.0 ms baseline; the improvement must be at least 7×. If timing misses while probe and
quality gates pass, optimize allocations inside `AiShotSearch.ts`; do not weaken quality.

- [ ] **Step 5: Review Task 2**

Spec review must confirm AC-1 and AC-4. Quality review must inspect the diff for accidental
changes to loadout, target selection, aim jitter seed/math, fallback, physics constants, or
public types. Mark T2 `ACCEPTED` only after both reviews pass.

---

### Task 3: Close issue tracking and run full fresh verification

**Files:**
- Modify: `.codearbiter/specs/ai-shot-search-performance.md` (status only)
- Modify: `.codearbiter/plans/ai-shot-search-performance.md` (ledger only)

**Interfaces:**
- Consumes: accepted T1 and T2 implementation.
- Produces: current governance ledger, complete verification evidence, and PR-ready branch.

- [x] **Step 1: Preserve the legacy task board and close durable issue tracking**

Leave the legacy prose bullet unchanged because it predates the structured `[ ] → [~] → [x]`
task format and cannot pass the commit gate's transition classifier. Close GitHub issue #63
from the PR and retain the sprint receipt as the verification record. If implementation reveals
unrelated work, mark it `[NEEDS-TRIAGE]` for the sprint-close harvest.

- [ ] **Step 2: Run the complete fresh suite**

Run these commands from separate fresh processes:

```powershell
npm run check
npm run test:client
npm run build
git diff --check
```

Expected: every command exits 0. Record total `npm run check` time and the benchmark median
in the sprint receipt. `npm run check` must visibly include `ai_search.mjs`.

- [ ] **Step 3: Final scope and dependency audit**

Run:

```powershell
git status --short
git diff --stat origin/main
git diff -- package.json package-lock.json
rg -n "Math\.random|Date\.now|performance\.now" shared/src/engine/AiShotSearch.ts
```

Expected: only sprint files are changed; `package-lock.json` has no diff; no new dependency;
the engine scan prints no matches. The benchmark may use `performance.now()` only inside
`scripts/checks/ai_search.mjs`.

- [ ] **Step 4: Update governance statuses**

Set the spec status to `IMPLEMENTED — awaiting commit gate`, set T3 to `ACCEPTED`, and leave
the append-only SMARTS entries in `.codearbiter/sprint-log.md` intact. Do not edit existing
log entries.

- [ ] **Step 5: Enter landing gates**

Route the entire diff through codeArbiter `commit-gate`, then
`finishing-a-development-branch`. `$ca-sprint` auto-selects open PR with a body that includes
`Closes #63`, the probe counts, quality-regret result, benchmark comparison, fresh suite
evidence, and any low-confidence SMARTS decisions. Never merge or deploy autonomously.

---

## Coverage map

- AC-1 determinism → T1 Steps 4–5; T2 Step 3; T3 Step 2.
- AC-2 probe budget → T1 Steps 1–4.
- AC-3 exhaustive-reference quality → T1 Steps 1–4.
- AC-4 gameplay parity → T2 Steps 2–3.
- AC-5 reusable seam → T1 Steps 3 and 6; T2 Step 2.
- AC-6 tracking and verification → T1 package wiring; T3 Steps 1–5.

## Hard-gate watch

Expected: none. The sprint touches deterministic engine code but no auth, crypto, secrets,
migration, irreversible operation, or trust boundary. A red determinism, regret, probe,
resolution-parity, dependency, or full-suite gate is a BLOCK; do not SMARTS-relax it.
