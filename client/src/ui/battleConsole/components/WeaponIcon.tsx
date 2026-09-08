import { useLayoutEffect, useRef } from 'preact/hooks';
import type { WeaponType } from '@shared/engine/WeaponSystem';
import { makeWeaponIcon } from '../../weaponIcons';

export function WeaponIcon({ weapon, className }: Readonly<{ weapon: WeaponType; className: string }>) {
  const host = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    host.current?.replaceChildren(makeWeaponIcon(weapon, 26));
  }, [weapon]);
  return <span ref={host} class={className} data-battle-console-weapon-icon="" aria-hidden="true" />;
}
