import { fireEvent } from '@testing-library/dom';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { InputHandler } from '../../input/InputHandler';
import {
  commandCategoryId,
  commandItemId,
  type CommandCategoryContribution,
  type CommandItemContribution,
  type CommandViewLifetime,
  type MountedCommandView,
} from './contracts';
import {
  type CommandSelection,
  type SessionCommandSelectionStore,
} from './registry';
import {
  createCommandCenterShell,
  type CommandCenterShell,
} from './CommandCenterShell';
import * as commandIconModule from './CommandIcon';

interface FixtureContext {
  readonly revision: number;
  readonly availableCategories: ReadonlySet<string>;
  readonly availableItems: ReadonlySet<string>;
}

interface ViewFixture {
  readonly host: HTMLElement;
  readonly lifetime: CommandViewLifetime;
  readonly update: Mock<(next: Readonly<FixtureContext>) => void>;
  readonly focusDefault: Mock<() => void>;
  readonly dispose: Mock<() => void>;
}

const shells: CommandCenterShell<FixtureContext>[] = [];

afterEach(() => {
  for (const shell of shells.splice(0)) shell.destroy();
  document.body.replaceChildren();
});

function selection(categoryId: string, itemId: string): CommandSelection {
  return {
    categoryId: commandCategoryId(categoryId),
    itemId: commandItemId(itemId),
  };
}

function fixtureItem(
  id: string,
  views: ViewFixture[],
): CommandItemContribution<FixtureContext> {
  return {
    id: commandItemId(id),
    summary: {
      label: id.replaceAll('-', ' '),
      description: `${id} briefing`,
    },
    availability: (context) => context.availableItems.has(id),
    createView: (host, context, lifetime) => {
      host.dataset.view = id;
      host.textContent = `${id}:${context.revision}`;
      const view: ViewFixture = {
        host,
        lifetime,
        update: vi.fn((next: Readonly<FixtureContext>) => {
          host.textContent = `${id}:${next.revision}`;
        }),
        focusDefault: vi.fn(),
        dispose: vi.fn(),
      };
      views.push(view);
      return view satisfies MountedCommandView<FixtureContext>;
    },
  };
}

function fixtureCategory(
  id: string,
  label: string,
  order: number,
  items: readonly CommandItemContribution<FixtureContext>[],
): CommandCategoryContribution<FixtureContext> {
  return {
    id: commandCategoryId(id),
    label,
    icon: id === 'campaigns' ? 'campaigns' : id === 'multiplayer' ? 'multiplayer' : 'skirmishes',
    order,
    availability: (context) => context.availableCategories.has(id),
    provideItems: () => items,
  };
}

function context(
  revision = 1,
  categories = ['campaigns', 'skirmishes', 'multiplayer'],
  items = ['ash-road', 'first-salvo', 'standard', 'local', 'online'],
): FixtureContext {
  return {
    revision,
    availableCategories: new Set(categories),
    availableItems: new Set(items),
  };
}

function setup(options: {
  readonly contributions?: readonly CommandCategoryContribution<FixtureContext>[];
  readonly initialSelection?: CommandSelection;
  readonly store?: SessionCommandSelectionStore;
  readonly fixtureContext?: FixtureContext;
} = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const views: ViewFixture[] = [];
  const contributions = options.contributions ?? [
    fixtureCategory('multiplayer', 'Multiplayer', 30, [
      fixtureItem('local', views),
      fixtureItem('online', views),
    ]),
    fixtureCategory('campaigns', 'Campaigns', 10, [fixtureItem('ash-road', views)]),
    fixtureCategory('skirmishes', 'Skirmishes', 20, [
      fixtureItem('first-salvo', views),
      fixtureItem('standard', views),
    ]),
  ];
  const store = options.store ?? {
    read: vi.fn(() => null),
    remember: vi.fn(() => true),
    clear: vi.fn(),
  };
  const shell = createCommandCenterShell(root, {
    contributions,
    context: options.fixtureContext ?? context(),
    initialSelection: 'initialSelection' in options
      ? options.initialSelection
      : selection('campaigns', 'ash-road'),
    selectionStore: store,
  });
  shells.push(shell);
  return { root, shell, store, views };
}

function buttons(container: ParentNode, selector: string): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>(selector)];
}

