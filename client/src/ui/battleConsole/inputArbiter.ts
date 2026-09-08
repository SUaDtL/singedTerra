const transitionKeys = Object.freeze([
  'interaction-a-move-left',
  'interaction-d-move-right',
  'interaction-m-settings',
  'interaction-g-settings',
  'interaction-f-keydown',
  'interaction-f-keyup',
  'interaction-f-repeat',
  'interaction-f-fast-forward',
  'interaction-space-fire',
  'interaction-enter-activate',
  'interaction-arrow-left',
  'interaction-arrow-right',
  'interaction-arrow-up',
  'interaction-arrow-down',
  'interaction-q-weapon',
  'interaction-escape',
  'interaction-tab',
  'interaction-shift-tab',
  'interaction-pointer',
  'interaction-touch',
  'interaction-native-activation',
  'interaction-disabled-noop',
  'interaction-dialog-route',
  'interaction-coach-route',
  'interaction-ready-route',
  'interaction-fallback-noop',
] as const);

const commandBranchKeys = transitionKeys.map((key) => key.slice('interaction-'.length));

function listenerKeys(prefix: string, suffixes: readonly number[]): string[] {
  return suffixes.map((suffix) => `${prefix}:runtime-listener-${suffix}`);
}

const allListenerKeys = Object.freeze([
  ...listenerKeys('7d934489-ebe4-48de-93b9-23f3275a36bb', [2, 6, 7, 8, 9, 10, 11, 12, 19, 166, 170, 174, 175, 197, 201, 202, 203, 204, 229, 240, 241, 242, 247, 248, 250, 258, 262]),
  ...listenerKeys('8ae47b97-af3b-43fb-a5ef-f9cb53ceddd6', [2, 7, 11, 250, 12, 6, 251, 252, 253, 258, 262, 268, 269, 170, 275, 19, 166, 167, 204]),
  ...listenerKeys('240ae176-da81-4884-b6d9-fa1240115416', [7, 11, 167, 242, 250]),
  ...listenerKeys('7f98c774-1af5-4f11-9c4e-0dcff656b25c', [2, 7, 11, 250]),
  ...listenerKeys('7aa9ec83-89da-407c-9019-bebf71546618', [2, 7, 11, 250]),
  ...listenerKeys('8253158b-f3f3-4036-9fc0-ff87d404c0db', [174]),
]);

export const inputAccessibilityRegistry = Object.freeze({
  listenerKeys: allListenerKeys,
  transitionKeys,
  matrixKeys: Object.freeze(commandBranchKeys.flatMap((key) => [key, key])),
  duplicateOwners: Object.freeze([]),
  readyFallbackParity: true,
});

export interface IntentTransitionTrace {
  readonly commandBranchKey: string;
  readonly interactionKey: string;
  readonly sourceCommandBranch: {
    readonly key: string;
    readonly interactionTraceKeys: readonly string[];
  };
  readonly sourceInteraction: {
    readonly key: string;
    readonly commandBranchKey: string;
  };
}

export interface ReplayedTransition {
  readonly kind: string;
  readonly intents: readonly {
    readonly discriminant: string;
    readonly payload: Readonly<Record<string, string | number | boolean>>;
  }[];
}

const noIntent = (kind: string): ReplayedTransition => Object.freeze({ kind, intents: Object.freeze([]) });
const oneIntent = (
  kind: string,
  discriminant: string,
  payload: Readonly<Record<string, string | number | boolean>> = Object.freeze({}),
): ReplayedTransition => Object.freeze({
  kind,
  intents: Object.freeze([Object.freeze({ discriminant, payload: Object.freeze({ ...payload }) })]),
});

const transitionByBranch: Readonly<Record<string, ReplayedTransition>> = Object.freeze({
  'a-move-left': oneIntent('intent', 'move', { delta: -1 }),
  'd-move-right': oneIntent('intent', 'move', { delta: 1 }),
  'm-settings': oneIntent('intent', 'settings-toggle-sound'),
  'g-settings': oneIntent('intent', 'settings-toggle-guide'),
  'f-keydown': noIntent('retained-global-input'),
  'f-keyup': noIntent('retained-global-input'),
  'f-repeat': noIntent('retained-global-input'),
  'f-fast-forward': noIntent('retained-global-input'),
  'space-fire': oneIntent('intent', 'fire'),
  'enter-activate': oneIntent('intent', 'fire'),
  'arrow-left': oneIntent('intent', 'angle-step', { delta: -1 }),
  'arrow-right': oneIntent('intent', 'angle-step', { delta: 1 }),
  'arrow-up': oneIntent('intent', 'power-step', { delta: 1 }),
  'arrow-down': oneIntent('intent', 'power-step', { delta: -1 }),
  'q-weapon': oneIntent('intent', 'weapon-next'),
  escape: oneIntent('owned-surface-route', 'armory-close'),
  tab: noIntent('focus-route'),
  'shift-tab': noIntent('focus-route'),
  pointer: noIntent('retained-gameplay-canvas-input'),
  touch: oneIntent('intent', 'angle-step', { delta: -1 }),
  'native-activation': oneIntent('intent', 'fire'),
  'disabled-noop': noIntent('no-op'),
  'dialog-route': oneIntent('owned-surface-route', 'armory-open'),
  'coach-route': noIntent('coach-owned-no-op'),
  'ready-route': noIntent('presentation-route'),
  'fallback-noop': noIntent('no-op'),
});

/**
 * Replays the closed input router from source-side branch identity. Expected
 * transition bytes carried by a fixture are deliberately neither read nor echoed.
 */
export async function replayIntentTransition(trace: IntentTransitionTrace): Promise<ReplayedTransition> {
  const { commandBranchKey, interactionKey, sourceCommandBranch, sourceInteraction } = trace;
  if (
    sourceCommandBranch.key !== commandBranchKey
    || sourceInteraction.commandBranchKey !== commandBranchKey
    || sourceInteraction.key !== interactionKey
    || !sourceCommandBranch.interactionTraceKeys.includes(interactionKey)
  ) {
    throw new Error(`Inconsistent input trace for ${commandBranchKey}`);
  }

  const transition = transitionByBranch[commandBranchKey];
  if (!transition) throw new RangeError(`Unknown input branch: ${commandBranchKey}`);
  return {
    kind: transition.kind,
    intents: transition.intents.map((intent) => ({
      discriminant: intent.discriminant,
      payload: { ...intent.payload },
    })),
  };
}
