import {
  commandCategoryId,
  commandItemId,
  type CommandCategoryContribution,
  type CommandViewLifetime,
  type MountedCommandView,
} from './contracts';

export interface MultiplayerCommandContext {
  readonly verifiedOperationsAvailable: boolean;
  readonly buildLocalBattleWorkspace: (listenerSignal: AbortSignal) => HTMLElement;
  readonly buildVerifiedOperationsWorkspace: (listenerSignal: AbortSignal) => HTMLElement;
  readonly buildOnlineBattleWorkspace: (listenerSignal: AbortSignal) => HTMLElement;
  readonly releaseOnlineBattleWorkspace: () => void;
}

function createBattlefieldProjection(document: Document): HTMLElement {
  const projection = document.createElement('figure');
  projection.className = 'command-center__battlefield-projection';
  projection.dataset.battlefieldProjection = 'verified-operations';
  const art = document.createElement('img');
  art.src = `${import.meta.env.BASE_URL}art/battlefield-theater-ultrawide-v2.webp`;
  art.alt = '';
  const caption = document.createElement('figcaption');
  caption.textContent = 'Verified proving ground';
  projection.append(art, caption);
  return projection;
}

export function createMultiplayerCommandView<Context extends MultiplayerCommandContext>(
  host: HTMLElement,
  context: Readonly<Context>,
  lifetime: CommandViewLifetime,
): MountedCommandView<Context> {
  const root = host.ownerDocument.createElement('article');
  root.className = 'multiplayer-command';
  root.dataset.multiplayerCommandView = 'local-battle';
  root.append(context.buildLocalBattleWorkspace(lifetime.signal));
  host.replaceChildren(root);

  let disposed = false;
  return {
    // Lobby remains the owner of mutable Local setup state. Its existing
    // callbacks re-render the shell with a fresh owned view when that state changes.
    update: () => undefined,
    focusDefault: () => {
      if (disposed) return;
      root.querySelector<HTMLElement>(
        '#lobby-hotseat-player-count, .lobby-start:not(:disabled), button:not(:disabled)',
      )?.focus();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      root.remove();
    },
  };
}

export function createVerifiedOperationsCommandView<Context extends MultiplayerCommandContext>(
  host: HTMLElement,
  context: Readonly<Context>,
  lifetime: CommandViewLifetime,
): MountedCommandView<Context> {
  const root = host.ownerDocument.createElement('article');
  root.className = 'multiplayer-command multiplayer-command--verified';
  root.dataset.multiplayerCommandView = 'verified-operations';
  root.append(
    createBattlefieldProjection(host.ownerDocument),
    context.buildVerifiedOperationsWorkspace(lifetime.signal),
  );
  host.replaceChildren(root);

  let disposed = false;
  return {
    update: () => undefined,
    focusDefault: () => {
      if (disposed) return;
      root.querySelector<HTMLElement>(
        '[role="tab"][aria-selected="true"], .primary:not(:disabled), button:not(:disabled)',
      )?.focus();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      root.remove();
    },
  };
}

export function createOnlineCommandView<Context extends MultiplayerCommandContext>(
  host: HTMLElement,
  context: Readonly<Context>,
  lifetime: CommandViewLifetime,
): MountedCommandView<Context> {
  const root = host.ownerDocument.createElement('article');
  root.className = 'multiplayer-command multiplayer-command--online';
  root.dataset.multiplayerCommandView = 'online';
  root.append(context.buildOnlineBattleWorkspace(lifetime.signal));
  host.replaceChildren(root);

  let disposed = false;
  return {
    update: () => undefined,
    focusDefault: () => {
      if (disposed) return;
      root.querySelector<HTMLElement>(
        '[data-network-recovery-retry], .lobby-btn.primary:not(:disabled), input:not(:disabled), button:not(:disabled)',
      )?.focus();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      context.releaseOnlineBattleWorkspace();
      root.remove();
    },
  };
}

export function createMultiplayerCommandCategoryContribution<
  Context extends MultiplayerCommandContext,
>(): CommandCategoryContribution<Context> {
  return {
    id: commandCategoryId('multiplayer'),
    label: 'Multiplayer',
    icon: 'multiplayer',
    order: 30,
    availability: () => true,
    provideItems: () => [
      {
        id: commandItemId('local-battle'),
        summary: {
          label: 'Local Battle',
          description: 'Share one screen with a local crew.',
        },
        availability: () => true,
        createView: (host, context, lifetime) => (
          createMultiplayerCommandView(host, context, lifetime)
        ),
      },
      {
        id: commandItemId('verified-operations'),
        summary: {
          label: 'Verified Operations',
          description: 'Deploy against authenticated orders and qualifications.',
        },
        availability: (context) => context.verifiedOperationsAvailable,
        createView: (host, context, lifetime) => (
          createVerifiedOperationsCommandView(host, context, lifetime)
        ),
      },
      {
        id: commandItemId('online'),
        summary: {
          label: 'Online',
          description: 'Create, join, or browse a network room.',
        },
        availability: () => true,
        createView: (host, context, lifetime) => (
          createOnlineCommandView(host, context, lifetime)
        ),
      },
    ],
  };
}
