import { DEFAULT_TANK_LOADOUT } from '@shared/types/TankLoadout';
import appearanceContract from '../../../../.codearbiter/contracts/battle-console/state/dynamic-appearance.json';
import type { BattleConsolePresentationState } from './types';

export type BattleConsoleAppearanceSourceKind = 'field' | 'affordance' | 'boundary';

export interface BattleConsoleAppearanceRequest {
  readonly key: string;
  readonly sourceKind: BattleConsoleAppearanceSourceKind;
  readonly stateField?: string;
  readonly stateValue?: unknown;
  readonly statePredicate?: unknown;
  readonly affordanceKey?: string;
  readonly affordanceState?: string;
  readonly boundaryKey?: string;
  readonly boundaryState?: string;
}

export interface BattleConsoleAppearanceRecord extends BattleConsoleAppearanceRequest {
  readonly alignment: string;
  readonly baseline: string;
  readonly baselineOffsetPx: number;
  readonly clearancePx: number;
  readonly fillOrAngle: unknown;
  readonly fontFile: string | null;
  readonly fontSizePx: number;
  readonly fontStack: string;
  readonly fontWeight: number | null;
  readonly iconOrGlyph: string | null;
  readonly opacity: number;
  readonly outlineRgba: string;
  readonly outlineWidthPx: number;
  readonly overflow: string;
  readonly physicalSocketKeys?: readonly string[];
  readonly readyOwner: string;
  readonly rgba: string;
  readonly trackingEm: number;
  readonly wrapping: string;
}

export interface BattleConsoleAppearanceObservation {
  readonly key: string;
  readonly rgba: string;
  readonly opacity: number;
  readonly outlineRgba: string;
  readonly outlineWidthPx: number;
  readonly fontFile: string | null;
  readonly fontStack: string;
  readonly fontSizePx: number;
  readonly fontWeight: number | null;
  readonly trackingEm: number;
  readonly baseline: string;
  readonly baselineOffsetPx: number;
  readonly iconOrGlyph: string | null;
  readonly fillOrAngle: unknown;
  readonly alignment: string;
  readonly overflow: string;
  readonly wrapping: string;
  readonly clearancePx: number;
}

const appearanceRecords = appearanceContract.expectations as readonly BattleConsoleAppearanceRecord[];

function equalJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requestMatches(record: BattleConsoleAppearanceRecord, request: BattleConsoleAppearanceRequest): boolean {
  if (record.sourceKind !== request.sourceKind) return false;
  if (record.sourceKind === 'field') {
    return record.stateField === request.stateField
      && equalJson(record.stateValue, request.stateValue)
      && equalJson(record.statePredicate, request.statePredicate);
  }
  if (record.sourceKind === 'affordance') {
    return record.affordanceKey === request.affordanceKey
      && record.affordanceState === request.affordanceState;
  }
  return record.stateField === request.stateField
    && equalJson(record.statePredicate, request.statePredicate);
}

/**
 * Resolves from the state/interaction predicate first. The caller-supplied key
 * is only an integrity assertion, so it cannot select or relabel an appearance.
 */
export function resolveAppearanceRequest(request: BattleConsoleAppearanceRequest): BattleConsoleAppearanceRecord {
  const matches = appearanceRecords.filter((record) => requestMatches(record, request));
  if (matches.length !== 1) {
    throw new Error(`appearance predicate resolved ${matches.length} records`);
  }
  const [resolved] = matches;
  if (!resolved) throw new Error('appearance predicate did not resolve a record');
  if (resolved.key !== request.key) {
    throw new Error(`claimed key ${request.key} does not match resolved appearance ${resolved.key}`);
  }
  return resolved;
}

type MutablePresentationState = {
  -readonly [Key in keyof BattleConsolePresentationState]: BattleConsolePresentationState[Key];
};

function currentFieldValue(state: BattleConsolePresentationState, path: string): unknown {
  return path.split('.').reduce<unknown>((value, segment) => (
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[segment] : undefined
  ), state);
}

function concreteFieldValue(
  state: BattleConsolePresentationState,
  field: string,
  contractValue: unknown,
): unknown {
  if (contractValue !== 'nonempty-string' && typeof contractValue !== 'string') return contractValue;
  const current = currentFieldValue(state, field);
  if (contractValue === 'nonempty-string') {
    if (field === 'commander.portrait') {
      return current ?? { color: '#c74332', loadout: { ...DEFAULT_TANK_LOADOUT } };
    }
    return typeof current === 'string' && current.length > 0 ? current : 'Observed state';
  }
  switch (contractValue) {
    case 'closed:string':
      return typeof current === 'string' && current.length > 0 ? current : 'appearance-id';
    case 'closed:number':
      return typeof current === 'number' ? current : 1;
    case 'closed:WeaponType':
      return state.weapon.type;
    case 'closed:FirstSalvoStep':
      return state.coach.step ?? 'aim';
    case 'closed:SemanticKey':
      return typeof current === 'string' && current.length > 0
        ? current
        : 'command-console-host::settings-trigger';
    case 'closed-immutable-collection':
      return state.armory.items;
    default:
      return contractValue;
  }
}

