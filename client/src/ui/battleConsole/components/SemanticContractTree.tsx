import { createElement, type JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import {
  clearTankLoadoutPreview,
  paintTankLoadoutPreview,
} from '../../../renderer/TankLoadoutPreview';
import type { BattleConsolePresentationState, BattleConsoleIntent } from '../types';
import { DEFAULT_POWER_CAP } from '@shared/engine/Tank';

export interface SemanticSourceRecord {
  readonly accessibleName: string;
  readonly checked: boolean | null;
  readonly current: string | null;
  readonly disabled: boolean;
  readonly expanded: boolean | null;
  readonly focusable: boolean;
  readonly live: string | null;
  readonly modal: boolean;
  readonly parentKey: string | null;
  readonly pressed: boolean | null;
  readonly role: string;
  readonly rootKey: string;
  readonly tabIndex: number;
  readonly tag: string;
  readonly visibleText: string;
}

export interface SemanticNodeDefinition {
  readonly stableKey: string;
  readonly sourceRecord: SemanticSourceRecord;
}

function windLabel(wind: number): string {
  if (Math.abs(wind) < 0.05) return 'calm';
  return `${Math.abs(wind).toFixed(1)} ${wind < 0 ? 'left' : 'right'}`;
}

function presentedCommanderHealth(state: BattleConsolePresentationState): number {
  return Math.max(0, Math.round(state.commander.health ?? 0));
}

const ARMORY_TRIGGER_KEY = 'armory-inline-host::weapon-trigger';
const ARMORY_TRIGGER_LABEL_KEY = 'node:span:Close Armory:36';

function dynamicText(
  node: SemanticNodeDefinition,
  state: BattleConsolePresentationState,
): string {
  const { sourceRecord: record } = node;
  const name = record.accessibleName.toLowerCase();
  if (node.stableKey === ARMORY_TRIGGER_LABEL_KEY) {
    return state.armory.open ? 'Close Armory' : 'Armory';
  }
  if (record.tag === 'BUTTON') {
    if (name.startsWith('move tank left')) return '‹';
    if (name.startsWith('move tank right') || name.startsWith('select next weapon')) return '›';
    if (name === 'aim barrel left' || name === 'decrease power') return '−';
    if (name === 'aim barrel right' || name === 'increase power') return '+';
  }
  if (name === 'p1' || /^p\d+$/.test(record.visibleText)) return state.commander.name;
  if (name.includes('health remaining')) return `${presentedCommanderHealth(state)} HP`;
  if (name.includes('fuel remaining')) return String(state.mobility.fuel ?? 0);
  if (name === 'baby missile' || name === 'weaponbaby missile∞') return state.weapon.name;
  if (name === 'unlimited ammunition') return state.weapon.ammo === null ? '∞' : String(state.weapon.ammo);
  if (record.role === 'status' && name.includes('fire ready')) return state.fireControl.status;
  if (record.tag === 'OUTPUT' && name === 'angle') return `${Math.round(state.ballistics.angle)}°`;
  if (record.tag === 'OUTPUT' && name === 'power') return String(Math.round(state.ballistics.power));
  if (record.tag === 'OUTPUT' && name === 'wind') {
    return Math.abs(state.ballistics.wind) < 0.05
      ? 'Calm'
      : `${state.ballistics.wind < 0 ? '←' : '→'} ${Math.abs(state.ballistics.wind).toFixed(1)}`;
  }
  if (name === 'fire ready') return state.fireControl.status;
  if (name === 'sound') return state.settings.soundEnabled ? 'On' : 'Off';
  if (name === 'trajectory guide') return state.settings.guideEnabled ? 'On' : 'Off';
  return record.visibleText;
}

function dynamicAccessibleName(
  node: SemanticNodeDefinition,
  state: BattleConsolePresentationState,
): string {
  const { sourceRecord: record } = node;
  const name = record.accessibleName.toLowerCase();
  if (record.tag === 'OUTPUT' && name === 'power') {
    const powerCap = Math.max(0, state.ballistics.powerCap ?? DEFAULT_POWER_CAP);
    return `Power ${Math.round(state.ballistics.power)} of ${Math.round(powerCap)}`;
  }
  if (record.tag === 'OUTPUT' && name === 'wind') return `Wind ${windLabel(state.ballistics.wind)}`;
  if (name === 'baby missile' || name === 'weaponbaby missile∞') return state.weapon.name;
  if (name === 'unlimited ammunition') return state.weapon.ammo === null ? 'Unlimited ammunition' : `${state.weapon.ammo} ammunition`;
  if (node.stableKey === ARMORY_TRIGGER_KEY) {
    return state.armory.open ? 'Close Armory' : 'Open Armory';
  }
  if (record.role === 'status' && name.includes("'s turn.")) {
    return `${state.commander.name}'s turn. ${presentedCommanderHealth(state)} health. Weapon ${state.weapon.name}. ${state.mobility.fuel ?? 0} fuel remaining.`;
  }
  if (record.role === 'status' && name.includes('fire ready.')) {
    return `${state.fireControl.status}. ${state.weapon.name} · ${Math.round(state.ballistics.angle)}° · Power ${Math.round(state.ballistics.power)} · Wind ${windLabel(state.ballistics.wind)}.`;
  }
  if (name === 'p1' || /^p\d+$/.test(record.visibleText)) return state.commander.name;
  if (name.includes('health remaining')) return `${presentedCommanderHealth(state)} health remaining`;
  if (name.includes('fuel remaining')) return `${state.mobility.fuel ?? 0} fuel remaining`;
  if (name.startsWith('select next weapon')) {
    return `Select next weapon, current ${state.weapon.name}`;
  }
  if (record.tag === 'BUTTON' && name.startsWith('fire ')) return `Fire ${state.weapon.name}`;
  return record.accessibleName;
}

function intentFor(
  node: SemanticNodeDefinition,
  state: BattleConsolePresentationState,
): BattleConsoleIntent | null {
  const { sourceRecord: record } = node;
  if (record.tag !== 'BUTTON') return null;
  if (node.stableKey === ARMORY_TRIGGER_KEY) {
    return { type: state.armory.open ? 'armory-close' : 'armory-open' };
  }
  const name = record.accessibleName.toLowerCase();
  if (name.startsWith('move tank left')) return { type: 'move', delta: -1 };
  if (name.startsWith('move tank right')) return { type: 'move', delta: 1 };
  if (name.startsWith('select next weapon')) return { type: 'weapon-next' };
  if (name === 'close armory') return { type: 'armory-close' };
  if (name === 'aim barrel left') return { type: 'angle-step', delta: -1 };
  if (name === 'aim barrel right') return { type: 'angle-step', delta: 1 };
  if (name === 'decrease power') return { type: 'power-step', delta: -1 };
  if (name === 'increase power') return { type: 'power-step', delta: 1 };
  if (name === 'battle settings') return { type: 'settings-open', origin: 'command-console-host::settings-trigger' };
  if (name === 'close settings') return { type: 'settings-close' };
  if (name === 'trajectory guide') return { type: 'settings-toggle-guide' };
  if (name === 'sound') return { type: 'settings-toggle-sound' };
  if (name === 'skip') return { type: 'coach-skip' };
  if (name === 'enter battle') return { type: 'coach-enter' };
  if (name.startsWith('fire ')) return { type: 'fire' };

  const equip = /^equip (.+)$/i.exec(record.accessibleName);
  if (equip) {
    const item = state.armory.items.find((candidate) => candidate.name === equip[1]);
    if (item?.purchase.weapon) return { type: 'armory-equip', weapon: item.purchase.weapon };
  }
  const buy = /^buy (.+?) for /i.exec(record.accessibleName);
  if (buy && state.commander.id) {
    const item = state.armory.items.find((candidate) => candidate.name === buy[1]);
    if (item) return { type: 'armory-buy', purchase: item.purchase, tankId: state.commander.id };
  }
  return null;
}

function runtimeDisabled(record: SemanticSourceRecord, state: BattleConsolePresentationState): boolean {
  const name = record.accessibleName.toLowerCase();
  if (name.startsWith('move tank left')) return !state.mobility.canMoveLeft;
  if (name.startsWith('move tank right')) return !state.mobility.canMoveRight;
  if (name.startsWith('select next weapon')) return !state.weapon.canCycle;
  if (['aim barrel left', 'aim barrel right', 'decrease power', 'increase power'].includes(name)) {
    return !state.weapon.canCycle || state.fireControl.submitting;
  }
  if (name.startsWith('fire ')) return !state.fireControl.ready || state.fireControl.submitting;
  if (name.startsWith('buy ') || name.startsWith('equip ')) return state.armory.submitting;
  return record.disabled;
}

const compactTargetByStableKey = new Map<string, string>([
  ['node:button:Move tank left, 8 fuel maximum:14', 'move-left'],
  ['node:button:Move tank right, 8 fuel maximum:20', 'move-right'],
  ['node:button:Select next weapon, current Baby Missile:32', 'weapon-next'],
  [ARMORY_TRIGGER_KEY, 'armory'],
  ['command-console-host::aim-left-control', 'angle-decrease'],
  ['node:button:Aim barrel right:44', 'angle-increase'],
  ['node:button:Decrease power:49', 'power-decrease'],
  ['node:button:Increase power:53', 'power-increase'],
  ['command-console-host::settings-trigger', 'settings'],
  ['command-console-host::fire', 'fire'],
]);

function CommanderPortrait({
  node,
  state,
  semanticClassName,
}: Readonly<{
  node: SemanticNodeDefinition;
  state: BattleConsolePresentationState;
  semanticClassName?: string;
}>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const portrait = state.commander.portrait;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!portrait) {
      clearTankLoadoutPreview(canvas);
      return;
    }
    paintTankLoadoutPreview(canvas, portrait.color, portrait.loadout, 'tactical');
    return () => clearTankLoadoutPreview(canvas);
  }, [
    portrait?.color,
    portrait?.loadout.treads,
    portrait?.loadout.hull,
    portrait?.loadout.turret,
    portrait?.loadout.barrel,
  ]);

  return (
    <canvas
      ref={canvasRef}
      class={semanticClassName}
      data-semantic-key={node.stableKey}
      data-semantic-tag="canvas"
      data-battle-console-portrait=""
      width={144}
      height={80}
      role="img"
      aria-label={`${state.commander.name}'s tank.`}
    />
  );
}

