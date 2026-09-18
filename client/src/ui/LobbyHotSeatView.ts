import { renderFieldOrder, type FieldOrder } from '../client/fieldOrder';
import { buildLobbyPreparationSection } from './LobbyPreparationSection';
import type { VerifiedChallengeSessionState } from '../client/VerifiedChallengeSession';
import type { VerifiedCareerState } from '../client/verifiedCareer';

export type LobbyVerifiedSurface = 'deployment' | 'challenge';

export interface LobbyLocalBattleViewOptions {
  minPlayers: number;
  maxPlayers: number;
  playerCount: number;
  playerRows: readonly HTMLElement[];
  vehicleInspection: HTMLElement;
  advanced: HTMLElement;
  validationMessage: string | null;
  onPlayerCountChange: (count: number) => void;
  onStart: () => void;
  listenerSignal?: AbortSignal;
}

export interface LobbyVerifiedOperationsViewOptions {
  verifiedDeployment: LobbyHotSeatVerifiedDeploymentOptions | null;
  verifiedChallenge?: LobbyHotSeatVerifiedChallengeOptions | null;
  verifiedSurface?: LobbyVerifiedSurface;
  onVerifiedSurfaceChange?: (surface: LobbyVerifiedSurface, restoreFocus: boolean) => void;
  listenerSignal?: AbortSignal;
}

export interface LobbyHotSeatVerifiedDeploymentOptions {
  action: 'start' | 'resume';
  commanderName: string;
  busy: boolean;
  message: string | null;
  abandonIntent: boolean;
  fieldOrder: FieldOrder | null;
  onLaunch: () => void;
  onRequestAbandon: () => void;
  onConfirmAbandon: () => void;
  onCancelAbandon: () => void;
}

export interface LobbyHotSeatVerifiedChallengeOptions {
  readonly accountId: string;
  readonly busy: boolean;
  readonly retryDelaySeconds?: number;
  readonly state: VerifiedChallengeSessionState;
  readonly career: VerifiedCareerState;
  readonly onLaunch: () => void;
  readonly onRetry: () => void;
  readonly onAbandon: () => void;
}

function verifiedCareerCopy(options: LobbyHotSeatVerifiedChallengeOptions): string {
  const career = options.career;
  if (career.accountId !== options.accountId) {
    return 'Verified Career unavailable. No totals are estimated.';
  }
  if (career.status === 'loading') return 'Loading Verified Career…';
  if (career.status === 'unavailable') return 'Verified Career unavailable. No totals are estimated.';
  const medal = career.career.challenge.medals.some(
    (entry) => entry.medalId === 'crosswind-qualification',
  );
  return `Verified Career · ${career.career.rank.current.code} ${career.career.rank.current.title}`
    + ` · Level ${career.career.level} · ${career.career.totalXp} XP`
    + ` · Crosswind Qualification medal ${medal ? 'earned' : 'not yet earned'}`;
}

function verifiedChallengeCopy(
  state: VerifiedChallengeSessionState,
  retryDelaySeconds = 0,
): string {
  const cooldown = retryDelaySeconds > 0 ? ` Retry available in ${retryDelaySeconds} seconds.` : '';
  if (state.status === 'idle') return 'Availability is checked only when you choose to start.';
  if (state.status === 'starting') return 'Checking verified backend availability…';
  if (state.status === 'start-unavailable') {
    if (state.reason === 'disabled') {
      return 'Trial starts are currently disabled by the verified backend. No reward was granted.';
    }
    if (state.reason === 'busy') return `Verification capacity is busy. No reward was granted.${cooldown}`;
    if (state.reason === 'rate-limited') return `Availability checks are limited.${cooldown || ' Try again shortly.'}`;
    if (state.reason === 'unauthorized') return 'Sign in again before checking trial availability.';
    if (state.reason === 'incompatible') return 'This saved trial is incompatible with the current client.';
    if (state.reason === 'timeout') return 'The availability check timed out. Check again to recover any active trial.';
    return 'Trial availability could not be confirmed. Check again to recover any active trial.';
  }
  if (state.status === 'active') {
    return `Qualification active · ${state.transcript.length} of 3 human salvos recorded.`;
  }
  if (state.status === 'completion-pending') return 'Verification pending. Reward has not been confirmed yet.';
  if (state.status === 'retryable') {
    return `Verification needs another server check.${cooldown}`;
  }
  if (state.status === 'completed') {
    if (state.receipt.disposition === 'awarded') {
      return 'First clear verified: medal earned and +200 XP awarded.';
    }
    if (state.receipt.disposition === 'already_owned') {
      return 'Clear verified: medal already earned and +0 XP awarded.';
    }
    return 'Attempt verified without a clear. No reward was granted.';
  }
  if (state.status === 'expired') return 'This qualification expired. No reward was granted.';
  if (state.status === 'abandoned') return 'This qualification was abandoned. No reward was granted.';
  if (state.status === 'invalid') return 'This saved qualification cannot be resumed.';
  return 'Verification became unavailable. No reward was granted.';
}