function setField(
  state: BattleConsolePresentationState,
  field: string,
  value: unknown,
): BattleConsolePresentationState {
  const segments = field.split('.');
  if (segments.length === 1) {
    return { ...state, [field]: value } as BattleConsolePresentationState;
  }
  const [owner, member] = segments;
  const group = state[owner as keyof BattleConsolePresentationState];
  if (!owner || typeof group !== 'object' || group === null || !member) {
    throw new Error(`unsupported appearance state field ${field}`);
  }
  return {
    ...state,
    [owner]: { ...group, [member]: value },
  } as MutablePresentationState as BattleConsolePresentationState;
}

function boundaryValue(record: BattleConsoleAppearanceRecord): number {
  const boundary = (record.statePredicate as { boundary?: string } | undefined)?.boundary;
  const limits: Readonly<Record<string, Readonly<Record<string, number>>>> = {
    'ballistics.angle': { minimum: 0, maximum: 180 },
    'ballistics.power': { minimum: 0, maximum: 100 },
    'ballistics.wind': { minimum: -10, zero: 0, maximum: 10 },
  };
  const value = record.stateField && boundary ? limits[record.stateField]?.[boundary] : undefined;
  if (value === undefined) throw new Error(`unsupported appearance boundary ${record.key}`);
  return value;
}

function projectAffordanceState(
  state: BattleConsolePresentationState,
  record: BattleConsoleAppearanceRecord,
): BattleConsolePresentationState {
  const key = record.affordanceKey;
  const interaction = record.affordanceState;
  let next = state;
  if (interaction === 'submitting') {
    if (key === 'fire') next = setField(next, 'fireControl.submitting', true);
    if (key === 'armory') next = setField(next, 'armory.submitting', true);
  }
  if (interaction === 'disabled') {
    const disabledFields: Readonly<Record<string, readonly [string, unknown]>> = {
      'move-left': ['mobility.canMoveLeft', false],
      'move-right': ['mobility.canMoveRight', false],
      'weapon-next': ['weapon.canCycle', false],
      fire: ['fireControl.ready', false],
      'angle-decrease': ['ballistics.angle', 0],
      'angle-increase': ['ballistics.angle', 180],
      'power-decrease': ['ballistics.power', 0],
      'power-increase': ['ballistics.power', 100],
      armory: ['armory.submitting', true],
      settings: ['settings.open', true],
      'coach-skip': ['coach.briefingOpen', false],
    };
    const entry = key ? disabledFields[key] : undefined;
    if (entry) next = setField(next, entry[0], entry[1]);
  }
  if (interaction === 'focusVisible' && key) {
    next = setField(next, 'focusOwner', `appearance-affordance:${key}`);
  }
  return next;
}

/** Projects a detached presentation snapshot before the same Preact owner rerenders. */
export function projectPresentationStateForAppearance(
  state: BattleConsolePresentationState,
  record: BattleConsoleAppearanceRecord,
): BattleConsolePresentationState {
  if (record.sourceKind === 'affordance') return projectAffordanceState(state, record);
  if (!record.stateField) throw new Error(`appearance ${record.key} has no state field`);
  const value = record.sourceKind === 'boundary'
    ? boundaryValue(record)
    : concreteFieldValue(state, record.stateField, record.stateValue);
  return setField(state, record.stateField, value);
}

function cssColorToHex8(value: string): string {
  const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
  if (channels.length < 3) throw new Error(`unsupported computed color ${value}`);
  const [red = 0, green = 0, blue = 0, cssAlpha = 1] = channels;
  const alpha = channels.length > 3 ? Math.round(cssAlpha * 255) : 255;
  return `#${[red, green, blue, alpha]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

function numericData(element: HTMLElement, key: string): number {
  const value = element.dataset[key];
  const parsed = value === undefined ? Number.NaN : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`invalid appearance datum ${key}`);
  return parsed;
}

/** Reads the committed marker and computed CSS rather than serializing its contract record. */
export function observeRenderedAppearance(element: HTMLElement): BattleConsoleAppearanceObservation {
  const computed = getComputedStyle(element);
  const fontSizePx = Number.parseFloat(computed.fontSize);
  const trackingPx = computed.letterSpacing === 'normal' ? 0 : Number.parseFloat(computed.letterSpacing);
  const fillOrAngle = element.dataset['appearanceFillOrAngle'];
  const fontWeight = element.dataset['appearanceFontWeight'];
  return {
    key: element.dataset['battleConsoleAppearanceKey'] ?? '',
    rgba: cssColorToHex8(computed.color),
    opacity: Number(computed.opacity),
    outlineRgba: cssColorToHex8(computed.outlineColor),
    outlineWidthPx: Number.parseFloat(computed.outlineWidth),
    fontFile: element.dataset['appearanceFontFile'] || null,
    fontStack: element.style.getPropertyValue('--battle-console-appearance-font-stack').trim(),
    fontSizePx,
    fontWeight: fontWeight === 'none' ? null : Number(fontWeight),
    trackingEm: fontSizePx === 0 ? 0 : trackingPx / fontSizePx,
    baseline: element.dataset['appearanceBaseline'] ?? '',
    baselineOffsetPx: numericData(element, 'appearanceBaselineOffsetPx'),
    iconOrGlyph: element.dataset['appearanceIconOrGlyph'] || null,
    fillOrAngle: fillOrAngle ? JSON.parse(fillOrAngle) : null,
    alignment: element.dataset['appearanceAlignment'] ?? '',
    overflow: element.dataset['appearanceOverflow'] ?? '',
    wrapping: element.dataset['appearanceWrapping'] ?? '',
    clearancePx: numericData(element, 'appearanceClearancePx'),
  };
}