export function SemanticContractTree({
  nodes,
  rootKey,
  state,
  dispatch,
  semanticClassName,
}: Readonly<{
  nodes: readonly SemanticNodeDefinition[];
  rootKey: string;
  state: BattleConsolePresentationState;
  dispatch: (intent: BattleConsoleIntent) => void;
  semanticClassName?: string;
}>) {
  const scopedNodes = nodes.filter((node) => node.sourceRecord.rootKey === rootKey);
  const rootStableKeys = new Set(scopedNodes.map((node) => node.stableKey));
  const byParent = new Map<string | null, SemanticNodeDefinition[]>();
  for (const node of scopedNodes) {
    const siblings = byParent.get(node.sourceRecord.parentKey) ?? [];
    siblings.push(node);
    byParent.set(node.sourceRecord.parentKey, siblings);
  }
  const roots = scopedNodes.filter((node) => (
    node.sourceRecord.parentKey === null || !rootStableKeys.has(node.sourceRecord.parentKey)
  ));

  const renderNode = (node: SemanticNodeDefinition): JSX.Element => {
    const record = node.sourceRecord;
    const children = byParent.get(node.stableKey) ?? [];
    const intent = intentFor(node, state);
    const isArmoryTrigger = node.stableKey === ARMORY_TRIGGER_KEY;
    const isSettingsBackdrop = node.stableKey === 'settings-dialog::backdrop';
    const isCommanderPortrait = record.tag === 'CANVAS' && record.role === 'img';
    if (isCommanderPortrait) {
      return (
        <CommanderPortrait
          key={node.stableKey}
          node={node}
          state={state}
          semanticClassName={semanticClassName}
        />
      );
    }
    const props: Record<string, unknown> = {
      key: node.stableKey,
      class: semanticClassName,
      'data-semantic-key': node.stableKey,
      'data-semantic-tag': record.tag.toLowerCase(),
      'data-battle-console-long-name': node.stableKey === 'node:span:P1:10' && state.commander.name.length > 12 ? '' : undefined,
      'data-battle-console-action': intent?.type === 'fire' ? 'fire' : undefined,
      'data-battle-console-target-key': compactTargetByStableKey.get(node.stableKey),
      'data-battle-console-text-key': node.stableKey === 'node:span:100 health remaining:11'
        ? 'commander.health'
        : undefined,
      'aria-label': dynamicAccessibleName(node, state) || undefined,
      title: ['node:span:P1:10', 'node:span:Baby Missile:30'].includes(node.stableKey)
        ? dynamicText(node, state) : undefined,
      'aria-live': record.live || undefined,
      'aria-modal': record.modal || undefined,
      'aria-current': record.current || undefined,
      'aria-expanded': isArmoryTrigger ? state.armory.open : record.expanded ?? undefined,
      'aria-pressed': record.pressed ?? undefined,
      'aria-checked': record.role === 'switch'
        ? (record.accessibleName.toLowerCase() === 'trajectory guide'
          ? state.settings.guideEnabled
          : state.settings.soundEnabled)
        : record.checked ?? undefined,
      role: record.role || undefined,
      tabIndex: isArmoryTrigger ? 0 : record.focusable ? record.tabIndex : undefined,
      disabled: record.tag === 'BUTTON' ? runtimeDisabled(record, state) : undefined,
      hidden: isArmoryTrigger && state.armory.open ? true : undefined,
      onClick: intent
        ? () => dispatch(intent)
        : isSettingsBackdrop
          ? (event: JSX.TargetedMouseEvent<HTMLElement>) => {
            if (event.target === event.currentTarget) dispatch({ type: 'settings-close' });
          }
          : undefined,
    };
    // Topology snapshots contain aggregate text for structural nodes; descendants own that text.
    const structural = ['DIV', 'SECTION', 'P'].includes(record.tag);
    let content = children.length > 0
      ? children.map(renderNode)
      : structural ? null : dynamicText(node, state);
    if (node.stableKey === 'command-console-host::fuel' && Array.isArray(content)) {
      content.unshift(<span key="fuel-well" class={semanticClassName} data-battle-console-fuel-well="" aria-hidden="true" />);
    }
    if (node.stableKey === 'command-console-host::wind') {
      content = [<span key="wind-label" class={semanticClassName} data-battle-console-wind-label="" aria-hidden="true">WIND</span>];
    }
    return createElement(record.tag.toLowerCase() as keyof JSX.IntrinsicElements, props, content);
  };

  return <>{roots.map(renderNode)}</>;
}
