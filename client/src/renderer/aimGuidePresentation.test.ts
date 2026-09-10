import { describe, expect, it } from 'vitest';
import { effectiveGravity, GameEngine } from '@shared/engine/GameEngine';
import { computeAiPlan } from '@shared/engine/AI';
import { HotSeatClient } from '../client/HotSeatClient';
import { buildClientEngineOptions } from '../client/gameEngineOptions';
import { quickOperationById, quickOperationOptions } from '../client/quickOperations';
import { buildLaunchGuide } from './aimGuide';
import { resolveAimGuidePresentation } from './aimGuidePresentation';

describe('aim-guide presentation wiring', () => {
  it('preserves local ownership while forwarding the client-supplied gravity verbatim', () => {
    expect(resolveAimGuidePresentation({
      mode: 'network',
      activePlayerOwned: false,
      activeIsAi: false,
    }, 0.222)).toEqual({
      visible: false,
      gravity: 0.222,
    });
    expect(resolveAimGuidePresentation({
      mode: 'network',
      activePlayerOwned: true,
      activeIsAi: false,
    }, 0.15)).toEqual({
      visible: true,
      gravity: 0.15,
    });
  });

  it('uses the real hot-seat client gravity at the legal D09 round boundary', () => {
    const engine = new GameEngine({
      maxPlayers: 2,
      players: [
        { name: 'P1', color: '#f00' },
        { name: 'P2', color: '#00f' },
      ],
      seed: 42,
      rounds: 3,
      suddenDeathTurn: 2,
      armsLevel: 4,
    });
    const client = new HotSeatClient(engine);
    const resolveShot = (): void => {
      let ticks = 0;
      while (
        (engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING')
        && ticks++ < 10_000
      ) engine.tick();
      expect(ticks).toBeLessThan(10_000);
    };

    for (let turn = 0; turn < 2; turn++) {
      client.sendAction({ type: 'select_weapon', weapon: 'tracer' });
      client.sendAction({ type: 'set_angle', angle: 90 });
      client.sendAction({ type: 'set_power', power: 20 });
      expect(engine.getState().turn).toBe(turn);
      expect(engine.getState().phase).toBe('PLAYER_TURN');
      client.sendAction({ type: 'fire' });
      resolveShot();
    }

    for (let turn = 2; turn < 40 && engine.getState().round === 1; turn++) {
      const state = engine.getState();
      const plan = computeAiPlan(
        state,
        state.activePlayerId,
        'hard',
        client.getEffectiveGravity(),
        4,
      );
      expect(plan).not.toBeNull();
      if (!plan) return;
      if (plan.buy) client.sendAction({ type: 'buy', weapon: plan.buy });
      if (plan.buyAccessory) client.sendAction({ type: 'buy', accessory: plan.buyAccessory });
      client.sendAction({ type: 'select_weapon', weapon: plan.weapon });
      client.sendAction({ type: 'set_angle', angle: plan.angle });
      client.sendAction({ type: 'set_power', power: plan.power });
      client.sendAction(plan.weapon === 'shield' ? { type: 'use_shield' } : { type: 'fire' });
      resolveShot();
    }

    expect(engine.getState()).toMatchObject({ round: 2, turn: 6, phase: 'ROUND_OVER' });
    client.sendAction({ type: 'next_round' });
    expect(client.getEffectiveGravity()).toBe(0.15);
    expect(resolveAimGuidePresentation({
      mode: 'hotseat',
      activePlayerOwned: true,
      activeIsAi: false,
    }, client.getEffectiveGravity())).toEqual({ visible: true, gravity: 0.15 });
  });

  it('uses selected-operation gravity for opening, sudden-death, and subsequent-round guides', () => {
    const players = [
      { name: 'P1', color: '#f00' },
      { name: 'P2', color: '#00f' },
    ];
    // The lobby request says a single round with sudden death disabled. The selected
    // operation must replace those settings before the client builds its engine.
    const selectedOperation = quickOperationById('last-light-siege');
    const selectedOptions = quickOperationOptions(selectedOperation.id, {
      maxPlayers: 2,
      players,
      seed: 42,
      rounds: 1,
      suddenDeathTurn: 0,
      armsLevel: 4,
    });
    expect(selectedOptions).toMatchObject({ rounds: 3, suddenDeathTurn: 12 });
    const { maxPlayers: _maxPlayers, players: _players, ...settings } = selectedOptions;
    const engine = new GameEngine(buildClientEngineOptions({
      mode: 'hotseat',
      players,
      playerNames: players.map((player) => player.name),
      settings,
    }));
    const client = new HotSeatClient(engine);
    const resolveShot = (): void => {
      let ticks = 0;
      while (
        (engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING')
        && ticks++ < 10_000
      ) engine.tick();
      expect(ticks).toBeLessThan(10_000);
    };
    const prepareSafeShot = (): void => {
      const activeTank = engine.getState().tanks.find((tank) => tank.id === engine.getState().activePlayerId);
      expect(activeTank).toBeDefined();
      if (!activeTank) return;
      // Unlimited baby missiles leave through the nearest sidewall, preserving both
      // tanks while we legally advance the operation to its sudden-death turn.
      const angle = activeTank.x < 600 ? 150 : 30;
      client.sendAction({ type: 'select_weapon', weapon: 'baby_missile' });
      client.sendAction({ type: 'set_angle', angle });
      client.sendAction({ type: 'set_power', power: 100 });
      expect(engine.getState().phase).toBe('PLAYER_TURN');
    };
    const expectGuideMatchesLiveProjectile = (): void => {
      const state = engine.getState();
      const activeTank = state.tanks.find((tank) => tank.id === state.activePlayerId);
      expect(activeTank).toBeDefined();
      if (!activeTank) return;
      const gravity = client.getEffectiveGravity();
      const guide = buildLaunchGuide(state, activeTank, gravity);
      expect(guide.length).toBeGreaterThan(2);
      client.sendAction({ type: 'fire' });
      engine.tick();
      const liveProjectile = engine.getState().projectiles[0];
      expect(liveProjectile).toBeDefined();
      if (!liveProjectile) return;
      // Point 1 is the visual muzzle tangent; point 2 is shared Physics after one tick.
      expect(guide[2]!.x).toBeCloseTo(liveProjectile.x, 10);
      expect(guide[2]!.y).toBeCloseTo(liveProjectile.y, 10);
      resolveShot();
    };

    expect(client.getEffectiveGravity()).toBe(0.15);
    prepareSafeShot();
    expectGuideMatchesLiveProjectile();

    while (engine.getState().turn <= selectedOptions.suddenDeathTurn!) {
      prepareSafeShot();
      client.sendAction({ type: 'fire' });
      expect(engine.getState().phase).toBe('FIRING');
      resolveShot();
    }

    const escalatedGravity = client.getEffectiveGravity();
    expect(escalatedGravity).toBeCloseTo(0.15 * 1.12, 10);
    prepareSafeShot();
    expectGuideMatchesLiveProjectile();

    // Each legal sidewall miss earns its normal turn stipend. Two more turns put
    // the active tank at the exact nuke price without inventing credits or state.
    for (let turn = 0; turn < 2; turn++) {
      prepareSafeShot();
      client.sendAction({ type: 'fire' });
      expect(engine.getState().phase).toBe('FIRING');
      resolveShot();
    }

    const activeTank = engine.getState().tanks.find((tank) => tank.id === engine.getState().activePlayerId);
    expect(activeTank?.credits).toBeGreaterThanOrEqual(12_000);
    client.sendAction({ type: 'buy', weapon: 'nuke' });
    expect(engine.getState().tanks.find((tank) => tank.id === engine.getState().activePlayerId)
      ?.inventory.nuke.count).toBe(1);
    // A legal zero-power vertical nuke strikes the firing tank; one survivor stages round two.
    client.sendAction({ type: 'select_weapon', weapon: 'nuke' });
    client.sendAction({ type: 'set_angle', angle: 90 });
    client.sendAction({ type: 'set_power', power: 0 });
    client.sendAction({ type: 'fire' });
    expect(engine.getState().phase).toBe('FIRING');
    resolveShot();

    expect(engine.getState()).toMatchObject({ round: 2, phase: 'ROUND_OVER' });
    const stagedNextRound = engine.getState();
    expect(stagedNextRound.turn).toBe(17);
    const nextRoundGravity = client.getEffectiveGravity();
    expect(nextRoundGravity).toBe(0.15);
    // Negative control: the former global-turn reconstruction stays escalated here,
    // while the live engine has reset its per-round sudden-death counter.
    const oldGlobalReconstruction = effectiveGravity(
      0.15,
      stagedNextRound.turn,
      selectedOptions.suddenDeathTurn!,
    );
    expect(oldGlobalReconstruction).toBeGreaterThan(nextRoundGravity);
    client.sendAction({ type: 'next_round' });
    prepareSafeShot();
    expectGuideMatchesLiveProjectile();
    expect(resolveAimGuidePresentation({
      mode: 'hotseat',
      activePlayerOwned: true,
      activeIsAi: false,
    }, nextRoundGravity)).toEqual({ visible: true, gravity: 0.15 });
  });
});
