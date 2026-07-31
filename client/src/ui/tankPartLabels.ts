import {
  TANK_PART_SLOTS,
  type TankKitId,
  type TankLoadout,
  type TankPartSlot,
} from '@shared/types/TankLoadout';

export const TANK_KIT_LABELS: Readonly<Record<TankKitId, string>> = {
  foundry: 'Foundry',
  ranger: 'Ranger',
  bulwark: 'Bulwark',
  jackal: 'Jackal',
};

export const TANK_SLOT_LABELS: Readonly<Record<TankPartSlot, string>> = {
  treads: 'Mobility',
  hull: 'Hull',
  turret: 'Turret',
  barrel: 'Barrel',
};

export const TANK_PART_VARIANT_LABELS: Readonly<Record<
  TankPartSlot,
  Readonly<Record<TankKitId, string>>
>> = {
  treads: {
    foundry: 'Tracks',
    ranger: 'Spider Legs',
    bulwark: 'Hover',
    jackal: 'Dune Wheels',
  },
  hull: {
    foundry: 'Armor Hull',
    ranger: 'Scout Hull',
    bulwark: 'Siege Hull',
    jackal: 'Raider Hull',
  },
  turret: {
    foundry: 'Cupola',
    ranger: 'Sensor Pod',
    bulwark: 'Bunker',
    jackal: 'Sensor Ring',
  },
  barrel: {
    foundry: 'Cannon',
    ranger: 'Railgun',
    bulwark: 'Siege Gun',
    jackal: 'Howitzer',
  },
};

/** One shared authored vocabulary for Garage controls and combat identity. */
export function tankLoadoutAccessibleLabel(
  ownerLabel: string,
  loadout: Readonly<TankLoadout>,
): string {
  const parts = TANK_PART_SLOTS.map((slot) =>
    `${TANK_SLOT_LABELS[slot]}: ${TANK_PART_VARIANT_LABELS[slot][loadout[slot]]}.`
  );
  return `${ownerLabel}'s tank. ${parts.join(' ')}`;
}
