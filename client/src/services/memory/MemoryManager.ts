/**
 * MemoryManager — PR-3 记忆层门面
 *
 * 封装底层 MemoryStore, 提供:
 * - 单例 (浏览器进程内)
 * - 自动选择 backend (local / mem0)
 * - 工具方法: 摘要/导入/导出
 * - 与 settingsStore 解耦: 通过 setDecayConfig 接收外部配置变更
 *
 * PR-3 默认 backend = 'local' (InMemoryMemoryStore).
 */
import type {
  EmbeddingProvider,
  MemoryDecayConfig,
  MemoryHit,
  MemoryQuery,
  MemoryRecord,
  MemoryRecordInput,
} from '../../types/memory';
import { InMemoryMemoryStore } from './InMemoryMemoryStore';
import { Mem0ClientAdapter } from './Mem0ClientAdapter';

export interface MemoryBackend {
  add(records: MemoryRecordInput[]): Promise<MemoryRecord[]>;
  search(q: MemoryQuery): Promise<MemoryHit[]>;
  searchSync(q: MemoryQuery): MemoryHit[];
  getByEntity(scope: string, entityId: string): Promise<MemoryRecord[]>;
  forget(id: string, reason: string): Promise<void>;
  prune(): Promise<number>;
  clear(): Promise<void>;
  size(): number;
  setDecayConfig(cfg: MemoryDecayConfig): void;
  setActiveEntities(ids: string[]): void;
  listArchived(sinceMs?: number): MemoryRecord[];
  restore(id: string): boolean;
}

class _MemoryManagerImpl {
  private backend: MemoryBackend = new InMemoryMemoryStore();
  private _backendType: 'local' | 'mem0' = 'local';

  getBackendType(): 'local' | 'mem0' {
    return this._backendType;
  }

  setBackend(type: 'local' | 'mem0', _config?: { apiKey?: string; userId?: string }): void {
    if (type === 'local') {
      this.backend = new InMemoryMemoryStore();
      this._backendType = 'local';
    } else {
      // 启用 mem0 时需要 import mem0ai; 本期仅留 placeholder
      // 实际初始化: this.backend = new Mem0ClientAdapter({ apiKey, userId });
      this.backend = new Mem0ClientAdapter() as unknown as MemoryBackend;
      this._backendType = 'mem0';
    }
  }

  add(records: MemoryRecordInput[]): Promise<MemoryRecord[]> {
    return this.backend.add(records).then((r) => { this.emit(); return r; });
  }

  search(q: MemoryQuery): Promise<MemoryHit[]> {
    return this.backend.search(q);
  }

  getByEntity(scope: string, entityId: string): Promise<MemoryRecord[]> {
    return this.backend.getByEntity(scope, entityId);
  }

  forget(id: string, reason: string): Promise<void> {
    return this.backend.forget(id, reason).then(() => this.emit());
  }

  prune(): Promise<number> {
    return this.backend.prune().then((n) => { if (n > 0) this.emit(); return n; });
  }

  clear(): Promise<void> {
    return this.backend.clear().then(() => this.emit());
  }

  size(): number {
    return this.backend.size();
  }

  /** 列出所有未软删除的 record (UI 总览用) */
  listAll(): MemoryRecord[] {
    const out: MemoryRecord[] = [];
    for (const r of (this.backend as unknown as { records?: Map<string, MemoryRecord> }).records?.values() || []) {
      if (!r.deletedAt) out.push(r);
    }
    return out;
  }

  searchSync(q: MemoryQuery): MemoryHit[] {
    return this.backend.searchSync(q);
  }

  /** 测试/重置用: 清空当前 backend 并重建 */
  resetForTest(): void {
    this.backend = new InMemoryMemoryStore({ persist: false });
    this._backendType = 'local';
    this.emit();
  }

  /**
   * 订阅 records 变更 (React useMemory 内部用)。
   * 返回 unsubscribe 函数。
   */
  subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => { this._listeners.delete(listener); };
  }

  private _listeners: Set<() => void> = new Set();

  private emit(): void {
    this._listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
  }

  setDecayConfig(cfg: MemoryDecayConfig): void {
    this.backend.setDecayConfig(cfg);
  }

  setActiveEntities(ids: string[]): void {
    this.backend.setActiveEntities(ids);
  }

  listArchived(sinceMs?: number): MemoryRecord[] {
    return this.backend.listArchived(sinceMs);
  }

  restore(id: string): boolean {
    return this.backend.restore(id);
  }
}

export const MemoryManager = new _MemoryManagerImpl();

/**
 * EmbeddingProvider 注册点 (供 settingsStore 或 PR-4 替换为 LLM 端点)
 */
let _embedder: EmbeddingProvider | null = null;
export function setEmbeddingProvider(p: EmbeddingProvider): void {
  _embedder = p;
  // backend 需要重建以使用新 embedder, 这里先简化
  // 实际 PR-4 中: 重新构造 InMemoryMemoryStore({ embedder: p })
}
export function getEmbeddingProvider(): EmbeddingProvider | null {
  return _embedder;
}
