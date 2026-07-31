import { describe, expect, it } from 'vitest';
import type { WallMode } from '@shared/types/GameOptions';
import * as audioProfiles from './AudioEngine';
import { getWallReflectAudioProfile } from './AudioEngine';

describe('wall ricochet audio profile', () => {
  it('keeps every layer short, bounded, and side-distinct', () => {
    const left = getWallReflectAudioProfile('left');
    const right = getWallReflectAudioProfile('right');

    expect(left.startFrequency).not.toBe(right.startFrequency);
    for (const profile of [left, right]) {
      expect(profile.noiseGain + profile.toneGain).toBeLessThanOrEqual(0.14);
      expect(profile.noiseDuration).toBeLessThanOrEqual(0.08);
      expect(profile.toneDuration).toBeLessThanOrEqual(0.12);
      expect(profile.endFrequency).toBeGreaterThan(0);
      expect(profile.endFrequency).toBeLessThan(profile.startFrequency);
    }
  });

  it('provides a distinct bounded transfer profile for wrap contacts', () => {
    const getWallContactAudioProfile = (
      audioProfiles as unknown as {
        getWallContactAudioProfile?: (
          walls: WallMode,
          side: 'left' | 'right',
        ) => ReturnType<typeof getWallReflectAudioProfile> | null;
      }
    ).getWallContactAudioProfile;

    expect(getWallContactAudioProfile).toBeTypeOf('function');
    if (!getWallContactAudioProfile) return;

    const reflective = getWallContactAudioProfile('reflective', 'left');
    const wrap = getWallContactAudioProfile('wrap', 'left');
    expect(reflective).not.toBeNull();
    expect(wrap).not.toBeNull();
    expect(wrap).not.toEqual(reflective);
    expect(getWallContactAudioProfile('open', 'left')).toBeNull();
    expect((wrap?.noiseGain ?? 1) + (wrap?.toneGain ?? 1)).toBeLessThanOrEqual(0.14);
    expect(wrap?.toneDuration).toBeLessThanOrEqual(0.16);
  });
});
