/**
 * Computer-opponent AI (single-player vs CPU). A PURE, DETERMINISTIC shot planner:
 * given a GameState and which tank is the bot, it returns the shot to take
 * (weapon + angle + power). It does NOT mutate the engine or drive the loop — the
 * client's AI driver applies the returned plan as ordinary player actions.
 *
 * Strategy — forward-simulation search (the classic artillery-AI approach):
 *   1. Pick the nearest living enemy as the target.
 *   2. Choose a weapon for the difficulty (weak/cheap for easy, strong for hard).
 *   3. Sweep (angle, power) and SIMULATE each candidate's ballistic flight with
 *      the real Physics against the live terrain + wind + gravity, scoring by how
 *      close the shot lands to the target. Keep the best.
 *   4. Perturb the winning shot by a difficulty-scaled AIM ERROR so easy bots miss
 *      and hard bots are nearly perfect.
 *
 * Determinism (HARD): no Math.random / Date. The only randomness is the aim error,
 * drawn from a seeded PRNG keyed off (turn, tank, wind) — so the same state always
 * yields the same plan, and a networked bot would replay identically. The flight
 * sim reuses the engine's own Physics (launchVelocity/stepProjectile/sweepCollide),
 * so the bot "sees" exactly the trajectory the engine will fly.
 */

import type { GameState, TankState, ProjectileState, AiDifficulty } from '../types/GameState';
import {
  launchVelocity,
  stepProjectile,
  sweepCollide,
  GRAVITY,
} from './Physics';
import { barrelTip, TANK_HEIGHT } from './Tank';
import { getWeapon, type WeaponType } from './WeaponSystem';
import { createRng } from './Random';

// AiDifficulty is defined in types/GameState (a leaf module) and re-exported here
// for convenience so callers can `import { AiDifficulty } from './AI'`.
export type { AiDifficulty };

/** The bot's chosen shot. The driver applies it as select_weapon + set_angle +
 *  set_power + fire (in that order). */
export interface AiPlan {
  weapon: WeaponType;
  angle: number;
  power: number;
}

/** Barrel length used to offset the projectile spawn — MUST match GameEngine's
 *  BARREL_LENGTH so the bot simulates from the same muzzle point the engine fires from. */
const BARREL_LENGTH = 18;

/** Hard cap on simulated flight ticks per candidate (a high lob is ~500–900). */
const SIM_MAX_TICKS = 1600;

/** Per-difficulty search resolution + aim error. Coarser search AND larger error
 *  on easy => visibly weaker bots; fine search + tiny error on hard => sharp. */
interface Tuning {
  angleStep: number;  // degrees between candidate angles
  powerStep: number;  // power units between candidate powers
  angleError: number; // ± max degrees of aim jitter
  powerError: number; // ± max power units of aim jitter
}
const TUNING: Record<AiDifficulty, Tuning> = {
  // easy still sprays (it's beatable), but tight enough to occasionally connect so
  // it's a real opponent, not a pushover that never threatens.
  easy:   { angleStep: 3, powerStep: 4, angleError: 3.5, powerError: 4 },
  medium: { angleStep: 2, powerStep: 2, angleError: 1.6, powerError: 2 },
  hard:   { angleStep: 1, powerStep: 1, angleError: 0.5, powerError: 0.8 },
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Stable small hash of a tank id (e.g. 'p1','p2') for seeding. */
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Compute the bot's shot for the active turn, or null if it cannot act (no living
 * self / no target). `gravity` should be the room's gravity (defaults to the
 * engine default) so the simulated arc matches the real one.
 */
