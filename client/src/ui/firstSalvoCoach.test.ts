import { describe, expect, it } from 'vitest';
import {
  FIRST_SALVO_PREFERENCE_KEY,
  applyFirstSalvoAction,
  createFirstSalvoCoach,
  firstSalvoPreferenceFor,
  firstSalvoStepFor,
  isFirstSalvoEligible,
  loadFirstSalvoPreference,
  persistFirstSalvoPreference,
  replayFirstSalvoCoach,
  skipFirstSalvoCoach,
  type FirstSalvoStorage,
} from './firstSalvoCoach';

const eligibleTurn = {
  phase: 'PLAYER_TURN' as const,
  activeIsAi: false,
  activeIsLocal: true,
  activeTankAlive: true,
};

const storageWith = (value: string | null): FirstSalvoStorage => ({
  getItem: () => value,
  setItem: () => undefined,
});

describe('First Salvo coach contract', () => {
  it('advances Aim only after a local set_angle action', () => {
    const coach = createFirstSalvoCoach(null);

    expect(firstSalvoStepFor(coach, eligibleTurn)).toBe('aim');
    expect(firstSalvoStepFor(applyFirstSalvoAction(coach, eligibleTurn, { type: 'set_power', power: 63 }), eligibleTurn))
      .toBe('aim');
    expect(firstSalvoStepFor(applyFirstSalvoAction(coach, eligibleTurn, { type: 'set_angle', angle: 72 }), eligibleTurn))
      .toBe('power-and-wind');
  });

  it('advances Power and wind only after a local set_power action', () => {
    const afterAim = applyFirstSalvoAction(
      createFirstSalvoCoach(null),
      eligibleTurn,
      { type: 'set_angle', angle: 72 },
    );

    expect(firstSalvoStepFor(afterAim, eligibleTurn)).toBe('power-and-wind');
    expect(firstSalvoStepFor(applyFirstSalvoAction(afterAim, eligibleTurn, { type: 'set_angle', angle: 80 }), eligibleTurn))
      .toBe('power-and-wind');
    expect(firstSalvoStepFor(applyFirstSalvoAction(afterAim, eligibleTurn, { type: 'set_power', power: 63 }), eligibleTurn))
      .toBe('fire');
  });

  it('completes every active step after a local turn-ending action', () => {
    const aim = createFirstSalvoCoach(null);
    const powerAndWind = applyFirstSalvoAction(aim, eligibleTurn, { type: 'set_angle', angle: 72 });
    const fire = applyFirstSalvoAction(powerAndWind, eligibleTurn, { type: 'set_power', power: 63 });

    for (const coach of [aim, powerAndWind, fire]) {
      expect(firstSalvoStepFor(applyFirstSalvoAction(coach, eligibleTurn, { type: 'fire' }), eligibleTurn)).toBeNull();
      expect(firstSalvoStepFor(applyFirstSalvoAction(coach, eligibleTurn, { type: 'use_shield' }), eligibleTurn)).toBeNull();
    }
  });

  it('does not advance the active coach for non-coaching actions', () => {
    const coach = createFirstSalvoCoach(null);

    expect(firstSalvoStepFor(applyFirstSalvoAction(coach, eligibleTurn, { type: 'move', delta: 12 }), eligibleTurn)).toBe('aim');
    expect(firstSalvoStepFor(applyFirstSalvoAction(coach, eligibleTurn, { type: 'select_weapon', weapon: 'missile' }), eligibleTurn))
      .toBe('aim');
    expect(firstSalvoStepFor(applyFirstSalvoAction(coach, eligibleTurn, { type: 'buy', weapon: 'baby_nuke' }), eligibleTurn))
      .toBe('aim');
  });

  it('requires a living local human PLAYER_TURN before showing or advancing', () => {
    const coach = createFirstSalvoCoach(null);
    const ineligibleTurns = [
      { ...eligibleTurn, activeIsAi: true },
      { ...eligibleTurn, activeIsLocal: false },
      { ...eligibleTurn, activeTankAlive: false },
      { ...eligibleTurn, phase: 'FIRING' as const },
    ];

    for (const turn of ineligibleTurns) {
      expect(isFirstSalvoEligible(turn)).toBe(false);
      expect(firstSalvoStepFor(coach, turn)).toBeNull();
      expect(firstSalvoStepFor(applyFirstSalvoAction(coach, turn, { type: 'set_angle', angle: 72 }), eligibleTurn))
        .toBe('aim');
    }
  });

  it('loads a completed preference, persists skips and completions, and treats malformed or failed storage as absent', () => {
    expect(loadFirstSalvoPreference(storageWith('v1:completed'))).toBe('completed');
    expect(loadFirstSalvoPreference(storageWith('not-a-first-salvo-preference'))).toBeNull();
    expect(createFirstSalvoCoach('completed').status).toBe('completed');

    const writes: string[] = [];
    const writable: FirstSalvoStorage = {
      getItem: () => null,
      setItem: (key, value) => writes.push(`${key}=${value}`),
    };
    persistFirstSalvoPreference(writable, 'skipped');
    persistFirstSalvoPreference(writable, 'completed');
    expect(writes).toEqual([
      `${FIRST_SALVO_PREFERENCE_KEY}=v1:skipped`,
      `${FIRST_SALVO_PREFERENCE_KEY}=v1:completed`,
    ]);

    const unavailable: FirstSalvoStorage = {
      getItem: () => { throw new Error('storage disabled'); },
      setItem: () => { throw new Error('storage disabled'); },
    };
    expect(loadFirstSalvoPreference(unavailable)).toBeNull();
    expect(() => persistFirstSalvoPreference(unavailable, 'completed')).not.toThrow();
  });

  it('loads the versioned skipped preference', () => {
    expect(loadFirstSalvoPreference(storageWith('v1:skipped'))).toBe('skipped');
  });

  it('derives the exact preference to persist from a skip or completed action result', () => {
    const coach = createFirstSalvoCoach(null);

    expect(firstSalvoPreferenceFor(skipFirstSalvoCoach(coach))).toBe('skipped');
    expect(firstSalvoPreferenceFor(applyFirstSalvoAction(coach, eligibleTurn, { type: 'fire' }))).toBe('completed');
    expect(firstSalvoPreferenceFor(coach)).toBeNull();
  });

  it('hides immediately when skipped and replay starts a fresh in-memory Aim session without clearing the preference', () => {
    const skipped = skipFirstSalvoCoach(createFirstSalvoCoach(null));

    expect(skipped.status).toBe('skipped');
    expect(firstSalvoStepFor(skipped, eligibleTurn)).toBeNull();
    expect(firstSalvoStepFor(replayFirstSalvoCoach(skipped), eligibleTurn)).toBe('aim');
    expect(firstSalvoStepFor(replayFirstSalvoCoach(createFirstSalvoCoach('completed')), eligibleTurn)).toBe('aim');
  });
});
