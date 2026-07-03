/**
 * REFERENCE ONLY — Scorched Earth (1991) equipment data + damage model.
 *
 * Supplied by the project owner as the canonical source for weapon/accessory
 * COSTS, BUNDLE SIZES, ARMS LEVELS, BLAST RADII, and the radial DAMAGE MODEL.
 * NOT wired into the build — it lives here so the store/economy and weapon
 * tuning can be made faithful to the original. singedTerra's live roster is a
 * curated subset (11 weapons) in `shared/src/engine/WeaponSystem.ts`; prices in
 * the store are derived from this table (see WeaponDefinition.price/bundleSize).
 *
 * Stats (cost / bundle / blast radius / arms level) are verbatim from the
 * official Scorched Earth 1.5 manual. Behavior fields are an implementation
 * model, not published numbers.
 *
 * IMPORTANT CAVEATS (don't treat the model values as canonical):
 *  - The game never published per-shot damage. Blast radius is the real
 *    primitive; damage is derived from distance via computeBlastDamage().
 *  - Tank power runs 0..100 (a battery = +10). So a "center" damage of 100
 *    means a direct hit is lethal vs a full-power tank — matching the game.
 *  - `relativeCapacity` on shields and `warheadCount` on sandhogs are TUNING
 *    HINTS. Exact values were never published; tune them to taste.
 *  - SCALE_MULTIPLIER medium/large factors are approximations.
 */

// ─────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────

export type ArmsLevel = 0 | 1 | 2 | 3 | 4;
export type WeaponCategory = "standard" | "earthDestroying" | "earthProducing" | "energy";

interface Purchasable {
  /** Stable identifier for code/data lookups. */
  readonly id: string;
  /** Display name as shown on the buy menu. */
  readonly name: string;
  /** Dollars per bundle (e.g. 400 for a bundle of 10 = $40/unit). */
  readonly cost: number;
  /** Units received per purchase. */
  readonly bundleSize: number;
  /** Availability gate; hidden when the game's Arms Level config is lower. */
  readonly armsLevel: ArmsLevel;
}

// ─────────────────────────────────────────────────────────────────────────
// Weapons
// ─────────────────────────────────────────────────────────────────────────

interface WeaponMeta extends Purchasable {
  readonly category: WeaponCategory;
  /** Can a guidance system steer this weapon? */
  readonly guidable: boolean;
  /** Baby Missile only: stock is effectively infinite (always 99). */
  readonly unlimited?: true;
  readonly notes?: string;
}

/** Behavior discriminated union — switch on `kind` for runtime dispatch. */
export type WeaponBehavior =
  | { readonly kind: "directBlast"; readonly blastRadius: number }
  | { readonly kind: "funkyBomb"; readonly blastRadius: number /* + chaotic sub-explosions */ }
  | {
      readonly kind: "multiWarhead";
      /** apogee = splits at peak (MIRV/Death's Head); sequential = drops in order (Leapfrog). */
      readonly split: "apogee" | "sequential";
      /** One radius per warhead. Count is warheadRadii.length. */
      readonly warheadRadii: readonly number[];
    }
  | { readonly kind: "roller"; readonly blastRadius: number; readonly rollsOffShields: true }
  | { readonly kind: "napalm"; readonly heat: "standard" | "hot" /* no fixed radius; pools spread */ }
  | { readonly kind: "tracer"; readonly leavesTrail: boolean /* zero damage */ }
  | { readonly kind: "riotCharge"; readonly wedgeRadius: number /* dirt-only wedge from own turret */ }
  | { readonly kind: "riotBomb"; readonly dirtRadius: number /* projectile; spherical dirt removal */ }
  | { readonly kind: "digger"; readonly fizzlesOnTank: true /* tunnels; no tank damage */ }
  | { readonly kind: "sandhog"; readonly warheadCount: number /* tunnels + lethal charge from below */ }
  | { readonly kind: "dirtSphere"; readonly dirtRadius: number /* produces dirt; buries */ }
  | { readonly kind: "liquidDirt" }
  | { readonly kind: "dirtCharge" }
  | { readonly kind: "earthDisrupter" }
  | {
      readonly kind: "plasmaBlast";
      readonly minRadius: number;
      readonly maxRadius: number;
      readonly ignoresTurret: true;
      readonly scalesWithBatteries: true;
    }
  | {
      readonly kind: "laser";
      readonly penetrates: readonly ("terrain" | "shields" | "tanks")[];
      readonly blockedBy: "superMag";
    };