function buildVerifiedChallenge(
  options: LobbyHotSeatVerifiedChallengeOptions,
  listenerSignal?: AbortSignal,
): HTMLElement {
  const challenge = document.createElement('section');
  challenge.className = 'lobby-verified-challenge';
  challenge.dataset.verifiedChallenge = 'crosswind-qualification';
  challenge.setAttribute('aria-label', 'Crosswind Qualification verified trial');
  const heading = document.createElement('div');
  heading.className = 'lobby-verified-challenge__heading';
  const title = document.createElement('h3');
  title.textContent = 'Crosswind Qualification';
  const badge = document.createElement('span');
  badge.textContent = 'Verified trial · availability checked on request';
  heading.append(title, badge);
  const rules = document.createElement('ul');
  rules.className = 'lobby-verified-challenge__rules';
  for (const rule of [
    'Seed 42',
    'Wrap walls',
    'Baby Missile only',
    '3 human salvos maximum',
    'First clear: Crosswind Qualification medal + 200 Verified Career XP',
    'Repeat clears: +0 XP',
  ]) {
    const item = document.createElement('li');
    item.textContent = rule;
    rules.append(item);
  }
  const career = document.createElement('p');
  career.className = 'lobby-verified-challenge__career';
  career.setAttribute('role', 'status');
  career.setAttribute('aria-live', 'polite');
  career.textContent = verifiedCareerCopy(options);
  const message = document.createElement('p');
  message.className = 'lobby-verified-challenge__message';
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  message.textContent = verifiedChallengeCopy(options.state, options.retryDelaySeconds);
  const actions = document.createElement('div');
  actions.className = 'lobby-verified-challenge__actions';
  const primary = document.createElement('button');
  primary.type = 'button';
  primary.className = 'lobby-btn primary lobby-verified-challenge__launch';
  primary.disabled = options.busy || options.state.status === 'starting'
    || options.state.status === 'completion-pending' || (options.retryDelaySeconds ?? 0) > 0;
  if (options.state.status === 'active') {
    primary.textContent = 'Enter qualification';
    primary.addEventListener('click', options.onLaunch, { signal: listenerSignal });
  } else if (options.state.status === 'retryable') {
    primary.textContent = options.state.retryIntent === 'complete' ? 'Retry verification' : 'Retry status check';
    primary.addEventListener('click', options.onRetry, { signal: listenerSignal });
  } else if (options.state.status === 'start-unavailable') {
    primary.textContent = 'Check availability again';
    primary.addEventListener('click', options.onLaunch, { signal: listenerSignal });
  } else if (options.state.status === 'completed') {
    primary.textContent = 'Start another qualification';
    primary.addEventListener('click', options.onLaunch, { signal: listenerSignal });
  } else if (options.state.status === 'starting') {
    primary.textContent = 'Checking availability…';
  } else if (options.state.status === 'completion-pending') {
    primary.textContent = 'Verification pending';
  } else {
    primary.textContent = 'Check availability and start';
    primary.addEventListener('click', options.onLaunch, { signal: listenerSignal });
  }
  actions.append(primary);
  if (options.state.status === 'active' || options.state.status === 'retryable') {
    const abandon = document.createElement('button');
    abandon.type = 'button';
    abandon.className = 'lobby-btn secondary lobby-verified-challenge__abandon';
    abandon.textContent = 'Abandon qualification';
    abandon.disabled = options.busy;
    abandon.addEventListener('click', options.onAbandon, { signal: listenerSignal });
    actions.append(abandon);
  }
  challenge.append(heading, rules, career, message, actions);
  return challenge;
}

