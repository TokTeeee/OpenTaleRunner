import { useSettingsStore } from '../../stores/settingsStore';
import { DEFAULT_OPENAI_IMAGE_ENDPOINT, DEFAULT_OPENAI_IMAGE_MODEL, getImageProviderDefaults } from '../../utils/providerCatalog';

const DB_NAME = 'aeslan-images';
const DB_VERSION = 1;
const STORE_NAME = 'generated';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getCache(key: string): Promise<string | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function setCache(key: string, base64: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(base64, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* ignore */ }
}

export class ImageClient {
  private config: { apiKey: string; endpoint: string; model: string; size: string; quality: string };

  constructor() {
    const s = useSettingsStore.getState().imageGen;
    const defaults = getImageProviderDefaults(s.provider);
    this.config = {
      apiKey: s.apiKey || useSettingsStore.getState().llm.apiKey,
      endpoint: s.endpoint || defaults.endpoint || DEFAULT_OPENAI_IMAGE_ENDPOINT,
      model: s.model || defaults.model || DEFAULT_OPENAI_IMAGE_MODEL,
      size: s.size || '1024x1024',
      quality: s.quality || 'standard',
    };
  }

  async generate(prompt: string, cacheKey: string): Promise<string | null> {
    // Check cache first
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    const base64 = await this.fetchImage(prompt);
    if (base64) {
      await setCache(cacheKey, base64);
    }
    return base64;
  }

  private async fetchImage(prompt: string): Promise<string | null> {
    try {
      const s = useSettingsStore.getState().imageGen;
      if (s.provider === 'openai' || s.provider === 'custom') {
        const resp = await fetch(this.config.endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.config.model,
            prompt,
            n: 1,
            size: this.config.size,
            quality: this.config.model === 'dall-e-3' ? this.config.quality : undefined,
            response_format: 'b64_json',
          }),
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        const img = data.data?.[0]?.b64_json;
        if (img) return `data:image/png;base64,${img}`;
      }
      // SD / custom — also try URL-based response
      const resp = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, n: 1, size: this.config.size }),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      const url = data.data?.[0]?.url;
      if (url) {
        const imgResp = await fetch(url);
        const blob = await imgResp.blob();
        return await blobToBase64(blob);
      }
      return null;
    } catch {
      return null;
    }
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
