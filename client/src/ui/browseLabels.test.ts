/**
 * browseLabels.test.ts — pure display-label mappers for public room-browser rows.
 * (Mirrors scripts/checks/browselabels.mjs into the vitest layer so the client
 * coverage gate sees this logic.)
 */
import { describe, it, expect } from 'vitest';
import {
  armsLabel,
  botLabel,
  interestLabel,
  roundsLabel,
  suddenDeathLabel,
} from './browseLabels';

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

  it('interestLabel: omits zero and formats a configured percentage', () => {
    expect(interestLabel(0)).toBe('');
    expect(interestLabel(-0.1)).toBe('');
    expect(interestLabel(0.2)).toBe('Interest +20%');
    expect(interestLabel(5)).toBe('Interest +50%');
    expect(interestLabel(Number.NaN)).toBe('');
    expect(interestLabel(Number.POSITIVE_INFINITY)).toBe('');
  });

  it('suddenDeathLabel: omits zero and identifies the turn threshold', () => {
    expect(suddenDeathLabel(0)).toBe('');
    expect(suddenDeathLabel(-1)).toBe('');
    expect(suddenDeathLabel(15)).toBe('Sudden death T15');
    expect(suddenDeathLabel(999)).toBe('Sudden death T50');
    expect(suddenDeathLabel(Number.NaN)).toBe('');
    expect(suddenDeathLabel(Number.POSITIVE_INFINITY)).toBe('');
  });
});
