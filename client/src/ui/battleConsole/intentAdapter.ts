import type { WeaponType } from '@shared/engine/WeaponSystem';
import type { BattleConsoleIntent, SemanticKey, StorePurchase } from './types';

export interface BattleConsoleControllerPort {
  move(delta: -1 | 1): void | Promise<void>;
  selectNextWeapon(): void | Promise<void>;
  selectWeapon(weapon: WeaponType): void | Promise<void>;
  openArmory(): void | Promise<void>;
  closeArmory(): void | Promise<void>;
  buy(purchase: StorePurchase, tankId: string): void | Promise<void>;
  equip(weapon: WeaponType): void | Promise<void>;
  stepAngle(delta: number): void | Promise<void>;
  stepPower(delta: number): void | Promise<void>;
  openSettings(origin: SemanticKey): void | Promise<void>;
  closeSettings(): void | Promise<void>;
  toggleSound(): void | Promise<void>;
  toggleGuide(): void | Promise<void>;
  fire(): void | Promise<void>;
  skipCoach(): void | Promise<void>;
  enterCoach(): void | Promise<void>;
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported battle-console intent: ${JSON.stringify(value)}`);
}

/** Sole intent-to-domain adapter. This module has no DOM or presentation import. */
export function dispatchBattleConsoleIntent(
  controller: BattleConsoleControllerPort,
  intent: BattleConsoleIntent,
): void | Promise<void> {
  switch (intent.type) {
    case 'move': return controller.move(intent.delta);
    case 'weapon-next': return controller.selectNextWeapon();
    case 'weapon-select': return controller.selectWeapon(intent.weapon);
    case 'armory-open': return controller.openArmory();
    case 'armory-close': return controller.closeArmory();
    case 'armory-buy': return controller.buy(intent.purchase, intent.tankId);
    case 'armory-equip': return controller.equip(intent.weapon);
    case 'angle-step': return controller.stepAngle(intent.delta);
    case 'power-step': return controller.stepPower(intent.delta);
    case 'settings-open': return controller.openSettings(intent.origin);
    case 'settings-close': return controller.closeSettings();
    case 'settings-toggle-sound': return controller.toggleSound();
    case 'settings-toggle-guide': return controller.toggleGuide();
    case 'fire': return controller.fire();
    case 'coach-skip': return controller.skipCoach();
    case 'coach-enter': return controller.enterCoach();
    default: return assertNever(intent);
  }
}
