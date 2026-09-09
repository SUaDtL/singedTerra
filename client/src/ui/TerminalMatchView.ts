import type { TankLoadout } from '@shared/types/TankLoadout';
import { makeHudGlyph } from './hudIcons';
import {
  clearTankLoadoutPreview,
  paintTankLoadoutPreview,
} from '../renderer/TankLoadoutPreview';

export interface TerminalMatchProjection {
  readonly title: string;
  readonly status: string;
  readonly quickOperation: string | null;
  readonly winner: { readonly color: string; readonly loadout: TankLoadout | null } | null;
  /** Escaped scoreboard markup produced by HUD's existing scoreboard builder. */
  readonly scoreboard: string;
  readonly scoreboardColumns: 3 | 4;
  readonly fieldOrder: string | null;
  readonly progressionReceipt: {
    readonly summary: string;
    readonly promotion?: {
      readonly code: string;
      readonly insignia: { readonly label: string; readonly mark: string };
      readonly title: string;
    };
    readonly careerNext?: string;
  } | null;
  readonly progressionHandoff: { readonly message: string; readonly signIn: boolean } | null;
  readonly primary: { readonly label: string; readonly kind: 'restart' | 'next-order'; readonly disabled: boolean };
  readonly retry: { readonly visible: boolean; readonly disabled: boolean };
  readonly menu: { readonly label: string; readonly disabled: boolean };
}

export interface TerminalMatchViewOptions {
  readonly host: HTMLElement;
  readonly onRestart: () => void;
  readonly onVerifiedNextOrder: () => void;
  readonly onQuit: () => void;
  readonly onRetry: () => void;
  readonly onSignIn: () => void;
  readonly focusFallback: () => HTMLElement | null;
  readonly isolationExclusions?: readonly HTMLElement[];
}

/** Semantic owner for the terminal GAME_OVER report and its modal lifecycle. */
export class TerminalMatchView {
  readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly status: HTMLElement;
  private readonly operation: HTMLElement;
  private readonly fieldOrder: HTMLElement;
  private readonly score: HTMLElement;
  private readonly tank: HTMLCanvasElement;
  private readonly receipt: HTMLElement;
  private readonly handoff: HTMLElement;
  private readonly signIn: HTMLButtonElement;
  private readonly retry: HTMLButtonElement;
  private readonly primary: HTMLButtonElement;
  private readonly primaryLabel: HTMLSpanElement;
  private readonly menu: HTMLButtonElement;
  private readonly onRestart: TerminalMatchViewOptions['onRestart'];
  private readonly onVerifiedNextOrder: TerminalMatchViewOptions['onVerifiedNextOrder'];
  private readonly onQuit: TerminalMatchViewOptions['onQuit'];
  private readonly onRetry: TerminalMatchViewOptions['onRetry'];
  private readonly onSignIn: TerminalMatchViewOptions['onSignIn'];
  private readonly focusFallback: TerminalMatchViewOptions['focusFallback'];
  private readonly isolationExclusions: ReadonlySet<HTMLElement>;
  private previousFocus: HTMLElement | null = null;
  private visible = false;
  private destroyed = false;
  private lastScoreboard: string | null = null;
  private lastScoreboardColumns: 3 | 4 | null = null;
  private lastWinnerSignature: string | null = null;
  private lastReceiptSignature: string | null = null;
  private winnerRendered = false;

  constructor(options: TerminalMatchViewOptions) {
    this.onRestart = options.onRestart;
    this.onVerifiedNextOrder = options.onVerifiedNextOrder;
    this.onQuit = options.onQuit;
    this.onRetry = options.onRetry;
    this.onSignIn = options.onSignIn;
    this.focusFallback = options.focusFallback;
    this.isolationExclusions = new Set(options.isolationExclusions ?? []);
    this.root = document.createElement('div');
    this.root.className = 'st-hud__overlay st-hud__overlay--victory st-hud__overlay--hidden';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'st-victory-title');
    this.root.setAttribute('aria-hidden', 'true');

