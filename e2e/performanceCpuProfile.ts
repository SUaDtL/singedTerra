export const P09_DIAGNOSTIC_SCHEMA = 'singedterra-p09-function-hotspot-diagnostic-v1' as const;
export const P09_DIAGNOSTIC_ONLY = 'diagnostic-only; profiled durations are not canonical and must not be compared with uninstrumented R17 timing' as const;

export type PerformanceScenario = 'idle' | 'aim' | 'impact';

export interface CpuProfileCallFrame {
  functionName: string;
  scriptId: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
}

export interface CpuProfileNode {
  id: number;
  callFrame: CpuProfileCallFrame;
  hitCount?: number;
  children?: number[];
  deoptReason?: string;
  positionTicks?: Array<{ line: number; ticks: number }>;
}

export interface CpuProfile {
  nodes: CpuProfileNode[];
  startTime: number;
  endTime: number;
  samples?: number[];
  timeDeltas?: number[];
}

export interface FunctionHotspot {
  key: string;
  functionName: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
  sampleCount: number;
  /** Forward-interval estimate; CPU sampling does not measure exact function duration. */
  estimatedSelfTimeUs: number;
  estimatedFirstPartyShare: number;
}

export interface CpuProfileSummary {
  profileDurationUs: number;
  /** Start-to-first-sample interval, which has no preceding sample to own it. */
  unassignedStartupTimeUs: number;
  /** End minus the final sample timestamp; assigned to that final sample by the estimator. */
  finalSampleTailTimeUs: number;
  totalEstimatedSampledTimeUs: number;
  firstPartyEstimatedSelfTimeUs: number;
  hotspots: FunctionHotspot[];
}

export interface ProfileObservation {
  scenario: PerformanceScenario;
  warmup: boolean;
  summary: CpuProfileSummary;
}

export interface HotspotRecurrence {
  key: string;
  functionName: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
  retainedSamplePresence: number;
  topSampleCount: number;
  medianEstimatedSelfTimeUs: number;
  medianEstimatedFirstPartyShare: number;
}

export interface ScenarioRecurrence {
  scenario: PerformanceScenario;
  retainedSampleCount: number;
  observedHotspots: HotspotRecurrence[];
}

export function p09CpuProfileEnabled(value: string | undefined): boolean {
  return value === '1';
}

export function profileArtifactName(scenario: PerformanceScenario, ordinal: number, warmup: boolean): string {
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) throw new Error('profile ordinal must be a non-negative integer');
  return `p09-${scenario}-${String(ordinal).padStart(2, '0')}-${warmup ? 'warmup' : 'retained'}.cpuprofile`;
}

function candidateOrigin(candidateBase: string): string {
  let origin: string;
  try {
    origin = new URL(candidateBase).origin;
  } catch {
    throw new Error('candidate base must be an absolute URL');
  }
  if (origin === 'null') throw new Error('candidate base must have an origin');
  return origin;
}

