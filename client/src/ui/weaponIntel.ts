import type { WeaponType } from '@shared/engine/WeaponSystem';

export interface WeaponIntel {
  /** The battlefield job this weapon is best at. */
  role: string;
  /** How the shot changes or depends on terrain. */
  terrain: string;
  /** Qualitative harm, reach, or protection character. */
  damage: string;
  /** One concise decision cue for a player choosing a shot. */
  useCase: string;
}

/**
 * Player-facing tactical guidance. This intentionally describes stable behavior
 * instead of repeating balance constants that may change during playtesting.
 */
export const WEAPON_INTEL = {
  baby_missile: {
    role: 'Reliable precision shot',
    terrain: 'Cuts a small crater at impact.',
    damage: 'Light, tight blast',
    useCase: 'Use to range a target or finish a wounded tank.',
  },
  missile: {
    role: 'Balanced direct attack',
    terrain: 'Opens a medium crater at impact.',
    damage: 'Strong, focused blast',
    useCase: 'Use when you have a clean line and want dependable damage.',
  },
  heavy_missile: {
    role: 'Heavy direct strike',
    terrain: 'Carves a broad crater that can destabilize slopes.',
    damage: 'Very strong, broad blast',
    useCase: 'Use to punish a near-direct hit or undermine a protected tank.',
  },
  baby_nuke: {
    role: 'Large-area finisher',
    terrain: 'Removes a wide section of ground.',
    damage: 'Severe, very wide blast',
    useCase: 'Use when close is good enough and nearby terrain can be sacrificed.',
  },
  nuke: {
    role: 'Maximum area destruction',
    terrain: 'Erases a massive crater and can collapse whole positions.',
    damage: 'Extreme, massive blast',
    useCase: 'Use for a decisive strike when collateral terrain damage is acceptable.',
  },
  dirt_bomb: {
    role: 'Terrain builder',
    terrain: 'Raises a mound instead of making a crater.',
    damage: 'No direct blast damage',
    useCase: 'Use to bury, shield, or block a firing lane.',
  },
  bouncing_betty: {
    role: 'Chained ground assault',
    terrain: 'Skips along the surface and blasts at each landing.',
    damage: 'Multiple medium blasts',
    useCase: 'Use across rolling ground or against several tanks in a row.',
  },
  funky_bomb: {
    role: 'Unpredictable airburst spread',
    terrain: 'Scatters several craters across the landing zone.',
    damage: 'Wide multi-bomb pattern',
    useCase: 'Use to pressure a broad area when pinpoint aim is unlikely.',
  },
  napalm: {
    role: 'Lingering area denial',
    terrain: 'Fire spreads along the surface and pools in low ground.',
    damage: 'Sustained burn over time',
    useCase: 'Use on slopes and valleys where a target cannot escape the flames.',
  },
  cluster_bomb: {
    role: 'Reliable airburst coverage',
    terrain: 'Drops a tight carpet of small craters after the apex.',
    damage: 'Several light overlapping blasts',
    useCase: 'Use when wind or distance makes one precise impact risky.',
  },
  mirv: {
    role: 'Heavy airburst attack',
    terrain: 'Splits at the apex into several broad craters.',
    damage: 'Multiple strong warheads',
    useCase: 'Use to cover nearby targets or stack warheads on one position.',
  },
  deaths_head: {
    role: 'Saturation strike',
    terrain: 'Blankets a wide zone with overlapping heavy craters.',
    damage: 'Devastating multi-warhead barrage',
    useCase: 'Use to overwhelm a crowded or heavily fortified area.',
  },
  riot_bomb: {
    role: 'Terrain remover',
    terrain: 'Clears a wide disc of earth without a damaging blast.',
    damage: 'No direct blast damage',
    useCase: 'Use to free a buried tank, open a lane, or collapse support.',
  },
  hot_napalm: {
    role: 'Heavy area denial',
    terrain: 'Spreads farther and burns longer along the surface.',
    damage: 'Severe sustained burn',
    useCase: 'Use to lock down a large valley or force damage over time.',
  },
  sandhog: {
    role: 'Subterranean attack',
    terrain: 'Burrows through earth, leaving a tunnel before detonation.',
    damage: 'Strong endpoint blast',
    useCase: 'Use against targets hidden behind hills or thick cover.',
  },
  tracer: {
    role: 'Non-damaging ranging shot',
    terrain: 'Leaves the battlefield unchanged.',
    damage: 'No damage',
    useCase: 'Spends one turn and ammunition to read wind before a valuable shot.',
  },
  shield: {
    role: 'Temporary defense',
    terrain: 'Does not alter terrain.',
    damage: 'Absorbs incoming damage',
    useCase: 'Activate before an exposed turn or an expected heavy strike.',
  },
  heavy_shield: {
    role: 'Reinforced defense',
    terrain: 'Does not alter terrain.',
    damage: 'Absorbs substantially more damage',
    useCase: 'Activate when survival matters more than immediate offense.',
  },
} satisfies Record<WeaponType, WeaponIntel>;
