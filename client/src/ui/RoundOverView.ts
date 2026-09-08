import type { AccessoryType, WeaponType } from '@shared/engine/WeaponSystem';
import { makeHudGlyph, makeHudIcon } from './hudIcons';
import { makeWeaponIcon } from './weaponIcons';

export type RoundOverPurchase = { weapon?: WeaponType; accessory?: AccessoryType };

export interface RoundOverShopItem {
  readonly key: WeaponType | AccessoryType;
  readonly name: string;
  readonly price: string;
  readonly owned: string;
  readonly disabled: boolean;
  readonly purchase: RoundOverPurchase;
}

export interface RoundOverViewProjection {
  readonly title: string;
  readonly titleLabel: string;
  /** Escaped scoreboard markup produced by the HUD's existing scoreboard builder. */
  readonly scoreboard: string;
  /** Number of columns used by the scoreboard layout (3 for single-round, 4 otherwise). */
  readonly scoreboardColumns?: 3 | 4;
  readonly tanks: readonly { readonly id: string; readonly label: string }[];
  readonly selectedTankId: string | null;
  readonly shopVisible: boolean;
  readonly credits: string;
  readonly weapons: readonly RoundOverShopItem[];
  readonly accessories: readonly RoundOverShopItem[];
}

export interface RoundOverViewOptions {
  readonly host: HTMLElement;
  readonly onBuy: (purchase: RoundOverPurchase, tankId: string) => void;
  readonly onNextRound: () => void;
  readonly onTankSelect: (tankId: string) => void;
  readonly focusFallback: () => HTMLElement | null;
}

interface ShopCell {
  readonly buy: HTMLButtonElement;
  readonly owned: HTMLElement;
}

/** Semantic owner for the between-rounds shop and its focus lifecycle. */
export class RoundOverView {
  readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly score: HTMLElement;
  private readonly shop: HTMLElement;
  private readonly tankSelect: HTMLSelectElement;
  private readonly credits: HTMLElement;
  private readonly weapons = new Map<string, ShopCell>();
  private readonly accessories = new Map<string, ShopCell>();
  private readonly onBuy: RoundOverViewOptions['onBuy'];
  private readonly onNextRound: RoundOverViewOptions['onNextRound'];
  private readonly onTankSelect: RoundOverViewOptions['onTankSelect'];
  private readonly focusFallback: RoundOverViewOptions['focusFallback'];
  private previousFocus: HTMLElement | null = null;
  private visible = false;
  private lastTitle: string | null = null;
  private lastTitleLabel: string | null = null;
  private lastScoreboard: string | null = null;
  private lastScoreboardColumns: 3 | 4 | null = null;
  private lastTankSignature: string | null = null;
  private lastSelectedTankId: string | null = null;
  private lastCredits: string | null = null;

  constructor(options: RoundOverViewOptions) {
    this.onBuy = options.onBuy;
    this.onNextRound = options.onNextRound;
    this.onTankSelect = options.onTankSelect;
    this.focusFallback = options.focusFallback;
    this.root = document.createElement('div');
    this.root.className = 'st-hud__overlay st-hud__overlay--hidden';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'st-round-over-title');

    const panel = document.createElement('div');
    panel.className = 'st-hud__overlay-panel st-hud__overlay-panel--round-shop';
    this.title = document.createElement('div');
    this.title.className = 'st-hud__overlay-text';
    this.title.id = 'st-round-over-title';
    this.score = document.createElement('div');
    this.score.className = 'st-hud__score';
    this.shop = document.createElement('div');
    this.shop.className = 'st-hud__roundshop';
    const shopHead = document.createElement('div');
    shopHead.className = 'st-hud__roundshop-head';
    const shopTitle = document.createElement('span');
    shopTitle.className = 'st-hud__roundshop-title';
    shopTitle.textContent = 'Round shop';
    this.tankSelect = document.createElement('select');
    this.tankSelect.className = 'st-hud__roundshop-sel';
    this.tankSelect.addEventListener('change', () => {
      if (this.visible && this.tankSelect.value) this.onTankSelect(this.tankSelect.value);
    });
    this.credits = document.createElement('span');
    this.credits.className = 'st-hud__roundshop-credits';
    const selectorWell = document.createElement('div');
    selectorWell.className = 'st-hud__roundshop-select-well';
    selectorWell.append(this.tankSelect, makeHudIcon('disclosure', 18));
    shopHead.append(shopTitle, this.credits, selectorWell);
    this.shop.append(shopHead, document.createElement('div'));
    this.shop.lastElementChild!.className = 'st-hud__roundshop-grid';