function isSameOrigin(url: string, origin: string): boolean {
  if (!url) return false;
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function hotspotKey(frame: CpuProfileCallFrame): string {
  return JSON.stringify([frame.url, frame.lineNumber, frame.columnNumber, frame.functionName]);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function summarizeCpuProfile(profile: CpuProfile, candidateBase: string): CpuProfileSummary {
  const origin = candidateOrigin(candidateBase);
  if (!Number.isFinite(profile.startTime) || !Number.isFinite(profile.endTime) || profile.endTime < profile.startTime) {
    throw new Error('CPU profile has an invalid time range');
  }
  const profileDurationUs = profile.endTime - profile.startTime;
  if (!Number.isFinite(profileDurationUs)) throw new Error('CPU profile has an invalid duration');
  if (!Array.isArray(profile.samples) || !Array.isArray(profile.timeDeltas)) {
    throw new Error('CPU profile must retain samples and timeDeltas');
  }
  if (profile.samples.length !== profile.timeDeltas.length) {
    throw new Error('CPU profile sample and timeDelta counts differ');
  }

  const nodes = new Map<number, CpuProfileNode>();
  for (const node of profile.nodes) {
    if (!Number.isSafeInteger(node.id) || nodes.has(node.id)) throw new Error(`CPU profile has invalid or duplicate node id ${node.id}`);
    nodes.set(node.id, node);
  }

  // CDP's first timeDelta runs from profile.startTime to the first sample
  // timestamp; assigning it to that first sample would attribute unsampled
  // startup time to a function. Build sample timestamps first, then estimate a
  // sample's self time from its timestamp forward to the next sample. The final
  // sample owns the explicit tail from its timestamp to profile.endTime.
  const sampleTimestamps: number[] = [];
  let sampleTimestamp = profile.startTime;
  for (let index = 0; index < profile.samples.length; index += 1) {
    const delta = profile.timeDeltas[index]!;
    if (!Number.isFinite(delta) || delta < 0) throw new Error(`CPU profile has invalid timeDelta at index ${index}`);
    sampleTimestamp += delta;
    if (!Number.isFinite(sampleTimestamp) || sampleTimestamp > profile.endTime) {
      throw new Error(`CPU profile sample timestamp is outside its time range at index ${index}`);
    }
    sampleTimestamps.push(sampleTimestamp);
  }

  const unassignedStartupTimeUs = sampleTimestamps.length === 0
    ? profileDurationUs
    : sampleTimestamps[0]! - profile.startTime;
  const finalSampleTailTimeUs = sampleTimestamps.length === 0
    ? 0
    : profile.endTime - sampleTimestamps[sampleTimestamps.length - 1]!;
  const accumulated = new Map<string, Omit<FunctionHotspot, 'estimatedFirstPartyShare'>>();
  let totalEstimatedSampledTimeUs = 0;
  let firstPartyEstimatedSelfTimeUs = 0;
  for (let index = 0; index < profile.samples.length; index += 1) {
    const nodeId = profile.samples[index]!;
    const node = nodes.get(nodeId);
    if (!node) throw new Error(`CPU profile sample references unknown node id ${nodeId}`);
    const intervalEnd = sampleTimestamps[index + 1] ?? profile.endTime;
    const estimatedSelfTimeUs = intervalEnd - sampleTimestamps[index]!;
    if (!Number.isFinite(estimatedSelfTimeUs) || estimatedSelfTimeUs < 0) {
      throw new Error(`CPU profile has invalid forward interval at index ${index}`);
    }
    totalEstimatedSampledTimeUs += estimatedSelfTimeUs;
    const frame = node.callFrame;
    if (!isSameOrigin(frame.url, origin)) continue;
    firstPartyEstimatedSelfTimeUs += estimatedSelfTimeUs;
    const key = hotspotKey(frame);
    const existing = accumulated.get(key);
    accumulated.set(key, {
      key,
      functionName: frame.functionName || '(anonymous)',
      url: frame.url,
      lineNumber: frame.lineNumber,
      columnNumber: frame.columnNumber,
      sampleCount: (existing?.sampleCount ?? 0) + 1,
      estimatedSelfTimeUs: (existing?.estimatedSelfTimeUs ?? 0) + estimatedSelfTimeUs,
    });
  }

  const hotspots = [...accumulated.values()]
    // Retain zero-duration samples in the count above, but do not promote a
    // function observed only at zero-width timestamps as a hotspot.
    .filter((hotspot) => hotspot.estimatedSelfTimeUs > 0)
    .map((hotspot): FunctionHotspot => ({
      ...hotspot,
      estimatedFirstPartyShare: firstPartyEstimatedSelfTimeUs === 0
        ? 0
        : hotspot.estimatedSelfTimeUs / firstPartyEstimatedSelfTimeUs,
    }))
    .sort((left, right) => right.estimatedSelfTimeUs - left.estimatedSelfTimeUs
      || right.sampleCount - left.sampleCount
      || left.key.localeCompare(right.key));

  return {
    profileDurationUs,
    unassignedStartupTimeUs,
    finalSampleTailTimeUs,
    totalEstimatedSampledTimeUs,
    firstPartyEstimatedSelfTimeUs,
    hotspots,
  };
}

const SCENARIO_ORDER: readonly PerformanceScenario[] = ['idle', 'aim', 'impact'];

export function summarizeHotspotRecurrence(observations: readonly ProfileObservation[]): ScenarioRecurrence[] {
  const grouped = new Map<PerformanceScenario, ProfileObservation[]>();
  for (const observation of observations) {
    if (observation.warmup) continue;
    const current = grouped.get(observation.scenario) ?? [];
    current.push(observation);
    grouped.set(observation.scenario, current);
  }

  return SCENARIO_ORDER
    .filter((scenario) => grouped.has(scenario))
    .map((scenario): ScenarioRecurrence => {
      const retained = grouped.get(scenario)!;
      const representatives = new Map<string, FunctionHotspot>();
      for (const observation of retained) {
        for (const hotspot of observation.summary.hotspots) {
          if (!representatives.has(hotspot.key)) representatives.set(hotspot.key, hotspot);
        }
      }
      const observedHotspots = [...representatives.values()].map((representative): HotspotRecurrence => {
        let retainedSamplePresence = 0;
        let topSampleCount = 0;
        const selfTimes: number[] = [];
        const shares: number[] = [];
        for (const observation of retained) {
          const hotspot = observation.summary.hotspots.find(({ key }) => key === representative.key);
          if (hotspot) retainedSamplePresence += 1;
          if (observation.summary.hotspots[0]?.key === representative.key) topSampleCount += 1;
          selfTimes.push(hotspot?.estimatedSelfTimeUs ?? 0);
          shares.push(hotspot?.estimatedFirstPartyShare ?? 0);
        }
        return {
          key: representative.key,
          functionName: representative.functionName,
          url: representative.url,
          lineNumber: representative.lineNumber,
          columnNumber: representative.columnNumber,
          retainedSamplePresence,
          topSampleCount,
          medianEstimatedSelfTimeUs: median(selfTimes),
          medianEstimatedFirstPartyShare: median(shares),
        };
      }).sort((left, right) => right.topSampleCount - left.topSampleCount
        || right.retainedSamplePresence - left.retainedSamplePresence
        || right.medianEstimatedSelfTimeUs - left.medianEstimatedSelfTimeUs
        || left.key.localeCompare(right.key));
      return { scenario, retainedSampleCount: retained.length, observedHotspots };
    });
}
