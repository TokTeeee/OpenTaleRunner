/**
 * 衰减策略 — PR-3
 *
 * 给定 record 与当前时间, 返回 true 表示应被软删除.
 * 调用方需先做跨策略保护 (24h 内豁免 / 0.9 importance 豁免 / 活跃实体豁免).
 */
import type { MemoryDecayConfig, MemoryRecord } from '../../types/memory';

function ageDays(record: MemoryRecord, now: number): number {
  return (now - record.metadata.timestamp) / (1000 * 3600 * 24);
}

export function applyDecay(record: MemoryRecord, cfg: MemoryDecayConfig, now: number): boolean {
  switch (cfg.strategy) {
    case 'none':
      return false;

    case 'gentle': {
      const retentionDays = cfg.retentionDays ?? 90;
      const importanceFloor = cfg.importanceFloor ?? 0.2;
      if (ageDays(record, now) < retentionDays) return false;
      if (record.metadata.importance >= importanceFloor) return false;
      return Math.random() < 0.1;
    }

    case 'forgetting_curve': {
      const tauDays = cfg.tauDays ?? 30;
      const survival = Math.exp(-ageDays(record, now) / tauDays);
      return Math.random() > survival;
    }

    case 'aggressive': {
      // 仅在超出容量时返回 true; 容量由调用方基于 size() 判断.
      // 这里返回 false, 调用方在 prune 中处理按 importance 淘汰.
      return false;
    }
  }
}

/**
 * 'aggressive' 模式专用: 给定当前总容量, 返回应被软删除的 record 列表.
 */
export function selectAggressiveEvictions(
  records: MemoryRecord[],
  maxRecords: number,
): MemoryRecord[] {
  if (records.length <= maxRecords) return [];
  const sorted = [...records].sort((a, b) => {
    if (a.metadata.importance !== b.metadata.importance) {
      return a.metadata.importance - b.metadata.importance;
    }
    return a.createdAt.localeCompare(b.createdAt);
  });
  return sorted.slice(0, records.length - maxRecords);
}
