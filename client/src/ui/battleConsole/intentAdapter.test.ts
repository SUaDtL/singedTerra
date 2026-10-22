import { describe, expect, it, vi } from 'vitest';
import { dispatchBattleConsoleIntent, type BattleConsoleControllerPort } from './intentAdapter';

describe('battle-console intent adapter', () => {
  it('routes ordinary gameplay and settings intents to their owned controls', () => {
    const port: BattleConsoleControllerPort = {
      move: vi.fn(), selectNextWeapon: vi.fn(), selectWeapon: vi.fn(), openArmory: vi.fn(),
      closeArmory: vi.fn(), buy: vi.fn(), equip: vi.fn(), stepAngle: vi.fn(), stepPower: vi.fn(),
      openSettings: vi.fn(), closeSettings: vi.fn(), toggleSound: vi.fn(), toggleGuide: vi.fn(),
      fire: vi.fn(), skipCoach: vi.fn(), enterCoach: vi.fn(),
    };
    dispatchBattleConsoleIntent(port, { type: 'fire' });
    dispatchBattleConsoleIntent(port, { type: 'settings-toggle-sound' });
    dispatchBattleConsoleIntent(port, { type: 'weapon-select', weapon: 'missile' });
    expect(port.fire).toHaveBeenCalledOnce();
    expect(port.toggleSound).toHaveBeenCalledOnce();
    expect(port.selectWeapon).toHaveBeenCalledExactlyOnceWith('missile');
    expect(port.openArmory).not.toHaveBeenCalled();
  });
});
