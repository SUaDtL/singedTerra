import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';

export interface BattleConsolePortalHosts {
  readonly settings: HTMLElement | null;
  readonly armory: HTMLElement | null;
  readonly coach: HTMLElement | null;
}

export const emptyBattleConsolePortalHosts: BattleConsolePortalHosts = Object.freeze({
  settings: null,
  armory: null,
  coach: null,
});

export function BattleConsolePortal({
  host,
  children,
}: Readonly<{ host: HTMLElement | null; children: ComponentChildren }>) {
  return host ? createPortal(children, host) : <>{children}</>;
}
