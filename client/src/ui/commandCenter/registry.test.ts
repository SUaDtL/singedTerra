import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  commandCategoryId,
  commandItemId,
  type CommandCategoryContribution,
  type CommandItemContribution,
  type CommandItemId,
} from './contracts';
import {
  COMMAND_SELECTION_STORAGE_KEY,
  createSessionCommandSelectionStore,
  findAvailableCommandItem,
  resolveCommandRegistry,
  resolveInitialCommandSelection,
  type CommandSelection,
  type SessionCommandSelectionStore,
} from './registry';

interface FixtureContext {
  readonly availableCategories: ReadonlySet<string>;
  readonly availableItems: ReadonlySet<string>;
}

function item(id: string): CommandItemContribution<FixtureContext> {
  return {
    id: commandItemId(id),
    summary: {
      label: id,
      description: `${id} description`,
    },
    availability: (context) => context.availableItems.has(id),
    createView: () => ({
      update: () => undefined,
      focusDefault: () => undefined,
      dispose: () => undefined,
    }),
  };
}

function category(
  id: string,
  order: number,
  items: readonly CommandItemContribution<FixtureContext>[],
): CommandCategoryContribution<FixtureContext> {
  return {
    id: commandCategoryId(id),
    label: id,
    icon: id === 'campaigns' ? 'campaigns' : id === 'multiplayer' ? 'multiplayer' : 'skirmishes',
    order,
    availability: (context) => context.availableCategories.has(id),
    provideItems: () => items,
  };
}

function selection(categoryId: string, itemId: string): CommandSelection {
  return {
    categoryId: commandCategoryId(categoryId),
    itemId: commandItemId(itemId),
  };
}

function rememberedStore(chosen: CommandSelection | null): SessionCommandSelectionStore {
  return {
    read: () => chosen,
    remember: () => true,
    clear: () => undefined,
  };
}

const allAvailable = Object.freeze<FixtureContext>({
  availableCategories: new Set(['campaigns', 'multiplayer', 'skirmishes']),
  availableItems: new Set([
    'ash-road',
    'first-salvo',
    'imported-challenge',
    'online',
    'standard',
  ]),
});

function fullRegistry(context: FixtureContext = allAvailable) {
  return resolveCommandRegistry([
    category('multiplayer', 30, [item('online')]),
    category('skirmishes', 20, [
      item('standard'),
      item('first-salvo'),
      item('imported-challenge'),
    ]),
    category('campaigns', 10, [item('ash-road')]),
  ], context);
}

function priorities(overrides: Partial<Parameters<typeof resolveInitialCommandSelection>[1]> = {}) {
  return {
    explicitInviteOrRejoin: selection('multiplayer', 'online'),
    importedChallenge: {
      explicit: true,
      validated: true,
      selection: selection('skirmishes', 'imported-challenge'),
    },
    campaign: {
      compatible: true,
      selection: selection('campaigns', 'ash-road'),
    },
    firstSalvo: selection('skirmishes', 'first-salvo'),
    standardQuickDuel: selection('skirmishes', 'standard'),
    ...overrides,
  };
}