export type Weapon = WeaponMeta & WeaponBehavior;

export const WEAPONS = [
  // — Standard —
  { id: "babyMissile", name: "Baby Missile", category: "standard", cost: 400, bundleSize: 10, armsLevel: 0, guidable: true, unlimited: true, kind: "directBlast", blastRadius: 10 },
  { id: "missile", name: "Missile", category: "standard", cost: 1875, bundleSize: 5, armsLevel: 0, guidable: true, kind: "directBlast", blastRadius: 20 },
  { id: "babyNuke", name: "Baby Nuke", category: "standard", cost: 10000, bundleSize: 3, armsLevel: 0, guidable: true, kind: "directBlast", blastRadius: 40 },
  { id: "nuke", name: "Nuke", category: "standard", cost: 12000, bundleSize: 1, armsLevel: 1, guidable: true, kind: "directBlast", blastRadius: 75 },
  { id: "leapFrog", name: "Leap Frog", category: "standard", cost: 10000, bundleSize: 2, armsLevel: 3, guidable: true, kind: "multiWarhead", split: "sequential", warheadRadii: [20, 25, 30] },
  { id: "funkyBomb", name: "Funky Bomb", category: "standard", cost: 7000, bundleSize: 2, armsLevel: 4, guidable: true, kind: "funkyBomb", blastRadius: 80 },
  { id: "mirv", name: "MIRV", category: "standard", cost: 10000, bundleSize: 3, armsLevel: 2, guidable: false, kind: "multiWarhead", split: "apogee", warheadRadii: [20, 20, 20, 20, 20] },
  { id: "deathsHead", name: "Death's Head", category: "standard", cost: 20000, bundleSize: 1, armsLevel: 4, guidable: false, kind: "multiWarhead", split: "apogee", warheadRadii: [35, 35, 35, 35, 35, 35, 35, 35, 35] },
  { id: "napalm", name: "Napalm", category: "standard", cost: 10000, bundleSize: 10, armsLevel: 2, guidable: true, kind: "napalm", heat: "standard" },
  { id: "hotNapalm", name: "Hot Napalm", category: "standard", cost: 20000, bundleSize: 2, armsLevel: 4, guidable: true, kind: "napalm", heat: "hot" },
  { id: "tracer", name: "Tracer", category: "standard", cost: 10, bundleSize: 20, armsLevel: 0, guidable: false, kind: "tracer", leavesTrail: false },
  { id: "smokeTracer", name: "Smoke Tracer", category: "standard", cost: 500, bundleSize: 10, armsLevel: 1, guidable: false, kind: "tracer", leavesTrail: true },
  { id: "babyRoller", name: "Baby Roller", category: "standard", cost: 5000, bundleSize: 10, armsLevel: 2, guidable: true, kind: "roller", blastRadius: 10, rollsOffShields: true },
  { id: "roller", name: "Roller", category: "standard", cost: 6000, bundleSize: 5, armsLevel: 2, guidable: true, kind: "roller", blastRadius: 20, rollsOffShields: true },
  { id: "heavyRoller", name: "Heavy Roller", category: "standard", cost: 6750, bundleSize: 2, armsLevel: 3, guidable: true, kind: "roller", blastRadius: 45, rollsOffShields: true },

  // — Earth Destroying —
  { id: "riotCharge", name: "Riot Charge", category: "earthDestroying", cost: 2000, bundleSize: 10, armsLevel: 2, guidable: false, kind: "riotCharge", wedgeRadius: 36 },
  { id: "riotBlast", name: "Riot Blast", category: "earthDestroying", cost: 5000, bundleSize: 5, armsLevel: 3, guidable: false, kind: "riotCharge", wedgeRadius: 60 },
  { id: "riotBomb", name: "Riot Bomb", category: "earthDestroying", cost: 5000, bundleSize: 5, armsLevel: 3, guidable: true, kind: "riotBomb", dirtRadius: 30 },
  { id: "heavyRiotBomb", name: "Heavy Riot Bomb", category: "earthDestroying", cost: 4750, bundleSize: 2, armsLevel: 3, guidable: true, kind: "riotBomb", dirtRadius: 45 },
  { id: "babyDigger", name: "Baby Digger", category: "earthDestroying", cost: 3000, bundleSize: 10, armsLevel: 0, guidable: true, kind: "digger", fizzlesOnTank: true },
  { id: "digger", name: "Digger", category: "earthDestroying", cost: 2500, bundleSize: 5, armsLevel: 0, guidable: true, kind: "digger", fizzlesOnTank: true, notes: "Cheaper than Baby Digger in the manual table — kept faithfully." },
  { id: "heavyDigger", name: "Heavy Digger", category: "earthDestroying", cost: 6750, bundleSize: 2, armsLevel: 1, guidable: true, kind: "digger", fizzlesOnTank: true },
  { id: "babySandhog", name: "Baby Sandhog", category: "earthDestroying", cost: 10000, bundleSize: 10, armsLevel: 0, guidable: true, kind: "sandhog", warheadCount: 1, notes: "warheadCount is a tuning hint; exact value unpublished." },
  { id: "sandhog", name: "Sandhog", category: "earthDestroying", cost: 16750, bundleSize: 5, armsLevel: 0, guidable: true, kind: "sandhog", warheadCount: 3, notes: "warheadCount is a tuning hint; manual only says 'more than Baby'." },
  { id: "heavySandhog", name: "Heavy Sandhog", category: "earthDestroying", cost: 25000, bundleSize: 2, armsLevel: 1, guidable: true, kind: "sandhog", warheadCount: 5, notes: "warheadCount is a tuning hint; 'can destroy the world'." },

  // — Earth Producing —
  { id: "dirtClod", name: "Dirt Clod", category: "earthProducing", cost: 5000, bundleSize: 10, armsLevel: 0, guidable: true, kind: "dirtSphere", dirtRadius: 20 },
  { id: "dirtBall", name: "Dirt Ball", category: "earthProducing", cost: 5000, bundleSize: 5, armsLevel: 0, guidable: true, kind: "dirtSphere", dirtRadius: 35 },
  { id: "tonOfDirt", name: "Ton of Dirt", category: "earthProducing", cost: 6750, bundleSize: 2, armsLevel: 1, guidable: true, kind: "dirtSphere", dirtRadius: 70 },
  { id: "liquidDirt", name: "Liquid Dirt", category: "earthProducing", cost: 5000, bundleSize: 10, armsLevel: 2, guidable: true, kind: "liquidDirt" },
  { id: "dirtCharge", name: "Dirt Charge", category: "earthProducing", cost: 5000, bundleSize: 5, armsLevel: 1, guidable: true, kind: "dirtCharge" },
  { id: "earthDisrupter", name: "Earth Disrupter", category: "earthProducing", cost: 5000, bundleSize: 10, armsLevel: 0, guidable: false, kind: "earthDisrupter" },

  // — Energy (consume batteries) —
  { id: "plasmaBlast", name: "Plasma Blast", category: "energy", cost: 9000, bundleSize: 5, armsLevel: 3, guidable: false, kind: "plasmaBlast", minRadius: 10, maxRadius: 75, ignoresTurret: true, scalesWithBatteries: true },
  { id: "laser", name: "Laser", category: "energy", cost: 5000, bundleSize: 5, armsLevel: 2, guidable: false, kind: "laser", penetrates: ["terrain", "shields", "tanks"], blockedBy: "superMag" },
] as const satisfies readonly Weapon[];

