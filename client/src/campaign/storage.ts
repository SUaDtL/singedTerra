export const CAMPAIGN_STORAGE_SCHEMA_VERSION = 1 as const
export const CAMPAIGN_STORAGE_DATABASE_VERSION = 1 as const
export const CAMPAIGN_STORAGE_DATABASE_NAME = 'singedterra-campaign'
export const CAMPAIGN_STORAGE_OBJECT_STORE = 'campaign-runs'

export interface CampaignStorageBinding {
  readonly episodeId: string
  readonly episodeVersion: number
  readonly episodeContentDigest: string
  readonly profileId: string
  readonly profileVersion: number
  readonly profileContentDigest: string
}

export interface CampaignStorageRecord {
  readonly kind: 'campaign-storage-record'
  readonly schemaVersion: typeof CAMPAIGN_STORAGE_SCHEMA_VERSION
  readonly slotId: string
  readonly revision: number
  readonly binding: CampaignStorageBinding
  readonly payload: unknown
}

export interface CampaignStorageTransactionPort {
  read(slotId: string): Promise<unknown | null>
  transact<Result>(
    slotId: string,
    operation: (current: unknown | null) => Readonly<{ next: unknown; result: Result }>,
  ): Promise<Result>
}

export interface CampaignStorage {
  load(slotId: string): Promise<CampaignStorageRecord | null>
  compareAndSwap(input: CampaignStorageCompareAndSwapInput): Promise<CampaignStorageRecord>
}

export type CampaignStorageCompareAndSwapInput = Readonly<{
  slotId: string
  expectedRevision: number
  binding: CampaignStorageBinding
  payload: unknown
}>

export class CampaignStorageConflictError extends Error {
  readonly currentRevision: number

  constructor(currentRevision: number) {
    super(`campaign storage revision conflict: current revision is ${currentRevision}`)
    this.name = 'CampaignStorageConflictError'
    this.currentRevision = currentRevision
  }
}

export class CampaignStorageContentMismatchError extends Error {
  constructor() {
    super('campaign storage content binding mismatch')
    this.name = 'CampaignStorageContentMismatchError'
  }
}

export class CampaignStorageIncompatibleError extends Error {
  readonly retained: unknown

  constructor(retained: unknown) {
    super('campaign storage record requires a compatible build')
    this.name = 'CampaignStorageIncompatibleError'
    // Opaque export copy. Unknown schemas are never interpreted or rewritten.
    this.retained = clone(retained)
  }
}

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

function safePositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function validIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64
    && /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(value)
}

function validSlotId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 80
    && /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(value)
}

function validDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

function clone<Value>(value: Value): Value {
  return structuredClone(value)
}

type CampaignStoragePayload = null | boolean | number | string
  | readonly CampaignStoragePayload[]
  | Readonly<{ [key: string]: CampaignStoragePayload }>

/** Own only deterministic JSON-like save data; reject Maps, Sets, views, cycles and executables. */
function ownPayload(value: unknown, ancestors = new WeakSet<object>()): CampaignStoragePayload | null {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'object' || ancestors.has(value)) return null
  ancestors.add(value)
  if (Array.isArray(value)) {
    const result: CampaignStoragePayload[] = []
    for (const entry of value) {
      const owned = ownPayload(entry, ancestors)
      if (owned === null && entry !== null) return null
      result.push(owned)
    }
    ancestors.delete(value)
    return Object.freeze(result)
  }
  if (!record(value) || Reflect.ownKeys(value).some((key) => typeof key !== 'string')) return null
  const result: { [key: string]: CampaignStoragePayload } = Object.create(null)
  for (const [key, entry] of Object.entries(value)) {
    const owned = ownPayload(entry, ancestors)
    if (owned === null && entry !== null) return null
    result[key] = owned
  }
  ancestors.delete(value)
  return Object.freeze(result)
}

