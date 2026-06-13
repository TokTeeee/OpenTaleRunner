import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorldMapData, RegionRef, LocationMapData } from '../../../src/types/map';

// ─── Manual IndexedDB mock ──────────────────────────────────────────────────
// fake-indexeddb is not installed, so we mock the IDB API manually.

class MockIDBRequest<T = unknown> {
  result: T | null = null;
  error: DOMException | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

class MockObjectStore {
  private data = new Map<string, unknown>();
  private keyPath: string | null;

  constructor(keyPath: string | null) {
    this.keyPath = keyPath;
  }

  put(value: unknown, explicitKey?: string): MockIDBRequest {
    const req = new MockIDBRequest();
    const key = explicitKey ?? (this.keyPath ? String((value as Record<string, unknown>)[this.keyPath]) : undefined);
    if (key !== undefined) {
      this.data.set(key, value);
    }
    req.result = undefined;
    queueMicrotask(() => req.onsuccess?.());
    return req;
  }

  get(key: string): MockIDBRequest {
    const req = new MockIDBRequest();
    req.result = this.data.has(key) ? this.data.get(key)! : undefined;
    queueMicrotask(() => req.onsuccess?.());
    return req;
  }

  delete(key: string): MockIDBRequest {
    const req = new MockIDBRequest();
    this.data.delete(key);
    req.result = undefined;
    queueMicrotask(() => req.onsuccess?.());
    return req;
  }

  clear(): MockIDBRequest {
    const req = new MockIDBRequest();
    this.data.clear();
    req.result = undefined;
    queueMicrotask(() => req.onsuccess?.());
    return req;
  }
}

class MockTransaction {
  objectStoreNames: Set<string>;
  private stores: Map<string, MockObjectStore>;
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(storeNames: string[], stores: Map<string, MockObjectStore>) {
    this.objectStoreNames = new Set(storeNames);
    this.stores = stores;
  }

  objectStore(name: string): MockObjectStore {
    const store = this.stores.get(name);
    if (!store) throw new Error(`Object store "${name}" not found`);
    return store;
  }

  complete(): void {
    queueMicrotask(() => this.oncomplete?.());
  }
}

// DOMStringList-like wrapper that supports .contains()
class DOMStringListMock extends Set<string> {
  contains(name: string): boolean {
    return this.has(name);
  }
}

class MockIDBDatabase {
  objectStoreNames: DOMStringListMock;
  private stores = new Map<string, MockObjectStore>();

  constructor() {
    this.objectStoreNames = new DOMStringListMock();
  }

  createObjectStore(name: string, options?: { keyPath?: string }): MockObjectStore {
    const store = new MockObjectStore(options?.keyPath ?? null);
    this.stores.set(name, store);
    this.objectStoreNames.add(name);
    return store;
  }