// ─────────────────────────────────────────────────────────────────────────
// Accessories ("Miscellaneous" buy tab)
// ─────────────────────────────────────────────────────────────────────────

export type AccessoryCategory = "guidance" | "defense" | "misc";
export type GuidanceType = "heat" | "ballistic" | "horizontal" | "vertical" | "lazyBoy";

interface AccessoryMeta extends Purchasable {
  readonly category: AccessoryCategory;
  readonly notes?: string;
}

export type AccessoryBehavior =
  | {
      readonly kind: "guidance";
      readonly guidance: GuidanceType;
      /** Whether the player must designate a target after firing. */
      readonly requiresTarget: boolean;
      readonly correctsWind: boolean;
      readonly correctsViscosity: boolean;
    }
  | { readonly kind: "parachute"; readonly defaultSafetyThreshold: number }
  | { readonly kind: "battery"; readonly powerPerUnit: number }
  | {
      readonly kind: "shield";
      readonly absorbsDamage: boolean;
      readonly deflectsProjectiles: boolean;
      readonly magPushUp: boolean;
      readonly immuneToShieldFailure: boolean;
      readonly immuneToLaser: boolean;
      /** Tuning hint only — relative durability ordinal, not a canonical HP value. */
      readonly relativeCapacity: number;
    }
  | { readonly kind: "autoDefense" }
  | { readonly kind: "fuel"; readonly unitsPerTank: number }
  | { readonly kind: "contactTrigger" };

