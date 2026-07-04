/**
 * themeColor.test.ts — the pure colour math in theme.ts (canvas shading from a player hex).
 * The canvas-dependent skyGradient()/crtCssVars styling is excluded from coverage; these
 * arithmetic helpers are not, and are worth pinning.
 */
import { describe, it, expect } from 'vitest';
import { hexToRgb, lightenHex, darkenHex } from './theme';

describe('theme colour helpers', () => {
  it('hexToRgb parses #rrggbb', () => {
    expect(hexToRgb('#ff8040')).toEqual([255, 128, 64]);
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
  });

  it('hexToRgb expands the #rgb shorthand', () => {
    expect(hexToRgb('#f80')).toEqual([255, 136, 0]); // f→ff, 8→88, 0→00
  });

  it('lightenHex mixes toward white; t=0 keeps the colour, t=1 is white', () => {
    expect(lightenHex('#804020', 0)).toBe('rgb(128, 64, 32)');
    expect(lightenHex('#804020', 1)).toBe('rgb(255, 255, 255)');
  });

  it('darkenHex mixes toward black; t=1 is black, t=0 keeps the colour', () => {
    expect(darkenHex('#804020', 1)).toBe('rgb(0, 0, 0)');
    expect(darkenHex('#804020', 0)).toBe('rgb(128, 64, 32)');
  });
});
