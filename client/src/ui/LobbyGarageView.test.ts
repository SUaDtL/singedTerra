import { describe, expect, it, vi } from 'vitest';
import type { TankLoadout } from '@shared/types/TankLoadout';
import { buildLobbyGarageView } from './LobbyGarageView';

const foundry: TankLoadout = { treads: 'foundry', hull: 'foundry', turret: 'foundry', barrel: 'foundry' };

function view(editing = false, controller: AbortController | undefined = undefined) {
  const onChange = vi.fn();
  const onOpen = vi.fn();
  const onClose = vi.fn();
  const onSpotlight = vi.fn();
  const onFocus = vi.fn();
  const root = buildLobbyGarageView({
    owner: 'player-1', ownerLabel: 'Player 1', value: foundry, editing,
    onChange, onOpen, onClose, onSpotlight, onFocus,
    listenerSignal: controller?.signal,
    isEditing: () => editing,
  });
  return { root, onChange, onOpen, onClose, onSpotlight, onFocus };
}

describe('buildLobbyGarageView', () => {
  it('renders the closed garage and routes open plus preset intents', () => {
    const { root, onOpen, onChange, onSpotlight, onFocus } = view();
    root.querySelector<HTMLButtonElement>('.lobby-garage__open')!.click();
    expect(onOpen).toHaveBeenCalledWith('player-1');
    root.querySelector<HTMLButtonElement>('[data-preset="ranger"]')!.click();
    expect(onSpotlight).toHaveBeenCalledWith('player-1');
    expect(onChange).toHaveBeenCalledWith({ treads: 'ranger', hull: 'ranger', turret: 'ranger', barrel: 'ranger' });
    expect(onFocus).toHaveBeenCalledWith('player-1', '[data-preset="ranger"]');
  });

  it('renders the editing dialog and routes escape, Done, and slot intents', () => {
    const { root, onClose, onChange, onSpotlight, onFocus } = view(true);
    expect(root.getAttribute('role')).toBe('dialog');
    root.querySelector<HTMLButtonElement>('[data-slot="turret"]')!.click();
    expect(onSpotlight).toHaveBeenCalledWith('player-1');
    expect(onChange).toHaveBeenCalledWith({ ...foundry, turret: 'ranger' });
    expect(onFocus).toHaveBeenCalledWith('player-1', '[data-slot="turret"]');
    root.querySelector<HTMLButtonElement>('.lobby-garage__close')!.click();
    expect(onClose).toHaveBeenCalledWith('player-1');
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
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
      owner: 'player-1', ownerLabel: 'Player 1', value: foundry, editing: true,
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
