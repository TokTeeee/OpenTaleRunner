/**
 * 物品词条池 — API 层逻辑测试
 */
import { describe, expect, it } from 'vitest';
import { drawAffixes, drawBuffs, type RNG } from '../../src/data/affixPool';

// 测试用确定性 RNG: next() 总是返 0.5, int() 总是返 0
const fixedRng: RNG = { next: () => 0.5, int: () => 0 };

describe('drawAffixes happy path', () => {
  it('weapon + 精良 返 ItemEffect[]', () => {
    const result = drawAffixes('weapon', '精良', fixedRng);
    expect(Array.isArray(result)).toBe(true);
    for (const e of result) {
      expect(e.id).toBeTruthy();
      expect(e.type).toBeTruthy();
      expect(e.description).toBeTruthy();
    }
  });

  it('armor + 稀有 返 ItemEffect[]', () => {
    const result = drawAffixes('armor', '稀有', fixedRng);
    expect(Array.isArray(result)).toBe(true);
  });

  it('accessory + 史诗 返 ItemEffect[]', () => {
    const result = drawAffixes('accessory', '史诗', fixedRng);
    expect(Array.isArray(result)).toBe(true);
  });

  it('consumable + 传说 返 ItemEffect[]', () => {
    const result = drawAffixes('consumable', '传说', fixedRng);
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('质量区间映射', () => {
  // 用确定性 RNG: rng.next() 返 0.999 (rollDebuff 概率检查时, 即便有 debuff 概率也尽量不触发)
  // rng.int() 返 0 (最小抽取数)
  const minRng: RNG = { next: () => 0.999, int: () => 0 };

  it('粗糙 → 0 个 buff', () => {
    const result = drawAffixes('weapon', '粗糙', minRng);
    expect(result.length).toBe(0);
  });

  it('普通 → 0 个 buff', () => {
    const result = drawAffixes('weapon', '普通', minRng);
    expect(result.length).toBe(0);
  });

  it('精良 → 1 个 buff (min=1, max=2, int(2) = 0 → 取 min=1)', () => {
    const result = drawAffixes('armor', '精良', minRng);
    expect(result.length).toBe(1);
  });

  it('稀有 → 2 个 buff', () => {
    const result = drawAffixes('accessory', '稀有', minRng);
    expect(result.length).toBe(2);
  });

  it('史诗 → 3 个 buff', () => {
    const result = drawAffixes('weapon', '史诗', minRng);
    expect(result.length).toBe(3);
  });

  it('传说 → 4 个 buff', () => {
    const result = drawAffixes('consumable', '传说', minRng);
    expect(result.length).toBe(4);
  });
});

describe('非主品类降级', () => {
  const fixedRng: RNG = { next: () => 0.5, int: () => 0 };

  it('material 返 []', () => {
    expect(drawAffixes('material', '传说', fixedRng)).toEqual([]);
  });

  it('key_item 返 []', () => {
    expect(drawAffixes('key_item', '传说', fixedRng)).toEqual([]);
  });

  it('container 返 []', () => {
    expect(drawAffixes('container', '传说', fixedRng)).toEqual([]);
  });
});

describe('debuff 概率 (1000 采样)', () => {
  // rng: int() 返 max (取最大 buff 数, 留出 debuff 位); next() 随机
  // 注意: 这里用真实 RNG 测分布
  const SAMPLE_SIZE = 1000;
  const TOLERANCE = 0.05; // ±5%

  it('传说质量: debuff 出现率约 15% ± 5%', () => {
    let debuffCount = 0;
    for (let i = 0; i < SAMPLE_SIZE; i++) {
      // 传说区间 4-5: int(2) 返 0 → 取 min=4. 若 debuff 触发, 总数 5; 若不触发, 4.
      const minRng: RNG = { next: Math.random, int: () => 0 };
      const result = drawAffixes('weapon', '传说', minRng);
      if (result.length > 4) debuffCount++;
    }
    const rate = debuffCount / SAMPLE_SIZE;
    expect(rate).toBeGreaterThanOrEqual(0.15 - TOLERANCE);
    expect(rate).toBeLessThanOrEqual(0.15 + TOLERANCE);
  });

  it('粗糙质量: debuff 出现率 = 0% (DEBUFF_PROBABILITY[粗糙] = 0)', () => {
    let debuffCount = 0;
    for (let i = 0; i < SAMPLE_SIZE; i++) {
      const minRng: RNG = { next: Math.random, int: () => 0 };
      const result = drawAffixes('weapon', '粗糙', minRng);
      // 粗糙 0-1: int(2) 返 0 → 0 个 buff. 减益概率 0. 总数永远 0.
      if (result.length > 0) debuffCount++;
    }
    expect(debuffCount).toBe(0);
  });
});

describe('RNG 注入确定性', () => {
  it('同样 RNG 序列 → 同样结果', () => {
    // 用一个 counter-based RNG, 每次调用都返相同序列
    let counter = 0;
    const seq = [0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 0, 0.5, 0.5];
    const seqRng: RNG = {
      next: () => seq[counter++ % seq.length] ?? 0,
      int: (n) => Math.floor((seq[counter++ % seq.length] ?? 0) * n),
    };

    const a = drawAffixes('weapon', '精良', seqRng);
    counter = 0; // 重置
    const b = drawAffixes('weapon', '精良', seqRng);
    expect(a).toEqual(b);
  });
});

describe('权重分布 (1000 采样)', () => {
  it('高 weight 项出现频次 > 低 weight 项', () => {
    // 在精良质量下, weapon 池子中 damage_bonus (weight=8) 应比 critical (weight=4) 出现多
    // 用 1000 次采样统计 damage_bonus 出现次数 vs critical 出现次数
    let dmgCount = 0;
    let critCount = 0;
    for (let i = 0; i < 1000; i++) {
      const result = drawAffixes('weapon', '精良'); // 用默认 RNG
      for (const e of result) {
        if (e.type === 'damage_bonus') dmgCount++;
        if (e.type === 'critical') critCount++;
      }
    }
    expect(dmgCount).toBeGreaterThan(critCount);
  });
});

describe('v0.6.3 minSubCategory 过滤', () => {
  it('法杖专属词条在 subCategory=staff 时可抽取', () => {
    const rng = { next: () => 0.99, int: (n: number) => n - 1 };
    const buffs = drawBuffs('weapon', '精良', 20, rng, 'staff');
    const hasStaffAffix = buffs.some(b => b.id === 'staff_int_1' || b.id === 'staff_mp_1');
    expect(hasStaffAffix).toBe(true);
  });

  it('法杖专属词条在 subCategory 未指定时不可抽取', () => {
    const rng = { next: () => 0.99, int: (n: number) => n - 1 };
    const buffs = drawBuffs('weapon', '精良', 20, rng);
    const hasStaffAffix = buffs.some(b => b.id === 'staff_int_1' || b.id === 'staff_mp_1');
    expect(hasStaffAffix).toBe(false);
  });

  it('圣印记专属词条在 subCategory=holy_symbol 时可抽取', () => {
    const rng = { next: () => 0.99, int: (n: number) => n - 1 };
    const buffs = drawBuffs('weapon', '精良', 20, rng, 'holy_symbol');
    const hasSymbolAffix = buffs.some(b => b.id === 'symbol_wis_1' || b.id === 'symbol_mp_1');
    expect(hasSymbolAffix).toBe(true);
  });
});
