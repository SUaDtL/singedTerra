/**
 * Deterministic network-room compatibility contract.
 *
 * Edge Functions intentionally cannot import the browser/shared engine tree
 * (ADR-0005), so this tiny integer protocol is owned by the referee layer.
 * Missing values are the deployed legacy contract; invalid explicit values
 * fail closed instead of silently selecting physics.
 */
export const LEGACY_NETWORK_RULESET_VERSION = 1 as const
export const PREPARED_NETWORK_RULESET_VERSION = 2 as const

export type NetworkRulesetVersion =
  | typeof LEGACY_NETWORK_RULESET_VERSION
  | typeof PREPARED_NETWORK_RULESET_VERSION

type RequestedVersion =
  | { ok: true; version: NetworkRulesetVersion }
  | { ok: false; error: 'invalid_request' }

type StoredVersion =
  | { ok: true; version: NetworkRulesetVersion }
  | { ok: false; error: 'invalid_stored' }

function isSupportedRulesetVersion(value: unknown): value is NetworkRulesetVersion {
  return value === LEGACY_NETWORK_RULESET_VERSION || value === PREPARED_NETWORK_RULESET_VERSION
}

/** Resolve a client request; only omission receives the legacy default. */
export function resolveRequestedRulesetVersion(value: unknown): RequestedVersion {
  if (value === undefined) return { ok: true, version: LEGACY_NETWORK_RULESET_VERSION }
  return isSupportedRulesetVersion(value)
    ? { ok: true, version: value }
    : { ok: false, error: 'invalid_request' }
}

/** Resolve a creation request; every supported explicit version is creatable. */
export function resolveCreatableRulesetVersion(value: unknown): RequestedVersion {
  return resolveRequestedRulesetVersion(value)
}

/** Resolve JSONB room options; only an absent field receives the legacy default. */
export function resolveStoredRulesetVersion(options: unknown): StoredVersion {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return { ok: false, error: 'invalid_stored' }
  }
  if (!Object.prototype.hasOwnProperty.call(options, 'rulesetVersion')) {
    return { ok: true, version: LEGACY_NETWORK_RULESET_VERSION }
  }
  const value = (options as { rulesetVersion?: unknown }).rulesetVersion
  if (value === undefined) return { ok: true, version: LEGACY_NETWORK_RULESET_VERSION }
  return isSupportedRulesetVersion(value)
    ? { ok: true, version: value }
    : { ok: false, error: 'invalid_stored' }
}

export function rulesetCompatibility(
  requested: NetworkRulesetVersion,
  stored: NetworkRulesetVersion,
):
  | { ok: true }
  | { ok: false; error: 'ruleset_mismatch'; requiredRulesetVersion: NetworkRulesetVersion } {
  return requested === stored
    ? { ok: true }
    : { ok: false, error: 'ruleset_mismatch', requiredRulesetVersion: stored }
}