/** Refresh only timer-owned presentation; keep controls, focus and listeners mounted. */
export function updateVerifiedChallengeCountdown(
  root: HTMLElement,
  state: VerifiedChallengeSessionState,
  retryDelaySeconds: number,
  busy: boolean,
): void {
  const message = root.querySelector<HTMLElement>('.lobby-verified-challenge__message');
  const primary = root.querySelector<HTMLButtonElement>('.lobby-verified-challenge__launch');
  if (message) message.textContent = verifiedChallengeCopy(state, retryDelaySeconds);
  if (primary) primary.disabled = busy || state.status === 'starting'
    || state.status === 'completion-pending' || retryDelaySeconds > 0;
}

function buildVerifiedSelector(
  selected: LobbyVerifiedSurface,
  onChange: ((surface: LobbyVerifiedSurface, restoreFocus: boolean) => void) | undefined,
  listenerSignal?: AbortSignal,
): HTMLElement {
  const selector = document.createElement('div');
  selector.className = 'lobby-verified-selector';
  selector.setAttribute('role', 'tablist');
  selector.setAttribute('aria-label', 'Verified operation');
  const choices = [
    { surface: 'deployment' as const, label: 'Deployment orders' },
    { surface: 'challenge' as const, label: 'Crosswind Qualification' },
  ];
  for (const choice of choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lobby-verified-selector__choice';
    button.id = `lobby-verified-choice-${choice.surface}`;
    button.dataset.verifiedSurface = choice.surface;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', 'lobby-verified-operation-panel');
    button.setAttribute('aria-selected', String(choice.surface === selected));
    button.tabIndex = choice.surface === selected ? 0 : -1;
    button.textContent = choice.label;
    button.addEventListener('click', () => onChange?.(choice.surface, true), { signal: listenerSignal });
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      onChange?.(choice.surface === 'deployment' ? 'challenge' : 'deployment', true);
    }, { signal: listenerSignal });
    selector.append(button);
  }
  return selector;
}

function buildCommanderDossier(fieldOrder: FieldOrder | null): HTMLElement | null {
  if (fieldOrder === null) return null;
  const dossier = document.createElement('section');
  dossier.className = 'lobby-verified-deployment__dossier';
  dossier.setAttribute('aria-label', 'Commander dossier');
  const title = document.createElement('h4');
  title.textContent = 'Commander dossier';
  const order = document.createElement('p');
  order.textContent = renderFieldOrder(fieldOrder).brief;
  dossier.append(title, order);
  return dossier;
}

function buildVerifiedDeployment(
  options: LobbyHotSeatVerifiedDeploymentOptions,
  includeFieldOrderDossier = true,
  listenerSignal?: AbortSignal,
): HTMLElement {
  const verified = document.createElement('section');
  verified.className = 'lobby-verified-deployment';
  verified.setAttribute('aria-label', 'Verified deployment');

  const title = document.createElement('h3');
  title.textContent = 'Verified deployment';
  const matchup = document.createElement('p');
  matchup.className = 'lobby-verified-deployment__matchup';
  matchup.textContent = `Commander ${options.commanderName} versus deterministic CPU`;
  const rules = document.createElement('ul');
  rules.className = 'lobby-verified-deployment__rules';
  for (const rule of [
    'Baby Missile only',
    '6 human / 6 CPU salvos maximum',
    'Fixed battlefield rules',
    'Verified XP stakes',
    '30-minute deadline',
  ]) {
    const item = document.createElement('li');
    item.textContent = rule;
    rules.append(item);
  }
  const dossier = includeFieldOrderDossier ? buildCommanderDossier(options.fieldOrder) : null;
  const message = document.createElement('p');
  message.className = 'lobby-verified-deployment__message';
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  message.textContent = options.message ?? '';
  message.hidden = options.message === null;

  const actions = document.createElement('div');
  actions.className = 'lobby-verified-deployment__actions';
  const launch = document.createElement('button');
  launch.type = 'button';
  launch.className = 'lobby-btn primary lobby-verified-deployment__launch';
  launch.textContent = options.busy
    ? 'Verified deployment busy'
    : options.action === 'resume'
      ? 'Resume verified deployment'
      : 'Start verified deployment';
  launch.disabled = options.busy;
  launch.addEventListener('click', options.onLaunch, { signal: listenerSignal });
  actions.append(launch);

  if (options.action === 'resume') {
    const abandon = document.createElement('button');
    abandon.type = 'button';
    abandon.className = 'lobby-btn secondary lobby-verified-deployment__abandon';
    abandon.textContent = 'Abandon verified deployment';
    abandon.disabled = options.busy;
    abandon.addEventListener('click', options.onRequestAbandon, { signal: listenerSignal });
    actions.append(abandon);

    const confirmation = document.createElement('div');
    confirmation.className = 'lobby-verified-deployment__confirm';
    confirmation.setAttribute('role', 'alertdialog');
    confirmation.setAttribute('aria-label', 'Confirm abandon verified deployment');
    confirmation.hidden = !options.abandonIntent;
    const warning = document.createElement('p');
    warning.textContent = 'Abandon this recoverable deployment and its pending verified run?';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'lobby-btn lobby-verified-deployment__confirm-abandon';
    confirm.textContent = 'Confirm abandon';
    confirm.addEventListener('click', options.onConfirmAbandon, { signal: listenerSignal });
    const keep = document.createElement('button');
    keep.type = 'button';
    keep.className = 'lobby-btn secondary lobby-verified-deployment__keep';
    keep.textContent = 'Keep deployment';
    keep.addEventListener('click', options.onCancelAbandon, { signal: listenerSignal });
    confirmation.append(warning, confirm, keep);
    actions.append(confirmation);
  }

  verified.append(title, matchup, rules);
  if (dossier) verified.append(dossier);
  verified.append(message, actions);
  return verified;
}

