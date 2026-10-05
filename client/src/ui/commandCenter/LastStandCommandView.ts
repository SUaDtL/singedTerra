import { createPreparationFrame } from '../PreparationFrame';
import type { MountedCommandView } from './contracts';

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
  description.textContent = 'Deploy into the field, survive until defeat, claim salvage, upgrade your cannon, and deploy again.';
  lead.append(eyebrow, headline, description);

  const briefing = document.createElement('dl');
  briefing.className = 'last-stand-command__briefing';
  for (const [term, value] of [
    ['Assignment', 'Endure the assault'],
    ['Progress', 'Salvage and permanent cannon upgrades'],
    ['Save', 'Stored locally on this device'],
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
  launch.href = `${import.meta.env.BASE_URL}last-stand/`;
  launch.textContent = 'Launch Last Stand';

  createPreparationFrame(document, {
    root,
    eyebrow: 'Campaigns / Last Stand',
    title: 'Last Stand',
    description: 'A local survival prototype with its own progression.',
    body: board,
    dockLabel: 'Field deployment',
    dockStatus: 'Your Last Stand save stays separate from Ash Road.',
    secondaryActions: launch,
  });
  host.replaceChildren(root);

  return {
    update: () => undefined,
    focusDefault: () => launch.focus(),
    dispose: () => root.remove(),
  };
}
