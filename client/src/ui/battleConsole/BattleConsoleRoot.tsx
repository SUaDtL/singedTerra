import matchFrameUrl from '../../assets/battle-console/battle-match-frame-v2.webp';
import armoryFrameUrl from '../../assets/battle-console/battle-armory-frame-ultrawide-v3.webp';
import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { CompactConsole } from './components/CompactConsole';
import { WeaponIcon } from './components/WeaponIcon';
import { SemanticContractTree } from './components/SemanticContractTree';
import {
  BattleConsolePortal,
  emptyBattleConsolePortalHosts,
  type BattleConsolePortalHosts,
} from './portals';
import type { BattleConsoleLifecycleStatus, BattleConsolePresentationState, BattleConsoleIntent } from './types';
import type { BattleConsoleLayoutMode } from './projection';
import { battleConsoleModeAssets, battleConsoleModeAssetUrl } from './modeAssets';
import { battleConsoleSemanticNodes, battleConsoleSemanticRegions } from './runtimeData';

interface RuntimeRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function markerStyle(rect: RuntimeRect): JSX.CSSProperties {
  return {
    position: 'absolute',
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    pointerEvents: 'none',
  };
}

function usesCanonicalSemanticInk(id: string, state: BattleConsolePresentationState): boolean {
  // AC-02/03: live readings always belong to DOM, including their default values.
  switch (id) {
    case 'commander-title':
    case 'weapon-label':
    case 'ballistics-title':
    case 'fire-control-title':
      return true;
    case 'armory-label':
      return !state.armory.open;
    default:
      return false;
  }
}

function CanonicalSemanticInk({
  state,
  layoutMode,
  scale,
}: Readonly<{
  state: BattleConsolePresentationState;
  layoutMode: BattleConsoleLayoutMode;
  scale: number;
}>) {
  const regions = battleConsoleSemanticRegions.filter((region) => usesCanonicalSemanticInk(region.id, state));
  const atlas = battleConsoleModeAssets[layoutMode].semantic;
  const semanticAtlasUrl = battleConsoleModeAssetUrl(
    import.meta.env.BASE_URL,
    'canonical-semantic-atlas',
    layoutMode,
  );
  return (
    <div
      aria-hidden="true"
      data-battle-console-semantic-mode={layoutMode}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: `${battleConsoleModeAssets[layoutMode].surface.width}px`,
        height: `${battleConsoleModeAssets[layoutMode].surface.height}px`,
        pointerEvents: 'none',
        transform: `scale(${1 / scale})`,
        transformOrigin: '0 0',
        zIndex: 4,
      }}
    >
      {regions.map((region) => {
        const projected = atlas.regions.find((candidate) => candidate.key === region.id);
        if (!projected) throw new Error(`Missing ${layoutMode} semantic atlas region: ${region.id}`);
        return (
          <i
            key={region.id}
            aria-hidden="true"
            data-battle-console-semantic-ink={region.id}
            style={{
              ...markerStyle(projected.targetRect),
              backgroundImage: `url("${semanticAtlasUrl}")`,
              backgroundPosition: `-${projected.atlasRect.x}px -${projected.atlasRect.y}px`,
              backgroundRepeat: 'no-repeat',
              backgroundSize: `${atlas.width}px ${atlas.height}px`,
            }}
          />
        );
      })}
    </div>
  );
}

const semanticAtlasModes = Object.freeze(['wide', 'standard', 'compact'] as const);

function SemanticAtlasPreloads() {
  return (
    <div hidden aria-hidden="true" data-battle-console-semantic-preloads="">
      {semanticAtlasModes.map((mode) => (
        <img
          key={mode}
          alt=""
          data-battle-console-semantic-preload={mode}
          src={battleConsoleModeAssetUrl(
            import.meta.env.BASE_URL,
            'canonical-semantic-atlas',
            mode,
          )}
        />
      ))}
      <img alt="" data-battle-console-match-frame-preload="" src={matchFrameUrl} />
      <img alt="" data-battle-console-armory-frame-preload="" src={armoryFrameUrl} loading="eager" decoding="sync" />
    </div>
  );
}

