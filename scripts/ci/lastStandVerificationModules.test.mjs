import assert from 'node:assert/strict';
import test from 'node:test';
import * as journey from '../../e2e/helpers/lastStandJourney.mjs';

// Refactor seams: these are real implementations with explicit host adapters,
// not strings cut from the orchestration source and evaluated in a test realm.
test('verification owners expose callable host-adapter seams', () => {
  for (const name of ['createLastStandNativeDriver', 'createLastStandProcessSupervisor',
    'createLastStandMediaCapture', 'createEncounterOracle', 'observeJourneyRuntime',
    'checkJourneyAudioReturn', 'runJourneyAway'])
    assert.equal(typeof journey[name], 'function', 'Missing maintained verification seam: '+name);
});
