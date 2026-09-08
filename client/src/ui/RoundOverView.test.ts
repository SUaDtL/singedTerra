import { describe, expect, it, vi } from 'vitest';
import { RoundOverView, type RoundOverViewProjection } from './RoundOverView';

function projection(overrides: Partial<RoundOverViewProjection> = {}): RoundOverViewProjection {
  return {
    title: 'Round 1 complete · 2/3',
    titleLabel: 'Round 1: Player 1 won. Round 2 of 3.',
    scoreboard: '<span class="score">Player 1</span>',
    scoreboardColumns: 4,
    tanks: [{ id: 'p1', label: 'Player 1' }],
    selectedTankId: 'p1',
    shopVisible: true,
    credits: '800 cr',
    weapons: [{
      key: 'missile',
      name: 'Missile',
      price: '$500',
      owned: 'have 2',
      disabled: false,
      purchase: { weapon: 'missile' },
    }],
    accessories: [],
    ...overrides,
  };
}

describe('RoundOverView', () => {
  it('renders the immutable projection and emits buy, tank, and next-round intents', () => {
    const host = document.createElement('div');
    const onBuy = vi.fn();
    const onNextRound = vi.fn();
    const onTankSelect = vi.fn();
    const view = new RoundOverView({ host, onBuy, onNextRound, onTankSelect, focusFallback: () => null });
    document.body.append(host);

    view.show(projection());

    const select = host.querySelector('select');
    const score = host.querySelector('.st-hud__score');
    const buy = host.querySelector<HTMLButtonElement>('[data-round-over-buy="missile"]');
    expect(select).not.toBeNull();
    expect(score).not.toBeNull();
    expect(buy).not.toBeNull();
    const option = select!.firstElementChild;
    const scoreChild = score!.firstElementChild;
    select!.focus();
    view.update(projection({ credits: '300 cr', weapons: [{ ...projection().weapons[0]!, owned: 'have 1' }] }));
    expect(host.querySelector('select')).toBe(select);
    expect(select!.firstElementChild).toBe(option);
    expect(host.querySelector('.st-hud__score')).toBe(score);
    expect(score!.firstElementChild).toBe(scoreChild);
    expect(document.activeElement).toBe(select);
    expect(score?.getAttribute('style')).toContain('--score-cols: 4');
    expect(host.querySelector('[data-round-over-buy="missile"]')).toBe(buy);
    expect(host.querySelector('.st-hud__roundshop-credits')?.textContent).toBe('300 cr');

    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Round 1 complete · 2/3');
    (host.querySelector('select') as HTMLSelectElement).value = 'p1';
    host.querySelector('select')?.dispatchEvent(new Event('change', { bubbles: true }));
    const next = host.querySelector<HTMLButtonElement>('[data-round-over-next]');
    expect(buy).not.toBeNull();
    expect(next).not.toBeNull();
    buy!.click();
    next!.click();

    expect(onTankSelect).toHaveBeenCalledWith('p1');
    expect(onBuy).toHaveBeenCalledWith({ weapon: 'missile' }, 'p1');
    expect(onNextRound).toHaveBeenCalledOnce();
    view.hide(false);
    buy!.click();
    next!.click();
    expect(onBuy).toHaveBeenCalledOnce();
    expect(onNextRound).toHaveBeenCalledOnce();
    host.remove();
  });

  it('traps both Tab directions and stops handling after hide', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const view = new RoundOverView({
      host,
      onBuy: vi.fn(),
      onNextRound: vi.fn(),
      onTankSelect: vi.fn(),
      focusFallback: () => null,
    });
    view.show(projection());
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
    const controls = [...dialog.querySelectorAll<HTMLElement>('button, select')];
    const first = controls[0]!;
    const last = controls.at(-1)!;

    last.focus();
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    dialog.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    first.focus();
    const backward = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    dialog.dispatchEvent(backward);
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);

    view.hide();
    expect(dialog.classList.contains('st-hud__overlay--hidden')).toBe(true);
    const afterHide = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    dialog.dispatchEvent(afterHide);
    expect(afterHide.defaultPrevented).toBe(false);
    host.remove();
  });

  it('supports a bot-only round and removes stale shop cells when the projection changes', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const fallback = document.createElement('button');
    document.body.append(fallback);
    const onBuy = vi.fn();
    const onNextRound = vi.fn();
    const view = new RoundOverView({
      host,
      onBuy,
      onNextRound,
      onTankSelect: vi.fn(),
      focusFallback: () => fallback,
    });

    view.show(projection());
    view.update(projection({ tanks: [], selectedTankId: null, shopVisible: false, weapons: [], accessories: [] }));
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(host.querySelector('[data-round-over-buy="missile"]')).toBeNull();
    const next = host.querySelector<HTMLButtonElement>('[data-round-over-next]')!;
    next.focus();
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    dialog.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(next);
    const backward = new KeyboardEvent('keydown', {
      key: 'Tab', shiftKey: true, bubbles: true, cancelable: true,
    });
    dialog.dispatchEvent(backward);
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(next);
    view.hide();
    next.click();
    expect(onBuy).not.toHaveBeenCalled();
    expect(onNextRound).not.toHaveBeenCalled();
    host.remove();
    fallback.remove();
  });

  it('retains the selected second tank when labels or option order change', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const view = new RoundOverView({
      host,
      onBuy: vi.fn(),
      onNextRound: vi.fn(),
      onTankSelect: vi.fn(),
      focusFallback: () => null,
    });
    view.show(projection({
      tanks: [{ id: 'p1', label: 'Player 1' }, { id: 'p2', label: 'Player 2' }],
      selectedTankId: 'p2',
    }));
    view.update(projection({
      tanks: [{ id: 'p2', label: 'Renamed 2' }, { id: 'p1', label: 'Renamed 1' }],
      selectedTankId: 'p2',
    }));
    expect(host.querySelector<HTMLSelectElement>('select')?.value).toBe('p2');
    host.remove();
  });

  it('keeps the single-round scoreboard column count when the projection changes', () => {
    const host = document.createElement('div');
    const view = new RoundOverView({
      host,
      onBuy: vi.fn(),
      onNextRound: vi.fn(),
      onTankSelect: vi.fn(),
      focusFallback: () => null,
    });
    view.show(projection({ scoreboardColumns: 3 }));
    expect(host.querySelector('.st-hud__score')?.getAttribute('style')).toContain('--score-cols: 3');
    view.update(projection({ scoreboardColumns: 4 }));
    expect(host.querySelector('.st-hud__score')?.getAttribute('style')).toContain('--score-cols: 4');
  });
});
