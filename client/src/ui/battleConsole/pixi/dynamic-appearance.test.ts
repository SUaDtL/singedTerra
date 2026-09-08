import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from '../contractTestSupport';

// @ts-ignore -- V-02 intentionally keeps the runtime product module absent for expectation RED.
import { dynamicAppearanceRegistry } from './scene';
import {
  projectPresentationStateForAppearance,
  resolveAppearanceRequest,
  type BattleConsoleAppearanceRequest,
} from '../appearanceRuntime';
import type { BattleConsolePresentationState } from '../types';

const appearance = readBattleConsoleContract('state/dynamic-appearance.json') as any;

const baseState: BattleConsolePresentationState = {
  commander: { id: 'p1', name: 'Player 1', portrait: null, health: 100 },
  mobility: { fuel: 100, canMoveLeft: true, canMoveRight: true },
  weapon: { type: 'baby_missile', name: 'Baby Missile', ammo: null, canCycle: true },
  armory: { open: false, submitting: false, items: [] },
  ballistics: { angle: 45, power: 50, wind: -1.3 },
  fireControl: { status: 'Fire ready', guidance: '', ready: true, submitting: false },
  settings: { open: false, soundEnabled: true, guideEnabled: true, returnFocusKey: null },
  coach: { step: null, briefingOpen: false },
  focusOwner: null,
};

function requestFor(entry: Record<string, unknown>): BattleConsoleAppearanceRequest {
  return {
    key: entry['key'] as string,
    sourceKind: entry['sourceKind'] as BattleConsoleAppearanceRequest['sourceKind'],
    stateField: entry['stateField'] as string | undefined,
    stateValue: entry['stateValue'],
    statePredicate: entry['statePredicate'],
    affordanceKey: entry['affordanceKey'] as string | undefined,
    affordanceState: entry['affordanceState'] as string | undefined,
  };
}

describe('AC-20 unmasked live-state appearance', () => {
  it('maps every state field consumer without reconstructing an owner', () => {
    expect(dynamicAppearanceRegistry.expectationKeys).toEqual(appearance.expectations.map((entry: { key: string }) => entry.key));
    expect(dynamicAppearanceRegistry.expectationKeys.length).toBe(appearance.cardinalities.expectations);
    expect(dynamicAppearanceRegistry.reconstructsOwners).toBe(false);
    expect(dynamicAppearanceRegistry.usesMasksToHideWrongInk).toBe(false);
  });

  it('resolves predicates independently of the claimed key and projects the real presentation state', () => {
    const angleEntry = appearance.expectations.find((entry: Record<string, unknown>) => (
      entry['sourceKind'] === 'field' && entry['stateField'] === 'ballistics.angle' && entry['stateValue'] === 90
    ));
    const angleRequest = requestFor(angleEntry);
    const angleRecord = resolveAppearanceRequest(angleRequest);
    expect(angleRecord.key).toBe(angleEntry.key);
    expect(projectPresentationStateForAppearance(baseState, angleRecord).ballistics.angle).toBe(90);

    const fireDisabledEntry = appearance.expectations.find((entry: Record<string, unknown>) => (
      entry['sourceKind'] === 'affordance' && entry['affordanceKey'] === 'fire' && entry['affordanceState'] === 'disabled'
    ));
    const disabledState = projectPresentationStateForAppearance(
      baseState,
      resolveAppearanceRequest(requestFor(fireDisabledEntry)),
    );
    expect(disabledState.fireControl.ready).toBe(false);

    expect(() => resolveAppearanceRequest({ ...angleRequest, key: 'field:ballistics.angle:0' }))
      .toThrow(/does not match resolved appearance/i);
  });
});
