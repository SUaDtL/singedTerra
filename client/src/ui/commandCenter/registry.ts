import type {
  CommandCategoryContribution,
  CommandCategoryId,
  CommandItemContribution,
  CommandItemId,
} from './contracts';
import {
  isCommandCategoryId,
  isCommandItemId,
} from './contracts';

export const COMMAND_SELECTION_STORAGE_KEY = 'singedterra.command-center.selection.v1';

export interface CommandSelection {
  readonly categoryId: CommandCategoryId;
  readonly itemId: CommandItemId;
}

export interface AvailableCommandCategory<Context> {
  readonly contribution: CommandCategoryContribution<Context>;
  readonly items: readonly CommandItemContribution<Context>[];
}

export interface ResolvedCommandRegistry<Context> {
  readonly categories: readonly AvailableCommandCategory<Context>[];
}

export interface AvailableCommandItem<Context> {
  readonly selection: CommandSelection;
  readonly category: CommandCategoryContribution<Context>;
  readonly item: CommandItemContribution<Context>;
}

export interface ImportedChallengeEntry {
  readonly explicit: boolean;
  readonly validated: boolean;
  readonly selection: CommandSelection;
}

export interface CampaignEntry {
  readonly compatible: boolean;
  readonly selection: CommandSelection;
}

export interface CommandEntryPriorities {
  readonly explicitInviteOrRejoin?: CommandSelection;
  readonly importedChallenge?: ImportedChallengeEntry;
  readonly campaign?: CampaignEntry;
  readonly firstSalvo: CommandSelection;
  readonly standardQuickDuel: CommandSelection;
}

export type CommandSelectionSource =
  | 'explicit-invite-or-rejoin'
  | 'imported-challenge'
  | 'remembered'
  | 'compatible-campaign'
  | 'first-salvo'
  | 'standard-quick-duel';

export interface ResolvedInitialCommandSelection {
  readonly source: CommandSelectionSource;
  readonly selection: CommandSelection;
}

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SessionCommandSelectionStore {
  read(): CommandSelection | null;
  remember(selection: CommandSelection): boolean;
  clear(): void;
}

export function resolveCommandRegistry<Context>(
  contributions: readonly CommandCategoryContribution<Context>[],
  context: Readonly<Context>,
): ResolvedCommandRegistry<Context> {
  const categoryIds = new Set<string>();
  for (const contribution of contributions) {
    if (!isCommandCategoryId(contribution.id)) {
      throw new Error('invalid command category ID');
    }
    if (!Number.isFinite(contribution.order)) {
      throw new Error(`invalid command category order: ${contribution.id}`);
    }
    if (categoryIds.has(contribution.id)) {
      throw new Error(`duplicate command category ID: ${contribution.id}`);
    }
    categoryIds.add(contribution.id);
  }

  const orderedCategories = [...contributions]
    .filter((contribution) => contribution.availability(context))
    .sort((left, right) => {
      const byOrder = left.order - right.order;
      if (byOrder !== 0) return byOrder;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });
  const itemIds = new Set<string>();
  const categories = orderedCategories.map((contribution) => {
    const items = contribution.provideItems(context).filter((providedItem) => {
      if (!isCommandItemId(providedItem.id)) {
        throw new Error('invalid command item ID');
      }
      if (itemIds.has(providedItem.id)) {
        throw new Error(`duplicate command item ID: ${providedItem.id}`);
      }
      itemIds.add(providedItem.id);
      return providedItem.availability(context);
    });
    return Object.freeze({
      contribution,
      items: Object.freeze(items),
    });
  });

  return Object.freeze({ categories: Object.freeze(categories) });
}

export function findAvailableCommandItem<Context>(
  registry: ResolvedCommandRegistry<Context>,
  categoryId: unknown,
  itemId: unknown,
): AvailableCommandItem<Context> | null {
  if (!isCommandCategoryId(categoryId) || !isCommandItemId(itemId)) return null;
  const category = registry.categories.find(({ contribution }) => contribution.id === categoryId);
  const item = category?.items.find((candidate) => candidate.id === itemId);
  if (!category || !item) return null;
  return Object.freeze({
    selection: Object.freeze({ categoryId, itemId }),
    category: category.contribution,
    item,
  });
}

function isStoredCommandSelection(value: unknown): value is CommandSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<Record<keyof CommandSelection, unknown>>;
  return isCommandCategoryId(candidate.categoryId) && isCommandItemId(candidate.itemId);
}

export function createSessionCommandSelectionStore(
  storage: SessionStorageLike = window.sessionStorage,
): SessionCommandSelectionStore {
  const clear = (): void => {
    try {
      storage.removeItem(COMMAND_SELECTION_STORAGE_KEY);
    } catch {
      // Session storage is best-effort; navigation must remain available when blocked.
    }
  };

  return {
    read: () => {
      let stored: string | null;
      try {
        stored = storage.getItem(COMMAND_SELECTION_STORAGE_KEY);
      } catch {
        return null;
      }
      if (stored === null) return null;
      try {
        const parsed: unknown = JSON.parse(stored);
        if (isStoredCommandSelection(parsed)) {
          return Object.freeze({
            categoryId: parsed.categoryId,
            itemId: parsed.itemId,
          });
        }
      } catch {
        // Invalid session data is removed below and resolved through contextual fallback.
      }
      clear();
      return null;
    },
    remember: (selection) => {
      if (!isStoredCommandSelection(selection)) return false;
      try {
        storage.setItem(COMMAND_SELECTION_STORAGE_KEY, JSON.stringify({
          categoryId: selection.categoryId,
          itemId: selection.itemId,
        }));
        return true;
      } catch {
        return false;
      }
    },
    clear,
  };
}

function resolveCandidate<Context>(
  registry: ResolvedCommandRegistry<Context>,
  source: CommandSelectionSource,
  selection: CommandSelection | undefined,
): ResolvedInitialCommandSelection | null {
  if (!selection) return null;
  const available = findAvailableCommandItem(registry, selection.categoryId, selection.itemId);
  return available
    ? Object.freeze({ source, selection: available.selection })
    : null;
}

export function resolveInitialCommandSelection<Context>(
  registry: ResolvedCommandRegistry<Context>,
  priorities: CommandEntryPriorities,
  store?: SessionCommandSelectionStore,
): ResolvedInitialCommandSelection | null {
  const explicit = resolveCandidate(
    registry,
    'explicit-invite-or-rejoin',
    priorities.explicitInviteOrRejoin,
  );
  if (explicit) return explicit;

  const imported = priorities.importedChallenge;
  if (imported?.explicit && imported.validated) {
    const importedSelection = resolveCandidate(registry, 'imported-challenge', imported.selection);
    if (importedSelection) return importedSelection;
  }

  const remembered = resolveCandidate(registry, 'remembered', store?.read() ?? undefined);
  if (remembered) return remembered;

  if (priorities.campaign?.compatible) {
    const campaign = resolveCandidate(
      registry,
      'compatible-campaign',
      priorities.campaign.selection,
    );
    if (campaign) return campaign;
  }

  return resolveCandidate(registry, 'first-salvo', priorities.firstSalvo)
    ?? resolveCandidate(registry, 'standard-quick-duel', priorities.standardQuickDuel);
}
