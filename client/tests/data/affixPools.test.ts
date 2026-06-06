/**
 * 词条池数据完整性 — 保护池子配置不被改坏
 */
import { describe, expect, it } from 'vitest';
import { AFFIX_POOLS, QUALITY_AFFIX_RANGE, DEBUFF_PROBABILITY } from '../../src/data/affixPools';
import type { ItemQuality } from '../../src/types/item';

const ALL_QUALITIES: readonly ItemQuality[] = ['粗糙', '普通', '精良', '稀有', '史诗', '传说'];

describe('AFFIX_POOLS 数据完整性', () => {
  it('4 个池子都存在', () => {
    expect(AFFIX_POOLS.weapon).toBeDefined();
    expect(AFFIX_POOLS.armor).toBeDefined();
    expect(AFFIX_POOLS.accessory).toBeDefined();
    expect(AFFIX_POOLS.consumable).toBeDefined();
    for (const key of ['weapon', 'armor', 'accessory', 'consumable'] as const) {
      expect(Array.isArray(AFFIX_POOLS[key].buffs)).toBe(true);
      expect(Array.isArray(AFFIX_POOLS[key].debuffs)).toBe(true);
    }
  });

  it('每个池子 3-5 个 affix (buff 或 debuff)', () => {
    for (const key of ['weapon', 'armor', 'accessory', 'consumable'] as const) {
      const pool = AFFIX_POOLS[key];
      const total = pool.buffs.length + pool.debuffs.length;
      expect(total, `${key} pool total affixes`).toBeGreaterThanOrEqual(3);
      expect(total, `${key} pool total affixes`).toBeLessThanOrEqual(10);
    }
  });

  it('每个 affix weight > 0', () => {
    for (const key of ['weapon', 'armor', 'accessory', 'consumable'] as const) {
      const pool = AFFIX_POOLS[key];
      for (const affix of [...pool.buffs, ...pool.debuffs]) {
        expect(affix.weight, `${key} affix weight`).toBeGreaterThan(0);
      }
    }
  });

  it('每个 affix minQuality 是合法 ItemQuality', () => {
    for (const key of ['weapon', 'armor', 'accessory', 'consumable'] as const) {
      const pool = AFFIX_POOLS[key];
      for (const affix of [...pool.buffs, ...pool.debuffs]) {
        expect(ALL_QUALITIES, `${key} affix minQuality`).toContain(affix.minQuality);
      }
    }
  });

  it('每个 affix effect.id 唯一 (全局)', () => {
    const seen = new Set<string>();
    for (const key of ['weapon', 'armor', 'accessory', 'consumable'] as const) {
      const pool = AFFIX_POOLS[key];
      for (const affix of [...pool.buffs, ...pool.debuffs]) {
        expect(seen.has(affix.effect.id), `duplicate effect.id: ${affix.effect.id}`).toBe(false);
        seen.add(affix.effect.id);
      }
    }
  });
});

describe('QUALITY_AFFIX_RANGE 完整性', () => {
  it('覆盖所有 6 个质量', () => {
    for (const q of ALL_QUALITIES) {
      expect(QUALITY_AFFIX_RANGE[q]).toBeDefined();
      expect(QUALITY_AFFIX_RANGE[q].min).toBeGreaterThanOrEqual(0);
      expect(QUALITY_AFFIX_RANGE[q].max).toBeGreaterThanOrEqual(QUALITY_AFFIX_RANGE[q].min);
    }
  });
});

describe('DEBUFF_PROBABILITY 完整性', () => {
  it('覆盖所有 6 个质量, 概率在 [0, 1]', () => {
    for (const q of ALL_QUALITIES) {
      const p = DEBUFF_PROBABILITY[q];
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});
