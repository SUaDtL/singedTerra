import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from './contractTestSupport';

// @ts-ignore -- V-02 intentionally keeps the runtime product module absent for expectation RED.
import {
  battleConsolePresentationStatesEqual,
  presentationStateContract,
  projectBattleConsoleState,
} from './projectState';
import type { BattleConsolePresentationState } from './types';

const visual = readBattleConsoleContract('state/visual-state.json') as any;

describe('AC-19 complete typed state and intents', () => {
  it('exposes every locked field and intent with no callback, DOM, client, engine, or mutable object', () => {
    // AC04 product successor: user-requested live budget extends the preserved historical state contract.
    expect(presentationStateContract.fieldKeys).toEqual([
      'armory.credits',
      ...visual.fields.flatMap((field: { key: string }) => (
        field.key === 'ballistics.wind' ? ['ballistics.powerCap', field.key] : [field.key]
      )),
    ]);
    expect(presentationStateContract.intentDiscriminants).toEqual(visual.intents.map((intent: { discriminant: string }) => intent.discriminant));
    expect(presentationStateContract.forbiddenReferenceKinds).toEqual(['callback', 'dom', 'client', 'engine', 'mutable-gameplay-object']);
  });

  it('copies and compares the active power cap as live presentation state', () => {
    const state = {
      commander: { id: 'p1', name: 'Player 1', portrait: null, health: 100 },
      mobility: { fuel: 100, canMoveLeft: true, canMoveRight: true },
      weapon: { type: 'baby_missile', name: 'Baby Missile', ammo: null, canCycle: true },
      armory: { open: false, submitting: false, items: [] },
      ballistics: { angle: 45, power: 150, powerCap: 200, wind: 0 },
      fireControl: { status: 'Fire ready', guidance: '', ready: true, submitting: false },
      settings: { open: false, soundEnabled: true, guideEnabled: true, returnFocusKey: null },
      coach: { step: null, briefingOpen: false },
      focusOwner: null,
    } satisfies BattleConsolePresentationState;

    const projected = projectBattleConsoleState(state);
    expect(projected.ballistics).toEqual({ angle: 45, power: 150, powerCap: 200, wind: 0 });
    expect(battleConsolePresentationStatesEqual(
      projected,
      { ...projected, ballistics: { ...projected.ballistics, powerCap: 100 } },
    )).toBe(false);
  });
});