  transaction(storeNames: string | string[], _mode: string): MockTransaction {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const tx = new MockTransaction(names, this.stores);
    // Auto-complete the transaction after microtask queue settles
    queueMicrotask(() => tx.complete());
    return tx;
  }
}

let mockDB: MockIDBDatabase;

function setupMockIndexedDB(): void {
  mockDB = new MockIDBDatabase();

  const mockOpen = vi.fn().mockImplementation((_name: string, _version: number) => {
    const req = new MockIDBRequest<IDBDatabase>();
    // In real IndexedDB, request.result is available during onupgradeneeded
    req.result = mockDB as unknown as IDBDatabase;
    // Simulate onupgradeneeded then onsuccess
    queueMicrotask(() => {
      req.onupgradeneeded?.(new Event('upgradeneeded') as IDBVersionChangeEvent);
      req.onsuccess?.(new Event('success'));
    });
    return req;
  });

  // Replace global indexedDB
  vi.stubGlobal('indexedDB', { open: mockOpen });
}

// ─── Test data factories ────────────────────────────────────────────────────

function makeWorldMap(overrides: Partial<WorldMapData> = {}): WorldMapData {
  return {
    id: 'world-1',
    width: 10,
    height: 10,
    tiles: [[{ type: 'plains' }]],
    regions: [],
    playerPos: { regionId: 'r1' },
    generatedAt: Date.now(),
    ...overrides,
  };
}

function makeRegionRef(overrides: Partial<RegionRef> = {}): RegionRef {
  return {
    id: 'region-1',
    name: 'Test Region',
    type: 'kingdom',
    worldX: 5,
    worldY: 5,
    climate: 'temperate',
    terrain: 'plains',
    discovered: true,
    locations: [],
    ...overrides,
  };
}

function makeLocationMap(overrides: Partial<LocationMapData> = {}): LocationMapData {
  return {
    id: 'loc-1',
    name: 'Test Location',
    type: 'town',
    backgroundImageKey: 'img-loc-1',
    buildings: [],
    npcs: [],
    landmarks: [],
    playerPos: { x: 0, y: 0 },
    generatedAt: Date.now(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('mapStorage', () => {
  beforeEach(() => {
    setupMockIndexedDB();
    // Reset module cache so openDB re-initializes
    vi.resetModules();
  });

  //
  // We test that each function:
  // 1. Is exported and callable
  // 2. Returns a Promise
  // 3. Resolves without error for basic inputs
  //
  // Full integration tests would require a real IndexedDB (e.g., via fake-indexeddb + jsdom).
  //

  describe('World Map CRUD', () => {
    it('saveWorldMap resolves without error', async () => {
      const { saveWorldMap } = await import('../../../src/services/map/mapStorage');
      await expect(saveWorldMap(makeWorldMap())).resolves.toBeUndefined();
    });

    it('getWorldMap resolves to null for missing key', async () => {
      const { getWorldMap } = await import('../../../src/services/map/mapStorage');
      const result = await getWorldMap('nonexistent');
      expect(result).toBeNull();
    });

    it('deleteWorldMap resolves without error', async () => {
      const { deleteWorldMap } = await import('../../../src/services/map/mapStorage');
      await expect(deleteWorldMap('world-1')).resolves.toBeUndefined();
    });
  });

  describe('Region Map CRUD', () => {
    it('saveRegionMap resolves without error', async () => {
      const { saveRegionMap } = await import('../../../src/services/map/mapStorage');
      await expect(saveRegionMap(makeRegionRef())).resolves.toBeUndefined();
    });

    it('getRegionMap resolves to null for missing key', async () => {
      const { getRegionMap } = await import('../../../src/services/map/mapStorage');
      const result = await getRegionMap('nonexistent');
      expect(result).toBeNull();
    });

    it('deleteRegionMap resolves without error', async () => {
      const { deleteRegionMap } = await import('../../../src/services/map/mapStorage');
      await expect(deleteRegionMap('region-1')).resolves.toBeUndefined();
    });
  });

  describe('Location Map CRUD', () => {
    it('saveLocationMap resolves without error', async () => {
      const { saveLocationMap } = await import('../../../src/services/map/mapStorage');
      await expect(saveLocationMap(makeLocationMap())).resolves.toBeUndefined();
    });

    it('getLocationMap resolves to null for missing key', async () => {
      const { getLocationMap } = await import('../../../src/services/map/mapStorage');
      const result = await getLocationMap('nonexistent');
      expect(result).toBeNull();
    });

    it('deleteLocationMap resolves without error', async () => {
      const { deleteLocationMap } = await import('../../../src/services/map/mapStorage');
      await expect(deleteLocationMap('loc-1')).resolves.toBeUndefined();
    });
  });

  describe('Location Image CRUD', () => {
    it('saveLocationImage resolves without error', async () => {
      const { saveLocationImage } = await import('../../../src/services/map/mapStorage');
      const blob = new Blob(['test'], { type: 'image/png' });
      await expect(saveLocationImage('img-1', blob)).resolves.toBeUndefined();
    });

    it('getLocationImage resolves to null for missing key', async () => {
      const { getLocationImage } = await import('../../../src/services/map/mapStorage');
      const result = await getLocationImage('nonexistent');
      expect(result).toBeNull();
    });

    it('deleteLocationImage resolves without error', async () => {
      const { deleteLocationImage } = await import('../../../src/services/map/mapStorage');
      await expect(deleteLocationImage('img-1')).resolves.toBeUndefined();
    });
  });

  describe('clearAllMapData', () => {
    it('resolves without error', async () => {
      const { clearAllMapData } = await import('../../../src/services/map/mapStorage');
      await expect(clearAllMapData()).resolves.toBeUndefined();
    });
  });

  describe('function signatures', () => {
    it('exports all expected functions', async () => {
      const mod = await import('../../../src/services/map/mapStorage');
      const expected = [
        'saveWorldMap', 'getWorldMap', 'deleteWorldMap',
        'saveRegionMap', 'getRegionMap', 'deleteRegionMap',
        'saveLocationMap', 'getLocationMap', 'deleteLocationMap',
        'saveLocationImage', 'getLocationImage', 'deleteLocationImage',
        'clearAllMapData',
      ];
      for (const name of expected) {
        expect(typeof mod[name as keyof typeof mod]).toBe('function');
      }
    });
  });
});
