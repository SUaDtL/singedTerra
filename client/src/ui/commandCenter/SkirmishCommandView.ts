import { createPracticeFieldOrderById, renderFieldOrder } from '../../client/fieldOrder';
import {
  QUICK_OPERATIONS,
  type QuickOperation,
  type QuickOperationId,
} from '../../client/quickOperations';
import { QUICK_DUEL_DEFAULT_ROUNDS } from '../../client/quickDuelLaunch';
import {
  commandCategoryId,
  commandItemId,
  type CommandCategoryContribution,
  type MountedCommandView,
} from './contracts';
import { createPreparationFrame, createPreparationPrimaryAction } from '../PreparationFrame';

export interface ImportedSkirmishChallenge {
  readonly operation: QuickOperation;
  readonly objective: string;
  readonly seed: number;
}

export interface SkirmishCommandContext {
  readonly firstSalvoAvailable: boolean;
  readonly importedChallenge: ImportedSkirmishChallenge | null;
  readonly importedChallengeInvalid: boolean;
  readonly onLaunchQuickOperation: (operationId: QuickOperationId) => void;
  readonly onLaunchImportedChallenge: () => void;
}

type SkirmishSelection =
  | Readonly<{ kind: 'operation'; operation: QuickOperation }>
  | Readonly<{ kind: 'imported-challenge'; challenge: ImportedSkirmishChallenge }>;

const BATTLEFIELD_LABELS = Object.freeze({
  'ember-dusk': 'Ember Dusk',
  'glassstorm-expanse': 'Glassstorm Expanse',
  'obsidian-caldera': 'Obsidian Caldera',
} as const);

const BATTLEFIELD_ART = Object.freeze({
  automatic: 'battlefield-theater-ultrawide-v2.webp',
  'ember-dusk': 'battlefield-theater-ember-dusk-v3.webp',
  'glassstorm-expanse': 'battlefield-theater-glassstorm-expanse-v3.webp',
  'obsidian-caldera': 'battlefield-theater-obsidian-caldera-v3.webp',
} as const);

function battlefieldLabel(value: QuickOperation['settings']['battlefieldWorld']): string {
  return value === undefined ? 'Automatic' : BATTLEFIELD_LABELS[value];
}

function operationFacts(
  operation: QuickOperation,
  seedOverride?: number,
): readonly (readonly [string, string])[] {
  const settings = operation.settings;
  const rounds = settings.rounds ?? QUICK_DUEL_DEFAULT_ROUNDS;
  const facts: Array<readonly [string, string]> = [
    ['Battlefield', battlefieldLabel(settings.battlefieldWorld)],
    ['Rounds', `${rounds} ${rounds === 1 ? 'round' : 'rounds'}`],
    ['Opponent', 'vs CPU'],
  ];
  if (settings.walls === 'wrap') facts.push(['Walls', 'Wrap walls']);
  if (settings.hazards === 'lava') facts.push(['Hazard', 'Lava hazard']);
  if (settings.suddenDeathTurn !== undefined) {
    facts.push(['Pressure', `Sudden death, turn ${settings.suddenDeathTurn}`]);
  }
  if (settings.armsLevel !== undefined) facts.push(['Arsenal', `Arms level ${settings.armsLevel}`]);
  const seed = seedOverride ?? settings.seed;
  if (seed !== undefined) facts.push(['Seed', String(seed)]);
  return facts;
}

function objectiveFor(operation: QuickOperation): string | null {
  const descriptor = operation.practiceObjective;
  if (!descriptor) return null;
  const fieldOrder = createPracticeFieldOrderById(descriptor.fieldOrderId);
  return fieldOrder ? renderFieldOrder(fieldOrder).brief : null;
}

