/**
 * 物品词条池 — API 层 (纯函数)
 *
 * 外部只调 `drawAffixes(category, quality)`. 内部自动: 查质量区间得 buff 数量,
 * 按 weight 滚 buffs, 按 debuffProb 滚 1 个 debuff, 合并返回.
 *
 * 详细见 spec: docs/superpowers/specs/2026-06-05-item-affix-pool-design.md
 */
import type { ItemCategory, ItemEffect, ItemQuality } from '../types/item';
import {
  AFFIX_POOLS,
  DEBUFF_PROBABILITY,
  QUALITY_AFFIX_RANGE,
  type AffixPoolKey,
} from './affixPools';

// ============================================================
// RNG 接口: 外部可注入, 便于测试和未来服务端确定性
// ============================================================
export interface RNG {
  /** [0, 1) 浮点 */
  next(): number;
  /** [0, n) 整数 */
  int(n: number): number;
}

export const defaultRng: RNG = {
  next: () => Math.random(),
  int: (n) => Math.floor(Math.random() * n),
};

// ============================================================
// 主入口: 一函数包打
// ============================================================
/**
 * 抽取物品词条 (buffs + 可选 debuff).
 * 步骤: 1) 查质量区间得 buff 数量 2) 按 weight 滚 buffs 3) 按 debuffProb 滚 1 个 debuff 4) 合并返回.
 *
 * @param category  物品 category, 必须是 AffixPoolKey (4 主品类之一)
 * @param quality   物品 quality
 * @param rng       可选 RNG, 默认 Math.random. 测试可注入 deterministic RNG.
 * @returns 词条数组 (可能为空). 调用方负责 attach 到 Item.effects.
 */
export function drawAffixes(
  category: ItemCategory,
  quality: ItemQuality,
  rng: RNG = defaultRng,
): ItemEffect[] {
  // 防御: 不在 4 主品类时返空 (material/key_item/container 暂不参与)
  if (!isPoolKey(category)) return [];

  const range = QUALITY_AFFIX_RANGE[quality];
  const buffCount = range.min === range.max
    ? range.min
    : range.min + rng.int(range.max - range.min + 1);

  const buffs = drawBuffs(category, quality, buffCount, rng);
  const debuff = rollDebuff(category, quality, rng);
  return debuff ? [...buffs, debuff] : buffs;
}

// ============================================================
// 内部辅助 (也导出供高级场景: UI 预演 / LLM 调)
// ============================================================
export function drawBuffs(
  category: AffixPoolKey,
  quality: ItemQuality,
  count: number,
  rng: RNG = defaultRng,
): ItemEffect[] {
  if (count <= 0) return [];
  const candidates = AFFIX_POOLS[category].buffs.filter((a) => qualityAtLeast(quality, a.minQuality));
  if (candidates.length === 0) return [];
  return Array.from({ length: count }, () => weightedPick(candidates, rng).effect);
}

export function rollDebuff(
  category: AffixPoolKey,
  quality: ItemQuality,
  rng: RNG = defaultRng,
): ItemEffect | null {
  if (rng.next() >= DEBUFF_PROBABILITY[quality]) return null;
  const candidates = AFFIX_POOLS[category].debuffs.filter((a) => qualityAtLeast(quality, a.minQuality));
  if (candidates.length === 0) return null;
  return weightedPick(candidates, rng).effect;
}

export function getQualityRange(quality: ItemQuality): { min: number; max: number } {
  const r = QUALITY_AFFIX_RANGE[quality];
  return { min: r.min, max: r.max };
}

// ============================================================
// 内部工具
// ============================================================
function isPoolKey(category: ItemCategory): category is AffixPoolKey {
  return category === 'weapon' || category === 'armor' || category === 'accessory' || category === 'consumable';
}

const QUALITY_ORDER: ItemQuality[] = ['粗糙', '普通', '精良', '稀有', '史诗', '传说'];
function qualityAtLeast(q: ItemQuality, min: ItemQuality): boolean {
  return QUALITY_ORDER.indexOf(q) >= QUALITY_ORDER.indexOf(min);
}

function weightedPick<T extends { weight: number }>(items: readonly T[], rng: RNG): T {
  const total = items.reduce((s, x) => s + x.weight, 0);
  let roll = rng.next() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll < 0) return item;
  }
  return items[items.length - 1]; // 浮点边界回退
}
