import { commandCategoryId, commandItemId, type CommandCategoryContribution } from './contracts';
import { createPreparationFrame } from '../PreparationFrame';
import type { MountedCommandView } from './contracts';

let lastStandCommandViewId = 0;

/** The Unity build owns its local progression; this view owns only its entry link. */
export function createLastStandCommandView<Context>(host: HTMLElement): MountedCommandView<Context> {
  const document = host.ownerDocument;
  const root = document.createElement('article');
  root.className = 'last-stand-command';
  root.dataset.lastStandCommandView = '';

  const board = document.createElement('section');
  board.className = 'last-stand-command__board';
  board.setAttribute('aria-label', 'Last Stand field briefing');

  const lead = document.createElement('div');
  lead.className = 'last-stand-command__lead';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'last-stand-command__eyebrow';
  eyebrow.textContent = 'Local survival campaign';
  const headline = document.createElement('h3');
  headline.className = 'last-stand-command__headline';
  headline.textContent = 'Hold the line. Return stronger.';
  const description = document.createElement('p');
  description.className = 'last-stand-command__description';
  description.textContent = 'Clear enemy waves, bank salvage and milestone unlocks, and build a stronger tank. Keep farming your tier or push into the next battlefield.';
  lead.append(eyebrow, headline, description);

  const briefing = document.createElement('dl');
  briefing.className = 'last-stand-command__briefing';
  for (const [term, value] of [
    ['Assignment', 'Defeat every enemy in each wave'],
    ['Progress', 'Wave rewards, permanent upgrades and armaments'],
    ['Save', 'Checkpoint after every completed wave'],
  ] as const) {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    briefing.append(dt, dd);
  }
  board.append(lead, briefing);

  const launch = document.createElement('a');
  launch.className = 'command-center__action command-center__primary-action lobby-btn primary preparation-frame__primary-action last-stand-command__launch';
  launch.dataset.commandAction = 'launch-last-stand';
  launch.dataset.commandPrimary = '';
  launch.dataset.preparationPrimary = '';
  launch.href = `${import.meta.env.BASE_URL}last-stand/`;
  launch.textContent = 'Launch Last Stand';

  const disclosure = document.createElement('p');
  disclosure.id = `last-stand-loss-${++lastStandCommandViewId}`;
  disclosure.className = 'last-stand-command__loss';
  disclosure.dataset.lastStandLossDisclosure = '';
  disclosure.textContent = 'Returning or reloading keeps your last confirmed wave checkpoint and banked rewards. Resume starts paused at the unfinished wave; partial-wave upgrades and spending roll back together. Saves stay in this browser and do not sync with your account.';
  launch.setAttribute('aria-describedby', disclosure.id);

  createPreparationFrame(document, {
    root,
    eyebrow: 'Campaigns / Last Stand',
    title: 'Last Stand',
    description: 'The survival campaign: hold the line and build lasting upgrades.',
    body: board,
    dockLabel: 'Field deployment',
    dockStatus: 'Progress is saved locally in this browser.',
    dockMessage: disclosure,
    secondaryActions: launch,
  });
  host.replaceChildren(root);

  const refresh = () => {
    launch.textContent = 'Launch Last Stand';
    // This is a read-only entry hint. Unity remains the sole checkpoint
    // validator and never resumes a run merely because this link was used.
    try {
      const raw = document.defaultView?.localStorage.getItem('singedTerra.lastStand.prototype.v1');
      if (!raw || raw.length > 262144) return;
      const save: unknown = JSON.parse(raw);
      // LastStandProgressionSave retains checkpoint envelopes 4 and 5 and writes 6.
      // Unknown editions remain Unity's responsibility, including future saves.
      if (!save || typeof save !== 'object' || !('version' in save) || typeof save.version !== 'number' ||
        ![4, 5, 6].includes(save.version) || !('checkpoint' in save)) return;
      const checkpoint = save.checkpoint;
      if (!checkpoint || typeof checkpoint !== 'object' || !('runId' in checkpoint) || !Number.isSafeInteger(checkpoint.runId) ||
        Number(checkpoint.runId) < 1 || !('encounter' in checkpoint)) return;
      const encounter = checkpoint.encounter;
      if (!encounter || typeof encounter !== 'object' || !('tier' in encounter) || !('completedWave' in encounter) ||
        !Number.isSafeInteger(encounter.tier) || Number(encounter.tier) < 1 || !Number.isSafeInteger(encounter.completedWave) ||
        Number(encounter.completedWave) < 0 || Number(encounter.completedWave) >= 2147483647) return;
      launch.textContent = `Resume Tier ${encounter.tier} · Wave ${Number(encounter.completedWave) + 1}`;
    } catch { /* The game presents storage or validation errors after launch. */ }
  };
  refresh();

  return {
    update: refresh,
    focusDefault: () => launch.focus(),
    dispose: () => root.remove(),
  };
}

export function createLastStandCommandCategoryContribution<Context>(): CommandCategoryContribution<Context> {
  return {
    id: commandCategoryId('campaigns'), label: 'Campaigns', icon: 'campaigns', order: 10,
    availability: () => true,
    provideItems: () => [{
      id: commandItemId('last-stand'),
      summary: { label: 'Last Stand', description: 'Clear waves, bank rewards, and resume your campaign.' },
      availability: () => true,
      createView: (host) => createLastStandCommandView<Context>(host),
    }],
  };
}