export type Accessory = AccessoryMeta & AccessoryBehavior;

export const ACCESSORIES = [
  // — Guidance —
  { id: "heatGuidance", name: "Heat Guidance", category: "guidance", cost: 10000, bundleSize: 6, armsLevel: 2, kind: "guidance", guidance: "heat", requiresTarget: false, correctsWind: false, correctsViscosity: false },
  { id: "ballisticGuidance", name: "Ballistic Guidance", category: "guidance", cost: 10000, bundleSize: 2, armsLevel: 2, kind: "guidance", guidance: "ballistic", requiresTarget: true, correctsWind: true, correctsViscosity: false },
  { id: "horzGuidance", name: "Horizontal Guidance", category: "guidance", cost: 15000, bundleSize: 5, armsLevel: 1, kind: "guidance", guidance: "horizontal", requiresTarget: true, correctsWind: false, correctsViscosity: false },
  { id: "vertGuidance", name: "Vertical Guidance", category: "guidance", cost: 20000, bundleSize: 5, armsLevel: 1, kind: "guidance", guidance: "vertical", requiresTarget: true, correctsWind: false, correctsViscosity: false },
  { id: "lazyBoy", name: "Lazy Boy", category: "guidance", cost: 20000, bundleSize: 2, armsLevel: 3, kind: "guidance", guidance: "lazyBoy", requiresTarget: true, correctsWind: false, correctsViscosity: false, notes: "Explodes exactly where clicked; detonates early if it hits a non-target tank." },

  // — Defense —
  { id: "parachute", name: "Parachute", category: "defense", cost: 10000, bundleSize: 8, armsLevel: 2, kind: "parachute", defaultSafetyThreshold: 5 },
  { id: "battery", name: "Battery", category: "defense", cost: 5000, bundleSize: 10, armsLevel: 2, kind: "battery", powerPerUnit: 10 },
  { id: "magDeflector", name: "Mag Deflector", category: "defense", cost: 10000, bundleSize: 2, armsLevel: 2, kind: "shield", absorbsDamage: false, deflectsProjectiles: true, magPushUp: true, immuneToShieldFailure: false, immuneToLaser: false, relativeCapacity: 1 },
  { id: "shield", name: "Shield", category: "defense", cost: 20000, bundleSize: 3, armsLevel: 3, kind: "shield", absorbsDamage: true, deflectsProjectiles: false, magPushUp: false, immuneToShieldFailure: false, immuneToLaser: false, relativeCapacity: 3 },
  { id: "forceShield", name: "Force Shield", category: "defense", cost: 25000, bundleSize: 3, armsLevel: 3, kind: "shield", absorbsDamage: true, deflectsProjectiles: true, magPushUp: false, immuneToShieldFailure: false, immuneToLaser: false, relativeCapacity: 4 },
  { id: "heavyShield", name: "Heavy Shield", category: "defense", cost: 30000, bundleSize: 2, armsLevel: 4, kind: "shield", absorbsDamage: true, deflectsProjectiles: false, magPushUp: false, immuneToShieldFailure: true, immuneToLaser: false, relativeCapacity: 6 },
  { id: "superMag", name: "Super Mag", category: "defense", cost: 40000, bundleSize: 2, armsLevel: 4, kind: "shield", absorbsDamage: true, deflectsProjectiles: true, magPushUp: true, immuneToShieldFailure: true, immuneToLaser: true, relativeCapacity: 8 },
  { id: "autoDefense", name: "Auto Defense", category: "defense", cost: 1500, bundleSize: 1, armsLevel: 3, kind: "autoDefense", notes: "One purchase covers the rest of the game; effective price scales with rounds left + interest rate." },

  // — Misc —
  { id: "fuelTank", name: "Fuel Tank", category: "misc", cost: 10000, bundleSize: 10, armsLevel: 3, kind: "fuel", unitsPerTank: 10 },
  { id: "contactTrigger", name: "Contact Trigger", category: "misc", cost: 1000, bundleSize: 25, armsLevel: 3, kind: "contactTrigger", notes: "Forces detonation on contact (per-shot Tunneling OFF). One trigger covers a whole multi-warhead shot." },
] as const satisfies readonly Accessory[];

