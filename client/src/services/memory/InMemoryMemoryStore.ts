/**
 * InMemoryMemoryStore — 纯 JS 实现, 无外部依赖
 *
 * 存储: Map<id, MemoryRecord> (进程内) + localStorage 持久化 (可选)
 * 检索: 全量扫描 + 余弦相似度 (PR-3 数据量 < 1k 够用, 后续 PR 替换为 sqlite-vec)
 *
 * 适用: 单设备/单机/小世界. 多设备同步在 PR-5 SaveManager 4 域化中提供.
 */
import type {
  EmbeddingProvider,
  MemoryDecayConfig,
  MemoryHit,
  MemoryQuery,
  MemoryRecord,
  MemoryRecordInput,
} from '../../types/memory';
import { HashEmbeddingProvider, cosineSimilarity } from './HashEmbeddingProvider';
import { applyDecay } from './decay';

const STORAGE_KEY = 'opentale-runner.memory.v1';
const DEFAULT_QUERY_TOPK = 8;
const DEFAULT_MIN_SCORE = 0.05;
const RECENT_PROTECTION_HOURS = 24;
const ARCHIVE_RETAIN_DAYS = 7;

function genId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

export class InMemoryMemoryStore {
  private records: Map<string, MemoryRecord> = new Map();
  private embedder: EmbeddingProvider;
  private decay: MemoryDecayConfig;
  private persist: boolean;

  constructor(options?: {
    embedder?: EmbeddingProvider;
    decay?: MemoryDecayConfig;
    persist?: boolean;
  }) {
    this.embedder = options?.embedder || new HashEmbeddingProvider();
    this.decay = options?.decay || { strategy: 'none' };
    this.persist = options?.persist ?? true;
    if (this.persist) this.load();
  }

  /** 切换衰减策略 (来自 settings) */
  setDecayConfig(cfg: MemoryDecayConfig): void {
    this.decay = cfg;
  }

  async add(records: MemoryRecordInput[]): Promise<MemoryRecord[]> {
    const created: MemoryRecord[] = [];
    for (const r of records) {
      const embedding = this.embedder.embedSync(r.content);
      const record: MemoryRecord = {
        ...r,
        id: genId(),
        embedding,
        createdAt: nowISO(),
        deletedAt: null,
      };
      this.records.set(record.id, record);
      created.push(record);
    }
    this.flush();
    return created;
  }

  /** 同步检索 — 在 prompt builder 同步方法中使用 */
  searchSync(q: MemoryQuery): MemoryHit[] {
    const topK = q.topK ?? DEFAULT_QUERY_TOPK;
    const minScore = q.minScore ?? DEFAULT_MIN_SCORE;
    const queryVec = this.embedder.embedSync(q.query);

    const hits: MemoryHit[] = [];
    for (const record of this.records.values()) {
      if (record.deletedAt) continue;
      if (q.scopes && !q.scopes.includes(record.scope)) continue;
      if (q.entityFilter && record.entityId !== q.entityFilter) continue;
      if (q.timeRange) {
        const [start, end] = q.timeRange;
        if (record.metadata.timestamp < start || record.metadata.timestamp > end) continue;
      }
      if (!record.embedding) continue;
      const score = cosineSimilarity(queryVec, record.embedding);
      if (score < minScore) continue;
      hits.push({ ...record, score });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, topK);
  }

  async search(q: MemoryQuery): Promise<MemoryHit[]> {
    return this.searchSync(q);
  }

  async getByEntity(scope: string, entityId: string): Promise<MemoryRecord[]> {
    const out: MemoryRecord[] = [];
    for (const r of this.records.values()) {
      if (r.scope === scope && r.entityId === entityId && !r.deletedAt) out.push(r);
    }
    out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return out;
  }

  async forget(id: string, _reason: string): Promise<void> {
    const r = this.records.get(id);
    if (!r) return;
    r.deletedAt = nowISO();
    this.records.set(id, r);
    this.flush();
  }

  async prune(): Promise<number> {
    const survivors: MemoryRecord[] = [];
    const toSoftDelete: MemoryRecord[] = [];
    const now = Date.now();
    const RECENT_MS = RECENT_PROTECTION_HOURS * 3600 * 1000;
    const activeEntityIds = this.collectActiveEntityIds();

    for (const r of this.records.values()) {
      if (r.deletedAt) continue;
      // 跨策略保护:
      // 1) 24h 内豁免
      if (now - r.metadata.timestamp < RECENT_MS) {
        survivors.push(r);
        continue;
      }
      // 2) importance >= 0.9 关键记忆豁免
      if (r.metadata.importance >= 0.9) {
        survivors.push(r);
        continue;
      }
      // 3) 活跃实体豁免
      if (activeEntityIds.has(`${r.scope}:${r.entityId}`)) {
        // 仅豁免最近 5 条
        const entRecords = survivors
          .filter((s) => s.scope === r.scope && s.entityId === r.entityId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        if (entRecords.length < 5) {
          survivors.push(r);
          continue;
        }
      }
      // 衰减策略判定
      if (applyDecay(r, this.decay, now)) {
        toSoftDelete.push(r);
      } else {
        survivors.push(r);
      }
    }

    for (const r of toSoftDelete) {
      r.deletedAt = nowISO();
    }
    this.flush();
    return toSoftDelete.length;
  }

  async clear(): Promise<void> {
    this.records.clear();
    this.flush();
  }

  size(): number {
    return this.records.size;
  }

  /** 列出所有软删除的 record (供 UI "恢复遗忘"功能) */
  listArchived(sinceMs?: number): MemoryRecord[] {
    const out: MemoryRecord[] = [];
    const cutoff = sinceMs ?? (Date.now() - ARCHIVE_RETAIN_DAYS * 24 * 3600 * 1000);
    for (const r of this.records.values()) {
      if (r.deletedAt && new Date(r.deletedAt).getTime() >= cutoff) out.push(r);
    }
    return out;
  }

  /** 恢复被软删除的 record */
  restore(id: string): boolean {
    const r = this.records.get(id);
    if (!r || !r.deletedAt) return false;
    r.deletedAt = null;
    this.records.set(id, r);
    this.flush();
    return true;
  }

  private collectActiveEntityIds(): Set<string> {
    // 简化: 当前时间 1h 内被检索/添加的 entity 视为活跃
    // 实际由调用方在 search 前通过 setActiveEntities 注入
    return this._activeEntities;
  }

  private _activeEntities: Set<string> = new Set();

  setActiveEntities(ids: string[]): void {
    this._activeEntities = new Set(ids);
  }

  private load(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as { records: MemoryRecord[] };
      this.records = new Map(data.records.map((r) => [r.id, r]));
    } catch {
      // ignore
    }
  }

  private flush(): void {
    if (!this.persist || typeof localStorage === 'undefined') return;
    try {
      const data = { records: Array.from(this.records.values()) };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // localStorage 满/不可用 — 静默忽略, 进程内仍有数据
    }
  }
}
