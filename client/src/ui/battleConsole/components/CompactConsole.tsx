import type { ComponentChildren } from 'preact';
import type { BattleConsoleIntent, BattleConsolePresentationState } from '../types';
import styles from './CompactConsole.module.css';
import { tankLoadoutAccessibleLabel } from '../../tankPartLabels';
import { DEFAULT_POWER_CAP } from '@shared/engine/Tank';

const keys = {
  'move-left': 'node:button:Move tank left, 8 fuel maximum:14',
  'move-right': 'node:button:Move tank right, 8 fuel maximum:20',
  'weapon-next': 'node:button:Select next weapon, current Baby Missile:32',
  armory: 'armory-inline-host::weapon-trigger',
  'angle-decrease': 'command-console-host::aim-left-control',
  'angle-increase': 'node:button:Aim barrel right:44',
  'power-decrease': 'node:button:Decrease power:49',
  'power-increase': 'node:button:Increase power:53',
  settings: 'command-console-host::settings-trigger',
  fire: 'command-console-host::fire',
} as const;

/** Compact semantic layout fills the same typed 1388x212 projected rail as Pixi. */
export function CompactConsole({ state, dispatch }: Readonly<{
  state: BattleConsolePresentationState;
  dispatch: (intent: BattleConsoleIntent) => void;
}>) {
  const locked = !state.weapon.canCycle || state.fireControl.submitting;
  const powerCap = Math.max(0, state.ballistics.powerCap ?? DEFAULT_POWER_CAP);
  const button = (key: keyof typeof keys, label: string, content: ComponentChildren, intent: BattleConsoleIntent, disabled = false) => (
    <button class={styles.control} type="button" data-semantic-key={keys[key]} data-battle-console-target-key={key}
      data-battle-console-action={key === 'fire' ? 'fire' : undefined}
      aria-label={label} disabled={disabled} onClick={() => dispatch(intent)}>{content}</button>
  );
  return (
    <section class={styles.chassis} data-battle-console-compact-chassis="" role="region" aria-label="Turn command console">
      <div class={styles.commander} role="group" aria-label={state.commander.portrait
        ? tankLoadoutAccessibleLabel(state.commander.name, state.commander.portrait.loadout)
        : `${state.commander.name} commander controls`}>
        <div class={styles.reading}><strong title={state.commander.name}>{state.commander.name}</strong><span data-battle-console-text-key="commander.health">{Math.max(0, Math.round(state.commander.health ?? 0))} HP</span></div>
        <div class={styles.mobility}>
          {button('move-left', 'Move tank left, 8 fuel maximum', '‹', { type: 'move', delta: -1 }, !state.mobility.canMoveLeft)}
          <div class={styles.fuel} data-battle-console-fuel-well=""><span>Fuel</span><strong class={styles.value} data-semantic-key="node:span:100 fuel remaining:19">{state.mobility.fuel ?? 0}</strong></div>
          {button('move-right', 'Move tank right, 8 fuel maximum', '›', { type: 'move', delta: 1 }, !state.mobility.canMoveRight)}
        </div>
      </div>
      <div class={styles.weapon}>
        {button('weapon-next', `Select next weapon, current ${state.weapon.name}`, <><span title={state.weapon.name}>{state.weapon.name}</span><small>{state.weapon.ammo === null ? '∞' : state.weapon.ammo} ammo · ›</small></>, { type: 'weapon-next' }, !state.weapon.canCycle)}
        {button('armory', state.armory.open ? 'Close Armory' : 'Open Armory', 'Armory', { type: state.armory.open ? 'armory-close' : 'armory-open' })}
      </div>
      <div class={styles.instrument}>
        <div class={styles.reading}><span>Angle</span><output class={styles.value} aria-label="Angle" data-semantic-key="node:output:Angle:43">{Math.round(state.ballistics.angle)}°</output></div>
        <div class={styles.pair}>
          {button('angle-decrease', 'Aim barrel left', '−', { type: 'angle-step', delta: -1 }, locked)}
          {button('angle-increase', 'Aim barrel right', '+', { type: 'angle-step', delta: 1 }, locked)}
        </div>
      </div>
      <div class={styles.instrument}>
        <div class={styles.reading}><span>Power</span><output class={styles.value} aria-label={`Power ${Math.round(state.ballistics.power)} of ${Math.round(powerCap)}`} data-semantic-key="node:output:Power:52">{Math.round(state.ballistics.power)}</output></div>
        <div class={styles.pair}>
          {button('power-decrease', 'Decrease power', '−', { type: 'power-step', delta: -1 }, locked)}
          {button('power-increase', 'Increase power', '+', { type: 'power-step', delta: 1 }, locked)}
        </div>
      </div>
      <div class={styles.wind}>
        <span>Wind</span><output class={styles.value} aria-label={`Wind ${Math.abs(state.ballistics.wind).toFixed(1)} ${state.ballistics.wind < 0 ? 'left' : 'right'}`} data-semantic-key="node:output:Wind:58">{Math.abs(state.ballistics.wind) < 0.05 ? 'Calm' : `${state.ballistics.wind < 0 ? '←' : '→'} ${Math.abs(state.ballistics.wind).toFixed(1)}`}</output>
      </div>
      <div class={styles.fire}>
        {button('fire', `Fire ${state.weapon.name}`, <><strong>Fire</strong><small role="status">{state.fireControl.status}</small></>, { type: 'fire' }, !state.fireControl.ready || state.fireControl.submitting)}
        {button('settings', 'Battle settings', 'Settings', { type: 'settings-open', origin: keys.settings })}
      </div>
    </section>
  );
}
