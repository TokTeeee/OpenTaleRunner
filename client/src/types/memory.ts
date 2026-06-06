/**
 * v0.4-memory 长期记忆系统类型。
 * 详细设计见 docs/superpowers/specs/2026-06-04-mem0-gm-memory-and-4domain-save-design.md (PR-3+PR-4)
 * 实现见 client/src/services/memory/* (MemoryManager + InMemoryMemoryStore)
 */

export type MemoryScope = 'npc' | 'item' | 'event' | 'player' | 'location' | 'lore';

export interface MemoryMetadata {
  worldDay: number;
  region?: string;
  timestamp: number;
  importance: number;  // 0..1
  tags?: string[];
}

export interface MemoryRecord {
  id: string;
  scope: MemoryScope;
  entityId: string | null;
  content: string;
  embedding?: number[];
  metadata: MemoryMetadata;
  createdAt: string;
  /** 软删除时间, null = 未删除 */
  deletedAt: string | null;
}

export type MemoryRecordInput = Omit<MemoryRecord, 'id' | 'createdAt' | 'deletedAt' | 'embedding'>;

export interface MemoryQuery {
  query: string;
  scopes?: MemoryScope[];
  topK?: number;
  minScore?: number;
  entityFilter?: string;
  timeRange?: [number, number];
}

export type MemoryHit = MemoryRecord & { score: number };

export type DecayStrategyName = 'none' | 'gentle' | 'forgetting_curve' | 'aggressive';

export interface MemoryDecayConfig {
  strategy: DecayStrategyName;
  /** gentle: 保留天数, 默认 90 */
  retentionDays?: number;
  /** gentle: 重要性阈值, 低于此值才可能被遗忘, 默认 0.2 */
  importanceFloor?: number;
  /** forgetting_curve: 衰减常数, 默认 30 天 */
  tauDays?: number;
  /** aggressive: 容量上限 */
  maxRecords?: number;
}

/**
 * Embedding 抽象 — 默认实现 HashEmbeddingProvider (PR-3 离线 deterministic)。
 * 未来可替换为 LLM 端点 (text-embedding-3-small) 或 transformers.js 本地模型。
 */
export interface EmbeddingProvider {
  readonly dim: number;
  embedSync(text: string): number[];
  embedBatchSync(texts: string[]): number[][];
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}