export function createSkirmishCommandView(
  host: HTMLElement,
  initialContext: Readonly<SkirmishCommandContext>,
  selection: SkirmishSelection,
): MountedCommandView<SkirmishCommandContext> {
  const document = host.ownerDocument;
  const listeners = new AbortController();
  let context = initialContext;
  let disposed = false;

  const operation = selection.kind === 'operation'
    ? selection.operation
    : selection.challenge.operation;
  const objective = selection.kind === 'operation'
    ? objectiveFor(operation)
    : selection.challenge.objective;

  const root = document.createElement('article');
  root.className = 'campaign-command skirmish-command';
  root.dataset.skirmishCommandView = '';
  root.dataset.operationId = operation.id;

  const decision = document.createElement('section');
  decision.className = 'campaign-command__decision';
  decision.setAttribute('aria-label', `${operation.title} preparation`);

  const identity = document.createElement('div');
  identity.className = 'campaign-command__identity';
  const kicker = document.createElement('p');
  kicker.className = 'campaign-command__chapter';
  kicker.textContent = selection.kind === 'imported-challenge'
    ? 'Imported seed challenge'
    : operation.id === 'first-salvo' ? 'First Salvo training' : 'Quick operation';
  const title = document.createElement('h2');
  title.className = 'campaign-command__mission';
  title.textContent = operation.title;
  const briefing = document.createElement('p');
  briefing.className = 'campaign-command__save-status';
  briefing.dataset.ui = 'quick-operation-briefing';
  briefing.textContent = operation.briefing;
  identity.append(kicker, title, briefing);

  const projection = document.createElement('figure');
  projection.className = 'campaign-command__scene command-center__battlefield-projection';
  projection.dataset.battlefieldProjection = operation.settings.battlefieldWorld ?? 'automatic';
  const projectionArt = document.createElement('img');
  projectionArt.className = 'campaign-command__scene-backdrop';
  projectionArt.src = `${import.meta.env.BASE_URL}art/${BATTLEFIELD_ART[
    operation.settings.battlefieldWorld ?? 'automatic'
  ]}`;
  projectionArt.alt = '';
  const projectionCaption = document.createElement('figcaption');
  projectionCaption.textContent = `${battlefieldLabel(operation.settings.battlefieldWorld)} field projection`;
  projection.append(projectionArt, projectionCaption);

  if (selection.kind === 'imported-challenge') {
    root.dataset.ui = 'seed-challenge';
    kicker.dataset.ui = 'seed-challenge-kicker';
    kicker.textContent = 'SEED CHALLENGE';
    title.dataset.ui = 'seed-challenge-operation';
  }

  if (objective) {
    const objectivePanel = document.createElement('section');
    objectivePanel.className = 'campaign-command__objective-panel';
    const objectiveLabel = document.createElement('p');
    objectiveLabel.className = 'campaign-command__fact-label';
    objectiveLabel.textContent = 'Field order';
    const objectiveCopy = document.createElement('p');
    objectiveCopy.className = 'campaign-command__objective';
    objectiveCopy.dataset.ui = 'quick-operation-objective';
    if (operation.practiceObjective) {
      objectiveCopy.dataset.contentVersion = String(operation.practiceObjective.contentVersion);
      objectiveCopy.dataset.fieldOrderId = operation.practiceObjective.fieldOrderId;
    }
    objectiveCopy.textContent = objective;
    if (selection.kind === 'imported-challenge') {
      objectiveCopy.dataset.ui = 'seed-challenge-objective';
    }
    objectivePanel.append(objectiveLabel, objectiveCopy);
    decision.append(projection, objectivePanel);
  } else {
    decision.append(projection);
  }

  const factsPanel = document.createElement('section');
  factsPanel.className = 'campaign-command__loadout skirmish-command__facts';
  const factsTitle = document.createElement('h3');
  factsTitle.className = 'campaign-command__loadout-title';
  factsTitle.textContent = 'Operation facts';
  const facts = document.createElement('dl');
  facts.className = 'campaign-command__equipment';
  const seedOverride = selection.kind === 'imported-challenge' ? selection.challenge.seed : undefined;
  for (const [term, value] of operationFacts(operation, seedOverride)) {
    const group = document.createElement('div');
    group.dataset.skirmishFact = term;
    const label = document.createElement('dt');
    label.textContent = term;
    const reading = document.createElement('dd');
    reading.textContent = value;
    group.append(label, reading);
    facts.append(group);
  }
  factsPanel.append(factsTitle, facts);

  if (selection.kind === 'imported-challenge') {
    const seed = facts.querySelector<HTMLElement>('[data-skirmish-fact="Seed"] dd');
    if (seed) {
      seed.dataset.ui = 'seed-challenge-seed';
      seed.textContent = `Seed · ${selection.challenge.seed}`;
    }
  }

  decision.append(factsPanel);

  const invalidChallenge = document.createElement('p');
  invalidChallenge.dataset.ui = 'seed-challenge-error';
  invalidChallenge.setAttribute('role', 'alert');
  invalidChallenge.textContent = 'This seed challenge is invalid or no longer supported.';
  invalidChallenge.hidden = !context.importedChallengeInvalid;

  const launch = createPreparationPrimaryAction(document, {
    label: selection.kind === 'imported-challenge'
      ? 'Start challenge vs CPU'
      : `Start ${operation.title}`,
    className: 'skirmish-command__primary-action',
  });
  launch.dataset.commandPrimary = '';
  launch.addEventListener('click', () => {
    if (disposed) return;
    if (selection.kind === 'imported-challenge') context.onLaunchImportedChallenge();
    else context.onLaunchQuickOperation(operation.id);
  }, { signal: listeners.signal });
  createPreparationFrame(document, {
    root,
    headingContent: identity,
    body: [decision, invalidChallenge],
    dockLabel: 'Launch order',
    dockStatus: selection.kind === 'imported-challenge'
      ? `Validated seed ${selection.challenge.seed}`
      : `${battlefieldLabel(operation.settings.battlefieldWorld)} · ${operationFacts(operation).find(([label]) => label === 'Rounds')?.[1] ?? 'Standard rounds'}`,
    primaryAction: launch,
    dockClassName: 'campaign-command__actions',
  });
  host.replaceChildren(root);

  return {
    update: (nextContext) => {
      if (disposed) return;
      context = nextContext;
      invalidChallenge.hidden = !context.importedChallengeInvalid;
    },
    focusDefault: () => {
      if (!disposed) launch.focus();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      listeners.abort();
      root.remove();
    },
  };
}