// ─────────────────────────────────────────────────────────────────────────
// Lookups
// ─────────────────────────────────────────────────────────────────────────

export type WeaponId = (typeof WEAPONS)[number]["id"];
export type AccessoryId = (typeof ACCESSORIES)[number]["id"];

export const WEAPONS_BY_ID: Readonly<Record<WeaponId, Weapon>> = Object.fromEntries(
  WEAPONS.map((w) => [w.id, w]),
) as Record<WeaponId, Weapon>;

export const ACCESSORIES_BY_ID: Readonly<Record<AccessoryId, Accessory>> = Object.fromEntries(
  ACCESSORIES.map((a) => [a.id, a]),
) as Record<AccessoryId, Accessory>;

/** Per-unit price (cost / bundleSize). */
export const unitCost = (item: Purchasable): number => item.cost / item.bundleSize;

// ─────────────────────────────────────────────────────────────────────────
// Damage model
// ─────────────────────────────────────────────────────────────────────────

export type ScaleSetting = "normal" | "medium" | "large";

/** medium/large factors are approximations — the manual doesn't publish them. */
const SCALE_MULTIPLIER: Record<ScaleSetting, number> = { normal: 1, medium: 1.5, large: 2 };

export type FalloffCurve = "linear" | "quadratic" | "smoothstep";

export interface BlastDamageInput {
  /** Pixel distance from explosion center to the tank's center. */
  readonly distance: number;
  /** Weapon blast radius at Normal scale. */
  readonly blastRadius: number;
  readonly scale?: ScaleSetting;
  /** Damage at the epicenter. 100 == lethal vs a full-power (100) tank. */
  readonly maxDamage?: number;
  /** Default 'quadratic' best reproduces "near-miss survivable, direct hit lethal". */
  readonly falloff?: FalloffCurve;
}

/**
 * Reference radial blast damage. This is a RECONSTRUCTION — the original
 * curve is not public. Returns damage in tank-power points (0..maxDamage).
 */
export function computeBlastDamage({
  distance,
  blastRadius,
  scale = "normal",
  maxDamage = 100,
  falloff = "quadratic",
}: BlastDamageInput): number {
  const r = blastRadius * SCALE_MULTIPLIER[scale];
  if (r <= 0 || distance >= r) return 0;

  const t = distance / r; // 0 at center .. 1 at edge
  let factor: number;
  switch (falloff) {
    case "linear":
      factor = 1 - t;
      break;
    case "quadratic":
      factor = (1 - t) ** 2;
      break;
    case "smoothstep": {
      const e = 1 - t;
      factor = e * e * (3 - 2 * e);
      break;
    }
    default:
      return assertNever(falloff);
  }
  return maxDamage * factor;
}

/**
 * Whether a weapon can damage a tank directly (vs only via burying/falling).
 * Note `sandhog` returns true: it carries a charge that kills from beneath.
 */
export function dealsDirectTankDamage(weapon: Weapon): boolean {
  switch (weapon.kind) {
    case "directBlast":
    case "funkyBomb":
    case "multiWarhead":
    case "roller":
    case "napalm":
    case "plasmaBlast":
    case "laser":
    case "sandhog":
      return true;
    case "tracer":
    case "riotCharge":
    case "riotBomb":
    case "digger":
    case "dirtSphere":
    case "liquidDirt":
    case "dirtCharge":
    case "earthDisrupter":
      return false;
    default:
      return assertNever(weapon);
  }
}

/** Compile-time exhaustiveness guard: a new union member becomes a type error. */
function assertNever(x: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(x)}`);
}