export function buildLobbyLocalBattleView(options: LobbyLocalBattleViewOptions): HTMLElement {
  const wrapper = document.createElement('div');
  const crowded = options.playerCount >= 3;
  wrapper.className = `lobby-route-brief lobby-hotseat lobby-hotseat--local${crowded ? ' crowded' : ''}`;

  const body = document.createElement('section');
  body.className = 'lobby-hotseat-body';
  body.dataset.multiplayerSurface = 'local';
  body.dataset.localPreparation = '';
  body.setAttribute('aria-labelledby', 'local-crew-preparation-heading');
  body.setAttribute('aria-describedby', 'local-crew-preparation-context');

  const preparationHeader = document.createElement('header');
  preparationHeader.className = 'lobby-local-preparation__header';
  const preparationHeading = document.createElement('h2');
  preparationHeading.id = 'local-crew-preparation-heading';
  preparationHeading.className = 'lobby-local-preparation__title';
  preparationHeading.textContent = 'Local Battle crew preparation';
  const preparationContext = document.createElement('p');
  preparationContext.id = 'local-crew-preparation-context';
  preparationContext.className = 'lobby-local-preparation__context';
  preparationContext.textContent = 'Configure the crew, inspect each vehicle, and confirm the effective rules before deployment.';
  preparationHeader.append(preparationHeading, preparationContext);

  const scroll = document.createElement('div');
  scroll.className = 'lobby-hotseat-scroll';

  const setup = document.createElement('section');
  setup.className = 'lobby-route-brief__setup lobby-local-preparation__content';
  setup.setAttribute('aria-label', 'Local battery setup');

  const countField = document.createElement('div');
  countField.className = 'lobby-field';
  const countLabel = document.createElement('label');
  countLabel.textContent = 'Players';
  const countSelect = document.createElement('select');
  countSelect.id = 'lobby-hotseat-player-count';
  countLabel.htmlFor = countSelect.id;
  for (let count = options.minPlayers; count <= options.maxPlayers; count += 1) {
    const option = document.createElement('option');
    option.value = String(count);
    option.textContent = String(count);
    if (count === options.playerCount) option.selected = true;
    countSelect.append(option);
  }
  countSelect.addEventListener('change', () => {
    options.onPlayerCountChange(Number(countSelect.value));
  }, { signal: options.listenerSignal });
  countField.append(countLabel, countSelect);
  const rows = document.createElement('div');
  rows.className = 'lobby-rows';
  rows.classList.toggle('crowded', crowded);
  rows.setAttribute('role', 'list');
  rows.setAttribute('aria-labelledby', 'crew-manifest-heading');
  rows.append(...options.playerRows);
  const crew = buildLobbyPreparationSection({
    id: 'crew-manifest',
    title: 'Crew',
    children: [countField, rows],
  });
  crew.classList.add('lobby-local-preparation__crew');
  const rules = buildLobbyPreparationSection({
    id: 'battlefield-protocol',
    title: 'Effective rules',
    children: [options.advanced],
  });
  rules.classList.add('lobby-local-preparation__rules');
  const inspection = document.createElement('section');
  inspection.className = 'lobby-local-preparation__inspection';
  inspection.setAttribute('aria-label', 'Selected vehicle inspection');
  inspection.append(options.vehicleInspection);
  setup.append(crew, inspection, rules);

  const error = document.createElement('div');
  error.className = 'lobby-error';
  error.setAttribute('role', 'status');
  error.setAttribute('aria-live', 'polite');
  error.textContent = options.validationMessage ?? '';

  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'lobby-start lobby-btn primary';
  start.textContent = 'Deploy local battle';
  start.disabled = options.validationMessage !== null;
  start.addEventListener('click', options.onStart, { signal: options.listenerSignal });

  scroll.append(preparationHeader, setup);
  const footer = document.createElement('footer');
  footer.className = 'lobby-hotseat-footer';
  footer.dataset.localDecision = '';
  footer.setAttribute('aria-labelledby', 'local-deployment-decision-heading');
  const decisionCopy = document.createElement('div');
  decisionCopy.className = 'lobby-hotseat-footer__brief';
  const decisionHeading = document.createElement('h3');
  decisionHeading.id = 'local-deployment-decision-heading';
  decisionHeading.className = 'lobby-hotseat-footer__heading';
  decisionHeading.textContent = 'Deployment';
  const status = document.createElement('span');
  status.className = 'lobby-hotseat-footer__status';
  status.textContent = `${options.playerCount} players · Shared screen`;
  decisionCopy.append(decisionHeading, status, error);
  footer.append(decisionCopy, start);
  body.append(scroll, footer);
  wrapper.append(body);
  return wrapper;
}