    const nextRound = document.createElement('button');
    nextRound.className = 'st-hud__restart';
    nextRound.type = 'button';
    const nextLabel = document.createElement('span');
    nextLabel.className = 'st-hud__restart-label';
    nextLabel.textContent = 'Start Next Round';
    nextRound.append(makeHudGlyph('right', 17), nextLabel);
    nextRound.dataset['roundOverNext'] = '';
    nextRound.addEventListener('click', () => {
      if (this.visible) this.onNextRound();
    });

    panel.append(this.title, this.score, this.shop, nextRound);
    this.root.append(panel);
    this.root.addEventListener('keydown', (event) => this.handleTab(event));
    options.host.append(this.root);
  }

  render(projection: RoundOverViewProjection): void {
    if (this.lastTitle !== projection.title) {
      this.title.textContent = projection.title;
      this.lastTitle = projection.title;
    }
    if (this.lastTitleLabel !== projection.titleLabel) {
      this.title.setAttribute('aria-label', projection.titleLabel);
      this.lastTitleLabel = projection.titleLabel;
    }
    const scoreboardColumns = projection.scoreboardColumns ?? 3;
    if (this.lastScoreboard !== projection.scoreboard) {
      this.score.innerHTML = projection.scoreboard;
      this.lastScoreboard = projection.scoreboard;
    }
    if (this.lastScoreboardColumns !== scoreboardColumns) {
      this.score.style.setProperty('--score-cols', String(scoreboardColumns));
      this.lastScoreboardColumns = scoreboardColumns;
    }
    this.shop.hidden = !projection.shopVisible;
    this.shop.style.display = projection.shopVisible ? '' : 'none';
    if (this.lastCredits !== projection.credits) {
      this.credits.textContent = projection.credits;
      this.lastCredits = projection.credits;
    }
    const tankSignature = JSON.stringify(projection.tanks.map((tank) => [tank.id, tank.label]));
    const tanksChanged = this.lastTankSignature !== tankSignature;
    if (tanksChanged) {
      this.tankSelect.replaceChildren(...projection.tanks.map((tank) => {
        const option = document.createElement('option');
        option.value = tank.id;
        option.textContent = tank.label;
        return option;
      }));
      this.lastTankSignature = tankSignature;
    }
    if (
      projection.selectedTankId !== null
      && (tanksChanged
        || this.lastSelectedTankId !== projection.selectedTankId
        || this.tankSelect.value !== projection.selectedTankId)
    ) {
      this.tankSelect.value = projection.selectedTankId;
    }
    this.lastSelectedTankId = projection.selectedTankId;
    this.renderCells(projection.weapons, 'weapon');
    this.renderCells(projection.accessories, 'accessory');
  }

  show(projection: RoundOverViewProjection): void {
    if (!this.visible) {
      this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.isolate(true);
      this.visible = true;
    }
    this.render(projection);
    this.root.classList.remove('st-hud__overlay--hidden');
    this.root.setAttribute('aria-hidden', 'false');
    const focusTarget = projection.tanks.length > 0
      ? this.tankSelect
      : this.root.querySelector<HTMLButtonElement>('[data-round-over-next]');
    focusTarget?.focus({ preventScroll: true });
  }

  update(projection: RoundOverViewProjection): void {
    this.render(projection);
  }

  hide(restoreFocus = true): void {
    if (!this.visible) return;
    this.root.classList.add('st-hud__overlay--hidden');
    this.root.setAttribute('aria-hidden', 'true');
    this.isolate(false);
    this.visible = false;
    const previous = this.previousFocus;
    this.previousFocus = null;
    if (restoreFocus && previous?.isConnected && !previous.closest('[inert]')) {
      previous.focus({ preventScroll: true });
    } else if (restoreFocus) {
      this.focusFallback()?.focus({ preventScroll: true });
    }
  }

  private renderCells(items: readonly RoundOverShopItem[], kind: 'weapon' | 'accessory'): void {
    const grid = this.shop.lastElementChild!;
    const cells = kind === 'weapon' ? this.weapons : this.accessories;
    const expected = new Set<string>(items.map((item) => item.key));
    for (const [key, cell] of cells) {
      if (!expected.has(key)) {
        cell.buy.remove();
        cells.delete(key);
      }
    }
    for (const item of items) {
      let cell = cells.get(item.key);
      if (!cell) {
        const buy = document.createElement('button');
        buy.type = 'button';
        buy.className = 'st-hud__store-buy st-hud__roundshop-buy';
        buy.dataset[kind] = item.key;
        buy.dataset[`roundOver${kind === 'weapon' ? 'Buy' : 'Accessory'}`] = item.key;
        const name = document.createElement('span');
        name.className = 'st-hud__roundshop-item-name';
        const price = document.createElement('span');
        price.className = 'st-hud__store-price';
        const owned = document.createElement('span');
        owned.className = 'st-hud__store-bundle';
        buy.append(
          kind === 'weapon' ? makeWeaponIcon(item.key as WeaponType, 18) : makeHudGlyph('store', 18),
          name,
          price,
          owned,
        );
        buy.addEventListener('click', () => {
          const tankId = this.tankSelect.value;
          if (this.visible && tankId) this.onBuy(item.purchase, tankId);
        });
        cell = { buy, owned };
        cells.set(item.key, cell);
        grid.append(buy);
      }
      cell.buy.querySelector<HTMLElement>('.st-hud__roundshop-item-name')!.textContent = item.name;
      cell.buy.querySelector<HTMLElement>('.st-hud__store-price')!.textContent = item.price;
      cell.owned.textContent = item.owned;
      cell.buy.disabled = item.disabled;
    }
  }

  private handleTab(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.visible) return;
    const focusable = [...this.root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), select:not(:disabled)',
    )].filter((element) => !element.hidden && !element.closest('[hidden]'));
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  private isolate(active: boolean): void {
    const modalRoot = this.root.parentElement;
    if (!modalRoot) return;
    if (active) {
      const appSiblings = modalRoot.parentElement
        ? [...modalRoot.parentElement.children].filter((element): element is HTMLElement =>
          element instanceof HTMLElement && element !== modalRoot)
        : [];
      const modalSiblings = [...modalRoot.children].filter((element): element is HTMLElement =>
        element instanceof HTMLElement && element !== this.root);
      for (const surface of [...appSiblings, ...modalSiblings]) {
        if (surface.dataset['roundOverPreviousInert'] !== undefined) continue;
        surface.dataset['roundOverPreviousInert'] = surface.inert ? 'true' : 'false';
        surface.dataset['roundOverPreviousAriaHidden'] = surface.getAttribute('aria-hidden') ?? '__absent__';
        surface.inert = true;
        surface.setAttribute('aria-hidden', 'true');
      }
      return;
    }
    const surfaces = modalRoot.parentElement
      ? [...modalRoot.parentElement.children, ...modalRoot.children]
      : [...modalRoot.children];
    for (const surface of surfaces) {
      if (!(surface instanceof HTMLElement)) continue;
      const previousInert = surface.dataset['roundOverPreviousInert'];
      if (previousInert === undefined) continue;
      surface.inert = previousInert === 'true';
      const previousAria = surface.dataset['roundOverPreviousAriaHidden'];
      if (previousAria === '__absent__' || previousAria === undefined) surface.removeAttribute('aria-hidden');
      else surface.setAttribute('aria-hidden', previousAria);
      delete surface.dataset['roundOverPreviousInert'];
      delete surface.dataset['roundOverPreviousAriaHidden'];
    }
  }
}
