import type { LogEntry, LoggerConfig } from './types';

const DB_NAME = 'AeslanLogs';
const DB_VERSION = 1;
const STORE_NAME = 'entries';

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('level', 'level', { unique: false });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function writeBatch(entries: LogEntry[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const entry of entries) {
      store.add(entry);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB unavailable (e.g., private browsing in some browsers)
  }
}

export async function queryLogs(criteria: {
  since?: number;
  category?: string;
  level?: number;
  limit?: number;
}): Promise<LogEntry[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = criteria.category
      ? store.index('category')
      : store.index('timestamp');

    const entries: LogEntry[] = [];
    let count = 0;

    await new Promise<void>((resolve) => {
      const request = index.openCursor(null, 'prev');
      request.onsuccess = () => {
        const c = request.result;
        if (!c) { resolve(); return; }

        const entry = c.value as LogEntry;
        const matches =
          (!criteria.since || entry.timestamp >= criteria.since)
          && (!criteria.level || entry.level >= criteria.level)
          && (criteria.limit === undefined || count < criteria.limit);

        if (matches) {
          entries.push(entry);
          count++;
        }
        c.continue();
      };
    });

    return entries;
  } catch {
    return [];
  }
}

export async function getStorageSizeMB(): Promise<number> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const count = await new Promise<number>((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return (count * 512) / (1024 * 1024);
  } catch {
    return 0;
  }
}

export async function purgeOldest(config: LoggerConfig): Promise<void> {
  const sizeMB = await getStorageSizeMB();
  if (sizeMB < config.maxStorageMB) return;

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('timestamp');

    const count = await new Promise<number>((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const toDelete = Math.ceil(count * 0.2);
    let deleted = 0;

    await new Promise<void>((resolve) => {
      const request = index.openCursor(null, 'next');
      request.onsuccess = () => {
        const c = request.result;
        if (!c || deleted >= toDelete) { resolve(); return; }
        c.delete();
        deleted++;
        c.continue();
      };
    });
  } catch {
    // cleanup failed silently
  }
}

export async function clearAll(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
  } catch {
    // clear failed silently
  }
}

export async function dumpAll(): Promise<LogEntry[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const entries: LogEntry[] = [];
    await new Promise<void>((resolve) => {
      const request = store.openCursor(null, 'next');
      request.onsuccess = () => {
        const c = request.result;
        if (!c) { resolve(); return; }
        entries.push(c.value as LogEntry);
        c.continue();
      };
    });
    return entries;
  } catch {
    return [];
  }
}