export function buildLobbyVerifiedOperationsView(
  options: LobbyVerifiedOperationsViewOptions,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'lobby-route-brief lobby-hotseat lobby-hotseat--verified';
  const body = document.createElement('section');
  body.className = 'lobby-hotseat-body';
  body.dataset.multiplayerSurface = 'verified';
  body.setAttribute('aria-label', 'Verified Operations');
  const scroll = document.createElement('div');
  scroll.className = 'lobby-hotseat-scroll';
  const hasVerifiedChoices = options.verifiedDeployment !== null && Boolean(options.verifiedChallenge);
  const requestedVerifiedSurface = options.verifiedSurface ?? 'deployment';
  const verifiedSurface: LobbyVerifiedSurface = requestedVerifiedSurface === 'challenge'
    && options.verifiedChallenge
    ? 'challenge'
    : options.verifiedDeployment
      ? 'deployment'
      : 'challenge';
  const verifiedSelector = hasVerifiedChoices
    ? buildVerifiedSelector(verifiedSurface, options.onVerifiedSurfaceChange, options.listenerSignal)
    : null;
  const verifiedPanel = document.createElement('section');
  verifiedPanel.className = 'lobby-verified-operation-panel';
  if (hasVerifiedChoices) {
    verifiedPanel.id = 'lobby-verified-operation-panel';
    verifiedPanel.setAttribute('role', 'tabpanel');
    verifiedPanel.setAttribute('aria-labelledby', `lobby-verified-choice-${verifiedSurface}`);
  }

  if (verifiedSurface === 'deployment' && options.verifiedDeployment) {
    if (verifiedSelector) scroll.append(verifiedSelector);
    const dossier = buildCommanderDossier(options.verifiedDeployment.fieldOrder);
    if (dossier) verifiedPanel.append(dossier);
    const verified = buildVerifiedDeployment(options.verifiedDeployment, false, options.listenerSignal);
    const footer = verified.querySelector<HTMLElement>('.lobby-verified-deployment__actions');
    footer?.classList.add('lobby-hotseat-footer');
    verifiedPanel.append(verified);
    scroll.append(verifiedPanel);
    body.append(scroll);
    if (footer) body.append(footer);
  } else if (options.verifiedChallenge) {
    if (verifiedSelector) scroll.append(verifiedSelector);
    verifiedPanel.append(buildVerifiedChallenge(options.verifiedChallenge, options.listenerSignal));
    scroll.append(verifiedPanel);
    body.append(scroll);
  }
  wrapper.append(body);
  return wrapper;
}