export function createSkirmishCommandCategoryContribution<
  Context extends SkirmishCommandContext,
>(): CommandCategoryContribution<Context> {
  return {
    id: commandCategoryId('skirmishes'),
    label: 'Skirmishes',
    icon: 'skirmishes',
    order: 20,
    availability: () => true,
    provideItems: (context) => [
      ...QUICK_OPERATIONS.map((operation) => ({
        id: commandItemId(operation.id),
        summary: {
          label: operation.title,
          description: operation.briefing,
        },
        availability: (itemContext: Readonly<Context>) => (
          operation.id !== 'first-salvo' || itemContext.firstSalvoAvailable
        ),
        createView: (viewHost: HTMLElement, viewContext: Readonly<Context>) => (
          createSkirmishCommandView(viewHost, viewContext, { kind: 'operation', operation })
        ),
      })),
      ...(context.importedChallenge ? [{
        id: commandItemId('imported-challenge'),
        summary: {
          label: 'Imported Challenge',
          description: `${context.importedChallenge.operation.title} at seed ${context.importedChallenge.seed}.`,
        },
        availability: (itemContext: Readonly<Context>) => itemContext.importedChallenge !== null,
        createView: (viewHost: HTMLElement, viewContext: Readonly<Context>) => (
          createSkirmishCommandView(viewHost, viewContext, {
            kind: 'imported-challenge',
            challenge: context.importedChallenge!,
          })
        ),
      }] : []),
    ],
  };
}
