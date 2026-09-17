import type {
  CommandCategoryContribution,
  CommandCategoryId,
  CommandItemId,
  CommandViewLifetime,
  MountedCommandView,
} from './contracts';
import type {
  CommandSelection,
  ResolvedCommandRegistry,
  SessionCommandSelectionStore,
} from './registry';
import {
  findAvailableCommandItem,
  resolveCommandRegistry,
} from './registry';
import { createCommandIcon, type CommandIconName } from './CommandIcon';

export interface CommandCenterShellOptions<Context> {
  readonly contributions: readonly CommandCategoryContribution<Context>[];
  readonly context: Readonly<Context>;
  readonly initialSelection?: CommandSelection | null;
  readonly selectionStore: SessionCommandSelectionStore;
}

export interface CommandCenterShell<Context> {
  update(context: Readonly<Context>): void;
  promoteInitialSelection(selection: CommandSelection): boolean;
  focusWorkspaceDefault(): void;
  destroy(): void;
}

interface ActiveCommandView<Context> {
  readonly generation: number;
  readonly itemId: CommandItemId;
  readonly mount: HTMLElement;
  readonly view: MountedCommandView<Context>;
  readonly lifetime: AbortController;
  disposed: boolean;
}

type StableFocusToken =
  | Readonly<{
    kind: 'category';
    categoryId: CommandCategoryId;
    surface: 'rail' | 'sheet';
  }>
  | Readonly<{
    kind: 'item';
    itemId: CommandItemId;
  }>;

let shellId = 0;

function setIconLabel(control: HTMLButtonElement, iconName: CommandIconName, label: string): void {
  const icon = createCommandIcon(iconName);
  control.replaceChildren(...(icon ? [icon] : []), document.createTextNode(label));
}