describe('command registry', () => {
  it('excludes unavailable categories before providing items and orders the rest deterministically', () => {
    const unavailableProvider = vi.fn(() => [item('hidden-item')]);
    const registry = resolveCommandRegistry([
      {
        ...category('hidden', 0, []),
        provideItems: unavailableProvider,
      },
      category('skirmishes', 20, [item('standard'), item('first-salvo')]),
      category('multiplayer', 10, [item('online')]),
      category('campaigns', 10, [item('ash-road')]),
    ], {
      availableCategories: new Set(['campaigns', 'multiplayer', 'skirmishes']),
      availableItems: new Set(['ash-road', 'first-salvo', 'online', 'standard']),
    });

    expect(registry.categories.map(({ contribution }) => contribution.id)).toEqual([
      commandCategoryId('campaigns'),
      commandCategoryId('multiplayer'),
      commandCategoryId('skirmishes'),
    ]);
    expect(unavailableProvider).not.toHaveBeenCalled();
  });

  it('preserves the category provider item order after availability filtering', () => {
    const registry = resolveCommandRegistry([
      category('skirmishes', 20, [item('standard'), item('first-salvo')]),
    ], {
      availableCategories: new Set(['skirmishes']),
      availableItems: new Set(['first-salvo', 'standard']),
    });

    expect(registry.categories[0]?.items.map(({ id }) => id)).toEqual([
      commandItemId('standard'),
      commandItemId('first-salvo'),
    ]);
  });

  it('looks up only exact available category/item pairs', () => {
    const registry = fullRegistry({
      availableCategories: allAvailable.availableCategories,
      availableItems: new Set(['ash-road', 'standard']),
    });

    expect(findAvailableCommandItem(registry, 'campaigns', 'ash-road')).toMatchObject({
      selection: selection('campaigns', 'ash-road'),
      item: { id: commandItemId('ash-road') },
    });
    expect(findAvailableCommandItem(registry, 'campaigns', 'standard')).toBeNull();
    expect(findAvailableCommandItem(registry, 'Campaigns', 'ash-road')).toBeNull();
    expect(findAvailableCommandItem(registry, 'campaigns', 'ash road')).toBeNull();
    expect(findAvailableCommandItem(registry, 'skirmishes', 'first-salvo')).toBeNull();
  });

  it('fails closed on malformed ordering and duplicate category or item IDs', () => {
    expect(() => resolveCommandRegistry([
      category('campaigns', 10, [item('ash-road')]),
      category('campaigns', 20, [item('standard')]),
    ], allAvailable)).toThrow('duplicate command category ID: campaigns');

    expect(() => resolveCommandRegistry([
      category('campaigns', 10, [item('ash-road')]),
      category('skirmishes', 20, [item('ash-road')]),
    ], allAvailable)).toThrow('duplicate command item ID: ash-road');

    const malformed = category('campaigns', 10, [item('ash-road')]);
    expect(() => resolveCommandRegistry([
      { ...malformed, id: 'Campaigns' as typeof malformed.id },
    ], allAvailable)).toThrow('invalid command category ID');
    const malformedItem = item('ash-road');
    expect(() => resolveCommandRegistry([
      category('campaigns', 10, [
        { ...malformedItem, id: 'Ash Road' as typeof malformedItem.id },
      ]),
    ], allAvailable)).toThrow('invalid command item ID');
    expect(() => resolveCommandRegistry([
      { ...malformed, order: Number.NaN },
    ], allAvailable)).toThrow('invalid command category order: campaigns');
  });
});

describe('initial command selection', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('uses explicit invite/rejoin then an explicit validated imported challenge before memory', () => {
    const store = rememberedStore(selection('skirmishes', 'standard'));

    expect(resolveInitialCommandSelection(fullRegistry(), priorities(), store)).toEqual({
      source: 'explicit-invite-or-rejoin',
      selection: selection('multiplayer', 'online'),
    });
    expect(resolveInitialCommandSelection(fullRegistry(), priorities({
      explicitInviteOrRejoin: undefined,
    }), store)).toEqual({
      source: 'imported-challenge',
      selection: selection('skirmishes', 'imported-challenge'),
    });
  });

  it.each([
      undefined,
      {
        explicit: false,
        validated: true,
        selection: selection('skirmishes', 'imported-challenge'),
      },
      {
        explicit: true,
        validated: false,
        selection: selection('skirmishes', 'imported-challenge'),
      },
  ])('never enters a missing, implicit, or unvalidated imported challenge: %j', (importedChallenge) => {
      const store = rememberedStore(selection('skirmishes', 'standard'));
      expect(resolveInitialCommandSelection(fullRegistry(), priorities({
        explicitInviteOrRejoin: undefined,
        importedChallenge,
      }), store)).toEqual({
        source: 'remembered',
        selection: selection('skirmishes', 'standard'),
      });
  });

  it('prefers a valid remembered selection over the non-explicit fallback chain', () => {
    expect(resolveInitialCommandSelection(fullRegistry(), priorities({
      explicitInviteOrRejoin: undefined,
      importedChallenge: undefined,
    }), rememberedStore(selection('multiplayer', 'online')))).toEqual({
      source: 'remembered',
      selection: selection('multiplayer', 'online'),
    });
  });

  it.each([
    {
      availableItems: ['ash-road', 'first-salvo', 'standard'],
      campaignCompatible: true,
      expectedSource: 'compatible-campaign' as const,
    },
    {
      availableItems: ['ash-road', 'first-salvo', 'standard'],
      campaignCompatible: false,
      expectedSource: 'first-salvo' as const,
    },
    {
      availableItems: ['standard'],
      campaignCompatible: false,
      expectedSource: 'standard-quick-duel' as const,
    },
  ])('ignores unavailable memory and resolves $expectedSource', ({
    availableItems,
    campaignCompatible,
    expectedSource,
  }) => {
    const noExplicitContext = priorities({
      explicitInviteOrRejoin: undefined,
      importedChallenge: undefined,
    });
    const registry = fullRegistry({
      availableCategories: allAvailable.availableCategories,
      availableItems: new Set(availableItems),
    });

    expect(resolveInitialCommandSelection(registry, {
      ...noExplicitContext,
      campaign: { ...noExplicitContext.campaign!, compatible: campaignCompatible },
    }, rememberedStore(selection('campaigns', 'obsolete-campaign')))?.source).toBe(expectedSource);
  });

  it('returns no selection when every contextual candidate is unavailable', () => {
    const registry = fullRegistry({
      availableCategories: allAvailable.availableCategories,
      availableItems: new Set(),
    });

    expect(resolveInitialCommandSelection(registry, priorities({
      explicitInviteOrRejoin: undefined,
      importedChallenge: undefined,
    }))).toBeNull();
  });
});

