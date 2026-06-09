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

  it('每个池子至少 3 个 affix (buff 或 debuff)', () => {
    for (const key of ['weapon', 'armor', 'accessory', 'consumable'] as const) {
      const pool = AFFIX_POOLS[key];
      const total = pool.buffs.length + pool.debuffs.length;
      expect(total, `${key} pool total affixes`).toBeGreaterThanOrEqual(3);
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

// ============================================================
// v0.6.3: 8 元素抗性/伤害词条扩展
// ============================================================
const EIGHT_ELEMENTS = ['fire', 'ice', 'lightning', 'wind', 'earth', 'arcane', 'holy', 'shadow'] as const;

describe('v0.6.3 防具池 8 元素抗性词条', () => {
  const armorBuffs = AFFIX_POOLS.armor.buffs;

  it('包含 8 个精良单元素抗性词条', () => {
    for (const elem of EIGHT_ELEMENTS) {
      const id = `arm_resist_${elem}_1`;
      const affix = armorBuffs.find(a => a.effect.id === id);
      expect(affix, `缺少词条 ${id}`).toBeDefined();
      expect(affix!.minQuality).toBe('精良');
      expect(affix!.effect.type).toBe('elemental_resist');
    }
  });

  it('包含稀有火/冰/雷抗性词条', () => {
    for (const elem of ['fire', 'ice', 'lightning'] as const) {
      const id = `arm_resist_${elem}_2`;
      const affix = armorBuffs.find(a => a.effect.id === id);
      expect(affix, `缺少词条 ${id}`).toBeDefined();
      expect(affix!.minQuality).toBe('稀有');
    }
  });

  it('包含史诗全抗词条 arm_resist_all_1', () => {
    const affix = armorBuffs.find(a => a.effect.id === 'arm_resist_all_1');
    expect(affix).toBeDefined();
    expect(affix!.minQuality).toBe('史诗');
    expect(affix!.effect.type).toBe('elemental_resist');
    const val = affix!.effect.value as Record<string, unknown>;
    for (const elem of EIGHT_ELEMENTS) {
      expect(val[elem], `全抗词条缺少 ${elem}`).toBe(10);
    }
  });

  it('旧的 arm_resist_1 已移除', () => {
    const found = armorBuffs.find(a => a.effect.id === 'arm_resist_1');
    expect(found).toBeUndefined();
  });
});

describe('v0.6.3 武器池 8 元素伤害词条', () => {
  const weaponBuffs = AFFIX_POOLS.weapon.buffs;

  it('包含 8 个元素伤害词条', () => {
    for (const elem of EIGHT_ELEMENTS) {
      const id = `wpn_elem_${elem}_1`;
      const affix = weaponBuffs.find(a => a.effect.id === id);
      expect(affix, `缺少词条 ${id}`).toBeDefined();
      expect(affix!.effect.type).toBe('elemental_damage');
    }
  });

  it('旧的 wpn_elem_1 已移除', () => {
    const found = weaponBuffs.find(a => a.effect.id === 'wpn_elem_1');
    expect(found).toBeUndefined();
  });
});

describe('v0.6.3 饰品池抗性词条', () => {
  const accBuffs = AFFIX_POOLS.accessory.buffs;

  it('包含精良火/冰/雷抗性词条', () => {
    for (const elem of ['fire', 'ice', 'lightning'] as const) {
      const id = `acc_resist_${elem}_1`;
      const affix = accBuffs.find(a => a.effect.id === id);
      expect(affix, `缺少词条 ${id}`).toBeDefined();
      expect(affix!.minQuality).toBe('精良');
      const val = affix!.effect.value as Record<string, unknown>;
      expect(val[elem]).toBe(15);
    }
  });

  it('包含稀有圣/暗抗性词条', () => {
    for (const elem of ['holy', 'shadow'] as const) {
      const id = `acc_resist_${elem}_1`;
      const affix = accBuffs.find(a => a.effect.id === id);
      expect(affix, `缺少词条 ${id}`).toBeDefined();
      expect(affix!.minQuality).toBe('稀有');
    }
  });

  it('包含传说全抗词条 acc_resist_all_1', () => {
    const affix = accBuffs.find(a => a.effect.id === 'acc_resist_all_1');
    expect(affix).toBeDefined();
    expect(affix!.minQuality).toBe('传说');
    const val = affix!.effect.value as Record<string, unknown>;
    for (const elem of EIGHT_ELEMENTS) {
      expect(val[elem], `全抗词条缺少 ${elem}`).toBe(10);
    }
  });
});