export function computeAiPlan(
  state: GameState,
  aiTankId: string,
  difficulty: AiDifficulty,
  gravity: number = GRAVITY,
): AiPlan | null {
  const me = state.tanks.find((t) => t.id === aiTankId && t.alive);
  if (!me) return null;

  const target = nearestEnemy(state, me);
  if (!target) return null;

  const tune = TUNING[difficulty];
  const weapon = chooseWeapon(me, target, difficulty);

  // Shield is not a projectile — raise it and end the turn (both drivers map the
  // 'shield' weapon to use_shield). No ballistic search / aim error needed; the
  // aim is irrelevant, so just echo the current barrel.
  if (weapon === 'shield') {
    return { weapon, angle: me.angle, power: me.power };
  }

  const best = searchShot(state, me, target, weapon, tune, gravity);
  if (!best) {
    // No simulated shot found the target's column (heavily walled in, etc.).
    // Fall back to a sensible lob roughly toward the target.
    const toward = target.x >= me.x ? 60 : 120;
    return { weapon, angle: toward, power: 70 };
  }

  // Aim error — a seeded, difficulty-scaled perturbation so easy bots spray and
  // hard bots are crisp. Seeded off (turn, tank, wind) => deterministic.
  const seed =
    (state.turn * 0x9e3779b1) ^ hashId(aiTankId) ^ Math.floor((state.wind + 32) * 1031);
  const rng = createRng(seed >>> 0);
  const angle = clamp(best.angle + (rng() * 2 - 1) * tune.angleError, 0, 180);
  const power = clamp(best.power + (rng() * 2 - 1) * tune.powerError, 1, 100);

  return { weapon, angle, power };
}

/** Nearest living enemy tank (Euclidean, body-center), or null. */
function nearestEnemy(state: GameState, me: TankState): TankState | null {
  let best: TankState | null = null;
  let bestD = Infinity;
  const mx = me.x;
  const my = me.y - TANK_HEIGHT / 2;
  for (const t of state.tanks) {
    if (t.id === me.id || !t.alive) continue;
    const d = Math.hypot(t.x - mx, t.y - TANK_HEIGHT / 2 - my);
    if (d < bestD) { bestD = d; best = t; }
  }
  return best;
}

/**
 * Heuristic EFFECTIVE damage per weapon, used ONLY for AI weapon selection — NOT
 * the engine's per-hit values. Area/DOT weapons (napalm, cluster) carry an
 * aggregate estimate because their detonation.maxDamage understates them (napalm's
 * impact is 0; the burn does the work). Utility weapons (dirt_bomb) and the shield
 * are absent — they are never offensive picks. Pure constants => deterministic.
 */
const AI_EFFECTIVE_DAMAGE: Partial<Record<WeaponType, number>> = {
  baby_missile:   34,
  funky_bomb:     45,
  bouncing_betty: 55,
  cluster_bomb:   55,
  napalm:         55,
  missile:        60,
  heavy_missile:  85,
  baby_nuke:      90,
  nuke:          100,
};

/** Heavy/premium tier a MEDIUM bot won't reach for — kept as a hard-bot escalation
 *  so medium stays moderate (tops out around a Missile) while hard brings nukes. */
const HEAVY_TIER: ReadonlySet<WeaponType> = new Set<WeaponType>([
  'heavy_missile', 'baby_nuke', 'nuke',
]);

/** A hard bot at/below this health raises a shield (if stocked) instead of trading
 *  blows — closes the exploit where the bot never shields and is out-traded, and
 *  makes the damage-pool shield (P1-5) actually get used defensively. */
const SHIELD_HP_THRESHOLD = 35;

/**
 * Pick a weapon (or the shield) for this turn. Difficulty-scaled and DAMAGE-scaled:
 *  - easy always lobs the free Baby Missile (beatable, predictable).
 *  - a HARD bot that is hurt and holds a shield raises it (defensive).
 *  - otherwise: among the damaging weapons the bot actually OWNS (medium excludes
 *    the heavy/premium tier), pick the WEAKEST that can still finish the target in
 *    one solid hit (effective dmg >= target health) — so it won't waste a nuke on a
 *    near-dead tank — falling back to the strongest it has when nothing one-shots.
 * Pure function of state => deterministic. Buy-to-restock is intentionally NOT done
 * here yet (REVIEW_BACKLOG P1-7b: needs careful buy+fire sequencing in both drivers).
 */
