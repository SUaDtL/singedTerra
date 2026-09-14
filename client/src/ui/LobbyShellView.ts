import { createPracticeFieldOrderById, renderFieldOrder } from '../client/fieldOrder';
import type { PracticeObjectiveDescriptor } from '../client/quickOperations';
import type { GameOptions } from '@shared/types/GameOptions';
import { QUICK_DUEL_DEFAULT_ROUNDS } from '../client/quickDuelLaunch';
import { makeHudIcon } from './hudIcons';

export type LobbyPrimaryTab = 'hotseat' | 'online';

export type LobbySeedChallengePresentation =
  | { readonly status: 'invalid' }
  | {
    readonly status: 'valid';
    readonly title: string;
    readonly objective: string;
    readonly seed: number;
  };

const MODE_PANEL_ID = 'lobby-mode-panel';

const MODE_CONTEXT: Record<LobbyPrimaryTab, { title: string; description: string }> = {
  hotseat: {
    title: 'Hot Seat',
    description: 'Set your crew, then start a shared-screen match.',
  },
  online: {
    title: 'Play Online',
    description: 'Create a room, join by code, or browse public games.',
  },
};

export interface LobbyShellViewOptions {
  activeTab: LobbyPrimaryTab;
  surface: 'chooser' | 'preparation';
  showBack: boolean;
  rejoinAvailable: boolean;
  account: HTMLElement | null;
  vehiclePreview?: HTMLElement;
  content?: HTMLElement;
  controls?: HTMLElement;
  firstSalvoPreferenceUnseen: boolean;
  onTabChange: (tab: LobbyPrimaryTab) => void;
  quickOperations?: readonly {
    readonly id: string;
    readonly title: string;
    readonly briefing: string;
    readonly settings?: Readonly<Pick<GameOptions,
      'walls' | 'battlefieldWorld' | 'hazards' | 'rounds' | 'suddenDeathTurn' | 'armsLevel' | 'seed'>>;
    readonly practiceObjective?: PracticeObjectiveDescriptor;
  }[];
  seedChallenge?: LobbySeedChallengePresentation;
  onSeedChallenge?: () => void;
  onQuickDuel: (operationId: string) => void;
  onRejoin: () => void;
  onBack: () => void;
  listenerSignal?: AbortSignal;
}

export function buildLobbyOnlineView(content: HTMLElement): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.append(content);
  return wrapper;
}

const BATTLEFIELD_PRESENTATION = {
  'ember-dusk': {
    label: 'Ember Dusk',
    asset: 'art/battlefield-theater-ember-dusk-v3.webp',
  },
  'glassstorm-expanse': {
    label: 'Glassstorm Expanse',
    asset: 'art/battlefield-theater-glassstorm-expanse-v3.webp',
  },
  'obsidian-caldera': {
    label: 'Obsidian Caldera',
    asset: 'art/battlefield-theater-obsidian-caldera-v3.webp',
  },
} as const;

type PresentedBattlefield = keyof typeof BATTLEFIELD_PRESENTATION;

function presentedBattlefield(value: unknown): PresentedBattlefield {
  return value === 'glassstorm-expanse' || value === 'obsidian-caldera'
    ? value
    : 'ember-dusk';
}

function operationFacts(operation: NonNullable<LobbyShellViewOptions['quickOperations']>[number]):
readonly [string, string][] {
  const settings = operation.settings ?? {};
  const world = BATTLEFIELD_PRESENTATION[presentedBattlefield(settings.battlefieldWorld)];
  const facts: [string, string][] = [
    ['Battlefield', settings.battlefieldWorld === undefined ? 'Automatic' : world.label],
    ['Rounds', `${settings.rounds ?? QUICK_DUEL_DEFAULT_ROUNDS} rounds`],
    ['Opponent', 'vs CPU'],
  ];
  if (settings.walls === 'wrap') facts.push(['Walls', 'Wrap walls']);
  if (settings.hazards === 'lava') facts.push(['Hazard', 'Lava hazard']);
  if (settings.suddenDeathTurn !== undefined) {
    facts.push(['Pressure', `Sudden death · Turn ${settings.suddenDeathTurn}`]);
  }
  if (settings.armsLevel !== undefined) facts.push(['Arsenal', `Arms level ${settings.armsLevel}`]);
  if (settings.seed !== undefined) facts.push(['Seed', `Seed ${settings.seed}`]);
  return facts;
}

