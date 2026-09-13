import {
  parseVerifiedCareer,
  type VerifiedCareer,
} from '@shared/net/verifiedCareer'

export interface VerifiedCareerSummaryResponse {
  readonly responseVersion: 1
  readonly career: VerifiedCareer
}

export interface AccountVerifiedCareerSnapshot {
  readonly accountId: string
  readonly career: VerifiedCareer
}

export type VerifiedCareerState =
  | { readonly status: 'unavailable'; readonly accountId: string | null }
  | { readonly status: 'loading'; readonly accountId: string }
  | { readonly status: 'ready'; readonly accountId: string; readonly career: VerifiedCareer }

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const ownKeys = Reflect.ownKeys(value)
  return ownKeys.length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

/** Strict wire parser. The shared parser validates and rebuilds the complete frozen projection. */
export function parseVerifiedCareerSummaryResponse(value: unknown): VerifiedCareerSummaryResponse | null {
  if (!exactRecord(value, ['responseVersion', 'career']) || value.responseVersion !== 1) return null
  const career = parseVerifiedCareer(value.career)
  return career ? Object.freeze({ responseVersion: 1 as const, career }) : null
}