function chooseWeapon(me: TankState, target: TankState, difficulty: AiDifficulty): WeaponType {
  const has = (w: WeaponType): boolean => {
    const a = me.inventory[w];
    return a.unlimited || a.count > 0;
  };

  // Defensive shield (hard only): hurt + holding a shield => raise it.
  if (difficulty === 'hard' && me.health <= SHIELD_HP_THRESHOLD && has('shield')) {
    return 'shield';
  }

  if (difficulty === 'easy') return 'baby_missile';

  // Owned damaging weapons, weakest→strongest by effective damage. Medium is capped
  // below the heavy tier; baby_missile is unlimited so this is never empty.
  const ranked = (Object.keys(AI_EFFECTIVE_DAMAGE) as WeaponType[])
    .filter((w) => has(w) && (difficulty === 'hard' || !HEAVY_TIER.has(w)))
    .sort((a, b) => AI_EFFECTIVE_DAMAGE[a]! - AI_EFFECTIVE_DAMAGE[b]!);
  if (ranked.length === 0) return 'baby_missile';

  // Weakest one-shot finisher (don't overkill); else the strongest in stock.
  const finisher = ranked.find((w) => AI_EFFECTIVE_DAMAGE[w]! >= target.health);
  return finisher ?? ranked[ranked.length - 1];
}

/**
 * Sweep (angle, power) toward the target, simulate each shot, and return the one
 * whose impact lands nearest the target (or null if none reached its column). The
 * angle range is the half-plane toward the target plus a margin, so the search is
 * bounded; the resolution comes from the difficulty tuning.
 */
function searchShot(
  state: GameState,
  me: TankState,
  target: TankState,
  weapon: WeaponType,
  tune: Tuning,
  gravity: number,
): { angle: number; power: number } | null {
  // Shoot toward the target: 0°=right..90°=up..180°=left. Bias the search to the
  // correct side but allow a generous overlap (wind/terrain can favor odd angles).
  const rightward = target.x >= me.x;
  const angleLo = rightward ? 5 : 90;
  const angleHi = rightward ? 90 : 175;

  const tx = target.x;
  const ty = target.y - TANK_HEIGHT / 2;

  let best: { angle: number; power: number } | null = null;
  let bestScore = Infinity;

  for (let angle = angleLo; angle <= angleHi; angle += tune.angleStep) {
    for (let power = 20; power <= 100; power += tune.powerStep) {
      const impact = simulateImpact(state, me, angle, power, gravity);
      if (!impact) continue;
      const score = Math.hypot(impact.x - tx, impact.y - ty);
      if (score < bestScore) {
        bestScore = score;
        best = { angle, power };
      }
    }
  }
  return best;
}

/**
 * Fly a single ballistic shell from the bot's muzzle at (angle, power) against the
 * live terrain + tanks, returning the first impact point (ground or tank) or null
 * (sailed out of bounds / never resolved). Uses the engine's own Physics so the
 * bot's mental model matches reality. Bounce/airburst/napalm behavior is IGNORED
 * here on purpose — aiming at the first impact lands those weapons near the target
 * too, and a plain ballistic probe is exact + cheap. Read-only: nothing mutates.
 */
function simulateImpact(
  state: GameState,
  me: TankState,
  angle: number,
  power: number,
  gravity: number,
): { x: number; y: number } | null {
  const v = launchVelocity(angle, power);
  const tip = barrelTip({ ...me, angle }, BARREL_LENGTH);
  const p: ProjectileState = {
    x: tip.x,
    y: tip.y,
    vx: v.vx,
    vy: v.vy,
    weaponType: 'missile', // probe is plain ballistic; weaponType is irrelevant here
    age: 0,
    hasSplit: true, // suppress any airburst split in the probe
    bounces: 0,     // suppress bounce in the probe — aim at first contact
  };

  for (let t = 0; t < SIM_MAX_TICKS; t++) {
    const prevX = p.x;
    const prevY = p.y;
    stepProjectile(p, state.wind, gravity);
    const hit = sweepCollide(p, prevX, prevY, state.terrain, state.tanks);
    if (hit.type === 'ground' || hit.type === 'tank') return { x: p.x, y: p.y };
    if (hit.type === 'oob') return null;
  }
  return null;
}
