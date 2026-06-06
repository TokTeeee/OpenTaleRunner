/**
 * Mem0 兼容适配器 — PR-3 placeholder
 *
 * 启用方法:
 * 1. npm install mem0ai
 * 2. 在 settingsStore 中设置 backend='mem0' 并填 apiKey
 * 3. MemoryManager 会自动选择此实现
 *
 * 本期: 所有方法 throw, 仅作为接口契约的占位.
 */
import type { MemoryHit, MemoryQuery, MemoryRecord, MemoryRecordInput } from '../../types/memory';

const NOT_ENABLED = 'Mem0MemoryStore 未启用 — 设置 VITE_MEMORY_BACKEND=mem0 并配置 MEM0_API_KEY';

export class Mem0ClientAdapter {
  async add(_records: MemoryRecordInput[]): Promise<MemoryRecord[]> {
    throw new Error(NOT_ENABLED);
  }
  async search(_q: MemoryQuery): Promise<MemoryHit[]> {
    throw new Error(NOT_ENABLED);
  }
  searchSync(_q: MemoryQuery): MemoryHit[] {
    throw new Error(NOT_ENABLED);
  }
  async getByEntity(_scope: string, _entityId: string): Promise<MemoryRecord[]> {
    throw new Error(NOT_ENABLED);
  }
  async forget(_id: string, _reason: string): Promise<void> {
    throw new Error(NOT_ENABLED);
  }
  async prune(): Promise<number> {
    throw new Error(NOT_ENABLED);
  }
  async clear(): Promise<void> {
    throw new Error(NOT_ENABLED);
  }
  size(): number {
    throw new Error(NOT_ENABLED);
  }
}
