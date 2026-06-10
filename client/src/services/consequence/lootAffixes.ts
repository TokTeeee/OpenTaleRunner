/**
 * 词条池 Loot 集成 — 纯函数
 *
 * 把 affixPool 系统的 drawAffixes 包装为 loot 友好的接口:
 * - 接受 LLM/GM 提供的 ItemGainedData
 * - 返回带 `pool_${now}_${i}` id 前缀的 ItemEffect[] (与预定义 `eff_` 区分)
 * - 可注入 RNG 便于测试
 *
 * 详细见 spec: docs/superpowers/specs/2026-06-05-loot-affix-integration-design.md
 */
import { drawAffixes, type RNG } from '../../data/affixPool';
import type { ItemEffect } from '../../types/item';
import type { ItemGainedData } from '../../types/game';

/**
 * 根据 loot 物品 (ItemGainedData) 生成词条池附加效果.
 *
 * 设计原则:
 * - LLM/GM 提供的预定义词条 (gained.effects) 由调用方负责附加, 本函数只负责池词条
 * - 池词条按 category × quality 抽取, 由 drawAffixes 内部概率控
 * - 池词条 id 用 `pool_${now}_${i}` 前缀, 调试时一眼区分
 *
 * @param gained  LLM/GM 提供的物品数据 (含 category, quality)
 * @param now     ISO 时间戳, 用于 id 生成 (避免与预定义 eff_${now}_* 冲突)
 * @param rng     可选 RNG, 默认 defaultRng (Math.random). 测试可注入确定性 RNG.
 * @returns 池词条数组 (可能空, 调用方 append 到预定义后)
 */
export function generateLootAffixes(
  gained: ItemGainedData,
  now: string,
  rng?: RNG,
): ItemEffect[] {
  const category = gained.category ?? 'consumable';
  const quality = gained.quality ?? '普通';

  // 类型断言: ItemGainedData.category/quality 是 string (LLM 自由格式)
  // drawAffixes 内部 isPoolKey 做实际过滤
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- LLM 自由格式, 由 isPoolKey 守卫
  const pool = drawAffixes(category as any, quality as any, rng, gained.subCategory);

  return pool.map((effect, i) => ({
    ...effect,
    id: `pool_${now}_${i}`,
  }));
}
