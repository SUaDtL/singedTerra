/**
 * browseLabels.test.ts — pure display-label mappers for public room-browser rows.
 * (Mirrors scripts/checks/browselabels.mjs into the vitest layer so the client
 * coverage gate sees this logic.)
 */
import { describe, it, expect } from 'vitest';
import { armsLabel, roundsLabel, botLabel } from './browseLabels';

describe('browseLabels', () => {
  it('armsLabel: names the tier endpoints and numbers the middle', () => {
    expect(armsLabel(0)).toBe('Basic');
    expect(armsLabel(4)).toBe('Full arsenal');
    expect(armsLabel(2)).toBe('Arms Lv 2');
  });

  it('armsLabel: clamps out-of-range input into 0–4', () => {
    expect(armsLabel(-3)).toBe('Basic');   // clamps to 0
    expect(armsLabel(99)).toBe('Full arsenal'); // clamps to 4
  });

  it('roundsLabel: "Single" for 1, "Best of N" otherwise', () => {
    expect(roundsLabel(1)).toBe('Single');
    expect(roundsLabel(5)).toBe('Best of 5');
  });

  it('botLabel: omitted at 0, "{n} CPU" otherwise', () => {
    expect(botLabel(0)).toBe('');
    expect(botLabel(-1)).toBe('');
    expect(botLabel(3)).toBe('3 CPU');
  });
});