describe('session command selection store', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('round-trips only stable IDs across store instances without touching localStorage', () => {
    const storageGet = vi.spyOn(Storage.prototype, 'getItem');
    const storageSet = vi.spyOn(Storage.prototype, 'setItem');
    const storageRemove = vi.spyOn(Storage.prototype, 'removeItem');
    const storageClear = vi.spyOn(Storage.prototype, 'clear');
    const chosen = selection('campaigns', 'ash-road');
    const store = createSessionCommandSelectionStore();

    expect(store.remember(chosen)).toBe(true);
    expect(createSessionCommandSelectionStore().read()).toEqual(chosen);
    expect(JSON.parse(window.sessionStorage.getItem(COMMAND_SELECTION_STORAGE_KEY)!)).toEqual({
      categoryId: 'campaigns',
      itemId: 'ash-road',
    });
    store.clear();
    expect(resolveInitialCommandSelection(fullRegistry(), priorities({
      explicitInviteOrRejoin: undefined,
      importedChallenge: undefined,
    }), store)?.source).toBe('compatible-campaign');
    for (const method of [storageGet, storageSet, storageRemove, storageClear]) {
      expect(method.mock.contexts).not.toContain(window.localStorage);
    }
  });

  it('ignores and clears corrupt or invalid stored selections', () => {
    const store = createSessionCommandSelectionStore();
    for (const stored of [
      '{',
      JSON.stringify(null),
      JSON.stringify({ categoryId: 'Campaigns', itemId: 'ash-road' }),
      JSON.stringify({ categoryId: 'campaigns', itemId: 'ash road' }),
    ]) {
      window.sessionStorage.setItem(COMMAND_SELECTION_STORAGE_KEY, stored);
      expect(store.read()).toBeNull();
      expect(window.sessionStorage.getItem(COMMAND_SELECTION_STORAGE_KEY)).toBeNull();
    }

    expect(store.remember({
      categoryId: 'Campaigns' as CommandSelection['categoryId'],
      itemId: 'ash-road' as CommandItemId,
    })).toBe(false);
    expect(window.sessionStorage.getItem(COMMAND_SELECTION_STORAGE_KEY)).toBeNull();
  });

  it('fails safely when session storage is unavailable', () => {
    const unavailableStorage = {
      getItem: vi.fn(() => { throw new DOMException('blocked'); }),
      setItem: vi.fn(() => { throw new DOMException('blocked'); }),
      removeItem: vi.fn(() => { throw new DOMException('blocked'); }),
    };
    const store = createSessionCommandSelectionStore(unavailableStorage);

    expect(store.read()).toBeNull();
    expect(store.remember(selection('campaigns', 'ash-road'))).toBe(false);
    expect(() => store.clear()).not.toThrow();
  });
});
