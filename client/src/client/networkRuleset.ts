import type { NetworkRulesetVersion } from '@shared/types/GameOptions';

/**
 * Browser half of the room ruleset protocol. The Edge runtime owns a mirrored
 * definition because it cannot import client/shared code (ADR-0005).
 */
export const LEGACY_NETWORK_RULESET_VERSION = 1 as const;
export const PREPARED_NETWORK_RULESET_VERSION = 2 as const;
export const TERRAIN_HAZARD_NETWORK_RULESET_VERSION = 3 as const;

/** New network rooms use v2; existing v1 lobbies are bridged at join time. */
export const CURRENT_NETWORK_RULESET_VERSION: NetworkRulesetVersion =
  PREPARED_NETWORK_RULESET_VERSION;

/**
 * Room JSON comes from a server-authoritative option object. Missing values are
 * legacy; malformed values fail closed to legacy locally and are rejected by
 * the Edge referee on any mutation.
 */
export function normalizeNetworkRulesetVersion(value: unknown): NetworkRulesetVersion {
  return value === TERRAIN_HAZARD_NETWORK_RULESET_VERSION
    ? TERRAIN_HAZARD_NETWORK_RULESET_VERSION
    : value === PREPARED_NETWORK_RULESET_VERSION
      ? PREPARED_NETWORK_RULESET_VERSION
      : LEGACY_NETWORK_RULESET_VERSION;
}
