/**
 * MemoryStore 接口 — PR-3
 *
 * 设计原则:
 * - 对齐 Mem0 add/search/get_all/forget 语义, 便于未来切换
 * - 4 种实现可插拔: InMemory / SqliteVec / Mem0Cloud / Mem0SelfHosted
 * - Embedding 由 store 内部调用 EmbeddingProvider, 调用方不感知
 *
 * PR-3 提供 InMemoryMemoryStore 默认实现.
 * SqliteVecMemoryStore 在 PR-3 之后作为性能优化单独实施.
 */
import type { MemoryHit, MemoryQuery, MemoryRecord, MemoryRecordInput } from '../../types/memory';

export interface MemoryStore {
  /** 批量添加 (内部生成 embedding) */
  add(records: MemoryRecordInput[]): Promise<MemoryRecord[]>;
  /** 检索 */
  search(q: MemoryQuery): Promise<MemoryHit[]>;
  /** 按实体获取 */
  getByEntity(scope: string, entityId: string): Promise<MemoryRecord[]>;
  /** 软删除 (保留 7 天可恢复) */
  forget(id: string, reason: string): Promise<void>;
  /** 衰减清理, 返回被软删除的 record 数 */
  prune(): Promise<number>;
  /** 清空所有 (含已软删除) — 测试用 */
  clear(): Promise<void>;
  /** 当前总数 (含已软删除) */
  size(): number;
}
