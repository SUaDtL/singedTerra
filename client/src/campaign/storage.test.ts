import { describe, expect, it, vi } from 'vitest'
import {
  CAMPAIGN_STORAGE_DATABASE_NAME,
  CAMPAIGN_STORAGE_DATABASE_VERSION,
  CAMPAIGN_STORAGE_OBJECT_STORE,
  CAMPAIGN_STORAGE_SCHEMA_VERSION,
  CampaignStorageConflictError,
  CampaignStorageContentMismatchError,
  CampaignStorageIncompatibleError,
  IndexedDbCampaignStoragePort,
  createCampaignStorage,
  parseCampaignStorageRecord,
  type CampaignStorageRecord,
  type CampaignStorageTransactionPort,
} from './storage'

const binding = Object.freeze({
  episodeId: 'ash-road-chapter-one',
  episodeVersion: 1,
  episodeContentDigest: 'a'.repeat(64),
  profileId: 'ash-road-v1',
  profileVersion: 1,
  profileContentDigest: 'b'.repeat(64),
})

class MemoryTransactionPort implements CampaignStorageTransactionPort {
  readonly records = new Map<string, unknown>()

  async read(slotId: string): Promise<unknown | null> {
    return structuredClone(this.records.get(slotId) ?? null)
  }

  async transact<Result>(
    slotId: string,
    operation: (current: unknown | null) => Readonly<{ next: unknown; result: Result }>,
  ): Promise<Result> {
    const current = structuredClone(this.records.get(slotId) ?? null)
    const { next, result } = operation(current)
    this.records.set(slotId, structuredClone(next))
    return result
  }
}

function expectFrozen(record: CampaignStorageRecord): void {
  expect(Object.isFrozen(record)).toBe(true)
  expect(Object.isFrozen(record.binding)).toBe(true)
  expect(Object.isFrozen(record.payload)).toBe(true)
}