export function createCommandCenterShell<Context>(
  root: HTMLElement,
  options: CommandCenterShellOptions<Context>,
): CommandCenterShell<Context> {
  const instanceId = ++shellId;
  const listeners = new AbortController();
  let context = options.context;
  let registry = resolveCommandRegistry(options.contributions, context);
  let activeCategoryId: CommandCategoryId | null = null;
  let selected: CommandSelection | null = null;
  let activeView: ActiveCommandView<Context> | null = null;
  let generation = 0;
  let focusRequest = 0;
  let destroyed = false;
  let interactionObserved = false;
  const modalBackgrounds = new Map<HTMLElement, boolean>();

  const restoreModalBackgrounds = (): void => {
    for (const [element, wasInert] of modalBackgrounds) {
      element.inert = wasInert;
      if (!wasInert) element.removeAttribute('inert');
    }
    modalBackgrounds.clear();
  };

  root.classList.add('command-center');
  root.setAttribute('role', 'region');

  const navigation = document.createElement('div');
  navigation.className = 'command-center__navigation';

  const shellTitle = document.createElement('h1');
  shellTitle.id = `command-center-title-${instanceId}`;
  shellTitle.className = 'command-center__title';
  shellTitle.textContent = 'Command center';
  root.setAttribute('aria-labelledby', shellTitle.id);

  const modesTrigger = document.createElement('button');
  modesTrigger.type = 'button';
  modesTrigger.className = 'command-center__modes-trigger';
  setIconLabel(modesTrigger, 'modes', 'Modes');
  modesTrigger.setAttribute('aria-haspopup', 'dialog');
  modesTrigger.setAttribute('aria-expanded', 'false');

  const rail = document.createElement('nav');
  rail.className = 'command-center__category-rail';
  rail.setAttribute('aria-label', 'Command categories');
  navigation.append(shellTitle, modesTrigger, rail);

  const body = document.createElement('div');
  body.className = 'command-center__body';

  const library = document.createElement('section');
  library.className = 'command-center__library';

  const libraryTitle = document.createElement('h2');
  libraryTitle.id = `command-center-library-title-${instanceId}`;
  library.setAttribute('aria-labelledby', libraryTitle.id);

  const libraryItems = document.createElement('div');
  libraryItems.className = 'command-center__library-items';
  library.append(libraryTitle, libraryItems);

  const workspaceHost = document.createElement('section');
  workspaceHost.className = 'command-center__workspace-host';
  workspaceHost.dataset.commandWorkspaceHost = '';
  workspaceHost.setAttribute('aria-label', 'Preparation workspace');
  body.append(library, workspaceHost);

  const sheet = document.createElement('aside');
  sheet.id = `command-center-modes-${instanceId}`;
  sheet.className = 'command-center__modes-sheet';
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');

  const sheetTitle = document.createElement('h2');
  sheetTitle.id = `command-center-modes-title-${instanceId}`;
  sheetTitle.textContent = 'Modes';
  sheet.setAttribute('aria-labelledby', sheetTitle.id);
  modesTrigger.setAttribute('aria-controls', sheet.id);

  const closeSheetButton = document.createElement('button');
  closeSheetButton.type = 'button';
  closeSheetButton.className = 'command-center__modes-close';
  setIconLabel(closeSheetButton, 'close', 'Close');
  closeSheetButton.setAttribute('aria-label', 'Close Modes');

  const sheetCategories = document.createElement('nav');
  sheetCategories.className = 'command-center__sheet-categories';
  sheetCategories.setAttribute('aria-label', 'Modes');
  sheet.append(sheetTitle, closeSheetButton, sheetCategories);

  root.replaceChildren(navigation, body, sheet);

  const findCategory = (categoryId: CommandCategoryId | null) => (
    categoryId === null
      ? undefined
      : registry.categories.find(({ contribution }) => contribution.id === categoryId)
  );

  const firstSelection = (): CommandSelection | null => {
    for (const category of registry.categories) {
      const item = category.items[0];
      if (item) return { categoryId: category.contribution.id, itemId: item.id };
    }
    return null;
  };

  const disposeActiveView = (): void => {
    const retiring = activeView;
    if (!retiring) return;
    activeView = null;
    if (!retiring.disposed) {
      retiring.disposed = true;
      retiring.lifetime.abort();
      retiring.view.dispose();
    }
    retiring.mount.remove();
  };

  const mountSelection = (next: CommandSelection | null): void => {
    if (next && activeView?.itemId === next.itemId) {
      activeView.view.update(context);
      return;
    }

    generation += 1;
    focusRequest += 1;
    disposeActiveView();
    workspaceHost.replaceChildren();
    if (!next) return;

    const available = findAvailableCommandItem(registry, next.categoryId, next.itemId);
    if (!available) return;
    const mount = document.createElement('div');
    mount.className = 'command-center__workspace-mount';
    mount.dataset.commandWorkspaceMount = '';
    mount.dataset.commandItem = available.item.id;
    workspaceHost.append(mount);
    const viewGeneration = generation;
    const lifetimeController = new AbortController();
    const lifetime: CommandViewLifetime = Object.freeze({
      signal: lifetimeController.signal,
      isCurrent: () => (
        !destroyed
        && !lifetimeController.signal.aborted
        && generation === viewGeneration
      ),
      run: (effect: () => void) => {
        if (
          destroyed
          || lifetimeController.signal.aborted
          || generation !== viewGeneration
        ) return false;
        effect();
        return true;
      },
    });
    const view = available.item.createView(mount, context, lifetime);
    activeView = {
      generation,
      itemId: available.item.id,
      mount,
      view,
      lifetime: lifetimeController,
      disposed: false,
    };
  };

  const focusCategory = (categoryId: CommandCategoryId, surface: 'rail' | 'sheet'): void => {
    const container = surface === 'rail' ? rail : sheetCategories;
    container.querySelector<HTMLButtonElement>(
      `[data-command-category="${categoryId}"]`,
    )?.focus();
  };

  const focusSelectedItem = (): void => {
    if (!selected) return;
    libraryItems.querySelector<HTMLButtonElement>(
      `[data-command-item="${selected.itemId}"]`,
    )?.focus();
  };

  const captureStableFocus = (): StableFocusToken | null => {
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || !root.contains(focused)) return null;
    const categoryId = focused.dataset.commandCategory;
    const surface = focused.dataset.commandSurface;
    if (categoryId && (surface === 'rail' || surface === 'sheet')) {
      return {
        kind: 'category',
        categoryId: categoryId as CommandCategoryId,
        surface,
      };
    }
    const itemId = focused.dataset.commandItem;
    return itemId ? { kind: 'item', itemId: itemId as CommandItemId } : null;
  };

  const restoreStableFocus = (token: StableFocusToken | null): boolean => {
    if (!token) return false;
    if (token.kind === 'category') {
      const container = token.surface === 'rail' ? rail : sheetCategories;
      const control = container.querySelector<HTMLButtonElement>(
        `[data-command-category="${token.categoryId}"]`,
      );
      if (!control) return false;
      control.focus();
      return true;
    }
    const control = libraryItems.querySelector<HTMLButtonElement>(
      `[data-command-item="${token.itemId}"]`,
    );
    if (!control) return false;
    control.focus();
    return true;
  };

  const focusFallbackSelection = (): void => {
    if (!sheet.hidden) {
      if (activeCategoryId) focusCategory(activeCategoryId, 'sheet');
      else closeSheetButton.focus();
      return;
    }
    focusSelectedItem();
  };

  const categoryButtons = (
    container: HTMLElement,
    surface: 'rail' | 'sheet',
  ): HTMLButtonElement[] => (
    [...container.querySelectorAll<HTMLButtonElement>('[data-command-category]')]
      .filter((button) => button.dataset.commandSurface === surface)
  );

  const moveCategory = (
    source: HTMLButtonElement,
    key: string,
    surface: 'rail' | 'sheet',
  ): boolean => {
    const availableButtons = categoryButtons(surface === 'rail' ? rail : sheetCategories, surface);
    const index = availableButtons.indexOf(source);
    if (index < 0) return false;
    let nextIndex: number;
    if (key === 'Home') nextIndex = 0;
    else if (key === 'End') nextIndex = availableButtons.length - 1;
    else if (key === 'ArrowLeft' || key === 'ArrowUp') {
      nextIndex = (index - 1 + availableButtons.length) % availableButtons.length;
    } else if (key === 'ArrowRight' || key === 'ArrowDown') {
      nextIndex = (index + 1) % availableButtons.length;
    } else return false;
    availableButtons[nextIndex]?.click();
    return true;
  };

  const renderCategories = (
    container: HTMLElement,
    surface: 'rail' | 'sheet',
  ): void => {
    const fragment = document.createDocumentFragment();
    for (const { contribution } of registry.categories) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'command-center__category';
      button.dataset.commandCategory = contribution.id;
      button.dataset.commandSurface = surface;
      button.dataset.commandIcon = contribution.icon;
      setIconLabel(button, contribution.icon, contribution.label);
      button.setAttribute('aria-pressed', String(contribution.id === activeCategoryId));
      button.addEventListener('click', () => {
        selectCategory(contribution.id, true);
        focusCategory(contribution.id, surface);
      }, { signal: listeners.signal });
      button.addEventListener('keydown', (event) => {
        if (moveCategory(button, event.key, surface)) event.preventDefault();
      }, { signal: listeners.signal });
      fragment.append(button);
    }
    container.replaceChildren(fragment);
  };

  const renderLibrary = (): void => {
    const category = findCategory(activeCategoryId);
    libraryTitle.textContent = category?.contribution.label ?? 'Commands';
    const fragment = document.createDocumentFragment();
    if (!category || category.items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'command-center__library-empty';
      empty.setAttribute('role', 'status');
      empty.textContent = 'No commands available.';
      fragment.append(empty);
    } else {
      category.items.forEach((item, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'command-center__item';
        button.dataset.commandItem = item.id;
        button.setAttribute('aria-current', String(item.id === selected?.itemId));
        const label = document.createElement('span');
        label.className = 'command-center__item-label';
        label.textContent = item.summary.label;
        const description = document.createElement('span');
        description.className = 'command-center__item-description';
        description.textContent = item.summary.description;
        button.append(label, description);
        button.addEventListener('click', () => {
          selectItem(item.id, true);
          focusSelectedItem();
        }, { signal: listeners.signal });
        button.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            button.click();
            return;
          }
          let nextIndex: number;
          if (event.key === 'Home') nextIndex = 0;
          else if (event.key === 'End') nextIndex = category.items.length - 1;
          else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
            nextIndex = (index - 1 + category.items.length) % category.items.length;
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
            nextIndex = (index + 1) % category.items.length;
          } else return;
          event.preventDefault();
          libraryItems.querySelectorAll<HTMLButtonElement>('[data-command-item]')[nextIndex]?.focus();
        }, { signal: listeners.signal });
        fragment.append(button);
      });
    }
    libraryItems.replaceChildren(fragment);
  };

  const renderNavigation = (): void => {
    renderCategories(rail, 'rail');
    renderCategories(sheetCategories, 'sheet');
    renderLibrary();
  };

  function selectItem(itemId: CommandItemId, remember: boolean): void {
    const category = findCategory(activeCategoryId);
    const item = category?.items.find((candidate) => candidate.id === itemId);
    if (!category || !item) return;
    const next = { categoryId: category.contribution.id, itemId: item.id };
    const changed = selected?.categoryId !== next.categoryId || selected.itemId !== next.itemId;
    selected = next;
    activeCategoryId = next.categoryId;
    if (changed) mountSelection(next);
    else activeView?.view.update(context);
    renderNavigation();
    if (remember) options.selectionStore.remember(next);
  }

  function selectCategory(categoryId: CommandCategoryId, remember: boolean): void {
    const category = findCategory(categoryId);
    if (!category) return;
    activeCategoryId = categoryId;
    const item = category.items.find((candidate) => candidate.id === selected?.itemId)
      ?? category.items[0];
    if (!item) {
      selected = null;
      mountSelection(null);
      renderNavigation();
      return;
    }
    selectItem(item.id, remember);
  }

  const closeSheet = (): void => {
    if (sheet.hidden) return;
    sheet.hidden = true;
    navigation.inert = false;
    body.inert = false;
    restoreModalBackgrounds();
    modesTrigger.setAttribute('aria-expanded', 'false');
    modesTrigger.focus();
  };

  const openSheet = (): void => {
    if (!sheet.hidden) return;
    sheet.hidden = false;
    navigation.inert = true;
    body.inert = true;
    const shellParent = root.parentElement;
    if (shellParent) {
      for (const sibling of shellParent.children) {
        if (sibling instanceof HTMLElement && sibling !== root) {
          modalBackgrounds.set(sibling, sibling.inert === true || sibling.hasAttribute('inert'));
          sibling.inert = true;
        }
      }
    }
    modesTrigger.setAttribute('aria-expanded', 'true');
    const selectedCategory = sheetCategories.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    (selectedCategory ?? closeSheetButton).focus();
  };

  modesTrigger.addEventListener('click', openSheet, { signal: listeners.signal });
  closeSheetButton.addEventListener('click', closeSheet, { signal: listeners.signal });
  sheet.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSheet();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = [...sheet.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
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
  }, { signal: listeners.signal });

  for (const eventName of ['click', 'keydown', 'pointerdown', 'touchstart'] as const) {
    root.addEventListener(eventName, (event) => {
      interactionObserved = true;
      event.stopPropagation();
    }, {
      signal: listeners.signal,
    });
  }

  const requested = options.initialSelection ?? options.selectionStore.read();
  const available = requested
    ? findAvailableCommandItem(registry, requested.categoryId, requested.itemId)
    : null;
  selected = available?.selection ?? firstSelection();
  activeCategoryId = selected?.categoryId ?? registry.categories[0]?.contribution.id ?? null;
  renderNavigation();
  mountSelection(selected);

  return {
    update: (nextContext) => {
      if (destroyed) return;
      const focusToken = captureStableFocus();
      context = nextContext;
      registry = resolveCommandRegistry(options.contributions, context);
      const current = selected
        ? findAvailableCommandItem(registry, selected.categoryId, selected.itemId)
        : null;
      if (current) {
        selected = current.selection;
        activeCategoryId = current.category.id;
        renderNavigation();
        activeView?.view.update(context);
        restoreStableFocus(focusToken);
        return;
      }
      selected = firstSelection();
      activeCategoryId = selected?.categoryId ?? registry.categories[0]?.contribution.id ?? null;
      renderNavigation();
      mountSelection(selected);
      const request = ++focusRequest;
      const expectedGeneration = generation;
      queueMicrotask(() => {
        if (!destroyed && request === focusRequest && expectedGeneration === generation) {
          focusFallbackSelection();
        }
      });
    },
    promoteInitialSelection: (nextSelection) => {
      if (destroyed || interactionObserved || root.contains(document.activeElement)) return false;
      const availableSelection = findAvailableCommandItem(
        registry,
        nextSelection.categoryId,
        nextSelection.itemId,
      );
      if (!availableSelection) return false;
      selected = availableSelection.selection;
      activeCategoryId = availableSelection.category.id;
      renderNavigation();
      mountSelection(selected);
      return true;
    },
    focusWorkspaceDefault: () => {
      const requestedView = activeView;
      if (!requestedView) return;
      const request = ++focusRequest;
      queueMicrotask(() => {
        if (
          !destroyed
          && request === focusRequest
          && activeView === requestedView
          && requestedView.generation === generation
        ) {
          requestedView.view.focusDefault();
        }
      });
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      generation += 1;
      focusRequest += 1;
      listeners.abort();
      navigation.inert = false;
      body.inert = false;
      restoreModalBackgrounds();
      disposeActiveView();
      root.replaceChildren();
      root.classList.remove('command-center');
      root.removeAttribute('role');
      root.removeAttribute('aria-labelledby');
    },
  };
}
