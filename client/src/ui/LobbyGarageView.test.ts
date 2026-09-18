import { describe, expect, it, vi } from 'vitest';
import {
  TANK_KIT_IDS,
  TANK_PART_SLOTS,
  type TankLoadout,
} from '@shared/types/TankLoadout';
import { TANK_PART_VARIANT_LABELS } from './tankPartLabels';
import { buildLobbyGarageView } from './LobbyGarageView';

const foundry: TankLoadout = { treads: 'foundry', hull: 'foundry', turret: 'foundry', barrel: 'foundry' };

function view(
  editing = false,
  controller: AbortController | undefined = undefined,
  value: TankLoadout = foundry,
) {
  const onChange = vi.fn();
  const onOpen = vi.fn();
  const onClose = vi.fn();
  const onSpotlight = vi.fn();
  const onFocus = vi.fn();
  const options = {
    owner: 'player-1', ownerLabel: 'Player 1', color: '#e84d4d', value, editing,
    onChange, onOpen, onClose, onSpotlight, onFocus,
    listenerSignal: controller?.signal,
    isEditing: () => editing,
  } satisfies Parameters<typeof buildLobbyGarageView>[0];
  const root = buildLobbyGarageView(options);
  return { root, onChange, onOpen, onClose, onSpotlight, onFocus };
}

describe('buildLobbyGarageView', () => {
  it('renders a compact closed summary and routes the Customize intent', () => {
    const { root, onOpen } = view();

    expect(root.querySelector('.lobby-garage__build-summary')?.textContent)
      .toBe('Foundry loadout');
    expect(root.querySelector('[data-preset]')).toBeNull();
    expect(root.querySelector('[data-slot]')).toBeNull();
    expect(root.querySelector('.lobby-garage__close')).toBeNull();

    root.querySelector<HTMLButtonElement>('.lobby-garage__open')!.click();
    expect(onOpen).toHaveBeenCalledWith('player-1');
  });

  it('renders the editing dialog and routes escape, Done, and slot intents', () => {
    const { root, onClose, onChange, onSpotlight, onFocus } = view(true);
    expect(root.getAttribute('role')).toBe('dialog');
    root.querySelector<HTMLButtonElement>(
      '[data-slot="turret"][data-variant="ranger"]',
    )!.click();
    expect(onSpotlight).toHaveBeenCalledWith('player-1');
    expect(onChange).toHaveBeenCalledWith({ ...foundry, turret: 'ranger' });
    expect(onFocus).toHaveBeenCalledWith(
      'player-1',
      '[data-slot="turret"][data-variant="ranger"]',
    );
    root.querySelector<HTMLButtonElement>('.lobby-garage__close')!.click();
    expect(onClose).toHaveBeenCalledWith('player-1');
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('identifies the owner and keeps their assembled tank inside the editor', () => {
    const mixed: TankLoadout = {
      treads: 'ranger',
      hull: 'bulwark',
      turret: 'jackal',
      barrel: 'foundry',
    };
    const { root } = view(true, undefined, mixed);

    expect(root.getAttribute('aria-label')).toBe('Vehicle Bay: Player 1');
    expect(root.querySelector('.lobby-garage__editor-header')?.textContent)
      .toContain('Player 1');

    const preview = root.querySelector<HTMLCanvasElement>('.lobby-garage__tank-preview');
    expect(preview).not.toBeNull();
    expect(preview?.dataset.tankPreviewSignature).toBe(
      'spotlight|#e84d4d|ranger|bulwark|jackal|foundry',
    );
  });

  it('states the cosmetic-only contract without implying rollback', () => {
    const { root } = view(true);

    expect(root.textContent).toMatch(/cosmetic/i);
    expect(root.textContent).toMatch(/performance/i);
    expect(
      Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
        .some((button) => button.textContent?.trim() === 'Cancel'),
    ).toBe(false);
    expect(root.querySelector<HTMLButtonElement>('.lobby-garage__close')?.textContent)
      .toBe('Done');
  });

  it('renders each named preset with a true painter thumbnail', () => {
    const { root } = view(true);
    const presets = Array.from(
      root.querySelectorAll<HTMLButtonElement>('.lobby-garage__preset[data-preset]'),
    );

    expect(presets).toHaveLength(4);
    for (const kit of TANK_KIT_IDS) {
      const preset = presets.find((candidate) => candidate.dataset.preset === kit);
      expect(preset, `${kit} preset`).toBeDefined();
      expect(preset?.textContent?.trim()).not.toBe('');
      expect(preset?.querySelector<HTMLCanvasElement>('canvas')?.dataset.tankPreviewSignature)
        .toBe(`preset|#e84d4d|${kit}|${kit}|${kit}|${kit}`);
    }
  });

  it('exposes all four named variants per component as direct immediate choices', () => {
    const { root, onChange, onSpotlight, onFocus } = view(true);

    for (const slot of TANK_PART_SLOTS) {
      const choices = Array.from(root.querySelectorAll<HTMLButtonElement>(
        `button[data-slot="${slot}"][data-variant]`,
      ));
      expect(choices, `${slot} choices`).toHaveLength(4);
      expect(choices.map((choice) => choice.dataset.variant)).toEqual([...TANK_KIT_IDS]);
      expect(choices.map((choice) => choice.textContent?.trim())).toEqual(
        TANK_KIT_IDS.map((kit) => TANK_PART_VARIANT_LABELS[slot][kit]),
      );
      expect(choices.find((choice) => choice.dataset.variant === 'foundry')
        ?.getAttribute('aria-pressed')).toBe('true');
    }

    root.querySelector<HTMLButtonElement>(
      'button[data-slot="turret"][data-variant="bulwark"]',
    )!.click();
    expect(onSpotlight).toHaveBeenCalledWith('player-1');
    expect(onChange).toHaveBeenCalledWith({ ...foundry, turret: 'bulwark' });
    expect(onFocus).toHaveBeenCalledWith(
      'player-1',
      '[data-slot="turret"][data-variant="bulwark"]',
    );
  });

  it('wraps focus in both Tab directions and stops after listener abort', () => {
    const controller = new AbortController();
    const { root, onClose } = view(true, controller);
    document.body.append(root);
    const controls = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-preset], [data-slot], .lobby-garage__close'));
    const first = controls[0]!;
    const last = controls.at(-1)!;
    last.focus();
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    root.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    first.focus();
    const backward = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    root.dispatchEvent(backward);
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    controller.abort();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
    root.remove();
  });

  it('consults live editing ownership before handling Escape or Tab', () => {
    let liveEditing = true;
    const onClose = vi.fn();
    const root = buildLobbyGarageView({
      owner: 'player-1', ownerLabel: 'Player 1', color: '#e84d4d', value: foundry, editing: true,
      isEditing: () => liveEditing,
      onChange: vi.fn(), onOpen: vi.fn(), onClose, onSpotlight: vi.fn(), onFocus: vi.fn(),
    });
    document.body.append(root);
    const controls = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-preset], [data-slot], .lobby-garage__close'));
    controls.at(-1)!.focus();
    liveEditing = false;
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    root.dispatchEvent(tab);
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(tab.defaultPrevented).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    root.remove();
  });
});
