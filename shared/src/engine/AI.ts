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

import type { GameState, TankState, AiDifficulty, AiPersonality } from '../types/GameState';
import { GRAVITY } from './Physics';
import { TANK_HEIGHT } from './Tank';
import { searchShot, simulateImpact } from './AiShotSearch';
import { ACCESSORIES, getWeapon, PARACHUTE_PRICE, type AccessoryType, type WeaponType } from './WeaponSystem';
import { createRng } from './Random';
import { surfaceAt } from './Terrain';
import { clamp } from './math';

// AiDifficulty is defined in types/GameState (a leaf module) and re-exported here
// for convenience so callers can `import { AiDifficulty } from './AI'`.
export type { AiDifficulty };
export type { AiPersonality };

/** The bot's chosen shot. The driver applies it as select_weapon + set_angle +
 *  set_power + fire (in that order). The driver commits optional turn-neutral purchases before the shot. `buy` restocks a weapon; `buyAccessory` purchases non-weapon equipment. */
export interface AiPlan {
  weapon: WeaponType;
  angle: number;
  power: number;
  /** Restock this weapon before firing (the bot lacked an in-stock finisher but
   *  can afford one). Turn-neutral; always === weapon. Absent => no purchase. */
  buy?: WeaponType;
  /** Buy one non-weapon accessory before the shot (turn-neutral). */
  buyAccessory?: AccessoryType;
}

/** Stable default profile for a CPU seat; no room option or random source is needed. */
export function deriveAiPersonality(aiTankId: string): AiPersonality {
  return (['aggressive', 'conservative', 'area_denial'] as const)[hashId(aiTankId) % 3]!;
}

/** Per-difficulty aim error. */
interface Tuning {
  angleError: number; // ± max degrees of aim jitter
  powerError: number; // ± max power units of aim jitter
}
const TUNING: Record<AiDifficulty, Tuning> = {
  // easy still sprays (it's beatable), but tight enough to occasionally connect so
  // it's a real opponent, not a pushover that never threatens.
  easy: { angleError: 3.5, powerError: 4 },
  medium: { angleError: 1.6, powerError: 2 },
  hard: { angleError: 0.5, powerError: 0.8 },
};

/** Easy's first opportunity in a duel should show the wind without
 * immediately solving it. This is a target-center miss distance rather than a
 * larger random wobble, because an exhaustive wind-correct search can otherwise
 * still turn a fortunate wobble into a near-direct hit. */
const EASY_FRESH_TARGET_MIN_MISS_DISTANCE = 60;
const EASY_FRESH_TARGET_CORRECTION_STEPS = [8, 14, 20] as const;

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
  armsLevel: number = Number.POSITIVE_INFINITY,
  personality: AiPersonality = deriveAiPersonality(aiTankId),
): AiPlan | null {
  const me = state.tanks.find((t) => t.id === aiTankId && t.alive);
  if (!me) return null;

  const target = nearestEnemy(state, me);
  if (!target) return null;

  const tune = TUNING[difficulty];
  const { weapon, buy, buyAccessory } = chooseLoadout(me, target, difficulty, state, armsLevel, personality);

  // Shield is not a projectile — raise it and end the turn (both drivers map the
  // 'shield' weapon to use_shield). No ballistic search / aim error needed; the
  // aim is irrelevant, so just echo the current barrel.
  if (weapon === 'shield') {
    return { weapon, angle: me.angle, power: me.power, ...(buyAccessory ? { buyAccessory } : {}) };
  }

  // A buy is turn-neutral; the bot will own `weapon` once the restock applies, so
  // the ballistic search (which doesn't depend on ammo) plans the same shot now.
  const buyField = {
    ...(buy ? { buy } : {}),
    ...(buyAccessory ? { buyAccessory } : {}),
  };

  const { shot: best } = searchShot(state, me, target, difficulty, gravity);
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

  const aim = difficulty === 'easy' && state.turn <= 1
    ? recoverableEasyOpeningAim(state, me, target, angle, power, gravity, rng)
    : { angle, power };
  return { weapon, ...aim, ...buyField };
}

