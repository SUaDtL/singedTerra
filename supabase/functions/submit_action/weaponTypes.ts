// Pure submit_action weapon roster.
//
// The Deno referee keeps this local allowlist because it must not import the
// browser/shared engine. The contract check compares it with shared WEAPONS.

export const WEAPON_TYPES: ReadonlySet<string> = new Set([
  'baby_missile',
  'missile',
  'heavy_missile',
  'baby_nuke',
  'nuke',
  'dirt_bomb',
  'bouncing_betty',
  'funky_bomb',
  'napalm',
  'cluster_bomb',
  'mirv',
  'deaths_head',
  'riot_bomb',
  'hot_napalm',
  'sandhog',
  'tracer',
  'shield',
  'heavy_shield',
])
