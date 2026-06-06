/**
 * lootAffixes 单测 — 验证词条池集成到 loot 的纯函数逻辑
 */
import { describe, expect, it } from 'vitest';
import { generateLootAffixes } from '../../../src/services/consequence/lootAffixes';
import type { ItemGainedData } from '../../../src/types/game';
import type { RNG } from '../../../src/data/affixPool';

const NOW = '2026-06-05T10:00:00.000Z';

// 测试用确定性 RNG: next() 总是返 0.5, int() 总是返 0
const fixedRng: RNG = { next: () => 0.5, int: () => 0 };

describe('generateLootAffixes', () => {
  it('weapon + 传说 + 固定 RNG → 返 pool_ 前缀 id 的 ItemEffect[]', () => {
    const gained: ItemGainedData = {
      name: '传说之剑',
      category: 'weapon',
      quality: '传说',
    };
    const result = generateLootAffixes(gained, NOW, fixedRng);
    expect(Array.isArray(result)).toBe(true);
    for (const e of result) {
      // id 必须是 pool_${now}_${i} 前缀
      expect(e.id).toMatch(/^pool_/);
      expect(e.id).toContain(NOW);
      // 必须有 type 和 description (来自池定义)
      expect(e.type).toBeTruthy();
      expect(e.description).toBeTruthy();
    }
  });

  it('material + 传说 → 返 [] (非主品类降级)', () => {
    const gained: ItemGainedData = {
      name: '铁矿',
      category: 'material',
      quality: '传说',
    };
    expect(generateLootAffixes(gained, NOW, fixedRng)).toEqual([]);
  });

  it('key_item + 传说 → 返 []', () => {
    const gained: ItemGainedData = {
      name: '古老钥匙',
      category: 'key_item',
      quality: '传说',
    };
    expect(generateLootAffixes(gained, NOW, fixedRng)).toEqual([]);
  });

  it('缺省 category 视为 consumable, 缺省 quality 视为 普通 → 不抛错', () => {
    const gained: ItemGainedData = { name: '神秘物品' };
    // 不传 rng → 用 defaultRng (Math.random), 也不传 quality
    // 普通 区间 0-1, 最多 1 个 affix
    const result = generateLootAffixes(gained, NOW);
    expect(Array.isArray(result)).toBe(true);
    // 不抛错即可
  });

  it('同样 RNG → 同样结果 (确定性)', () => {
    const gained: ItemGainedData = {
      name: '精良之剑',
      category: 'weapon',
      quality: '精良',
    };
    const a = generateLootAffixes(gained, NOW, fixedRng);
    const b = generateLootAffixes(gained, NOW, fixedRng);
    expect(a).toEqual(b);
  });
});