function parseBinding(value: unknown): CampaignStorageBinding | null {
  if (!record(value) || !exactKeys(value, [
    'episodeId', 'episodeVersion', 'episodeContentDigest',
    'profileId', 'profileVersion', 'profileContentDigest',
  ]) || !validIdentifier(value.episodeId) || !safePositiveInteger(value.episodeVersion)
    || !validDigest(value.episodeContentDigest) || !validIdentifier(value.profileId)
    || !safePositiveInteger(value.profileVersion) || !validDigest(value.profileContentDigest)) {
    return null
  }
  return Object.freeze({
    episodeId: value.episodeId,
    episodeVersion: value.episodeVersion,
    episodeContentDigest: value.episodeContentDigest,
    profileId: value.profileId,
    profileVersion: value.profileVersion,
    profileContentDigest: value.profileContentDigest,
  })
}

function requireBinding(value: unknown): CampaignStorageBinding {
  const parsed = parseBinding(value)
  if (!parsed) throw new Error('invalid campaign storage content binding')
  return parsed
}

function sameBinding(left: CampaignStorageBinding, right: CampaignStorageBinding): boolean {
  return left.episodeId === right.episodeId
    && left.episodeVersion === right.episodeVersion
    && left.episodeContentDigest === right.episodeContentDigest
    && left.profileId === right.profileId
    && left.profileVersion === right.profileVersion
    && left.profileContentDigest === right.profileContentDigest
}

export function parseCampaignStorageRecord(value: unknown): CampaignStorageRecord | null {
  if (!record(value) || !exactKeys(value, [
    'kind', 'schemaVersion', 'slotId', 'revision', 'binding', 'payload',
  ]) || value.kind !== 'campaign-storage-record'
    || value.schemaVersion !== CAMPAIGN_STORAGE_SCHEMA_VERSION
    || !validSlotId(value.slotId) || !safePositiveInteger(value.revision)) return null
  const binding = parseBinding(value.binding)
  if (!binding) return null
  let payload: unknown
  try {
    const cloned = clone(value.payload)
    payload = ownPayload(cloned)
    if (payload === null && cloned !== null) return null
  } catch {
    return null
  }
  return Object.freeze({
    kind: 'campaign-storage-record',
    schemaVersion: CAMPAIGN_STORAGE_SCHEMA_VERSION,
    slotId: value.slotId,
    revision: value.revision,
    binding,
    payload,
  })
}

function incompatible(value: unknown): CampaignStorageIncompatibleError {
  try {
    return new CampaignStorageIncompatibleError(value)
  } catch {
    return new CampaignStorageIncompatibleError(null)
  }
}

