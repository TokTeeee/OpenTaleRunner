/**
 * useMemory — React 订阅 MemoryManager 的 hooks。
 * UI/Engine 都通过这个 hook 拿 records / byEntity / search, MemoryManager 单例在 hooks 下层。
 *
 * 模式: useState counter 触发重渲染, useEffect 订阅 MemoryManager.subscribe, 变化时 setState(+1).
 * 避免 useSyncExternalStore 在 filter().map() 每次返回新数组的无限重渲染问题.
 */
import { useEffect, useState } from 'react';
import { MemoryManager } from '../services/memory/MemoryManager';
import type { MemoryQuery, MemoryHit, MemoryRecord, MemoryScope } from '../types/memory';

/** 内部 hook: 订阅 MemoryManager 变化, 返回触发重渲染的 tick */
function useMemoryTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => MemoryManager.subscribe(() => setTick((t) => t + 1)), []);
  return tick;
}

/** 订阅 MemoryManager 变化, 返回当前所有未软删除 records 列表 */
export function useMemoryRecords(): MemoryRecord[] {
  useMemoryTick();
  return MemoryManager.listAll();
}

/** 按 scope 过滤 (订阅) */
export function useMemoryRecordsByScope(scope: MemoryScope | 'all'): MemoryRecord[] {
  useMemoryTick();
  const all = MemoryManager.listAll();
  if (scope === 'all') return all;
  return all.filter((r) => r.scope === scope);
}

/** 按 entity 取 (订阅) */
export function useMemoryByEntitySync(scope: MemoryScope, entityId: string): MemoryRecord[] {
  useMemoryTick();
  return MemoryManager.listAll().filter((r) => r.scope === scope && r.entityId === entityId);
}

/** 同步 search (订阅, 无 query 时空数组) */
export function useMemorySearch(q: MemoryQuery): MemoryHit[] {
  useMemoryTick();
  if (!q.query) return [];
  return MemoryManager.searchSync(q);
}