describe('campaign IndexedDB transaction core', () => {
  it('opens the versioned IndexedDB store and reads through a readonly transaction', async () => {
    const stored = { durable: true }
    const getRequest = {} as IDBRequest
    const store = { get: vi.fn(() => {
      queueMicrotask(() => {
        Object.defineProperty(getRequest, 'result', { configurable: true, value: stored })
        getRequest.onsuccess?.call(getRequest, new Event('success'))
      })
      return getRequest as IDBRequest
    }) }
    const transaction = { objectStore: vi.fn(() => store) }
    const database = {
      objectStoreNames: { contains: vi.fn(() => false) },
      createObjectStore: vi.fn(),
      transaction: vi.fn(() => transaction),
      close: vi.fn(),
    }
    const openRequest = {} as IDBOpenDBRequest
    const factory = { open: vi.fn(() => {
      queueMicrotask(() => {
        Object.defineProperty(openRequest, 'result', {
          configurable: true,
          value: database as unknown as IDBDatabase,
        })
        openRequest.onupgradeneeded?.call(
          openRequest,
          new Event('upgradeneeded') as IDBVersionChangeEvent,
        )
        openRequest.onsuccess?.call(openRequest, new Event('success'))
      })
      return openRequest as IDBOpenDBRequest
    }) } as unknown as IDBFactory

    const port = new IndexedDbCampaignStoragePort(factory)
    await expect(port.read('ash-road-local')).resolves.toEqual(stored)
    expect(factory.open).toHaveBeenCalledWith(
      CAMPAIGN_STORAGE_DATABASE_NAME,
      CAMPAIGN_STORAGE_DATABASE_VERSION,
    )
    expect(database.createObjectStore).toHaveBeenCalledWith(CAMPAIGN_STORAGE_OBJECT_STORE)
    expect(database.transaction).toHaveBeenCalledWith(CAMPAIGN_STORAGE_OBJECT_STORE, 'readonly')
    expect(store.get).toHaveBeenCalledWith('ash-road-local')
    expect(database.close).toHaveBeenCalledOnce()
  })

  it('keeps compare/read/write in one real readwrite transaction and closes on completion', async () => {
    const getRequest = {} as IDBRequest
    const put = vi.fn((_value: unknown, _key: IDBValidKey) => {
      queueMicrotask(() => transaction.oncomplete?.call(transaction, new Event('complete')))
      return {} as IDBRequest
    })
    const store = {
      get: vi.fn(() => {
        queueMicrotask(() => {
          Object.defineProperty(getRequest, 'result', { configurable: true, value: null })
          getRequest.onsuccess?.call(getRequest, new Event('success'))
        })
        return getRequest
      }),
      put,
    }
    const transaction = {
      objectStore: vi.fn(() => store),
      abort: vi.fn(),
      error: null,
      oncomplete: null,
      onabort: null,
      onerror: null,
    } as unknown as IDBTransaction
    const database = {
      objectStoreNames: { contains: vi.fn(() => true) },
      createObjectStore: vi.fn(),
      transaction: vi.fn(() => transaction),
      close: vi.fn(),
    }
    const openRequest = {} as IDBOpenDBRequest
    const factory = { open: vi.fn(() => {
      queueMicrotask(() => {
        Object.defineProperty(openRequest, 'result', {
          configurable: true, value: database as unknown as IDBDatabase,
        })
        openRequest.onsuccess?.call(openRequest, new Event('success'))
      })
      return openRequest
    }) } as unknown as IDBFactory

    const port = new IndexedDbCampaignStoragePort(factory)
    await expect(port.transact('ash-road-local', (current) => ({
      next: { revision: 1 }, result: current === null ? 'created' : 'unexpected',
    }))).resolves.toBe('created')
    expect(database.transaction).toHaveBeenCalledWith(CAMPAIGN_STORAGE_OBJECT_STORE, 'readwrite')
    expect(put).toHaveBeenCalledWith({ revision: 1 }, 'ash-road-local')
    expect(database.close).toHaveBeenCalledOnce()
  })

  it('rejects blocked opens and closes after synchronous transaction setup failure', async () => {
    const blockedRequest = {} as IDBOpenDBRequest
    const blockedFactory = { open: vi.fn(() => {
      queueMicrotask(() => blockedRequest.onblocked?.call(
        blockedRequest,
        new Event('blocked') as IDBVersionChangeEvent,
      ))
      return blockedRequest
    }) } as unknown as IDBFactory
    await expect(new IndexedDbCampaignStoragePort(blockedFactory).read('ash-road-local'))
      .rejects.toThrow('upgrade blocked')

    const database = {
      objectStoreNames: { contains: vi.fn(() => true) },
      createObjectStore: vi.fn(),
      transaction: vi.fn(() => { throw new Error('transaction setup failed') }),
      close: vi.fn(),
    }
    const openRequest = {} as IDBOpenDBRequest
    const factory = { open: vi.fn(() => {
      queueMicrotask(() => {
        Object.defineProperty(openRequest, 'result', {
          configurable: true, value: database as unknown as IDBDatabase,
        })
        openRequest.onsuccess?.call(openRequest, new Event('success'))
      })
      return openRequest
    }) } as unknown as IDBFactory
    await expect(new IndexedDbCampaignStoragePort(factory).transact(
      'ash-road-local', () => ({ next: {}, result: undefined }),
    )).rejects.toThrow('transaction setup failed')
    expect(database.close).toHaveBeenCalledOnce()
  })

  it('parses only exact v1 records with canonical content binding and detached payload', () => {
    const source = {
      kind: 'campaign-storage-record',
      schemaVersion: CAMPAIGN_STORAGE_SCHEMA_VERSION,
      slotId: 'ash-road-local',
      revision: 7,
      binding,
      payload: { kind: 'campaign-save-payload', acceptedCommands: [{ type: 'fire' }] },
    }
    const parsed = parseCampaignStorageRecord(source)
    expect(parsed).not.toBeNull()
    expectFrozen(parsed!)
    source.payload.acceptedCommands[0]!.type = 'move'
    expect((parsed!.payload as { acceptedCommands: Array<{ type: string }> })
      .acceptedCommands[0]!.type).toBe('fire')

    expect(parseCampaignStorageRecord({ ...source, schemaVersion: 99 })).toBeNull()
    expect(parseCampaignStorageRecord({ ...source, revision: 0 })).toBeNull()
    expect(parseCampaignStorageRecord({ ...source, extra: true })).toBeNull()
    expect(parseCampaignStorageRecord({ ...source, binding: { ...binding, extra: true } })).toBeNull()
    expect(parseCampaignStorageRecord({ ...source, binding: {
      ...binding,
      episodeContentDigest: 'changed',
    } })).toBeNull()
  })

  it('creates revision one, advances by compare-and-swap, and returns detached reads', async () => {
    const port = new MemoryTransactionPort()
    const storage = createCampaignStorage(port)
    const first = await storage.compareAndSwap({
      slotId: 'ash-road-local', expectedRevision: 0, binding, payload: { step: 1 },
    })
    expect(first).toMatchObject({ revision: 1, payload: { step: 1 } })
    expectFrozen(first)

    const second = await storage.compareAndSwap({
      slotId: 'ash-road-local', expectedRevision: 1, binding, payload: { step: 2 },
    })
    expect(second).toMatchObject({ revision: 2, payload: { step: 2 } })
    const loaded = await storage.load('ash-road-local')
    expect(loaded).toEqual(second)
    expect(loaded).not.toBe(second)
    expectFrozen(loaded!)
  })

  it('refuses stale writers without overwriting the newer revision', async () => {
    const port = new MemoryTransactionPort()
    const storage = createCampaignStorage(port)
    await storage.compareAndSwap({
      slotId: 'ash-road-local', expectedRevision: 0, binding, payload: { owner: 'first' },
    })
    const newer = await storage.compareAndSwap({
      slotId: 'ash-road-local', expectedRevision: 1, binding, payload: { owner: 'newer' },
    })
    await expect(storage.compareAndSwap({
      slotId: 'ash-road-local', expectedRevision: 1, binding, payload: { owner: 'stale' },
    })).rejects.toBeInstanceOf(CampaignStorageConflictError)
    expect(await storage.load('ash-road-local')).toEqual(newer)
  })

  it('refuses changed content and retains unknown-version records byte-for-byte', async () => {
    const port = new MemoryTransactionPort()
    const storage = createCampaignStorage(port)
    const first = await storage.compareAndSwap({
      slotId: 'ash-road-local', expectedRevision: 0, binding, payload: { step: 1 },
    })
    await expect(storage.compareAndSwap({
      slotId: 'ash-road-local', expectedRevision: first.revision,
      binding: { ...binding, profileContentDigest: 'c'.repeat(64) }, payload: { step: 2 },
    })).rejects.toBeInstanceOf(CampaignStorageContentMismatchError)
    expect(await storage.load('ash-road-local')).toEqual(first)

    const unknown = { ...first, schemaVersion: 99, payload: { retained: true } }
    port.records.set('ash-road-local', structuredClone(unknown))
    await expect(storage.load('ash-road-local')).rejects.toBeInstanceOf(
      CampaignStorageIncompatibleError,
    )
    await expect(storage.compareAndSwap({
      slotId: 'ash-road-local', expectedRevision: first.revision,
      binding, payload: { overwritten: true },
    })).rejects.toBeInstanceOf(CampaignStorageIncompatibleError)
    expect(port.records.get('ash-road-local')).toEqual(unknown)
  })

  it('validates slot, revision and structured-clone payload before opening a transaction', async () => {
    const port = new MemoryTransactionPort()
    const storage = createCampaignStorage(port)
    await expect(storage.load('../escape')).rejects.toThrow('invalid campaign storage slot')
    await expect(storage.compareAndSwap({
      slotId: 'ash-road-local', expectedRevision: -1, binding, payload: {},
    })).rejects.toThrow('invalid campaign storage revision')
    await expect(storage.compareAndSwap({
      slotId: 'ash-road-local', expectedRevision: 0, binding,
      payload: { callback: () => undefined },
    })).rejects.toThrow('campaign storage payload is not cloneable')
    await expect(storage.compareAndSwap({
      slotId: 'ash-road-local', expectedRevision: 0, binding,
      payload: { map: new Map([['mutable', true]]) },
    })).rejects.toThrow('campaign storage payload is not cloneable deterministic data')
    expect(parseCampaignStorageRecord({
      kind: 'campaign-storage-record', schemaVersion: 1, slotId: 'ash-road-local',
      revision: 1, binding, payload: { view: new Uint8Array([1, 2]) },
    })).toBeNull()
    expect(port.records.size).toBe(0)
  })
})
