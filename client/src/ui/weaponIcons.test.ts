import { describe, expect, it } from 'vitest';
import type { WeaponType } from '@shared/engine/WeaponSystem';
import { makeWeaponIcon } from './weaponIcons';

const EXPECTED_FAMILIES = {
  baby_missile: 'rocket',
  missile: 'rocket',
  heavy_missile: 'rocket',
  baby_nuke: 'nuclear',
  nuke: 'nuclear',
  dirt_bomb: 'terrain',
  bouncing_betty: 'bounce',
  funky_bomb: 'volatile',
  napalm: 'fire',
  cluster_bomb: 'airburst',
  mirv: 'mirv',
  deaths_head: 'death',
  riot_bomb: 'terrain',
  hot_napalm: 'fire',
  sandhog: 'drill',
  tracer: 'tracer',
  shield: 'defense',
  heavy_shield: 'defense',
} satisfies Record<WeaponType, string>;

const EXPECTED_SILHOUETTES = {
  rocket: 'path:M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5',
  nuclear: 'path:M12 12h.01',
  terrain: 'path:m8 3 4 8 5-5 5 15H2L8 3z',
  bounce: 'circle:12,12,10|circle:12,12,1',
  volatile:
    'path:M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z',
  fire:
    'path:M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4',
  airburst: 'circle:18,5,3|circle:6,12,3|circle:18,19,3',
  mirv: 'circle:12,18,3|circle:6,6,3|circle:18,6,3',
  death: 'path:m12.5 17-.5-1-.5 1h1z',
  drill: 'path:M10 18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a3 3 0 0 1-3-3 1 1 0 0 1 1-1z',
  tracer: 'circle:12,12,10|circle:12,12,1',
  defense:
    'path:M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
} satisfies Record<string, string>;

function silhouetteSignature(icon: SVGElement): string {
  const primitives = [...icon.children].slice(0, 3);
  return primitives.map((primitive) => {
    if (primitive.tagName.toLowerCase() === 'circle') {
      return `circle:${primitive.getAttribute('cx')},${primitive.getAttribute('cy')},${primitive.getAttribute('r')}`;
    }
    return `${primitive.tagName.toLowerCase()}:${primitive.getAttribute('d') ?? ''}`;
  }).join('|');
}

function circleDotSignature(icon: SVGElement): string[] {
  return silhouetteSignature(icon).split('|').sort();
}

describe('weapon glyph catalog', () => {
  it('maps every weapon to stable decorative family geometry', () => {
    for (const [weapon, family] of Object.entries(EXPECTED_FAMILIES) as [
      WeaponType,
      keyof typeof EXPECTED_SILHOUETTES,
    ][]) {
      const icon = makeWeaponIcon(weapon, 14);
      expect(icon.dataset['weapon']).toBe(weapon);
      expect(icon.dataset['family']).toBe(family);
      expect(icon.classList.contains('st-weapon-icon')).toBe(true);
      expect(icon.getAttribute('width')).toBe('14');
      expect(icon.getAttribute('height')).toBe('14');
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      expect(icon.getAttribute('focusable')).toBe('false');
      expect(icon.children.length).toBeGreaterThan(0);
      const expectedSilhouette = EXPECTED_SILHOUETTES[family]!;
      if (family === 'bounce' || family === 'tracer') {
        // CircleDot is two disjoint, stroke-only circles with the same center.
        // Their DOM order does not affect the painted icon.
        expect(circleDotSignature(icon)).toEqual(expectedSilhouette.split('|').sort());
      } else {
        expect(silhouetteSignature(icon)).toContain(expectedSilhouette);
      }
    }
  });
});
