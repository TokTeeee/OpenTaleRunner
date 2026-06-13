import type { WorldMapData, RegionRef, LocationMapData } from '../../types/map';

const DB_NAME = 'AeslanMaps';
const DB_VERSION = 1;
const WORLD_STORE = 'worldMaps';
const REGION_STORE = 'regionMaps';
const LOCATION_STORE = 'locationMaps';
const IMAGE_STORE = 'locationImages';

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WORLD_STORE)) {
        db.createObjectStore(WORLD_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(REGION_STORE)) {
        db.createObjectStore(REGION_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(LOCATION_STORE)) {
        db.createObjectStore(LOCATION_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(IMAGE_STORE)) {
        db.createObjectStore(IMAGE_STORE);
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => reject(request.error);
  });
}

// ─── World Map CRUD ─────────────────────────────────────────────────────────

export async function saveWorldMap(data: WorldMapData): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(WORLD_STORE, 'readwrite');
  const store = tx.objectStore(WORLD_STORE);
  store.put(data);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getWorldMap(id: string): Promise<WorldMapData | null> {
  const db = await openDB();
  const tx = db.transaction(WORLD_STORE, 'readonly');
  const store = tx.objectStore(WORLD_STORE);
  const result = await new Promise<WorldMapData | null>((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  return result;
}

export async function deleteWorldMap(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(WORLD_STORE, 'readwrite');
  const store = tx.objectStore(WORLD_STORE);
  store.delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Region Map CRUD ────────────────────────────────────────────────────────

export async function saveRegionMap(data: RegionRef): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(REGION_STORE, 'readwrite');
  const store = tx.objectStore(REGION_STORE);
  store.put(data);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getRegionMap(id: string): Promise<RegionRef | null> {
  const db = await openDB();
  const tx = db.transaction(REGION_STORE, 'readonly');
  const store = tx.objectStore(REGION_STORE);
  const result = await new Promise<RegionRef | null>((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  return result;
}

export async function deleteRegionMap(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(REGION_STORE, 'readwrite');
  const store = tx.objectStore(REGION_STORE);
  store.delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Location Map CRUD ──────────────────────────────────────────────────────

export async function saveLocationMap(data: LocationMapData): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(LOCATION_STORE, 'readwrite');
  const store = tx.objectStore(LOCATION_STORE);
  store.put(data);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getLocationMap(id: string): Promise<LocationMapData | null> {
  const db = await openDB();
  const tx = db.transaction(LOCATION_STORE, 'readonly');
  const store = tx.objectStore(LOCATION_STORE);
  const result = await new Promise<LocationMapData | null>((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  return result;
}

export async function deleteLocationMap(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(LOCATION_STORE, 'readwrite');
  const store = tx.objectStore(LOCATION_STORE);
  store.delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Location Image (Blob) CRUD ─────────────────────────────────────────────

export async function saveLocationImage(id: string, blob: Blob): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(IMAGE_STORE, 'readwrite');
  const store = tx.objectStore(IMAGE_STORE);
  store.put(blob, id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getLocationImage(id: string): Promise<Blob | null> {
  const db = await openDB();
  const tx = db.transaction(IMAGE_STORE, 'readonly');
  const store = tx.objectStore(IMAGE_STORE);
  const result = await new Promise<Blob | null>((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  return result;
}

export async function deleteLocationImage(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(IMAGE_STORE, 'readwrite');
  const store = tx.objectStore(IMAGE_STORE);
  store.delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Clear All Map Data ─────────────────────────────────────────────────────

export async function clearAllMapData(): Promise<void> {
  const db = await openDB();
  const storeNames = [WORLD_STORE, REGION_STORE, LOCATION_STORE, IMAGE_STORE];
  const tx = db.transaction(storeNames, 'readwrite');
  for (const name of storeNames) {
    tx.objectStore(name).clear();
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
