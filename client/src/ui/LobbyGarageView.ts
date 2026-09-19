import {
  TANK_KIT_IDS,
  TANK_PART_SLOTS,
  normalizeTankLoadout,
  type TankKitId,
  type TankLoadout,
} from '@shared/types/TankLoadout';
import { paintTankLoadoutPreview } from '../renderer/TankLoadoutPreview';
import {
  TANK_KIT_LABELS,
  TANK_PART_VARIANT_LABELS,
  TANK_SLOT_LABELS,
} from './tankPartLabels';

export interface LobbyGarageViewOptions {
  readonly owner: string;
  readonly ownerLabel: string;
  readonly color: string;
  readonly value: TankLoadout;
  readonly editing: boolean;
  readonly disabled?: boolean;
  readonly isEditing?: () => boolean;
  readonly listenerSignal?: AbortSignal;
  readonly onChange: (next: TankLoadout) => void;
  readonly onOpen: (owner: string) => void;
  readonly onClose: (owner: string) => void;
  readonly onSpotlight: (owner: string) => void;
  readonly onFocus: (owner: string, selector: string) => void;
}

function presetLoadout(kit: TankKitId): TankLoadout {
  return { treads: kit, hull: kit, turret: kit, barrel: kit };
}

export function buildLobbyGarageView(options: LobbyGarageViewOptions): HTMLElement {
  const { owner, ownerLabel, color, editing, listenerSignal } = options;
  const disabled = options.disabled ?? false;
  const loadout = normalizeTankLoadout(options.value);
  const garage = document.createElement('section');
  garage.className = 'lobby-garage';
  garage.classList.toggle('editing', editing);
  garage.dataset.owner = owner;
  garage.setAttribute('aria-label', editing ? `Vehicle Bay: ${ownerLabel}` : `${ownerLabel} tank Garage`);
  if (editing) {
    garage.setAttribute('role', 'dialog');
    garage.setAttribute('aria-modal', 'true');
  }
  if (disabled) garage.setAttribute('aria-busy', 'true');

  const heading = document.createElement(editing ? 'h2' : 'span');
  heading.className = `lobby-garage__heading${editing ? ' lobby-garage__editor-header' : ''}`;
  heading.textContent = editing ? `Vehicle Bay: ${ownerLabel}` : 'Garage';

  const uniformKit = TANK_KIT_IDS.find((kit) =>
    TANK_PART_SLOTS.every((slot) => loadout[slot] === kit),
  );
  const summary = document.createElement('p');
  summary.className = 'lobby-garage__build-summary';
  summary.textContent = uniformKit
    ? `${TANK_KIT_LABELS[uniformKit]} loadout`
    : `Mixed assembly: ${TANK_PART_SLOTS.map((slot) =>
      `${TANK_SLOT_LABELS[slot]} ${TANK_PART_VARIANT_LABELS[slot][loadout[slot]]}`,
    ).join(', ')}`;

  let inspection: HTMLElement | null = null;
  if (editing) {
    inspection = document.createElement('div');
    inspection.className = 'lobby-garage__inspection';
    inspection.setAttribute('aria-label', `${ownerLabel} assembled tank`);
    const tankPreview = document.createElement('canvas');
    tankPreview.className = 'lobby-garage__tank-preview';
    tankPreview.setAttribute('aria-hidden', 'true');
    paintTankLoadoutPreview(tankPreview, color, loadout, 'spotlight');
    const inspectionCopy = document.createElement('div');
    inspectionCopy.className = 'lobby-garage__inspection-copy';
    const inspectionLabel = document.createElement('span');
    inspectionLabel.className = 'lobby-garage__inspection-label';
    inspectionLabel.textContent = 'Current build';
    const cosmeticNote = document.createElement('p');
    cosmeticNote.className = 'lobby-garage__cosmetic-note';
    cosmeticNote.id = `lobby-garage-note-${owner}`;
    cosmeticNote.textContent = 'Appearance is cosmetic only. Performance remains unchanged.';
    inspectionCopy.append(inspectionLabel, summary, cosmeticNote);
    inspection.append(tankPreview, inspectionCopy);
    garage.setAttribute('aria-describedby', cosmeticNote.id);
  }

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'lobby-garage__open';
  open.textContent = 'Customize tank';
  open.setAttribute('aria-label', `Customize ${ownerLabel} tank`);
  open.disabled = disabled;
  open.addEventListener('click', () => options.onOpen(owner), { signal: listenerSignal });

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'lobby-garage__close';
  close.textContent = 'Done';
  close.setAttribute('aria-label', 'Done customizing tank');
  close.addEventListener('click', () => options.onClose(owner), { signal: listenerSignal });

  if (!editing) {
    garage.append(heading, summary, open);
    return garage;
  }

  const presets = document.createElement('div');
  presets.className = 'lobby-garage__presets';
  for (const kit of TANK_KIT_IDS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lobby-garage__preset';
    button.dataset.preset = kit;
    button.disabled = disabled;
    const label = document.createElement('span');
    label.className = 'lobby-garage__preset-label';
    label.textContent = TANK_KIT_LABELS[kit];
    if (editing) {
      const thumbnail = document.createElement('canvas');
      thumbnail.className = 'lobby-garage__preset-thumbnail';
      thumbnail.setAttribute('aria-hidden', 'true');
      paintTankLoadoutPreview(thumbnail, color, presetLoadout(kit), 'preset');
      button.append(thumbnail);
    }
    button.append(label);
    const active = TANK_PART_SLOTS.every((slot) => loadout[slot] === kit);
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', `Apply ${TANK_KIT_LABELS[kit]} preset to ${ownerLabel}`);
    button.addEventListener('click', () => {
      options.onSpotlight(owner);
      options.onChange(presetLoadout(kit));
      options.onFocus(owner, `[data-preset="${kit}"]`);
    }, { signal: listenerSignal });
    presets.append(button);
  }

  const slots = document.createElement('div');
  slots.className = 'lobby-garage__slots';
  for (const slot of TANK_PART_SLOTS) {
    const group = document.createElement('fieldset');
    group.className = 'lobby-garage__slot';
    group.dataset.slotGroup = slot;

    const legend = document.createElement('legend');
    legend.className = 'lobby-garage__slot-label';
    legend.textContent = TANK_SLOT_LABELS[slot];

    const choices = document.createElement('div');
    choices.className = 'lobby-garage__variants';
    for (const kit of TANK_KIT_IDS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lobby-garage__variant';
      button.dataset.slot = slot;
      button.dataset.variant = kit;
      button.disabled = disabled;
      button.textContent = TANK_PART_VARIANT_LABELS[slot][kit];
      const active = loadout[slot] === kit;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute(
        'aria-label',
        `Select ${TANK_PART_VARIANT_LABELS[slot][kit]} for ${ownerLabel} ${TANK_SLOT_LABELS[slot].toLowerCase()}`,
      );
      button.addEventListener('click', () => {
        options.onSpotlight(owner);
        options.onChange({ ...loadout, [slot]: kit });
        options.onFocus(owner, `[data-slot="${slot}"][data-variant="${kit}"]`);
      }, { signal: listenerSignal });
      choices.append(button);
    }

    group.append(legend, choices);
    slots.append(group);
  }

  const presetGroup = document.createElement('section');
  presetGroup.className = 'lobby-garage__preset-group';
  presetGroup.setAttribute('aria-label', 'Preset loadouts');
  const presetLabel = document.createElement('span');
  presetLabel.className = 'lobby-garage__group-label';
  presetLabel.textContent = 'Preset loadouts';
  presetGroup.append(presetLabel, presets);

  const componentGroup = document.createElement('section');
  componentGroup.className = 'lobby-garage__component-group';
  componentGroup.setAttribute('aria-label', 'Component bay');
  const componentLabel = document.createElement('span');
  componentLabel.className = 'lobby-garage__group-label';
  componentLabel.textContent = 'Component bay';
  componentGroup.append(componentLabel, slots);

  const workshopHeader = document.createElement('header');
  workshopHeader.className = 'lobby-garage__workshop-header';
  const workshopKicker = document.createElement('span');
  workshopKicker.className = 'lobby-garage__workshop-kicker';
  workshopKicker.textContent = 'Command workshop';
  workshopHeader.append(workshopKicker, heading);

  const editorScroll = document.createElement('div');
  editorScroll.className = 'lobby-garage__editor-scroll';
  editorScroll.append(presetGroup, componentGroup);

  const actions = document.createElement('footer');
  actions.className = 'lobby-garage__actions';
  actions.append(close);

  garage.addEventListener('keydown', (event) => {
    if (!(options.isEditing?.() ?? editing)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      options.onClose(owner);
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = Array.from(garage.querySelectorAll<HTMLButtonElement>(
      'button[data-preset], button[data-variant], .lobby-garage__close',
    )).filter((control) => !control.disabled);
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, { signal: listenerSignal });

  if (inspection) {
    garage.append(workshopHeader, inspection, editorScroll, actions);
  }
  return garage;
}
