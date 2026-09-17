import { describe, expect, it, vi } from 'vitest';
import {
  dispatchBattleConsoleIntent,
  type BattleConsoleControllerPort,
} from './intentAdapter';

function controller(): BattleConsoleControllerPort {
  return {
    move: vi.fn(),
    selectNextWeapon: vi.fn(),
    selectWeapon: vi.fn(),
    openArmory: vi.fn(),
    closeArmory: vi.fn(),
    buy: vi.fn(),
    equip: vi.fn(),
    stepAngle: vi.fn(),
    stepPower: vi.fn(),
    openSettings: vi.fn(),
    closeSettings: vi.fn(),
    toggleSound: vi.fn(),
    toggleGuide: vi.fn(),
    fire: vi.fn(),
    retryCampaign: vi.fn(),
    selectCampaignRoute: vi.fn(),
    chooseCampaignCheckpoint: vi.fn(),
    applyCampaignEmergencyPatch: vi.fn(),
    continueCampaign: vi.fn(),
    skipCoach: vi.fn(),
    enterCoach: vi.fn(),
  };
}

describe('campaign battle-console intent adapter', () => {
  it('routes retry through the exhaustive typed controller port only', () => {
    const port = controller();

    dispatchBattleConsoleIntent(port, { type: 'campaign-retry' });

    expect(port.retryCampaign).toHaveBeenCalledOnce();
    expect(port.fire).not.toHaveBeenCalled();
    expect(port.openArmory).not.toHaveBeenCalled();
  });

  it('routes route, checkpoint, and continuation intents without callbacks in presentation', () => {
    const port = controller();
    dispatchBattleConsoleIntent(port, {
      type: 'campaign-route-select', routeId: 'salvage-pit-route',
    });
    dispatchBattleConsoleIntent(port, {
      type: 'campaign-checkpoint-choice', choice: { kind: 'refill', weaponId: 'missile' },
    });
    dispatchBattleConsoleIntent(port, { type: 'campaign-emergency-patch' });
    dispatchBattleConsoleIntent(port, { type: 'campaign-continue' });
    expect(port.selectCampaignRoute).toHaveBeenCalledWith('salvage-pit-route');
    expect(port.chooseCampaignCheckpoint).toHaveBeenCalledWith({
      kind: 'refill', weaponId: 'missile',
    });
    expect(port.applyCampaignEmergencyPatch).toHaveBeenCalledOnce();
    expect(port.continueCampaign).toHaveBeenCalledOnce();
  });
});
