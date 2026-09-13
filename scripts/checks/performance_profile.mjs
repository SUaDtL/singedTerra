import assert from 'node:assert/strict';
import {
  p09CpuProfileEnabled,
  profileArtifactName,
  summarizeCpuProfile,
  summarizeHotspotRecurrence,
} from '../../e2e/performanceCpuProfile.ts';

const candidate = 'http://127.0.0.1:5198/singedTerra/';
const profile = {
  nodes: [
    { id: 1, callFrame: { functionName: '(root)', scriptId: '0', url: '', lineNumber: 0, columnNumber: 0 } },
    { id: 2, callFrame: { functionName: 'renderAim', scriptId: '1', url: `${candidate}assets/main.js`, lineNumber: 10, columnNumber: 5 } },
    { id: 3, callFrame: { functionName: 'thirdParty', scriptId: '2', url: 'https://example.invalid/library.js', lineNumber: 2, columnNumber: 1 } },
    { id: 4, callFrame: { functionName: 'project', scriptId: '1', url: `${candidate}assets/main.js`, lineNumber: 20, columnNumber: 3 } },
  ],
  startTime: 100,
  endTime: 14_100,
  samples: [2, 3, 2, 4],
  timeDeltas: [1_000, 2_000, 3_000, 4_000],
};

const summary = summarizeCpuProfile(profile, candidate);
assert.equal(summary.profileDurationUs, 14_000);
assert.equal(summary.unassignedStartupTimeUs, 1_000);
assert.equal(summary.finalSampleTailTimeUs, 4_000);
assert.equal(summary.totalEstimatedSampledTimeUs, 13_000);
assert.equal(summary.firstPartyEstimatedSelfTimeUs, 10_000);
assert.deepEqual(summary.hotspots.map(({ functionName, sampleCount, estimatedSelfTimeUs, estimatedFirstPartyShare }) => ({
  functionName,
  sampleCount,
  estimatedSelfTimeUs,
  estimatedFirstPartyShare,
})), [
  { functionName: 'renderAim', sampleCount: 2, estimatedSelfTimeUs: 6_000, estimatedFirstPartyShare: 0.6 },
  { functionName: 'project', sampleCount: 1, estimatedSelfTimeUs: 4_000, estimatedFirstPartyShare: 0.4 },
]);

assert.equal(p09CpuProfileEnabled('1'), true);
assert.equal(p09CpuProfileEnabled('true'), false);
assert.equal(p09CpuProfileEnabled(undefined), false);
assert.equal(profileArtifactName('impact', 5, false), 'p09-impact-05-retained.cpuprofile');
assert.equal(profileArtifactName('idle', 0, true), 'p09-idle-00-warmup.cpuprofile');
assert.throws(() => profileArtifactName('idle', -1, false));

const originConfusion = summarizeCpuProfile({
  ...profile,
  nodes: [
    ...profile.nodes,
    { id: 5, callFrame: { functionName: 'lookalike', scriptId: '5', url: 'http://127.0.0.1:5198.example.invalid/main.js', lineNumber: 1, columnNumber: 1 } },
  ],
  samples: [2, 5],
  timeDeltas: [1_000, 9_000],
}, candidate);
assert.equal(originConfusion.totalEstimatedSampledTimeUs, 13_000);
assert.equal(originConfusion.firstPartyEstimatedSelfTimeUs, 9_000);
assert.deepEqual(originConfusion.hotspots.map(({ functionName }) => functionName), ['renderAim']);

const forwardIntervals = summarizeCpuProfile({
  ...profile,
  startTime: 0,
  endTime: 10_000,
  samples: [2, 4],
  timeDeltas: [1, 9_999],
}, candidate);
assert.equal(forwardIntervals.unassignedStartupTimeUs, 1);
assert.equal(forwardIntervals.finalSampleTailTimeUs, 0);
assert.equal(forwardIntervals.totalEstimatedSampledTimeUs, 9_999);
assert.deepEqual(forwardIntervals.hotspots.map(({ functionName, sampleCount, estimatedSelfTimeUs }) => ({
  functionName,
  sampleCount,
  estimatedSelfTimeUs,
})), [
  { functionName: 'renderAim', sampleCount: 1, estimatedSelfTimeUs: 9_999 },
]);