export interface BattleConsoleClassNames {
  readonly root: string;
  readonly inline: string;
  readonly portal: string;
  readonly semanticNode: string;
  readonly weaponIcon: string;
}

const unstyledClassNames: BattleConsoleClassNames = Object.freeze({
  root: 'battle-console-root',
  inline: 'battle-console-root__inline',
  portal: 'battle-console-root__portal',
  semanticNode: 'battle-console-root__semantic-node',
  weaponIcon: 'battle-console-root__weapon-icon',
});

function ArmoryPanel({
  state,
  dispatch,
  className,
}: Readonly<{
  state: BattleConsolePresentationState;
  dispatch: (intent: BattleConsoleIntent) => void;
  className: string;
}>) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    closeButton.current?.focus({ preventScroll: true });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dispatch({ type: 'armory-close' });
        return;
      }
      if (event.key !== 'Tab' || !panel.current?.contains(document.activeElement)) return;
      const controls = [...panel.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex="0"]',
      )];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [dispatch]);
  return (
    <section
      ref={panel}
      class={className}
      role="dialog"
      aria-modal="true"
      aria-label="Armory"
      data-battle-console-dialog="armory"
      data-semantic-key="armory-portal-host::armory-dialog"
    >
      <header data-battle-console-portal-header="">
        <aside data-battle-console-armory-budget="">
          <span>Credits</span>
          <output aria-label="Available credits" data-battle-console-credits="">
            {state.armory.credits == null ? 'Unavailable' : `$${state.armory.credits.toLocaleString()}`}
          </output>
        </aside>
        <div>
          <span data-battle-console-eyebrow="">Battle supply</span>
          <h2>Armory</h2>
        </div>
        <button
          ref={closeButton}
          type="button"
          aria-label="Close Armory"
          data-semantic-key="node:button:Close Armory:114"
          onClick={() => dispatch({ type: 'armory-close' })}
        >
          Close
        </button>
      </header>
      <div data-battle-console-armory-scroll="" tabIndex={0} aria-label="Armory inventory">
        <div data-battle-console-armory-grid="">
          {state.armory.items.map((item) => (
            <article key={item.key} data-battle-console-armory-item="">
            <header>
              <h3>{item.name}</h3>
              <span data-battle-console-owned="" data-owned={item.owned}>
                {item.purchase.weapon ? (item.ammo === null ? '∞ ammo' : `${item.ammo} ammo`) : `${item.owned} owned`}
              </span>
            </header>
            <p>{item.description}</p>
            <div data-battle-console-portal-actions="">
              <span data-battle-console-bundle="" data-bundle-size={item.bundleSize}>+{item.bundleSize} per purchase</span>
              {item.purchase.weapon && (
                <button
                  type="button"
                  disabled={!item.canEquip || item.equipped || state.armory.submitting}
                  onClick={() => dispatch({ type: 'armory-equip', weapon: item.purchase.weapon! })}
                >
                  {item.equipped ? 'Equipped' : 'Equip'}
                </button>
              )}
              <button
                type="button"
                disabled={!item.canBuy || state.armory.submitting || state.commander.id === null}
                onClick={() => {
                  if (state.commander.id) {
                    dispatch({
                      type: 'armory-buy',
                      purchase: item.purchase,
                      tankId: state.commander.id,
                    });
                  }
                }}
              >
                Buy ${item.price.toLocaleString()}
              </button>
            </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function SettingsPanel({
  state,
  dispatch,
  className,
}: Readonly<{
  state: BattleConsolePresentationState;
  dispatch: (intent: BattleConsoleIntent) => void;
  className: string;
}>) {
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    panel.current?.querySelector<HTMLElement>('[role="switch"]')?.focus({ preventScroll: true });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dispatch({ type: 'settings-close' });
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = [...(panel.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])];
      if (controls.length === 0 || !panel.current?.contains(document.activeElement)) return;
      const first = controls[0]!;
      const last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch]);
  return (
    <div
      ref={panel}
      class={className}
      data-ui="battle-settings"
      data-semantic-key="settings-dialog::backdrop"
      data-battle-console-settings-backdrop=""
      aria-hidden="false"
      onClick={(event) => {
        if (event.target === event.currentTarget) dispatch({ type: 'settings-close' });
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Battle Settings"
        data-battle-console-dialog="settings"
        onClick={(event) => event.stopPropagation()}
      >
        <header data-battle-console-portal-header="">
          <span data-battle-console-eyebrow="">Field controls</span>
          <h2 data-semantic-key="settings-dialog::title">Settings</h2>
        </header>
        <div data-battle-console-settings-grid="">
          <button
            type="button"
            role="switch"
            aria-label="Trajectory guide"
            aria-checked={state.settings.guideEnabled}
            data-semantic-key="settings-dialog::switch-guide"
            onClick={() => dispatch({ type: 'settings-toggle-guide' })}
          >
            <span>Trajectory guide</span><strong>{state.settings.guideEnabled ? 'On' : 'Off'}</strong>
          </button>
          <button
            type="button"
            role="switch"
            aria-label="Sound"
            aria-checked={state.settings.soundEnabled}
            data-semantic-key="settings-dialog::switch-audio"
            onClick={() => dispatch({ type: 'settings-toggle-sound' })}
          >
            <span>Sound</span><strong>{state.settings.soundEnabled ? 'On' : 'Off'}</strong>
          </button>
        </div>
        <footer data-battle-console-settings-footer="">
          <button
            type="button"
            aria-label="Close settings"
            data-semantic-key="settings-dialog::close"
            data-battle-console-settings-close=""
            onClick={() => dispatch({ type: 'settings-close' })}
          >
            Close settings
          </button>
        </footer>
      </section>
    </div>
  );
}

function CoachPanel({
  dispatch,
  className,
}: Readonly<{
  state: BattleConsolePresentationState;
  dispatch: (intent: BattleConsoleIntent) => void;
  className: string;
}>) {
  const enterButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const focusEntry = () => enterButton.current?.focus({ preventScroll: true });
    focusEntry();
    window.addEventListener('st:splash-dismissed', focusEntry);
    return () => window.removeEventListener('st:splash-dismissed', focusEntry);
  }, []);

  return (
    <section class={className} role="dialog" aria-modal="true" aria-label="First salvo briefing"
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault();
        buttons[(current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }}
    >
      <span data-battle-console-eyebrow="">First salvo</span>
      <h2>Field briefing</h2>
      <p>Adjust angle and power to line up your shot. Wind changes each turn and can push your shell sideways. Fire commits your shot and ends your turn.</p>
      <div data-battle-console-portal-actions="">
        <button type="button" onClick={() => dispatch({ type: 'coach-skip' })}>Skip</button>
        <button ref={enterButton} type="button" onClick={() => dispatch({ type: 'coach-enter' })}>
          Enter battle
        </button>
      </div>
    </section>
  );
}

export interface BattleConsoleRootProps {
  readonly state: BattleConsolePresentationState;
  readonly lifecycleStatus: BattleConsoleLifecycleStatus;
  readonly dispatch: (intent: BattleConsoleIntent) => void;
  readonly portalHosts?: BattleConsolePortalHosts;
  readonly classNames?: BattleConsoleClassNames;
  readonly layoutMode?: BattleConsoleLayoutMode;
  readonly scale?: number;
}

export function BattleConsoleRoot({
  state,
  lifecycleStatus,
  dispatch,
  portalHosts = emptyBattleConsolePortalHosts,
  classNames = unstyledClassNames,
  layoutMode = 'wide',
  scale = 1,
}: BattleConsoleRootProps) {
  const root = useRef<HTMLDivElement>(null);
  const settingsWasOpen = useRef(state.settings.open);
  const armoryWasOpen = useRef(state.armory.open);
  const coachWasOpen = useRef(state.coach.briefingOpen && state.coach.step !== null);
  const coachBriefingOpen = state.coach.briefingOpen && state.coach.step !== null;
  const canonicalInkKeys = lifecycleStatus === 'ready'
    ? battleConsoleSemanticRegions
      .filter((region) => usesCanonicalSemanticInk(region.id, state))
      .map((region) => region.id)
      .join(' ')
    : '';
  const inlineInert = state.armory.open || state.settings.open || coachBriefingOpen;
  // Capture the live focus owner before Preact replaces the breakpoint-specific tree.
  // Restoring a stored last-focus key would steal focus from dialogs or outside controls.
  const activeInlineElement = root.current?.querySelector('[data-console-owner="preact"]')
    ?.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
  const breakpointFocusKey = inlineInert ? null : activeInlineElement?.dataset['semanticKey'];
  useLayoutEffect(() => {
    if (!breakpointFocusKey) return;
    const target = [...(root.current?.querySelectorAll<HTMLElement>(
      '[data-console-owner="preact"] [data-semantic-key]',
    ) ?? [])].find((element) => element.dataset['semanticKey'] === breakpointFocusKey);
    target?.focus({ preventScroll: true });
  }, [layoutMode]);
  useEffect(() => {
    const wasOpen = settingsWasOpen.current;
    settingsWasOpen.current = state.settings.open;
    if (!wasOpen || state.settings.open || !state.settings.returnFocusKey) return;
    const target = state.settings.returnFocusKey === 'pause-origin::menu-trigger'
      ? document.querySelector<HTMLElement>('[data-ui="match-drawer-toggle"]')
      : [...(root.current?.querySelectorAll<HTMLElement>('[data-semantic-key]') ?? [])]
        .find((element) => element.dataset['semanticKey'] === state.settings.returnFocusKey);
    target?.focus({ preventScroll: true });
  }, [state.settings.open, state.settings.returnFocusKey]);
  useEffect(() => {
    const wasOpen = armoryWasOpen.current;
    armoryWasOpen.current = state.armory.open;
    if (!wasOpen || state.armory.open) return;
    const target = [...(root.current?.querySelectorAll<HTMLElement>('[data-semantic-key]') ?? [])]
      .find((element) => element.dataset['semanticKey'] === 'armory-inline-host::weapon-trigger');
    target?.focus({ preventScroll: true });
  }, [state.armory.open]);
  useEffect(() => {
    const wasOpen = coachWasOpen.current;
    coachWasOpen.current = coachBriefingOpen;
    if (!wasOpen || coachBriefingOpen) return;
    root.current?.querySelector<HTMLElement>('[data-semantic-key="command-console-host::fire"]')
      ?.focus({ preventScroll: true });
  }, [coachBriefingOpen]);
  const tree = (rootKey: string) => (
    <SemanticContractTree
      nodes={battleConsoleSemanticNodes}
      rootKey={rootKey}
      state={state}
      dispatch={dispatch}
      semanticClassName={classNames.semanticNode}
    />
  );

  return (
    <div
      ref={root}
      class={classNames.root}
      data-battle-console-state={lifecycleStatus}
      data-battle-console-mode={layoutMode}
      data-battle-console-semantic-tree=""
      data-battle-console-scope="css-module"
      data-battle-console-canonical-ink={canonicalInkKeys || undefined}
      style={{ '--battle-console-scale': String(scale) } as JSX.CSSProperties}
    >
      <SemanticAtlasPreloads />
      <div class={classNames.inline} data-console-owner="preact" inert={inlineInert || undefined}>
        {layoutMode === 'compact' ? <CompactConsole state={state} dispatch={dispatch} /> : <>
        <WeaponIcon className={classNames.weaponIcon} weapon={state.weapon.type} />
        {tree('command-console-host')}
        {tree('armory-inline-host')}
        </>}
      </div>
      {lifecycleStatus === 'ready' && layoutMode !== 'compact' && (
        <CanonicalSemanticInk state={state} layoutMode={layoutMode} scale={scale} />
      )}
      {coachBriefingOpen && (
        <BattleConsolePortal host={portalHosts.coach}>
          <CoachPanel state={state} dispatch={dispatch} className={classNames.portal} />
        </BattleConsolePortal>
      )}
      {state.settings.open && (
        <BattleConsolePortal host={portalHosts.settings}>
          <SettingsPanel
            state={state}
            dispatch={dispatch}
            className={classNames.portal}
          />
        </BattleConsolePortal>
      )}
      {state.armory.open && (
        <BattleConsolePortal host={portalHosts.armory}>
          <ArmoryPanel state={state} dispatch={dispatch} className={classNames.portal} />
        </BattleConsolePortal>
      )}
    </div>
  );
}
