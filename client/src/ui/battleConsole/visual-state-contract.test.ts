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
      'armory.available',
      'armory.credits',
      'campaign.commitmentCount',
      'campaign.objects',
      'campaign.result',
      'campaign.retryable',
      'campaign.supplies',
      ...visual.fields.flatMap((field: { key: string }) => (
        field.key === 'ballistics.angle'
          ? [field.key, 'ballistics.canAdjust']
          : field.key === 'ballistics.wind' ? ['ballistics.powerCap', field.key] : [field.key]
      )),
    ]);
    expect(presentationStateContract.intentDiscriminants).toEqual(
      visual.intents.flatMap((intent: { discriminant: string }) => (
        intent.discriminant === 'coach-skip'
          ? [intent.discriminant, 'campaign-retry']
          : [intent.discriminant]
      )),
    );
    expect(presentationStateContract.forbiddenReferenceKinds).toEqual(['callback', 'dom', 'client', 'engine', 'mutable-gameplay-object']);
  });

  it('copies and compares the active power cap and mode capabilities as live presentation state', () => {
    const state = {
      commander: { id: 'p1', name: 'Player 1', portrait: null, health: 100 },
      mobility: { fuel: 100, canMoveLeft: true, canMoveRight: true },
      weapon: { type: 'baby_missile', name: 'Baby Missile', ammo: null, canCycle: true },
      armory: { available: false, credits: 8_000, open: false, submitting: false, items: [] },
      ballistics: { angle: 45, power: 150, canAdjust: true, powerCap: 200, wind: 0 },
      fireControl: { status: 'Fire ready', guidance: '', ready: true, submitting: false },
      settings: { open: false, soundEnabled: true, guideEnabled: true, returnFocusKey: null },
      coach: { step: null, briefingOpen: false },
      focusOwner: null,
    } satisfies BattleConsolePresentationState;

    const projected = projectBattleConsoleState(state);
    expect(projected.armory).toMatchObject({ available: false, credits: 8_000 });
    expect(projected.ballistics).toEqual({ angle: 45, power: 150, canAdjust: true, powerCap: 200, wind: 0 });
    expect(battleConsolePresentationStatesEqual(
      projected,
      { ...projected, ballistics: { ...projected.ballistics, powerCap: 100 } },
    )).toBe(false);
    expect(battleConsolePresentationStatesEqual(
      projected,
      { ...projected, armory: { ...projected.armory, available: true } },
    )).toBe(false);
    expect(battleConsolePresentationStatesEqual(
      projected,
      { ...projected, ballistics: { ...projected.ballistics, canAdjust: false } },
    )).toBe(false);
  });

  it('detaches and structurally compares every ordered campaign fact', () => {
    const campaign = {
      commitmentCount: 4,
      supplies: 2,
      retryable: false,
      objects: [
        { id: 'refinery', kind: 'protected' as const, health: 61, maxHealth: 100, alive: true },
        { id: 'drum-a', kind: 'supply-drum' as const, health: 0, maxHealth: 20, alive: false },
      ],
      result: {
        outcome: 'success' as const,
        reason: 'objective' as const,
        commitmentId: 4,
      },
    };
    const state = {
      commander: { id: 'p1', name: 'Player 1', portrait: null, health: 100 },
      mobility: { fuel: 100, canMoveLeft: true, canMoveRight: true },
      weapon: { type: 'baby_missile', name: 'Baby Missile', ammo: null, canCycle: true },
      armory: { available: false, credits: 0, open: false, submitting: false, items: [] },
      ballistics: { angle: 45, power: 50, canAdjust: true, powerCap: 100, wind: 0 },
      fireControl: { status: 'Fire ready', guidance: '', ready: true, submitting: false },
      settings: { open: false, soundEnabled: true, guideEnabled: true, returnFocusKey: null },
      coach: { step: null, briefingOpen: false },
      focusOwner: null,
      campaign,
    } satisfies BattleConsolePresentationState;

    const projected = projectBattleConsoleState(state);
    expect(projected.campaign).toEqual(campaign);
    expect(projected.campaign).not.toBe(campaign);
    expect(projected.campaign?.objects).not.toBe(campaign.objects);
    expect(projected.campaign?.objects[0]).not.toBe(campaign.objects[0]);
    expect(projected.campaign?.result).not.toBe(campaign.result);
    expect(battleConsolePresentationStatesEqual(projected, {
      ...projected,
      campaign: {
        commitmentCount: 4,
        supplies: 2,
        retryable: false,
        objects: campaign.objects.map((object) => ({ ...object })),
        result: { ...campaign.result },
      },
    })).toBe(true);

    const changedCampaigns: NonNullable<BattleConsolePresentationState['campaign']>[] = [
      { ...campaign, commitmentCount: 5 },
      { ...campaign, supplies: 6 },
      { ...campaign, retryable: true },
      { ...campaign, objects: [campaign.objects[1]!, campaign.objects[0]!] },
      { ...campaign, objects: [{ ...campaign.objects[0]!, id: 'refinery-east' }, campaign.objects[1]!] },
      { ...campaign, objects: [{ ...campaign.objects[0]!, kind: 'relay' }, campaign.objects[1]!] },
      { ...campaign, objects: [{ ...campaign.objects[0]!, health: 60 }, campaign.objects[1]!] },
      { ...campaign, objects: [{ ...campaign.objects[0]!, maxHealth: 120 }, campaign.objects[1]!] },
      { ...campaign, objects: [{ ...campaign.objects[0]!, alive: false }, campaign.objects[1]!] },
      { ...campaign, result: { ...campaign.result, outcome: 'failure', reason: 'player' } },
      { ...campaign, result: { ...campaign.result, commitmentId: 5 } },
      {
        ...campaign,
        result: {
          outcome: 'technical-failure',
          reason: 'technical-failure',
          code: 'effect-queue-limit',
          reward: false,
          commitmentId: 4,
        },
      },
    ];
    for (const changed of changedCampaigns) {
      expect(battleConsolePresentationStatesEqual(projected, {
        ...projected,
        campaign: changed,
      })).toBe(false);
    }
    expect(battleConsolePresentationStatesEqual(
      { ...projected, campaign: undefined },
      { ...projected, campaign: null },
    )).toBe(true);
    expect(battleConsolePresentationStatesEqual(
      { ...projected, campaign: null },
      projected,
    )).toBe(false);
    expect(battleConsolePresentationStatesEqual(
      projected,
      { ...projected, campaign: null },
    )).toBe(false);
  });
});
