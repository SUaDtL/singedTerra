import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from './contractTestSupport';

// @ts-ignore -- V-02 intentionally keeps the runtime product module absent for expectation RED.
import { presentationStateContract } from './projectState';

const visual = readBattleConsoleContract('state/visual-state.json') as any;

describe('AC-19 complete typed state and intents', () => {
  it('exposes every locked field and intent with no callback, DOM, client, engine, or mutable object', () => {
    // AC04 product successor: user-requested live budget extends the preserved historical state contract.
    expect(presentationStateContract.fieldKeys).toEqual(['armory.credits', ...visual.fields.map((field: { key: string }) => field.key)]);
    expect(presentationStateContract.intentDiscriminants).toEqual(visual.intents.map((intent: { discriminant: string }) => intent.discriminant));
    expect(presentationStateContract.forbiddenReferenceKinds).toEqual(['callback', 'dom', 'client', 'engine', 'mutable-gameplay-object']);
  });
});
