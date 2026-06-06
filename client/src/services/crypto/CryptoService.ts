/**
 * 客户端加密服务 — 使用 Web Crypto API (AES-GCM) 保护 localStorage 中的敏感字段。
 * 威胁模型：防止浏览器 DevTools / 扩展 / 物理访问时 API Key 明文泄露。
 * 局限性：浏览器端无硬件安全模块，无法防御同一浏览器进程内的内存读取。
 */
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const PBKDF2_ITERATIONS = 100000;
const APP_SALT = new TextEncoder().encode('aeslan-crypto-v1');

const SENSITIVE_FIELDS = [
  'llm.apiKey',
  'autoPlayLLM.apiKey',
  'stt.apiKey',
  'tts.apiKey',
  'imageGen.apiKey',
  'token',
];

function getDeviceSeed(): string {
  const STORAGE_KEY = 'aeslan-device-seed';
  if (typeof localStorage === 'undefined') return '';
  let seed: string;
  try { seed = localStorage.getItem(STORAGE_KEY) ?? ''; } catch { return ''; }
  if (!seed) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    seed = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem(STORAGE_KEY, seed); } catch { /* storage unavailable */ }
  }
  return seed;
}

async function deriveKey(): Promise<CryptoKey> {
  const seed = getDeviceSeed();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`aeslan:${seed}`),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: APP_SALT,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return `$AESLAN1$${arrayBufferToBase64(combined.buffer)}`;
}

async function decrypt(wrapped: string): Promise<string> {
  if (!wrapped.startsWith('$AESLAN1$')) {
    return wrapped;
  }
  const combined = new Uint8Array(base64ToArrayBuffer(wrapped.slice('$AESLAN1$'.length)));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const key = await deriveKey();
  const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
      current[keys[i]] = {};
    }
    current = current[keys[i]] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

async function encryptSensitiveFields(obj: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = structuredClone(obj);
  for (const field of SENSITIVE_FIELDS) {
    const value = getNestedValue(result, field);
    if (typeof value === 'string' && value.length > 0 && !value.startsWith('$AESLAN1$')) {
      const encrypted = await encrypt(value);
      setNestedValue(result, field, encrypted);
    }
  }
  return result;
}

async function decryptSensitiveFields(obj: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = structuredClone(obj);
  for (const field of SENSITIVE_FIELDS) {
    const value = getNestedValue(result, field);
    if (typeof value === 'string' && value.startsWith('$AESLAN1$')) {
      try {
        const decrypted = await decrypt(value);
        setNestedValue(result, field, decrypted);
      } catch {
        setNestedValue(result, field, '');
      }
    }
  }
  return result;
}

interface StorageEnvelope {
  state: Record<string, unknown>;
  version?: number;
}

export function createSecureStorage() {
  return {
    getItem: async (name: string): Promise<StorageEnvelope | null> => {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(name);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as StorageEnvelope;
        if (parsed.state) {
          parsed.state = await decryptSensitiveFields(parsed.state);
        }
        return parsed;
      } catch {
        return null;
      }
    },
    setItem: async (name: string, value: StorageEnvelope): Promise<void> => {
      if (typeof localStorage === 'undefined') return;
      try {
        const clone = structuredClone(value);
        if (clone.state) {
          clone.state = await encryptSensitiveFields(clone.state);
        }
        try { localStorage.setItem(name, JSON.stringify(clone)); } catch { /* storage full or denied */ }
      } catch {
        try { localStorage.setItem(name, JSON.stringify(value)); } catch { /* storage full or denied */ }
      }
    },
    removeItem: async (name: string): Promise<void> => {
      if (typeof localStorage === 'undefined') return;
      try { localStorage.removeItem(name); } catch { /* storage unavailable */ }
    },
  };
}