describe('CommandCenterShell semantics and registry growth', () => {
  it('keeps control labels authoritative while rendering category, Modes, and Close glyphs', () => {
    const { root } = setup();
    const categoryButtons = buttons(root, '[data-command-category]');
    const modes = root.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
    const close = root.querySelector<HTMLButtonElement>('[aria-label="Close Modes"]')!;

    expect(categoryButtons).toHaveLength(6);
    expect(categoryButtons.map((button) => button.textContent)).toEqual([
      'Campaigns',
      'Skirmishes',
      'Multiplayer',
      'Campaigns',
      'Skirmishes',
      'Multiplayer',
    ]);
    expect(categoryButtons.map((button) => [...button.querySelectorAll('use')]
      .map((use) => use.getAttribute('href'))))
      .toEqual([
        [expect.stringMatching(/sprite\.svg.*#stc-campaign$/u)],
        [expect.stringMatching(/sprite\.svg.*#stc-duel$/u)],
        [
          expect.stringMatching(/sprite\.svg.*#stc-local$/u),
          expect.stringMatching(/sprite\.svg.*#stc-online$/u),
        ],
        [expect.stringMatching(/sprite\.svg.*#stc-campaign$/u)],
        [expect.stringMatching(/sprite\.svg.*#stc-duel$/u)],
        [
          expect.stringMatching(/sprite\.svg.*#stc-local$/u),
          expect.stringMatching(/sprite\.svg.*#stc-online$/u),
        ],
      ]);
    expect(modes.textContent).toBe('Modes');
    expect(modes.querySelector('use')?.getAttribute('href')).toMatch(/sprite\.svg.*#stc-menu$/u);
    expect(close.textContent).toBe('Close');
    expect(close.querySelector('use')?.getAttribute('href')).toMatch(/sprite\.svg.*#stc-close$/u);
    expect(root.querySelectorAll('svg')).toHaveLength(8);
    expect(root.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(8);
    expect(root.querySelectorAll('svg[aria-label], svg title')).toHaveLength(0);
  });

  it('keeps labels and navigation operable when decorative glyphs are unavailable', () => {
    const iconSpy = vi.spyOn(commandIconModule, 'createCommandIcon').mockReturnValue(null);
    try {
      const { root } = setup();
      const categoryButtons = buttons(root, '[data-command-category]');
      const modes = root.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
      const close = root.querySelector<HTMLButtonElement>('[aria-label="Close Modes"]')!;

      expect(root.querySelector('svg')).toBeNull();
      expect(categoryButtons[0]?.textContent).toBe('Campaigns');
      expect(modes.textContent).toBe('Modes');
      expect(close.textContent).toBe('Close');
      categoryButtons[1]!.click();
      expect(root.querySelector('[data-command-workspace-mount]')?.textContent)
        .toBe('first-salvo:1');
      modes.click();
      expect(root.querySelector<HTMLElement>('[role="dialog"]')?.hidden).toBe(false);
      close.click();
      expect(root.querySelector<HTMLElement>('[role="dialog"]')?.hidden).toBe(true);
    } finally {
      iconSpy.mockRestore();
    }
  });

  it('renders an ordered labelled desktop rail and one labelled Modes sheet from the same registry', () => {
    const { root } = setup();
    const rail = root.querySelector<HTMLElement>('nav[aria-label="Command categories"]')!;
    const heading = root.querySelector<HTMLHeadingElement>('h1')!;
    const trigger = root.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
    const sheet = root.querySelector<HTMLElement>('[role="dialog"]')!;
    const title = sheet.querySelector('h2')!;

    expect(buttons(rail, '[data-command-category]').map((button) => button.textContent)).toEqual([
      'Campaigns',
      'Skirmishes',
      'Multiplayer',
    ]);
    expect(heading.textContent).toBe('Command center');
    expect(root.getAttribute('role')).toBe('region');
    expect(root.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(trigger.textContent).toBe('Modes');
    expect(trigger.getAttribute('aria-controls')).toBe(sheet.id);
    expect(sheet.hidden).toBe(true);
    expect(sheet.getAttribute('aria-labelledby')).toBe(title.id);
    expect(title.textContent).toBe('Modes');
    expect(buttons(sheet, '[data-command-category]').map((button) => button.textContent)).toEqual([
      'Campaigns',
      'Skirmishes',
      'Multiplayer',
    ]);
    expect(root.querySelectorAll('[data-command-workspace-host]')).toHaveLength(1);
    expect(root.querySelectorAll('[data-command-workspace-mount]')).toHaveLength(1);
  });

  it('renders and mounts a fourth fixture category without shell-specific markup', () => {
    const views: ViewFixture[] = [];
    const contributions = [
      fixtureCategory('campaigns', 'Campaigns', 10, [fixtureItem('ash-road', views)]),
      fixtureCategory('skirmishes', 'Skirmishes', 20, [fixtureItem('standard', views)]),
      fixtureCategory('multiplayer', 'Multiplayer', 30, [fixtureItem('online', views)]),
      fixtureCategory('training', 'Training', 40, [fixtureItem('range', views)]),
    ];
    const { root } = setup({
      contributions,
      fixtureContext: context(1, ['campaigns', 'skirmishes', 'multiplayer', 'training'], [
        'ash-road',
        'standard',
        'online',
        'range',
      ]),
    });

    const training = buttons(root, 'nav [data-command-category]')
      .find((button) => button.textContent === 'Training')!;
    training.click();
    const range = buttons(root, '[data-command-item]')
      .find((button) => button.textContent?.includes('range'))!;
    range.click();

    expect(root.querySelector('[data-command-workspace-mount]')?.textContent).toBe('range:1');
  });

  it('exposes a generic singleton layout without weakening 4- or 18-item libraries', () => {
    const views: ViewFixture[] = [];
    const skirmishItems = Array.from(
      { length: 4 },
      (_, index) => fixtureItem(`skirmish-${index}`, views),
    );
    const manyItems = Array.from(
      { length: 18 },
      (_, index) => fixtureItem(`multiplayer-${index}`, views),
    );
    const contributions = [
      fixtureCategory('campaigns', 'Campaigns', 10, [fixtureItem('ash-road', views)]),
      fixtureCategory('skirmishes', 'Skirmishes', 20, skirmishItems),
      fixtureCategory('multiplayer', 'Multiplayer', 30, manyItems),
    ];
    const fixtureContext = context(
      1,
      ['campaigns', 'skirmishes', 'multiplayer'],
      ['ash-road', ...skirmishItems.map((item) => item.id), ...manyItems.map((item) => item.id)],
    );
    const { root } = setup({ contributions, fixtureContext });
    const body = root.querySelector<HTMLElement>('.command-center__body')!;

    expect(body.dataset.commandCollection).toBe('singleton');
    expect(body.dataset.commandItemCount).toBe('1');

    buttons(root, '.command-center__category-rail [data-command-category]')[1]!.click();
    expect(body.dataset.commandCollection).toBe('library');
    expect(body.dataset.commandItemCount).toBe('4');

    buttons(root, '.command-center__category-rail [data-command-category]')[2]!.click();
    expect(body.dataset.commandCollection).toBe('library');
    expect(body.dataset.commandItemCount).toBe('18');
    expect(buttons(root, '.command-center__library-items [data-command-item]')).toHaveLength(18);
  });
});

describe('CommandCenterShell keyboard and focus', () => {
  it('operates categories and items with the keyboard while containing command input', () => {
    const { root, store } = setup();
    const escapedKey = vi.fn();
    const escapedClick = vi.fn();
    document.body.addEventListener('keydown', escapedKey);
    document.body.addEventListener('click', escapedClick);
    const railCategories = buttons(root, 'nav [data-command-category]');

    railCategories[0]!.focus();
    fireEvent.keyDown(railCategories[0]!, { key: 'ArrowRight' });
    expect(document.activeElement?.textContent).toBe('Skirmishes');
    expect(root.querySelector('[data-command-workspace-mount]')?.textContent).toBe('first-salvo:1');

    const libraryItems = buttons(root, '[data-command-item]');
    libraryItems[0]!.focus();
    fireEvent.keyDown(libraryItems[0]!, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toContain('standard');
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(root.querySelector('[data-command-workspace-mount]')?.textContent).toBe('standard:1');
    expect(store.remember).toHaveBeenLastCalledWith(selection('skirmishes', 'standard'));
    expect(escapedKey).not.toHaveBeenCalled();
    expect(escapedClick).not.toHaveBeenCalled();
  });

  it('keeps real capture-phase battle input gated and pointer/touch events off the battle target', () => {
    const { root } = setup();
    const battleTarget = document.createElement('div');
    const emitBattleAction = vi.fn();
    const escapedPointer = vi.fn();
    const escapedTouch = vi.fn();
    document.body.addEventListener('pointerdown', escapedPointer);
    document.body.addEventListener('touchstart', escapedTouch);
    document.body.append(battleTarget);
    const battleInput = new InputHandler(battleTarget, emitBattleAction, {
      canHandleCommand: () => false,
    });
    battleInput.attach();
    const selectedCategory = root.querySelector<HTMLButtonElement>(
      '[data-command-surface="rail"][aria-pressed="true"]',
    )!;

    fireEvent.keyDown(selectedCategory, { key: ' ' });
    fireEvent.pointerDown(selectedCategory);
    fireEvent.touchStart(selectedCategory);

    expect(emitBattleAction).not.toHaveBeenCalled();
    expect(escapedPointer).not.toHaveBeenCalled();
    expect(escapedTouch).not.toHaveBeenCalled();
    battleInput.detach();
  });

  it('opens a modal Modes sheet, traps Tab, and closes on Escape with focus restored', () => {
    const { root } = setup();
    const globalChrome = document.createElement('header');
    root.before(globalChrome);
    const trigger = root.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
    const sheet = root.querySelector<HTMLElement>('[role="dialog"]')!;

    trigger.click();
    expect(sheet.hidden).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector<HTMLElement>('.command-center__navigation')?.inert).toBe(true);
    expect(root.querySelector<HTMLElement>('.command-center__body')?.inert).toBe(true);
    expect(globalChrome.inert).toBe(true);
    const sheetControls = buttons(sheet, 'button');
    expect(document.activeElement).toBe(sheetControls.find((button) => button.ariaPressed === 'true'));

    sheetControls.at(-1)!.focus();
    fireEvent.keyDown(sheetControls.at(-1)!, { key: 'Tab' });
    expect(document.activeElement).toBe(sheetControls[0]);
    fireEvent.keyDown(sheetControls[0]!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(sheetControls.at(-1));

    fireEvent.keyDown(sheet, { key: 'Escape' });
    expect(sheet.hidden).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector<HTMLElement>('.command-center__navigation')?.inert).toBe(false);
    expect(root.querySelector<HTMLElement>('.command-center__body')?.inert).toBe(false);
    expect(globalChrome.inert).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('promotes a contextual selection only before the player engages the shell', () => {
    const initial = selection('skirmishes', 'first-salvo');
    const { root, shell, store } = setup({ initialSelection: initial });

    expect(shell.promoteInitialSelection(selection('campaigns', 'ash-road'))).toBe(true);
    expect(root.querySelector('[data-command-workspace-mount]')?.textContent).toBe('ash-road:1');
    expect(store.remember).not.toHaveBeenCalled();

    buttons(root, 'nav [data-command-category]')[2]!.click();
    expect(shell.promoteInitialSelection(initial)).toBe(false);
    expect(root.querySelector('[data-command-workspace-mount]')?.textContent).toBe('local:1');
  });

  it('keeps fallback focus inside an open Modes sheet when context removes the active category', async () => {
    const { root, shell } = setup();
    const trigger = root.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
    const sheet = root.querySelector<HTMLElement>('[role="dialog"]')!;
    trigger.click();

    shell.update(context(2, ['skirmishes', 'multiplayer'], [
      'first-salvo',
      'standard',
      'local',
      'online',
    ]));
    await Promise.resolve();

    expect(sheet.hidden).toBe(false);
    expect(sheet.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(
      sheet.querySelector('[data-command-category][aria-pressed="true"]'),
    );
  });

  it('focuses the sheet Close control when an update removes every available category', async () => {
    const { root, shell } = setup();
    const trigger = root.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
    const sheet = root.querySelector<HTMLElement>('[role="dialog"]')!;
    trigger.click();

    shell.update(context(2, [], []));
    await Promise.resolve();

    expect(sheet.hidden).toBe(false);
    expect(document.activeElement).toBe(
      sheet.querySelector<HTMLButtonElement>('[aria-label="Close Modes"]'),
    );
  });

  it('rejects stale queued focus after a newer selection wins', async () => {
    const { root, shell, views } = setup();
    const skirmishes = buttons(root, 'nav [data-command-category]')[1]!;
    skirmishes.click();
    const firstSalvoView = views.at(-1)!;
    shell.focusWorkspaceDefault();
    const standard = buttons(root, '[data-command-item]')[1]!;
    standard.click();
    const standardView = views.at(-1)!;

    shell.focusWorkspaceDefault();
    await Promise.resolve();

    expect(firstSalvoView.focusDefault).not.toHaveBeenCalled();
    expect(standardView.focusDefault).toHaveBeenCalledOnce();
  });
});

describe('CommandCenterShell mounted-view lifecycle', () => {
  it('invalidates stale async DOM and domain effects before disposing a replaced view', async () => {
    const { root, shell, views } = setup();
    const first = views[0]!;
    const domainMutation = vi.fn();
    const staleWrite = Promise.resolve().then(() => first.lifetime.run(() => {
      first.host.append('stale');
      domainMutation();
    }));

    buttons(root, 'nav [data-command-category]')[1]!.click();
    const second = views[1]!;
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(first.host.isConnected).toBe(false);
    expect(root.querySelectorAll('[data-command-workspace-mount]')).toHaveLength(1);
    expect(first.lifetime.signal.aborted).toBe(true);
    expect(await staleWrite).toBe(false);
    expect(first.host.textContent).not.toContain('stale');
    expect(root.textContent).not.toContain('stale');
    expect(domainMutation).not.toHaveBeenCalled();

    shell.destroy();
    shell.destroy();
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).toHaveBeenCalledOnce();
  });

  it('updates the current mounted view without remounting it', () => {
    const { root, shell, views } = setup();
    const mounted = views[0]!;

    shell.update(context(2));

    expect(views).toHaveLength(1);
    expect(mounted.update).toHaveBeenCalledOnce();
    expect(mounted.update).toHaveBeenCalledWith(expect.objectContaining({ revision: 2 }));
    expect(root.querySelector('[data-command-workspace-mount]')?.textContent).toBe('ash-road:2');
  });

  it('restores stable category and item focus across a valid context update', () => {
    const { root, shell } = setup();
    const category = root.querySelector<HTMLButtonElement>(
      '[data-command-surface="rail"][data-command-category="campaigns"]',
    )!;
    category.focus();
    shell.update(context(2));
    expect(document.activeElement).toBe(root.querySelector(
      '[data-command-surface="rail"][data-command-category="campaigns"]',
    ));

    const item = root.querySelector<HTMLButtonElement>('[data-command-item="ash-road"]')!;
    item.focus();
    shell.update(context(3));
    expect(document.activeElement).toBe(root.querySelector('[data-command-item="ash-road"]'));
  });

  it('falls back when the selected item disappears and keeps focus on a stable selected control', async () => {
    const { root, shell, views } = setup();
    const first = views[0]!;

    shell.update(context(2, ['skirmishes'], ['first-salvo', 'standard']));
    await Promise.resolve();

    expect(first.dispose).toHaveBeenCalledOnce();
    expect(root.querySelector('[data-command-workspace-mount]')?.textContent).toBe('first-salvo:2');
    expect(document.activeElement).toBe(root.querySelector('[data-command-item][aria-current="true"]'));
  });

  it('disposes the workspace when a registry category intentionally has no available items', () => {
    const views: ViewFixture[] = [];
    const { root } = setup({
      contributions: [
        fixtureCategory('campaigns', 'Campaigns', 10, [fixtureItem('ash-road', views)]),
        fixtureCategory('training', 'Training', 20, []),
      ],
      fixtureContext: context(1, ['campaigns', 'training'], ['ash-road']),
    });
    const campaign = views[0]!;

    buttons(root, 'nav [data-command-category]')[1]!.click();

    expect(campaign.dispose).toHaveBeenCalledOnce();
    expect(root.querySelectorAll('[data-command-workspace-mount]')).toHaveLength(0);
    expect(root.querySelector('[role="status"]')?.textContent).toBe('No commands available.');
    expect(document.activeElement?.textContent).toBe('Training');
  });

  it('remembers only user-selected category and item pairs through the T04 store', () => {
    const remembered = selection('multiplayer', 'online');
    const store: SessionCommandSelectionStore = {
      read: vi.fn(() => remembered),
      remember: vi.fn(() => true),
      clear: vi.fn(),
    };
    const { root } = setup({ initialSelection: undefined, store });
    expect(root.querySelector('[data-command-workspace-mount]')?.textContent).toBe('online:1');
    expect(store.remember).not.toHaveBeenCalled();

    buttons(root, 'nav [data-command-category]')[0]!.click();
    expect(store.remember).toHaveBeenLastCalledWith(selection('campaigns', 'ash-road'));
  });
});