export function buildLobbyShellView(options: LobbyShellViewOptions): HTMLElement {
  const card = document.createElement('div');
  card.className = 'lobby-card';

  const deployment = document.createElement('main');
  deployment.className = 'lobby-deployment';
  deployment.setAttribute('aria-label', 'Deployment preparation');

  const title = document.createElement('h1');
  title.textContent = 'singedTerra';
  const masthead = document.createElement('header');
  masthead.className = 'lobby-deployment__masthead';
  const commandHeader = document.createElement('div');
  commandHeader.className = 'lobby-command-header';
  commandHeader.setAttribute('aria-label', 'Pre-game command preparation');
  const commandKicker = document.createElement('h2');
  commandKicker.className = 'lobby-command-header__kicker';
  commandKicker.textContent = 'COMMAND PREPARATION';
  commandHeader.append(commandKicker);
  masthead.append(title, commandHeader);
  if (options.account) masthead.append(options.account);

  if (options.rejoinAvailable) {
    const banner = document.createElement('div');
    banner.className = 'lobby-rejoin-banner';

    const text = document.createElement('span');
    text.className = 'lobby-rejoin-text';
    text.textContent = 'You have a game in progress.';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lobby-btn primary';
    button.textContent = 'Rejoin your game';
    button.addEventListener('click', () => { options.onRejoin(); }, { signal: options.listenerSignal });
    banner.append(text, button);
    masthead.append(banner);
  }

  if (options.surface === 'chooser') {
    const chooser = document.createElement('nav');
    chooser.className = 'lobby-deployment-chooser';
    chooser.setAttribute('aria-label', 'Choose deployment');

    const choice = (
      label: string,
      className: string,
      onClick: () => void,
    ): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.textContent = label;
      button.setAttribute('aria-label', label);
      button.addEventListener('click', onClick, { signal: options.listenerSignal });
      return button;
    };

    const addRailGlyph = (
      button: HTMLButtonElement,
      glyph: 'quick' | 'local' | 'online',
    ): HTMLButtonElement => {
      const decoration = document.createElement('span');
      decoration.className = `lobby-deployment-rail__glyph lobby-deployment-rail__glyph--${glyph}`;
      decoration.setAttribute('aria-hidden', 'true');
      button.prepend(decoration);
      return button;
    };

    const seedChallenge = options.seedChallenge;
    if (seedChallenge) {
      const callout = document.createElement('section');
      callout.className = 'lobby-seed-challenge';
      callout.dataset.ui = 'seed-challenge';
      if (seedChallenge.status === 'invalid') {
        callout.dataset.ui = 'seed-challenge-error';
        callout.setAttribute('role', 'alert');
        callout.textContent = 'This seed challenge is invalid or no longer supported.';
      } else {
        const kicker = document.createElement('span');
        kicker.dataset.ui = 'seed-challenge-kicker';
        kicker.textContent = 'SEED CHALLENGE';
        const operation = document.createElement('h2');
        operation.dataset.ui = 'seed-challenge-operation';
        operation.textContent = seedChallenge.title;
        const objective = document.createElement('p');
        objective.dataset.ui = 'seed-challenge-objective';
        objective.textContent = seedChallenge.objective;
        const seed = document.createElement('p');
        seed.dataset.ui = 'seed-challenge-seed';
        seed.textContent = `Seed · ${seedChallenge.seed}`;
        const start = choice(
          'Start challenge vs CPU',
          options.rejoinAvailable ? 'lobby-btn lobby-deployment-choice--secondary' : 'lobby-btn primary',
          () => {
          options.onSeedChallenge?.();
          },
        );
        callout.append(kicker, operation, objective, seed, start);
      }
      chooser.append(callout);
    }

    const operations = options.quickOperations ?? [{ id: 'standard', title: 'Standard Duel', briefing: '' }];
    const firstSalvo = operations.find((operation) => operation.id === 'first-salvo');
    const ordinaryOperations = operations.filter((operation) => operation.id !== 'first-salvo');
    const showFirstSalvo = options.firstSalvoPreferenceUnseen
      && !options.rejoinAvailable
      && seedChallenge?.status !== 'valid'
      && firstSalvo !== undefined;
    let selectedOperation = ordinaryOperations[0] ?? operations[0]!;
    const operationField = document.createElement('section');
    operationField.className = 'lobby-quick-operation';
    operationField.dataset.ui = 'quick-operation';
    operationField.setAttribute('aria-label', 'Quick operations');
    const operationKicker = document.createElement('span');
    operationKicker.className = 'lobby-quick-operation__kicker';
    operationKicker.textContent = 'QUICK OPERATIONS';
    const operationTitle = document.createElement('h2');
    operationTitle.textContent = 'Choose a battlefield condition';
    const operationCards = document.createElement('div');
    operationCards.className = 'lobby-quick-operation__cards';
    const operationBriefing = document.createElement('p');
    operationBriefing.className = 'lobby-quick-operation__briefing';
    operationBriefing.dataset.ui = 'quick-operation-briefing';
    const operationObjective = document.createElement('p');
    operationObjective.className = 'lobby-quick-operation__briefing';
    operationObjective.dataset.ui = 'quick-operation-objective';

    const operationPreview = document.createElement('section');
    operationPreview.className = 'lobby-operation-preview';
    operationPreview.dataset.ui = 'battlefield-preview';
    const previewHeader = document.createElement('span');
    previewHeader.className = 'lobby-operation-preview__header';
    previewHeader.textContent = 'BATTLEFIELD PREVIEW';
    const previewViewport = document.createElement('div');
    previewViewport.className = 'lobby-operation-preview__viewport';
    const previewImage = document.createElement('img');
    previewImage.className = 'lobby-operation-preview__image';
    previewImage.alt = '';
    const illustrationNote = document.createElement('span');
    illustrationNote.className = 'lobby-operation-preview__illustration-note';
    illustrationNote.dataset.ui = 'battlefield-illustration-note';
    illustrationNote.textContent = 'Illustrative backdrop';
    previewViewport.append(previewImage, illustrationNote);
    const previewReadout = document.createElement('div');
    previewReadout.className = 'lobby-operation-preview__readout';
    previewReadout.setAttribute('aria-live', 'polite');
    previewReadout.tabIndex = 0;
    previewReadout.setAttribute('role', 'region');
    previewReadout.setAttribute('aria-label', 'Selected operation details');
    const previewTitle = document.createElement('h2');
    previewTitle.className = 'lobby-operation-preview__title';
    previewTitle.dataset.ui = 'battlefield-preview-title';
    operationBriefing.classList.add('lobby-operation-preview__briefing');
    const previewFacts = document.createElement('dl');
    previewFacts.className = 'lobby-operation-preview__facts';
    previewFacts.dataset.ui = 'battlefield-preview-facts';
    previewReadout.append(previewTitle, operationBriefing, operationObjective, previewFacts);
    operationPreview.append(previewHeader, previewViewport, previewReadout);

    const cardButtons: HTMLButtonElement[] = [];
    const selectOperation = (operation: typeof selectedOperation): void => {
      selectedOperation = operation;
      operationBriefing.textContent = operation.briefing;
      previewTitle.textContent = operation.title;
      const worldId = presentedBattlefield(operation.settings?.battlefieldWorld);
      const world = BATTLEFIELD_PRESENTATION[worldId];
      operationPreview.dataset['battlefieldWorld'] = operation.settings?.battlefieldWorld ?? 'automatic';
      illustrationNote.hidden = operation.settings?.battlefieldWorld !== undefined;
      operationPreview.setAttribute('aria-label', `Battlefield preview: ${operation.title}`);
      previewImage.src = `${import.meta.env.BASE_URL}${world.asset}`;
      const objective = operation.practiceObjective;
      const fieldOrder = objective ? createPracticeFieldOrderById(objective.fieldOrderId) : null;
      operationObjective.hidden = fieldOrder === null;
      operationObjective.textContent = fieldOrder === null ? '' : renderFieldOrder(fieldOrder).brief;
      if (objective && fieldOrder) {
        operationObjective.dataset['contentVersion'] = String(objective.contentVersion);
        operationObjective.dataset['fieldOrderId'] = objective.fieldOrderId;
      } else {
        delete operationObjective.dataset['contentVersion'];
        delete operationObjective.dataset['fieldOrderId'];
      }
      previewFacts.replaceChildren(...operationFacts(operation).map(([term, value]) => {
        const group = document.createElement('div');
        const label = document.createElement('dt');
        label.textContent = term;
        const reading = document.createElement('dd');
        reading.textContent = value;
        group.append(label, reading);
        return group;
      }));
      for (const card of cardButtons) {
        card.setAttribute('aria-pressed', String(card.dataset['operationId'] === operation.id));
      }
    };
    for (const operation of ordinaryOperations) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'lobby-quick-operation__card';
      card.dataset['operationId'] = operation.id;
      card.dataset['battlefieldWorld'] = presentedBattlefield(operation.settings?.battlefieldWorld);
      card.setAttribute('aria-pressed', 'false');
      const cardTitle = document.createElement('span');
      cardTitle.className = 'lobby-quick-operation__card-title';
      cardTitle.textContent = operation.title;
      const cardBriefing = document.createElement('span');
      cardBriefing.className = 'lobby-quick-operation__card-briefing';
      cardBriefing.textContent = operation.briefing;
      card.append(cardTitle, cardBriefing);
      card.addEventListener('click', () => { selectOperation(operation); }, { signal: options.listenerSignal });
      cardButtons.push(card);
      operationCards.append(card);
    }
    selectOperation(selectedOperation);
    operationField.append(operationKicker, operationTitle, operationCards);
    const deploymentConsole = document.createElement('div');
    deploymentConsole.className = 'lobby-deployment-console';
    deploymentConsole.append(operationField, operationPreview);
    const ordinaryQuickDuel = choice(
      'Quick Duel vs CPU',
      options.rejoinAvailable || showFirstSalvo || seedChallenge?.status === 'valid'
        ? 'lobby-btn lobby-deployment-choice--secondary'
        : 'lobby-btn primary',
      () => { options.onQuickDuel(selectedOperation.id); },
    );
    const localBattle = choice(
        'Local Battle',
        'lobby-btn lobby-deployment-choice--secondary',
        () => { options.onTabChange('hotseat'); },
      );
    const playOnline = choice(
        'Play Online',
        'lobby-btn lobby-deployment-choice--secondary',
        () => { options.onTabChange('online'); },
      );
    addRailGlyph(ordinaryQuickDuel, 'quick');
    addRailGlyph(localBattle, 'local');
    addRailGlyph(playOnline, 'online');
    const deploymentRail = document.createElement('div');
    deploymentRail.className = 'lobby-deployment-rail';
    const readiness = document.createElement('div');
    readiness.className = 'lobby-deployment-rail__status';
    readiness.setAttribute('role', 'status');
    readiness.innerHTML = '<strong>READY</strong><span>TO DEPLOY</span>';
    deploymentRail.append(ordinaryQuickDuel, localBattle, playOnline, readiness);
    if (showFirstSalvo) {
      const introduction = document.createElement('section');
      introduction.className = 'lobby-first-salvo';
      introduction.setAttribute('aria-label', 'First Salvo');
      const introductionTitle = document.createElement('h2');
      introductionTitle.textContent = firstSalvo.title;
      const introductionBriefing = document.createElement('p');
      introductionBriefing.textContent = 'One round against CPU. Aim, set power, and fire.';
      introduction.append(introductionTitle, introductionBriefing);

      const alternatives = document.createElement('details');
      alternatives.dataset.ui = 'other-quick-duels';
      const summary = document.createElement('summary');
      summary.textContent = 'Choose another Quick Duel';
      alternatives.append(summary, deploymentConsole, ordinaryQuickDuel);

      const firstSalvoRail = deploymentRail.cloneNode(false) as HTMLDivElement;
      firstSalvoRail.append(
        addRailGlyph(
          choice('Start First Salvo', 'lobby-btn primary', () => { options.onQuickDuel(firstSalvo.id); }),
          'quick',
        ),
        localBattle,
        playOnline,
        readiness,
      );

      chooser.append(
        introduction,
        alternatives,
        firstSalvoRail,
      );
    } else {
      chooser.append(deploymentConsole, deploymentRail);
    }
    deployment.append(masthead, chooser);
    card.append(deployment);
    return card;
  }

  const { content, vehiclePreview, controls } = options;
  if (!content || !vehiclePreview || !controls) {
    throw new Error('Lobby preparation content is required for the preparation surface');
  }

  const back = options.showBack ? document.createElement('button') : null;
  if (back) {
    back.type = 'button';
    back.className = 'lobby-btn lobby-deployment__back';
    back.append(makeHudIcon('left', 18), 'Back to deployment choices');
    back.setAttribute('aria-label', 'Back to deployment choices');
    back.addEventListener('click', () => { options.onBack(); }, { signal: options.listenerSignal });
  }

  const context = document.createElement('section');
  context.className = 'lobby-mode-context lobby-deployment__mission-brief';
  const contextTitle = document.createElement('h2');
  contextTitle.textContent = MODE_CONTEXT[options.activeTab].title;
  const contextDescription = document.createElement('p');
  contextDescription.textContent = MODE_CONTEXT[options.activeTab].description;
  context.append(contextTitle, contextDescription);
  const panel = document.createElement('section');
  panel.className = 'lobby-mode-panel';
  panel.id = MODE_PANEL_ID;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-label', `${MODE_CONTEXT[options.activeTab].title} preparation`);
  panel.append(content);
  deployment.append(masthead);
  if (back) deployment.append(back);
  deployment.append(context, panel, vehiclePreview, controls);
  card.append(deployment);
  return card;
}