function recoverableEasyOpeningAim(
  state: GameState,
  me: TankState,
  target: TankState,
  angle: number,
  power: number,
  gravity: number,
  rng: () => number,
): Pick<AiPlan, 'angle' | 'power'> {
  const targetY = target.y - TANK_HEIGHT / 2;
  const candidates: Array<Pick<AiPlan, 'angle' | 'power'>> = [{ angle, power }];
  const direction = rng() < 0.5 ? -1 : 1;
  for (const step of EASY_FRESH_TARGET_CORRECTION_STEPS) {
    candidates.push(
      { angle: clamp(angle + direction * step, 0, 180), power: clamp(power + direction * step, 1, 100) },
      { angle: clamp(angle - direction * step, 0, 180), power: clamp(power - direction * step, 1, 100) },
      { angle: clamp(angle + direction * step, 0, 180), power: clamp(power - direction * step, 1, 100) },
      { angle: clamp(angle - direction * step, 0, 180), power: clamp(power + direction * step, 1, 100) },
    );
  }
  let safest: { aim: Pick<AiPlan, 'angle' | 'power'>; score: number } | null = null;
  for (const candidate of candidates) {
    const impact = simulateImpact(state, me, candidate.angle, candidate.power, gravity);
    if (!impact) continue;
    const score = Math.hypot(impact.x - target.x, impact.y - targetY);
    if (score < EASY_FRESH_TARGET_MIN_MISS_DISTANCE) continue;
    if (!safest || score < safest.score) safest = { aim: candidate, score };
  }
  return safest?.aim ?? { angle, power };
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
const PARACHUTE_SLOPE_RISK = 40;

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
  state: GameState,
  armsLevel: number,
  personality: AiPersonality,
): { weapon: WeaponType; buy?: WeaponType; buyAccessory?: AccessoryType } {
  const has = (w: WeaponType): boolean => {
    const a = me.inventory[w];
    return a.unlimited || a.count > 0;
  };

  // Defensive shield (hard only): hurt + holding a shield => raise it.
  if (difficulty === 'hard' && me.health <= SHIELD_HP_THRESHOLD && has('shield')) {
    return { weapon: 'shield' };
  }

  const parachuteCount = me.accessories.parachute ?? 0;
  const leftSurface = surfaceAt(state.terrain, me.x - 24);
  const rightSurface = surfaceAt(state.terrain, me.x + 24);
  const riskyLedge = Math.abs(leftSurface - rightSurface) >= PARACHUTE_SLOPE_RISK;
  const weaponBuy = difficulty === 'hard' ? chooseBuy(me, target, personality) : null;
  const weaponBuyCost = weaponBuy ? getWeapon(weaponBuy).price : 0;
  const buyAccessory = difficulty === 'hard'
    && parachuteCount === 0
    && riskyLedge
    && armsLevel >= ACCESSORIES.parachute.armsLevel
    && me.credits - weaponBuyCost >= PARACHUTE_PRICE
    ? ACCESSORIES.parachute.type
    : undefined;

  if (difficulty === 'easy') return { weapon: 'baby_missile' };

  // Owned damaging weapons, weakest→strongest by effective damage. Medium is capped
  // below the heavy tier; baby_missile is unlimited so this is never empty.
  const ranked = (Object.keys(AI_EFFECTIVE_DAMAGE) as WeaponType[])
    .filter((w) => has(w) && (difficulty === 'hard' || !HEAVY_TIER.has(w)))
    .sort((a, b) => AI_EFFECTIVE_DAMAGE[a]! - AI_EFFECTIVE_DAMAGE[b]!);

  if (personality === 'area_denial') {
    const areaWeapon = AREA_DENIAL_ORDER.find((w) => ranked.includes(w));
    if (areaWeapon) return { weapon: areaWeapon, ...(buyAccessory ? { buyAccessory } : {}) };
  }

  // Weakest in-stock one-shot finisher (don't overkill).
  const finisher = (personality === 'aggressive' ? [...ranked].reverse() : ranked)
    .find((w) => AI_EFFECTIVE_DAMAGE[w]! >= target.health);
  if (finisher) return { weapon: finisher, ...(buyAccessory ? { buyAccessory } : {}) };

  // Nothing in stock one-shots. A hard bot restocks if it can afford a finisher.
  if (difficulty === 'hard') {
    const buy = weaponBuy;
    if (buy) return { weapon: buy, buy, ...(buyAccessory ? { buyAccessory } : {}) };
  }

  // Fall back to the strongest weapon in stock (baby_missile is always available).
  return { weapon: ranked.at(-1) ?? 'baby_missile', ...(buyAccessory ? { buyAccessory } : {}) };
}

const AREA_DENIAL_ORDER: readonly WeaponType[] = [
  'hot_napalm', 'napalm', 'bouncing_betty', 'cluster_bomb', 'mirv', 'deaths_head',
];

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
function chooseBuy(me: TankState, target: TankState, personality: AiPersonality): WeaponType | null {
  const candidates = (Object.keys(AI_EFFECTIVE_DAMAGE) as WeaponType[])
    .filter((w) => {
      const slot = me.inventory[w];
      if (slot.unlimited || slot.count > 0) return false; // only restock what we lack
      const def = getWeapon(w);
      return def.implemented
        && def.price <= me.credits                  // affordable now
        && AI_EFFECTIVE_DAMAGE[w]! >= target.health; // and finishes the target
    })
    .sort((a, b) => {
      if (personality === 'aggressive') return AI_EFFECTIVE_DAMAGE[b]! - AI_EFFECTIVE_DAMAGE[a]!;
      if (personality === 'area_denial') {
        const ai = AREA_DENIAL_ORDER.indexOf(a);
        const bi = AREA_DENIAL_ORDER.indexOf(b);
        if (ai !== -1 || bi !== -1) return (ai === -1 ? AREA_DENIAL_ORDER.length : ai) - (bi === -1 ? AREA_DENIAL_ORDER.length : bi);
      }
      return AI_EFFECTIVE_DAMAGE[a]! - AI_EFFECTIVE_DAMAGE[b]!;
    });
  return candidates[0] ?? null;
}
