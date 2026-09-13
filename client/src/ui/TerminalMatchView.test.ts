import { afterEach, describe, expect, it, vi } from 'vitest';
import { getByRole } from '@testing-library/dom';
import { TerminalMatchView, type TerminalMatchProjection } from './TerminalMatchView';

const seedChallenge = (url: string): NonNullable<TerminalMatchProjection['seedChallenge']> => ({
  descriptor: {
    version: 'ST1', tag: 'LL', operationId: 'last-light-siege', seed: 42,
    origin: 'local-selection',
  },
  url,
});

function projection(overrides: Partial<TerminalMatchProjection> = {}): TerminalMatchProjection {
  return {
    title: 'Player 1 wins',
    status: 'Match winner',
    quickOperation: 'Operation · Quick Duel — Hold the ridge',
    winner: null,
    scoreboard: '<span class="st-hud__score-name">Player 1</span>',
    scoreboardColumns: 4,
    fieldOrder: null,
    turningPoint: null,
    nextExperiment: null,
    seedChallenge: null,
    progressionReceipt: null,
    progressionHandoff: null,
    primary: { label: 'Play again', kind: 'restart', disabled: false },
    retry: { visible: false, disabled: true },
    menu: { label: 'Main Menu', disabled: false },
    ...overrides,
  };
}