export function createCampaignStorage(port: CampaignStorageTransactionPort): CampaignStorage {
  return Object.freeze({
    async load(slotId: string): Promise<CampaignStorageRecord | null> {
      if (!validSlotId(slotId)) throw new Error('invalid campaign storage slot')
      const raw = await port.read(slotId)
      if (raw === null) return null
      const parsed = parseCampaignStorageRecord(raw)
      if (!parsed) throw incompatible(raw)
      if (parsed.slotId !== slotId) throw incompatible(raw)
      return parsed
    },

    async compareAndSwap(
      input: CampaignStorageCompareAndSwapInput,
    ): Promise<CampaignStorageRecord> {
      if (!record(input) || !exactKeys(input, [
        'slotId', 'expectedRevision', 'binding', 'payload',
      ]) || !validSlotId(input.slotId)) throw new Error('invalid campaign storage slot')
      if (typeof input.expectedRevision !== 'number' || !Number.isSafeInteger(input.expectedRevision)
        || input.expectedRevision < 0) throw new Error('invalid campaign storage revision')
      const binding = requireBinding(input.binding)
      let payload: unknown
      try {
        const cloned = clone(input.payload)
        payload = ownPayload(cloned)
        if (payload === null && cloned !== null) {
          throw new Error('campaign storage payload is not deterministic data')
        }
      } catch {
        throw new Error('campaign storage payload is not cloneable deterministic data')
      }
      return port.transact(input.slotId, (raw) => {
        const current = raw === null ? null : parseCampaignStorageRecord(raw)
        if (raw !== null && (!current || current.slotId !== input.slotId)) throw incompatible(raw)
        const currentRevision = current?.revision ?? 0
        if (currentRevision !== input.expectedRevision) {
          throw new CampaignStorageConflictError(currentRevision)
        }
        if (current && !sameBinding(current.binding, binding)) {
          throw new CampaignStorageContentMismatchError()
        }
        if (currentRevision === Number.MAX_SAFE_INTEGER) {
          throw new Error('campaign storage revision overflow')
        }
        const next = parseCampaignStorageRecord({
          kind: 'campaign-storage-record',
          schemaVersion: CAMPAIGN_STORAGE_SCHEMA_VERSION,
          slotId: input.slotId,
          revision: currentRevision + 1,
          binding,
          payload,
        })
        if (!next) throw new Error('campaign storage transition produced an invalid record')
        return Object.freeze({ next, result: next })
      })
    },
  })
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(CAMPAIGN_STORAGE_DATABASE_NAME, CAMPAIGN_STORAGE_DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(CAMPAIGN_STORAGE_OBJECT_STORE)) {
        database.createObjectStore(CAMPAIGN_STORAGE_OBJECT_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('campaign storage open failed'))
    request.onblocked = () => reject(new Error('campaign storage upgrade blocked'))
  })
}

function requestResult(request: IDBRequest): Promise<unknown | null> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result === undefined ? null : request.result)
    request.onerror = () => reject(request.error ?? new Error('campaign storage request failed'))
  })
}

/** Real browser port. The compare/read/write sequence remains inside one IDB transaction. */
export class IndexedDbCampaignStoragePort implements CampaignStorageTransactionPort {
  constructor(private readonly factory: IDBFactory = indexedDB) {}

  async read(slotId: string): Promise<unknown | null> {
    const database = await openDatabase(this.factory)
    try {
      const transaction = database.transaction(CAMPAIGN_STORAGE_OBJECT_STORE, 'readonly')
      return await requestResult(transaction.objectStore(CAMPAIGN_STORAGE_OBJECT_STORE).get(slotId))
    } finally {
      database.close()
    }
  }

  async transact<Result>(
    slotId: string,
    operation: (current: unknown | null) => Readonly<{ next: unknown; result: Result }>,
  ): Promise<Result> {
    const database = await openDatabase(this.factory)
    return new Promise<Result>((resolve, reject) => {
      let operationResult: Result | undefined
      let operationError: unknown = null
      let transaction: IDBTransaction
      let store: IDBObjectStore
      let get: IDBRequest
      try {
        transaction = database.transaction(CAMPAIGN_STORAGE_OBJECT_STORE, 'readwrite')
        store = transaction.objectStore(CAMPAIGN_STORAGE_OBJECT_STORE)
        get = store.get(slotId)
      } catch (error) {
        database.close()
        reject(error)
        return
      }
      get.onsuccess = () => {
        try {
          const applied = operation(get.result === undefined ? null : get.result)
          operationResult = applied.result
          store.put(applied.next, slotId)
        } catch (error) {
          operationError = error
          transaction.abort()
        }
      }
      get.onerror = () => {
        operationError = get.error ?? new Error('campaign storage read failed')
        transaction.abort()
      }
      transaction.oncomplete = () => {
        database.close()
        resolve(operationResult as Result)
      }
      transaction.onabort = () => {
        database.close()
        reject(operationError ?? transaction.error ?? new Error('campaign storage transaction aborted'))
      }
      transaction.onerror = () => {
        operationError ??= transaction.error ?? new Error('campaign storage transaction failed')
      }
    })
  }
}

export function createIndexedDbCampaignStorage(
  factory: IDBFactory = indexedDB,
): CampaignStorage {
  return createCampaignStorage(new IndexedDbCampaignStoragePort(factory))
}