    const panel = document.createElement('div');
    panel.className = 'st-hud__overlay-panel st-hud__overlay-panel--victory';
    const eyebrow = document.createElement('div');
    eyebrow.className = 'st-hud__victory-eyebrow';
    eyebrow.textContent = 'After action report';
    const hero = document.createElement('section');
    hero.className = 'st-hud__victory-hero';
    const frame = document.createElement('div');
    frame.className = 'st-hud__victory-tank-frame';
    this.tank = document.createElement('canvas');
    this.tank.className = 'st-hud__victory-tank';
    this.tank.setAttribute('aria-hidden', 'true');
    this.tank.hidden = true;
    frame.append(this.tank);
    hero.append(frame);
    const report = document.createElement('section');
    report.className = 'st-hud__victory-report';
    this.status = document.createElement('div');
    this.status.className = 'st-hud__victory-status';
    this.operation = document.createElement('div');
    this.operation.className = 'st-hud__victory-operation';
    this.operation.dataset['ui'] = 'quick-operation-report';
    this.fieldOrder = document.createElement('div');
    this.fieldOrder.className = 'st-hud__victory-field-order';
    this.fieldOrder.setAttribute('role', 'status');
    this.title = document.createElement('h1');
    this.title.id = 'st-victory-title';
    this.title.className = 'st-hud__overlay-text st-hud__victory-title';
    const scoreLabel = document.createElement('div');
    scoreLabel.className = 'st-hud__victory-score-label';
    scoreLabel.textContent = 'Final standings';
    this.score = document.createElement('div');
    this.score.className = 'st-hud__score';
    this.receipt = document.createElement('div');
    this.receipt.className = 'st-hud__victory-progression-receipt';
    this.receipt.setAttribute('role', 'status');
    this.receipt.setAttribute('aria-live', 'polite');
    this.handoff = document.createElement('div');
    this.handoff.className = 'st-hud__victory-progression-handoff';
    this.handoff.setAttribute('role', 'status');
    this.handoff.setAttribute('aria-live', 'polite');
    this.handoff.setAttribute('aria-atomic', 'true');
    const handoffText = document.createElement('p');
    handoffText.textContent = 'Sign in to record future matches.';
    this.signIn = document.createElement('button');
    this.signIn.type = 'button';
    this.signIn.className = 'st-hud__victory-progression-sign-in';
    this.signIn.textContent = 'Sign in';
    this.signIn.addEventListener('click', () => {
      if (this.visible && !this.destroyed) this.onSignIn();
    });
    this.handoff.append(handoffText, this.signIn);
    this.retry = document.createElement('button');
    this.retry.type = 'button';
    this.retry.className = 'st-hud__restart st-hud__victory-verified-retry';
    this.retry.textContent = 'Retry verification';
    this.retry.addEventListener('click', () => {
      if (this.visible && !this.destroyed && !this.retry.disabled
        && this.retry.parentElement === this.primary.parentElement) this.onRetry();
    });
    this.primary = document.createElement('button');
    this.primary.type = 'button';
    this.primary.className = 'st-hud__restart st-hud__victory-primary';
    this.primary.dataset['terminalPrimary'] = '';
    this.primaryLabel = document.createElement('span');
    this.primaryLabel.className = 'st-hud__victory-action-label';
    this.primary.append(makeHudGlyph('weapon', 18), this.primaryLabel);
    this.primary.addEventListener('click', () => {
      if (!this.visible || this.destroyed || this.primary.disabled) return;
      if (this.primary.dataset['kind'] === 'next-order') {
        this.primary.blur();
        this.onVerifiedNextOrder();
      }
      else this.onRestart();
    });
    this.menu = document.createElement('button');
    this.menu.type = 'button';
    this.menu.className = 'st-hud__restart st-hud__restart--ghost';
    this.menu.dataset['terminalMenu'] = '';
    const menuLabel = document.createElement('span');
    menuLabel.className = 'st-hud__victory-action-label';
    this.menu.append(makeHudGlyph('menu', 18), menuLabel);
    this.menu.addEventListener('click', () => {
      if (this.visible && !this.destroyed && !this.menu.disabled) this.onQuit();
    });
    const buttons = document.createElement('div');
    buttons.className = 'st-hud__overlay-btns';
    buttons.append(this.primary, this.menu);
    report.append(this.status, this.operation, this.fieldOrder, this.receipt, this.handoff, this.title, scoreLabel, this.score, buttons);
    panel.append(eyebrow, hero, report);
    this.root.append(panel);
    this.root.addEventListener('keydown', (event) => this.handleTab(event));
    options.host.append(this.root);
  }

  show(projection: TerminalMatchProjection): void {
    if (this.destroyed) return;
    if (!this.visible) {
      if (this.previousFocus === null) {
        this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      this.isolate(true);
      this.visible = true;
    }
    this.render(projection);
    this.root.classList.remove('st-hud__overlay--hidden');
    this.root.setAttribute('aria-hidden', 'false');
    this.primary.focus({ preventScroll: true });
  }

  prepare(): void {
    if (this.destroyed || this.visible || this.previousFocus !== null) return;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  update(projection: TerminalMatchProjection): void {
    if (!this.destroyed) this.render(projection);
  }

  hide(restoreFocus = true): void {
    if (!this.visible && this.previousFocus === null) return;
    if (this.visible) {
      this.root.classList.add('st-hud__overlay--hidden');
      this.root.setAttribute('aria-hidden', 'true');
      this.isolate(false);
      this.visible = false;
    }
    this.tank.hidden = true;
    if (this.tank.dataset['tankPreviewSignature'] !== undefined) clearTankLoadoutPreview(this.tank);
    this.root.style.removeProperty('--st-victory-color');
    this.winnerRendered = false;
    this.lastWinnerSignature = null;
    this.receipt.hidden = true;
    this.receipt.replaceChildren();
    this.receipt.classList.remove('st-hud__victory-progression-receipt--promotion');
    this.lastReceiptSignature = null;
    this.handoff.hidden = true;
    this.signIn.remove();
    const previous = this.previousFocus;
    this.previousFocus = null;
    if (restoreFocus && previous?.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true });
    else if (restoreFocus) this.focusFallback()?.focus({ preventScroll: true });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.hide(false);
    this.destroyed = true;
    this.root.remove();
  }

  private render(projection: TerminalMatchProjection): void {
    this.title.textContent = projection.title;
    this.status.textContent = projection.status;
    this.operation.textContent = projection.quickOperation === null ? '' : projection.quickOperation;
    this.operation.hidden = projection.quickOperation === null;
    this.fieldOrder.textContent = projection.fieldOrder ?? '';
    this.fieldOrder.hidden = projection.fieldOrder === null;
    if (this.lastScoreboard !== projection.scoreboard) {
      this.score.innerHTML = projection.scoreboard;
      this.lastScoreboard = projection.scoreboard;
    }
    if (this.lastScoreboardColumns !== projection.scoreboardColumns) {
      this.score.style.setProperty('--score-cols', String(projection.scoreboardColumns));
      this.lastScoreboardColumns = projection.scoreboardColumns;
    }
    const winnerSignature = projection.winner === null ? null : JSON.stringify(projection.winner);
    if (!this.winnerRendered || this.lastWinnerSignature !== winnerSignature) {
      if (projection.winner === null) {
        this.tank.hidden = true;
        if (this.tank.dataset['tankPreviewSignature'] !== undefined) clearTankLoadoutPreview(this.tank);
        this.root.style.setProperty('--st-victory-color', '#ffd23f');
      } else if (projection.winner.loadout) {
        this.tank.hidden = false;
        this.root.style.setProperty('--st-victory-color', projection.winner.color);
        paintTankLoadoutPreview(this.tank, projection.winner.color, projection.winner.loadout, 'spotlight');
      } else {
        this.tank.hidden = true;
        this.root.style.setProperty('--st-victory-color', projection.winner.color);
      }
      this.lastWinnerSignature = winnerSignature;
      this.winnerRendered = true;
    }
    const receiptSignature = projection.progressionReceipt === null
      ? null
      : JSON.stringify(projection.progressionReceipt);
    this.receipt.hidden = projection.progressionReceipt === null;
    this.receipt.classList.toggle(
      'st-hud__victory-progression-receipt--promotion',
      projection.progressionReceipt?.promotion !== undefined,
    );
    if (projection.progressionReceipt && receiptSignature !== this.lastReceiptSignature) {
      const summary = document.createElement('span');
      summary.className = 'st-hud__victory-progression-summary';
      summary.textContent = projection.progressionReceipt.summary;
      const children: HTMLElement[] = [summary];
      const promotion = projection.progressionReceipt.promotion;
      if (promotion) {
        const card = document.createElement('section');
        card.className = 'st-hud__victory-promotion';
        const kicker = document.createElement('div');
        kicker.className = 'st-hud__victory-promotion-kicker';
        kicker.textContent = 'Commander promoted';
        const code = document.createElement('div');
        code.className = 'st-hud__victory-promotion-code';
        code.textContent = promotion.code;
        const insignia = document.createElement('div');
        insignia.className = 'st-hud__victory-promotion-insignia';
        insignia.setAttribute('aria-label', promotion.insignia.label);
        insignia.textContent = promotion.insignia.mark;
        const heading = document.createElement('div');
        heading.className = 'st-hud__victory-promotion-title';
        heading.textContent = promotion.title;
        card.append(kicker, code, insignia, heading);
        children.push(card);
      }
      if (projection.progressionReceipt.careerNext) {
        const next = document.createElement('div');
        next.className = 'st-hud__victory-career-next';
        next.textContent = projection.progressionReceipt.careerNext;
        children.push(next);
      }
      this.receipt.replaceChildren(...children);
    } else if (!projection.progressionReceipt && this.lastReceiptSignature !== null) this.receipt.replaceChildren();
    this.lastReceiptSignature = receiptSignature;
    this.handoff.hidden = projection.progressionHandoff === null;
    if (projection.progressionHandoff) {
      this.handoff.firstElementChild!.textContent = projection.progressionHandoff.message;
      if (projection.progressionHandoff.signIn) {
        if (this.signIn.parentElement !== this.handoff) this.handoff.append(this.signIn);
      } else this.signIn.remove();
    } else {
      this.signIn.remove();
    }
    this.primaryLabel.textContent = projection.primary.label;
    this.primary.dataset['kind'] = projection.primary.kind;
    this.primary.disabled = projection.primary.disabled;
    this.menu.querySelector<HTMLElement>('.st-hud__victory-action-label')!.textContent = projection.menu.label;
    this.menu.disabled = projection.menu.disabled;
    const retiringFocusedRetry = document.activeElement === this.retry
      && (!projection.retry.visible || projection.retry.disabled);
    this.retry.disabled = projection.retry.disabled;
    if (projection.retry.visible) {
      if (this.retry.parentElement !== this.primary.parentElement) this.primary.before(this.retry);
    } else this.retry.remove();
    if (retiringFocusedRetry) this.primary.focus({ preventScroll: true });
  }

  private handleTab(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.visible || this.destroyed) return;
    event.preventDefault();
    const focusable = [
      ...(!this.handoff.hidden && this.signIn.isConnected ? [this.signIn] : []),
      ...(this.retry.isConnected && !this.retry.disabled ? [this.retry] : []),
      ...(!this.primary.disabled ? [this.primary] : []),
      ...(!this.menu.disabled ? [this.menu] : []),
    ];
    if (focusable.length === 0) return;
    const current = focusable.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.shiftKey
      ? (current <= 0 ? focusable.length - 1 : current - 1)
      : (current < 0 || current === focusable.length - 1 ? 0 : current + 1);
    focusable[next]!.focus({ preventScroll: true });
  }

  private isolate(active: boolean): void {
    const modalRoot = this.root.parentElement;
    if (!modalRoot) return;
    const appSiblings = modalRoot.parentElement
      ? [...modalRoot.parentElement.children].filter((surface) => surface !== modalRoot)
      : [];
    const surfaces = [...appSiblings, ...modalRoot.children];
    for (const surface of surfaces) {
      if (!(surface instanceof HTMLElement) || surface === this.root || surface === modalRoot
        || this.isolationExclusions.has(surface)) continue;
      if (active) {
        if (surface.dataset['terminalPreviousInert'] !== undefined) continue;
        surface.dataset['terminalPreviousInert'] = surface.inert ? 'true' : 'false';
        surface.dataset['terminalPreviousAriaHidden'] = surface.getAttribute('aria-hidden') ?? '__absent__';
        surface.inert = true;
        surface.setAttribute('aria-hidden', 'true');
      } else {
        const previousInert = surface.dataset['terminalPreviousInert'];
        if (previousInert === undefined) continue;
        surface.inert = previousInert === 'true';
        const previousAria = surface.dataset['terminalPreviousAriaHidden'];
        if (previousAria === '__absent__') surface.removeAttribute('aria-hidden');
        else if (previousAria !== undefined) surface.setAttribute('aria-hidden', previousAria);
        delete surface.dataset['terminalPreviousInert'];
        delete surface.dataset['terminalPreviousAriaHidden'];
      }
    }
  }
}