describe('TerminalMatchView', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('copies an eligible canonical challenge link and includes the action in the focus loop', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const host = document.createElement('div');
    document.body.append(host);
    const view = new TerminalMatchView({
      host, onRestart: vi.fn(), onVerifiedNextOrder: vi.fn(), onQuit: vi.fn(),
      onRetry: vi.fn(), onSignIn: vi.fn(), focusFallback: () => null,
    });
    const url = 'https://play.example/singedTerra/#challenge=ST1-LL-16';
    view.show(projection({ seedChallenge: seedChallenge(url) }));
    const copy = host.querySelector<HTMLButtonElement>('[data-action="copy-seed-challenge"]')!;
    copy.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith(url);
    expect(host.querySelector('[data-ui="seed-challenge-copy-status"]')?.textContent)
      .toBe('Challenge link copied');
    expect(host.querySelector<HTMLInputElement>('[data-ui="seed-challenge-copy-fallback"]'))
      .toBeNull();
    const primary = host.querySelector<HTMLButtonElement>('[data-terminal-primary]')!;
    primary.focus();
    host.querySelector<HTMLElement>('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab', shiftKey: true, bubbles: true, cancelable: true,
    }));
    expect(document.activeElement).toBe(copy);
    view.destroy();
    host.remove();
  });

  it.each([
    ['missing Clipboard', undefined],
    ['denied Clipboard', { writeText: vi.fn().mockRejectedValue(new DOMException('private', 'NotAllowedError')) }],
  ])('reveals and selects only the canonical full URL for %s', async (_label, clipboard) => {
    vi.stubGlobal('navigator', { clipboard });
    const host = document.createElement('div');
    document.body.append(host);
    const view = new TerminalMatchView({
      host, onRestart: vi.fn(), onVerifiedNextOrder: vi.fn(), onQuit: vi.fn(),
      onRetry: vi.fn(), onSignIn: vi.fn(), focusFallback: () => null,
    });
    const url = 'https://play.example/singedTerra/#challenge=ST1-CW-16';
    view.show(projection({ seedChallenge: seedChallenge(url) }));
    host.querySelector<HTMLButtonElement>('[data-action="copy-seed-challenge"]')!.click();
    await Promise.resolve();
    await Promise.resolve();

    const fallback = host.querySelector<HTMLInputElement>('[data-ui="seed-challenge-copy-fallback"]')!;
    expect(host.querySelector('[data-ui="seed-challenge-copy-status"]')?.textContent)
      .toBe('Copy this challenge link:');
    expect(fallback.value).toBe(url);
    expect(fallback.selectionStart).toBe(0);
    expect(fallback.selectionEnd).toBe(url.length);
    expect(document.activeElement).toBe(fallback);
    expect(getByRole(host, 'textbox', { name: 'Challenge link' })).toBe(fallback);
    expect(host.textContent).not.toContain('private');
    view.destroy();
    host.remove();
  });

  it('clears the share action, status, fallback, and stale clipboard completion on retirement', async () => {
    let resolveCopy!: () => void;
    const pending = new Promise<void>((resolve) => { resolveCopy = resolve; });
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(() => pending) } });
    const host = document.createElement('div');
    document.body.append(host);
    const view = new TerminalMatchView({
      host, onRestart: vi.fn(), onVerifiedNextOrder: vi.fn(), onQuit: vi.fn(),
      onRetry: vi.fn(), onSignIn: vi.fn(), focusFallback: () => null,
    });
    view.show(projection({ seedChallenge: seedChallenge('https://play.example/#challenge=ST1-LA-16') }));
    const copy = host.querySelector<HTMLButtonElement>('[data-action="copy-seed-challenge"]')!;
    copy.click();
    copy.focus();
    view.update(projection({ seedChallenge: null }));
    resolveCopy();
    await pending;
    await Promise.resolve();

    expect(host.querySelector('[data-action="copy-seed-challenge"]')).toBeNull();
    expect(host.querySelector('[data-ui="seed-challenge-copy-status"]')).toBeNull();
    expect(host.querySelector('[data-ui="seed-challenge-copy-fallback"]')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('[data-terminal-primary]'));
    view.destroy();
    host.remove();
  });

  it('keeps one stable share surface in the hero without moving terminal actions', async () => {
    vi.stubGlobal('navigator', { clipboard: undefined });
    const host = document.createElement('div');
    document.body.append(host);
    const view = new TerminalMatchView({
      host, onRestart: vi.fn(), onVerifiedNextOrder: vi.fn(), onQuit: vi.fn(),
      onRetry: vi.fn(), onSignIn: vi.fn(), focusFallback: () => null,
    });
    const challenge = seedChallenge('https://play.example/#challenge=ST1-LL-16');
    const terminal = projection({ seedChallenge: challenge });

    view.show(terminal);
    const hero = host.querySelector<HTMLElement>('.st-hud__victory-hero')!;
    const report = host.querySelector<HTMLElement>('.st-hud__victory-report')!;
    const share = host.querySelector<HTMLElement>('[data-ui="seed-challenge-share"]')!;
    const actions = host.querySelector<HTMLElement>('.st-hud__overlay-btns')!;
    expect(share.parentElement).toBe(hero);
    expect(actions.parentElement).toBe(report);

    host.querySelector<HTMLButtonElement>('[data-action="copy-seed-challenge"]')!.click();
    await Promise.resolve();
    await Promise.resolve();
    const fallback = host.querySelector<HTMLInputElement>('[data-ui="seed-challenge-copy-fallback"]')!;
    expect(document.activeElement).toBe(fallback);
    const append = vi.spyOn(hero, 'append');
    view.update(terminal);
    expect(append).not.toHaveBeenCalled();
    expect(share.parentElement).toBe(hero);
    expect(document.activeElement).toBe(fallback);
    expect([fallback.selectionStart, fallback.selectionEnd]).toEqual([0, challenge.url.length]);

    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    view.update(terminal);
    expect(append).not.toHaveBeenCalled();
    expect(share.parentElement).toBe(hero);
    expect(actions.parentElement).toBe(report);
    expect(document.activeElement).toBe(fallback);
    view.update(projection({ seedChallenge: null }));
    expect(share.isConnected).toBe(false);
    expect(document.activeElement).toBe(host.querySelector('[data-terminal-primary]'));
    view.destroy();
    host.remove();
  });

  it('renders a static explanation without adding a focusable terminal action', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const view = new TerminalMatchView({
      host, onRestart: vi.fn(), onVerifiedNextOrder: vi.fn(), onQuit: vi.fn(),
      onRetry: vi.fn(), onSignIn: vi.fn(), focusFallback: () => null,
    });

    view.show(projection({
      turningPoint: 'Turning point · Round 2: Player 1 clinched the match.',
      nextExperiment: 'Experiment · Keep power fixed, change your opening angle, and compare where the first shot lands.',
    }));

    expect(host.querySelector<HTMLElement>('[data-ui="terminal-turning-point"]')?.textContent)
      .toBe('Turning point · Round 2: Player 1 clinched the match.');
    expect(host.querySelector<HTMLElement>('[data-ui="terminal-next-experiment"]')?.textContent)
      .toBe('Experiment · Keep power fixed, change your opening angle, and compare where the first shot lands.');
    const context = host.querySelector<HTMLElement>('.st-hud__victory-context');
    expect(context).not.toBeNull();
    expect(context?.querySelector('[data-ui="terminal-turning-point"]')).not.toBeNull();
    expect(context?.querySelector('[data-ui="terminal-next-experiment"]')).not.toBeNull();
    expect(host.querySelectorAll('button:not(:disabled)')).toHaveLength(2);
    view.destroy();
    host.remove();
  });

  it('keeps coarse explanatory copy in the hero without reparenting it on stable updates', () => {
    let coarse = true;
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: coarse })));
    const host = document.createElement('div');
    document.body.append(host);
    const view = new TerminalMatchView({
      host, onRestart: vi.fn(), onVerifiedNextOrder: vi.fn(), onQuit: vi.fn(),
      onRetry: vi.fn(), onSignIn: vi.fn(), focusFallback: () => null,
    });
    const withInsights = projection({
      turningPoint: 'Turning point · Round 2: Player 1 clinched the match.',
      nextExperiment: 'Experiment · Keep power fixed, change your opening angle.',
    });

    view.show(withInsights);
    const insights = host.querySelector<HTMLElement>('.st-hud__victory-insights')!;
    const hero = host.querySelector<HTMLElement>('.st-hud__victory-hero')!;
    const turningPoint = host.querySelector<HTMLElement>('[data-ui="terminal-turning-point"]')!;
    expect(insights.parentElement).toBe(hero);
    expect(turningPoint.tabIndex).toBe(-1);
    expect(turningPoint.hasAttribute('tabindex')).toBe(false);
    const prepend = vi.spyOn(hero, 'prepend');

    view.update(withInsights);
    expect(insights.parentElement).toBe(hero);
    view.update(withInsights);
    expect(insights.parentElement).toBe(hero);

    expect(prepend).not.toHaveBeenCalled();
    expect(host.querySelectorAll('button:not(:disabled)')).toHaveLength(2);
    view.destroy();
    host.remove();
    coarse = false;
  });

  it('returns insights to report context for fine pointers and absent copy', () => {
    let coarse = false;
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: coarse })));
    const host = document.createElement('div');
    document.body.append(host);
    const view = new TerminalMatchView({
      host, onRestart: vi.fn(), onVerifiedNextOrder: vi.fn(), onQuit: vi.fn(),
      onRetry: vi.fn(), onSignIn: vi.fn(), focusFallback: () => null,
    });
    const withInsights = projection({
      turningPoint: 'Turning point · Round 2: Player 1 clinched the match.',
      nextExperiment: 'Experiment · Keep power fixed, change your opening angle.',
    });
    view.show(withInsights);
    const insights = host.querySelector<HTMLElement>('.st-hud__victory-insights')!;
    const context = host.querySelector<HTMLElement>('.st-hud__victory-context')!;
    expect(insights.parentElement).toBe(context);

    coarse = true;
    view.update(withInsights);
    expect(insights.parentElement).toBe(host.querySelector('.st-hud__victory-hero'));

    coarse = false;
    view.update(withInsights);
    expect(insights.parentElement).toBe(context);

    coarse = true;
    view.update(projection());
    expect(insights.parentElement).toBe(context);
    view.destroy();
    host.remove();
  });

  it('renders the projection and emits live intents', () => {
    const host = document.createElement('div');
    const onRestart = vi.fn();
    const onQuit = vi.fn();
    const view = new TerminalMatchView({
      host,
      onRestart,
      onVerifiedNextOrder: vi.fn(),
      onQuit,
      onRetry: vi.fn(),
      onSignIn: vi.fn(),
      focusFallback: () => null,
    });
    document.body.append(host);
    view.show(projection());
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(host.textContent).toContain('Player 1 wins');
    host.querySelector<HTMLButtonElement>('[data-terminal-primary]')!.click();
    host.querySelector<HTMLButtonElement>('[data-terminal-menu]')!.click();
    expect(onRestart).toHaveBeenCalledOnce();
    expect(onQuit).toHaveBeenCalledOnce();
    view.hide(false);
    host.querySelector<HTMLButtonElement>('[data-terminal-primary]')!.click();
    expect(onRestart).toHaveBeenCalledOnce();
    host.remove();
  });

  it('retains child identity and focus while updating stable fields', () => {
    const host = document.createElement('div');
    const view = new TerminalMatchView({
      host,
      onRestart: vi.fn(),
      onVerifiedNextOrder: vi.fn(),
      onQuit: vi.fn(),
      onRetry: vi.fn(),
      onSignIn: vi.fn(),
      focusFallback: () => null,
    });
    document.body.append(host);
    view.show(projection({
      progressionReceipt: {
        summary: 'Verified victory',
        promotion: { code: 'CPL', insignia: { label: 'Corporal', mark: 'Ⅱ' }, title: 'Corporal' },
        careerNext: '500 XP to Sergeant',
      },
    }));
    const score = host.querySelector('.st-hud__score')!;
    const firstScoreChild = score.firstElementChild;
    const receipt = host.querySelector('.st-hud__victory-progression-receipt')!;
    const receiptChildren = [...receipt.children];
    const primary = host.querySelector<HTMLButtonElement>('[data-terminal-primary]')!;
    primary.focus();
    view.update(projection({
      quickOperation: 'Operation · Updated',
      progressionReceipt: {
        summary: 'Verified victory',
        promotion: { code: 'CPL', insignia: { label: 'Corporal', mark: 'Ⅱ' }, title: 'Corporal' },
        careerNext: '500 XP to Sergeant',
      },
    }));
    expect(score.firstElementChild).toBe(firstScoreChild);
    expect(document.activeElement).toBe(primary);
    expect([...receipt.children].every((child, index) => child === receiptChildren[index])).toBe(true);
    expect(score.getAttribute('style')).toContain('--score-cols: 4');
    host.remove();
  });

  it('keeps the anonymous sign-in action parented and focused across unrelated updates', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const view = new TerminalMatchView({
      host,
      onRestart: vi.fn(), onVerifiedNextOrder: vi.fn(), onQuit: vi.fn(),
      onRetry: vi.fn(), onSignIn: vi.fn(), focusFallback: () => null,
    });
    const handoff = { message: 'Sign in to record future matches.', signIn: true };
    view.show(projection({ progressionHandoff: handoff }));
    const signIn = host.querySelector<HTMLButtonElement>('.st-hud__victory-progression-sign-in')!;
    const parent = signIn.parentElement;
    signIn.focus();
    view.update(projection({ quickOperation: 'Operation · Updated', progressionHandoff: handoff }));
    expect(signIn.parentElement).toBe(parent);
    expect(document.activeElement).toBe(signIn);
    view.destroy();
    host.remove();
  });

  it('repaints the same winner after hide and show', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const view = new TerminalMatchView({
      host,
      onRestart: vi.fn(), onVerifiedNextOrder: vi.fn(), onQuit: vi.fn(),
      onRetry: vi.fn(), onSignIn: vi.fn(), focusFallback: () => null,
    });
    const winner = { color: '#e84d4d', loadout: null };
    view.show(projection({ winner }));
    expect(view.root.style.getPropertyValue('--st-victory-color')).toBe('#e84d4d');
    view.hide(false);
    view.show(projection({ winner }));
    expect(view.root.style.getPropertyValue('--st-victory-color')).toBe('#e84d4d');
    view.destroy();
    host.remove();
  });

  it('restores pre-existing inert and aria-hidden values exactly', () => {
    const shell = document.createElement('main');
    const sibling = document.createElement('section');
    sibling.inert = true;
    sibling.setAttribute('aria-hidden', 'false');
    const host = document.createElement('div');
    shell.append(sibling, host);
    document.body.append(shell);
    const view = new TerminalMatchView({
      host,
      onRestart: vi.fn(), onVerifiedNextOrder: vi.fn(), onQuit: vi.fn(),
      onRetry: vi.fn(), onSignIn: vi.fn(), focusFallback: () => null,
    });
    view.show(projection());
    expect(sibling.getAttribute('aria-hidden')).toBe('true');
    view.hide(false);
    expect(sibling.inert).toBe(true);
    expect(sibling.getAttribute('aria-hidden')).toBe('false');
    view.destroy();
    shell.remove();
  });

  it('wraps both Tab directions and restores focus after hide', () => {
    const host = document.createElement('div');
    const fallback = document.createElement('button');
    document.body.append(host, fallback);
    fallback.focus();
    const view = new TerminalMatchView({
      host,
      onRestart: vi.fn(),
      onVerifiedNextOrder: vi.fn(),
      onQuit: vi.fn(),
      onRetry: vi.fn(),
      onSignIn: vi.fn(),
      focusFallback: () => fallback,
    });
    view.show(projection());
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
    const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled)')]
      .filter((element) => !element.hidden && !element.closest('[hidden]'));
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
    expect(document.activeElement).toBe(fallback);
    host.remove();
    fallback.remove();
  });

  it('retires a focused retry action and excludes it from the focus loop', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const view = new TerminalMatchView({
      host,
      onRestart: vi.fn(),
      onVerifiedNextOrder: vi.fn(),
      onQuit: vi.fn(),
      onRetry: vi.fn(),
      onSignIn: vi.fn(),
      focusFallback: () => null,
    });
    view.show(projection({ retry: { visible: true, disabled: false } }));
    const retry = host.querySelector<HTMLButtonElement>('.st-hud__victory-verified-retry')!;
    const primary = host.querySelector<HTMLButtonElement>('[data-terminal-primary]')!;
    const menu = host.querySelector<HTMLButtonElement>('[data-terminal-menu]')!;
    expect(retry.parentElement).toBe(primary.parentElement);
    expect(retry.nextElementSibling).toBe(primary);
    retry.focus();
    view.update(projection());
    expect(retry.isConnected).toBe(false);
    expect(document.activeElement).toBe(primary);
    primary.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab', shiftKey: true, bubbles: true, cancelable: true,
    }));
    expect(document.activeElement).toBe(menu);
    view.destroy();
    host.remove();
  });
});
