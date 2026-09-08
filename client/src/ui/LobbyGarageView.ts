import {
  TANK_KIT_IDS,
  TANK_PART_SLOTS,
  normalizeTankLoadout,
  type TankKitId,
  type TankLoadout,
} from '@shared/types/TankLoadout';
import {
  TANK_KIT_LABELS,
  TANK_PART_VARIANT_LABELS,
  TANK_SLOT_LABELS,
} from './tankPartLabels';

export interface LobbyGarageViewOptions {
  readonly owner: string;
  readonly ownerLabel: string;
  readonly value: TankLoadout;
  readonly editing: boolean;
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
  const { owner, ownerLabel, editing, listenerSignal } = options;
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

  const heading = document.createElement('span');
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

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'lobby-garage__open';
  open.textContent = 'Customize tank';
  open.setAttribute('aria-label', `Customize ${ownerLabel} tank`);
  open.addEventListener('click', () => options.onOpen(owner), { signal: listenerSignal });

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'lobby-garage__close';
  close.textContent = 'Done';
  close.setAttribute('aria-label', 'Done customizing tank');
  close.addEventListener('click', () => options.onClose(owner), { signal: listenerSignal });

  const presets = document.createElement('div');
  presets.className = 'lobby-garage__presets';
  for (const kit of TANK_KIT_IDS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lobby-garage__preset';
    button.dataset.preset = kit;
    button.dataset.short = kit.charAt(0).toUpperCase();
    button.textContent = TANK_KIT_LABELS[kit];
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
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lobby-garage__slot';
    button.dataset.slot = slot;
    button.dataset.kit = loadout[slot];
    button.dataset.short = `${TANK_SLOT_LABELS[slot].slice(0, 2).toUpperCase()}\u00b7${loadout[slot].charAt(0).toUpperCase()}`;
    button.setAttribute(
      'aria-label',
      `Change ${ownerLabel} ${TANK_SLOT_LABELS[slot].toLowerCase()}, currently ${TANK_PART_VARIANT_LABELS[slot][loadout[slot]]}`,
    );
    button.innerHTML = `<span>${TANK_SLOT_LABELS[slot]}</span><strong>${TANK_PART_VARIANT_LABELS[slot][loadout[slot]]}</strong>`;
    button.addEventListener('click', () => {
      const current = TANK_KIT_IDS.indexOf(loadout[slot]);
      const nextKit = TANK_KIT_IDS[(current + 1) % TANK_KIT_IDS.length]!;
      options.onSpotlight(owner);
      options.onChange({ ...loadout, [slot]: nextKit });
      options.onFocus(owner, `[data-slot="${slot}"]`);
    }, { signal: listenerSignal });
    slots.append(button);
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

  garage.addEventListener('keydown', (event) => {
    if (!(options.isEditing?.() ?? editing)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      options.onClose(owner);
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = Array.from(garage.querySelectorAll<HTMLButtonElement>('[data-preset], [data-slot], .lobby-garage__close'));
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

  if (editing) garage.append(heading, summary, presetGroup, componentGroup, close);
  else garage.append(heading, open, presets, slots, close);
  return garage;
}
