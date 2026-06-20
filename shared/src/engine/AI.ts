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
import { barrelTip, TANK_HEIGHT, BARREL_LENGTH } from './Tank';
import { getWeapon, type WeaponType } from './WeaponSystem';
import { createRng } from './Random';
import { clamp } from './math';

// AiDifficulty is defined in types/GameState (a leaf module) and re-exported here
// for convenience so callers can `import { AiDifficulty } from './AI'`.
export type { AiDifficulty };

/** The bot's chosen shot. The driver applies it as select_weapon + set_angle +
 *  set_power + fire (in that order). When `buy` is set, the driver FIRST commits a
 *  turn-neutral buy of that weapon (restocking before the shot) — see the
 *  buy-to-restock note on chooseBuy(). `buy`, when present, always equals `weapon`. */
export interface AiPlan {
  weapon: WeaponType;
  angle: number;
  power: number;
  /** Restock this weapon before firing (the bot lacked an in-stock finisher but
   *  can afford one). Turn-neutral; always === weapon. Absent => no purchase. */
  buy?: WeaponType;
}

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
  const { weapon, buy } = chooseLoadout(me, target, difficulty);

  // Shield is not a projectile — raise it and end the turn (both drivers map the
  // 'shield' weapon to use_shield). No ballistic search / aim error needed; the
  // aim is irrelevant, so just echo the current barrel.
  if (weapon === 'shield') {
    return { weapon, angle: me.angle, power: me.power };
  }

  // A buy is turn-neutral; the bot will own `weapon` once the restock applies, so
  // the ballistic search (which doesn't depend on ammo) plans the same shot now.
  const buyField = buy ? { buy } : {};

  const best = searchShot(state, me, target, weapon, tune, gravity);
  if (!best) {
    // No simulated shot found the target's column (heavily walled in, etc.).
    // Fall back to a sensible lob roughly toward the target.
    const toward = target.x >= me.x ? 60 : 120;
    return { weapon, angle: toward, power: 70, ...buyField };
  }

  // Aim error — a seeded, difficulty-scaled perturbation so easy bots spray and
  // hard bots are crisp. Seeded off (turn, tank, wind) => deterministic.
  const seed =
    (state.turn * 0x9e3779b1) ^ hashId(aiTankId) ^ Math.floor((state.wind + 32) * 1031);
  const rng = createRng(seed >>> 0);
  const angle = clamp(best.angle + (rng() * 2 - 1) * tune.angleError, 0, 180);
  const power = clamp(best.power + (rng() * 2 - 1) * tune.powerError, 1, 100);

  return { weapon, angle, power, ...buyField };
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
 * the engine's per-hit values. Area/DOT weapons (napalm, cluster, mirv, deaths_head,
 * hot_napalm) carry an AGGREGATE estimate because their per-submunition / per-tick
 * detonation values understate them (napalm's impact is 0; the burn does the work;
 * an airburst's value is the stacked carpet, not one bomblet). Utility weapons
 * (dirt_bomb, riot_bomb — zero blast damage) and the shield are absent — they are
 * never offensive picks. Pure constants => deterministic.
 *
 * The Phase-2 premium additions (mirv/deaths_head/hot_napalm) are included so hard
 * bots actually buy + use the full arsenal. Their values keep `nuke` (100) the
 * WEAKEST >=100 finisher, so a healthy-target pick/restock still lands on the nuke
 * (deaths_head is a strict escalation above it).
 */
const AI_EFFECTIVE_DAMAGE: Partial<Record<WeaponType, number>> = {
  baby_missile:   34,
  funky_bomb:     45,
  bouncing_betty: 55,
  cluster_bomb:   55,
  napalm:         55,
  missile:        60,
  hot_napalm:     75, // hotter/wider/longer burn than napalm (55)
  heavy_missile:  85,
  mirv:           88, // 3 stacking warheads — punchier than cluster, below the nuke
  baby_nuke:      90,
  nuke:          100,
  deaths_head:   120, // 7-warhead saturation — the apex offensive pick
};

/** Heavy/premium tier a MEDIUM bot won't reach for — kept as a hard-bot escalation
 *  so medium stays moderate (tops out around a Missile) while hard brings the nukes
 *  and the premium Phase-2 ordnance (mirv / deaths_head / hot_napalm). */
const HEAVY_TIER: ReadonlySet<WeaponType> = new Set<WeaponType>([
  'heavy_missile', 'baby_nuke', 'nuke', 'mirv', 'deaths_head', 'hot_napalm',
]);

/** A hard bot at/below this health raises a shield (if stocked) instead of trading
 *  blows — closes the exploit where the bot never shields and is out-traded, and
 *  makes the damage-pool shield (P1-5) actually get used defensively. */
const SHIELD_HP_THRESHOLD = 35;

/**
 * Pick a weapon (or the shield), and optionally a weapon to BUY first, for this
 * turn. Difficulty-scaled and DAMAGE-scaled:
 *  - easy always lobs the free Baby Missile (beatable, predictable).
 *  - a HARD bot that is hurt and holds a shield raises it (defensive).
 *  - otherwise: among the damaging weapons the bot actually OWNS (medium excludes
 *    the heavy/premium tier), pick the WEAKEST that can still finish the target in
 *    one solid hit (effective dmg >= target health) — so it won't waste a nuke on a
 *    near-dead tank.
 *  - BUY-TO-RESTOCK (hard only, P1-7b): if NOTHING in stock one-shots the target
 *    but the bot can afford a finisher, buy it (see chooseBuy) and fire it. Else
 *    fall back to the strongest weapon in stock.
 * Pure function of state => deterministic (no clock/random).
 */
function chooseLoadout(
  me: TankState,
  target: TankState,
  difficulty: AiDifficulty,
): { weapon: WeaponType; buy?: WeaponType } {
  const has = (w: WeaponType): boolean => {
    const a = me.inventory[w];
    return a.unlimited || a.count > 0;
  };

  // Defensive shield (hard only): hurt + holding a shield => raise it.
  if (difficulty === 'hard' && me.health <= SHIELD_HP_THRESHOLD && has('shield')) {
    return { weapon: 'shield' };
  }

  if (difficulty === 'easy') return { weapon: 'baby_missile' };

  // Owned damaging weapons, weakest→strongest by effective damage. Medium is capped
  // below the heavy tier; baby_missile is unlimited so this is never empty.
  const ranked = (Object.keys(AI_EFFECTIVE_DAMAGE) as WeaponType[])
    .filter((w) => has(w) && (difficulty === 'hard' || !HEAVY_TIER.has(w)))
    .sort((a, b) => AI_EFFECTIVE_DAMAGE[a]! - AI_EFFECTIVE_DAMAGE[b]!);

  // Weakest in-stock one-shot finisher (don't overkill).
  const finisher = ranked.find((w) => AI_EFFECTIVE_DAMAGE[w]! >= target.health);
  if (finisher) return { weapon: finisher };

  // Nothing in stock one-shots. A hard bot restocks if it can afford a finisher.
  if (difficulty === 'hard') {
    const buy = chooseBuy(me, target);
    if (buy) return { weapon: buy, buy };
  }

  // Fall back to the strongest weapon in stock (baby_missile is always available).
  return { weapon: ranked.length > 0 ? ranked[ranked.length - 1] : 'baby_missile' };
}

/**
 * Buy-to-restock pick (P1-7b): the cheapest affordable weapon the bot LACKS that
 * would one-shot the target. Returns null when no such weapon is affordable (the
 * caller then falls back to its strongest in-stock weapon — the prior behaviour).
 *
 * Restricting the buy to a FINISHER (effective dmg >= target health) is what keeps
 * the buy+fire sequencing simple and loop-free: the bot buys exactly ONE bundle and
 * then owns a finisher, so the very next plan picks it as `finisher` above (no
 * `buy`) and fires it. Networked, every client recomputes this same transition, so
 * the buy and the fire land as two ordered log entries with no extra coordination.
 * Pure function of state => deterministic.
 */
function chooseBuy(me: TankState, target: TankState): WeaponType | null {
  const candidates = (Object.keys(AI_EFFECTIVE_DAMAGE) as WeaponType[])
    .filter((w) => {
      const slot = me.inventory[w];
      if (slot.unlimited || slot.count > 0) return false; // only restock what we lack
      const def = getWeapon(w);
      return def.implemented
        && def.price <= me.credits                  // affordable now
        && AI_EFFECTIVE_DAMAGE[w]! >= target.health; // and finishes the target
    })
    .sort((a, b) => AI_EFFECTIVE_DAMAGE[a]! - AI_EFFECTIVE_DAMAGE[b]!);
  return candidates.length > 0 ? candidates[0] : null;
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
