// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  resolveCampaignCombatProfile,
} from '@shared/campaign/combatProfiles';
import { GameEngine } from '@shared/engine/GameEngine';
import { CampaignClient } from '../campaign/CampaignClient';
import { ASH_ROAD_EPISODE } from '../campaign/content/episode';
import type {
  BattleConsoleLifecycleController,
  BattleConsoleLifecycleEnterRequest,
} from './battleConsole/lifecycle';
import type { BattleConsolePresentationState } from './battleConsole/types';
import { HUD } from './HUD';

const campaignProfile = resolveCampaignCombatProfile(
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
);
const campaignCapabilities = new CampaignClient({
  encounter: ASH_ROAD_EPISODE.encounters[0]!,
  combatProfile: campaignProfile,
}).inputCapabilities;

function mount() {
  let request: BattleConsoleLifecycleEnterRequest | null = null;
  const enter = vi.fn(async (next: BattleConsoleLifecycleEnterRequest) => {
    request = next;
    return { generation: 1, committed: true, status: 'ready', resources: {} } as never;
  });
  const update = vi.fn();
  const lifecycle = {
    enter,
    restart: enter,
    update,
    destroy: vi.fn(async () => ({} as never)),
    snapshot: () => ({ activeGeneration: request ? 1 : null, status: 'ready', resources: {} }) as never,
  } satisfies BattleConsoleLifecycleController;
  const root = document.createElement('div');
  const overlay = document.createElement('div');
  const modal = document.createElement('div');
  const rail = document.createElement('div');
  document.body.append(root, overlay, modal, rail);
  const hud = new HUD(root, overlay, modal, rail, { battleConsoleLifecycle: lifecycle });
  const state = new GameEngine({
    players: [
      { name: 'Alice', color: '#e84d4d' },
      { name: 'Bob', color: '#4d8ce8' },
    ],
    maxPlayers: 2,
    seed: 17,
  }).getState();
  return {
    hud,
    state,
    request: () => request,
    latest: () => (update.mock.calls.at(-1)?.[0]
      ?? request?.initialState) as BattleConsolePresentationState,
  };
}

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelector('#st-hud-style')?.remove();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('HUD campaign arsenal projection', () => {
  it('projects only campaign weapons and keeps depleted equipment disabled', async () => {
    const { hud, state, latest } = mount();
    try {
      const active = state.tanks.find((tank) => tank.id === state.activePlayerId)!;
      active.inventory.missile = { count: 0, unlimited: false };
      active.inventory.cluster_bomb = { count: 2, unlimited: false };
      active.inventory.sandhog = { count: 2, unlimited: false };
      active.inventory.napalm = { count: 2, unlimited: false };
      active.inventory.shield = { count: 1, unlimited: false };
      hud.setInputCapabilities(campaignCapabilities);
      hud.update(state, false, true, true, true);

      const weaponItems = latest().armory.items.filter((item) => item.purchase.weapon);
      expect(weaponItems.map((item) => item.purchase.weapon)).toEqual([
        'missile',
        'cluster_bomb',
        'napalm',
        'sandhog',
        'shield',
      ]);
      expect(weaponItems.find((item) => item.purchase.weapon === 'missile')).toMatchObject({
        ammo: 0,
        canEquip: false,
      });
    } finally {
      await hud.destroy();
    }
  });

  it('guards forged select and equip intents while preserving ordinary selection', async () => {
    const narrowed = mount();
    const narrowedSelect = vi.fn();
    narrowed.hud.onWeaponSelect(narrowedSelect);
    narrowed.hud.setInputCapabilities(campaignCapabilities);
    narrowed.hud.update(narrowed.state, false, true, true, true);
    narrowed.request()!.dispatch({ type: 'weapon-select', weapon: 'nuke' });
    narrowed.request()!.dispatch({ type: 'armory-equip', weapon: 'heavy_shield' });
    narrowed.request()!.dispatch({ type: 'weapon-select', weapon: 'shield' });
    expect(narrowedSelect).toHaveBeenCalledExactlyOnceWith('shield');
    await narrowed.hud.destroy();

    const ordinary = mount();
    const ordinarySelect = vi.fn();
    ordinary.hud.onWeaponSelect(ordinarySelect);
    ordinary.hud.update(ordinary.state, false, true, true, true);
    ordinary.request()!.dispatch({ type: 'weapon-select', weapon: 'nuke' });
    expect(ordinarySelect).toHaveBeenCalledExactlyOnceWith('nuke');
    await ordinary.hud.destroy();
  });

  it('keeps the authoritative campaign selection unchanged when ammunition is depleted', () => {
    const client = new CampaignClient({
      encounter: ASH_ROAD_EPISODE.encounters[0]!,
      combatProfile: campaignProfile,
    });
    client.sendAction({ type: 'select_weapon', weapon: 'shield' });
    const active = client.getState().tanks.find((tank) => tank.id === client.getState().activePlayerId)!;
    active.inventory.missile.count = 0;

    client.sendAction({ type: 'select_weapon', weapon: 'missile' });

    expect(active.selectedWeapon).toBe('shield');
    expect(client.getCommittedReplayJournal()).toEqual([]);
  });
});
