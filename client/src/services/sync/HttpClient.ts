/**
 * 统一 HTTP 客户端 — 服务端 API 请求基础层。
 * APIClient 和 MultiplayerAPI 共用：base URL / 鉴权注入 / 错误归一化 / JSON 解析。
 */
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore } from '../../stores/authStore';
import { clientLogger } from '../logging/ClientLogger';
import { LogCategory } from '../logging/types';

export function getBaseUrl(): string {
  const { server } = useSettingsStore.getState();
  return (server?.endpoint || 'http://localhost:8000').replace(/\/$/, '');
}

export function getAuthToken(): string {
  return useAuthStore.getState().token || '';
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const start = performance.now();

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const elapsed = Math.round(performance.now() - start);

  if (!res.ok) {
    const text = await res.text();
    clientLogger.warn(LogCategory.HTTP, method, `${path} → ${res.status} (${elapsed}ms) error: ${text.slice(0, 100)}`);
    throw new Error(`[API ${res.status}] ${method} ${path}: ${text.slice(0, 200)}`);
  }

  clientLogger.debug(LogCategory.HTTP, method, `${path} → ${res.status} (${elapsed}ms)`);

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