const startupAndTail = summarizeCpuProfile({
  ...profile,
  startTime: 0,
  endTime: 20_000,
  samples: [2, 4],
  timeDeltas: [9_000, 1_000],
}, candidate);
assert.equal(startupAndTail.unassignedStartupTimeUs, 9_000);
assert.equal(startupAndTail.finalSampleTailTimeUs, 10_000);
assert.equal(startupAndTail.totalEstimatedSampledTimeUs, 11_000);
assert.deepEqual(startupAndTail.hotspots.map(({ functionName, sampleCount, estimatedSelfTimeUs }) => ({
  functionName,
  sampleCount,
  estimatedSelfTimeUs,
})), [
  { functionName: 'project', sampleCount: 1, estimatedSelfTimeUs: 10_000 },
  { functionName: 'renderAim', sampleCount: 1, estimatedSelfTimeUs: 1_000 },
]);

const zeroDeltaSamples = summarizeCpuProfile({
  ...profile,
  startTime: 0,
  endTime: 100,
  samples: [2, 2],
  timeDeltas: [0, 100],
}, candidate);
assert.deepEqual(zeroDeltaSamples.hotspots.map(({ functionName, sampleCount, estimatedSelfTimeUs }) => ({
  functionName,
  sampleCount,
  estimatedSelfTimeUs,
})), [
  { functionName: 'renderAim', sampleCount: 2, estimatedSelfTimeUs: 100 },
]);
const zeroTimeOnly = summarizeCpuProfile({
  ...profile,
  startTime: 0,
  endTime: 0,
  samples: [2],
  timeDeltas: [0],
}, candidate);
assert.deepEqual(zeroTimeOnly.hotspots, []);

const renderAim = summary.hotspots[0];
const project = summary.hotspots[1];
const recurrence = summarizeHotspotRecurrence([
  { scenario: 'aim', warmup: true, summary: { ...summary, hotspots: [project, renderAim] } },
  { scenario: 'aim', warmup: false, summary },
  { scenario: 'aim', warmup: false, summary },
  { scenario: 'aim', warmup: false, summary: { ...summary, hotspots: [project, renderAim] } },
  { scenario: 'idle', warmup: false, summary: { ...summary, totalEstimatedSampledTimeUs: 1_000, firstPartyEstimatedSelfTimeUs: 0, hotspots: [] } },
]);
assert.equal(recurrence.length, 2);
assert.deepEqual(recurrence[0], {
  scenario: 'idle',
  retainedSampleCount: 1,
  observedHotspots: [],
});
assert.equal(recurrence[1].scenario, 'aim');
assert.equal(recurrence[1].retainedSampleCount, 3);
assert.deepEqual(recurrence[1].observedHotspots.map(({ functionName, retainedSamplePresence, topSampleCount }) => ({
  functionName,
  retainedSamplePresence,
  topSampleCount,
})), [
  { functionName: 'renderAim', retainedSamplePresence: 3, topSampleCount: 2 },
  { functionName: 'project', retainedSamplePresence: 3, topSampleCount: 1 },
]);
assert.equal(recurrence[1].observedHotspots[0].medianEstimatedSelfTimeUs, 6_000);
assert.equal(recurrence[1].observedHotspots[0].medianEstimatedFirstPartyShare, 0.6);

const sparseRecurrence = summarizeHotspotRecurrence([
  { scenario: 'impact', warmup: false, summary },
  { scenario: 'impact', warmup: false, summary: { ...summary, totalEstimatedSampledTimeUs: 1_000, firstPartyEstimatedSelfTimeUs: 0, hotspots: [] } },
  { scenario: 'impact', warmup: false, summary },
]);
assert.equal(sparseRecurrence[0].observedHotspots[0].retainedSamplePresence, 2);
assert.equal(sparseRecurrence[0].observedHotspots[0].medianEstimatedSelfTimeUs, 6_000);
assert.equal(sparseRecurrence[0].observedHotspots[0].medianEstimatedFirstPartyShare, 0.6);

for (const malformed of [
  { ...profile, timeDeltas: [1_000] },
  { ...profile, samples: [999], timeDeltas: [1_000] },
  { ...profile, timeDeltas: [1_000, 2_000, -1, 4_000] },
  { ...profile, nodes: [...profile.nodes, profile.nodes[0]] },
  { ...profile, startTime: 200, endTime: 100 },
  { ...profile, startTime: 0, endTime: 100, samples: [2], timeDeltas: [101] },
  { ...profile, startTime: Number.MAX_VALUE, endTime: Number.MAX_VALUE, samples: [2], timeDeltas: [Number.MAX_VALUE] },
  { ...profile, samples: undefined, timeDeltas: undefined },
]) {
  assert.throws(() => summarizeCpuProfile(malformed, candidate));
}
assert.throws(() => summarizeCpuProfile(profile, 'not a URL'));

console.log('P09 CPU profile analysis checks passed');
