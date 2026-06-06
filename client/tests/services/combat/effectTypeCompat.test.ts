import { describe, expect, it } from 'vitest';
import {
  toCombatCategory,
  isGMFallback,
  isWeaponPermanent,
  hasDefaultMapping,
  COMBAT_CATEGORY_LABELS,
} from '../../../src/services/combat/effectTypeCompat';
import type { EffectType } from '../../../src/types/item';

describe('effectTypeCompat: v0.3 EffectType → 战斗域分类', () => {
  // 11 种 EffectType 全部映射正确
  const expected: Array<[EffectType, ReturnType<typeof toCombatCategory>]> = [
    ['hp_restore', 'heal'],
    ['hp_max_bonus', 'buff'],
    ['vital_restore', 'buff'],
    ['attribute_mod', 'buff'],
    ['elemental_resist', 'buff'],
    ['skill_bonus', 'buff'],
    ['elemental_damage', 'damage'],
    ['damage_bonus', 'weapon-perm'],
    ['defense_bonus', 'weapon-perm'],
    ['light_source', 'gm-fallback'],
    ['special', 'gm-fallback'],
  ];

  it.each(expected)('EffectType %s 映射到 %s', (input, expected) => {
    expect(toCombatCategory(input)).toBe(expected);
  });

  it('unknown / null / undefined 走 gm-fallback 兜底', () => {
    expect(toCombatCategory(null)).toBe('gm-fallback');
    expect(toCombatCategory(undefined)).toBe('gm-fallback');
    expect(toCombatCategory('')).toBe('gm-fallback');
    expect(toCombatCategory('not_a_real_type')).toBe('gm-fallback');
  });

  it('isGMFallback 判定正确', () => {
    expect(isGMFallback('light_source')).toBe(true);
    expect(isGMFallback('special')).toBe(true);
    expect(isGMFallback('hp_restore')).toBe(false);
    expect(isGMFallback(null)).toBe(true);
  });

  it('isWeaponPermanent 判定正确', () => {
    expect(isWeaponPermanent('damage_bonus')).toBe(true);
    expect(isWeaponPermanent('defense_bonus')).toBe(true);
    expect(isWeaponPermanent('hp_restore')).toBe(false);
    expect(isWeaponPermanent('attribute_mod')).toBe(false);
  });

  it('hasDefaultMapping 判定正确 (3 类走 default)', () => {
    expect(hasDefaultMapping('hp_restore')).toBe(true);
    expect(hasDefaultMapping('attribute_mod')).toBe(true);
    expect(hasDefaultMapping('elemental_damage')).toBe(true);
    expect(hasDefaultMapping('damage_bonus')).toBe(false);
    expect(hasDefaultMapping('special')).toBe(false);
  });

  it('5 种 CombatEffectCategory 都有中文 label', () => {
    expect(COMBAT_CATEGORY_LABELS.heal).toBe('治疗');
    expect(COMBAT_CATEGORY_LABELS.buff).toBe('增益/减益');
    expect(COMBAT_CATEGORY_LABELS.damage).toBe('伤害');
    expect(COMBAT_CATEGORY_LABELS['weapon-perm']).toBe('武器永久词条');
    expect(COMBAT_CATEGORY_LABELS['gm-fallback']).toBe('需 GM 裁定');
  });

  it('5 个分类总和 = 11 (没有遗漏, 也没有重叠)', () => {
    // 11 种 EffectType 应全部有分类
    const allTypes: EffectType[] = [
      'damage_bonus', 'defense_bonus', 'attribute_mod', 'hp_restore',
      'hp_max_bonus', 'vital_restore', 'elemental_damage', 'elemental_resist',
      'skill_bonus', 'light_source', 'special',
    ];
    for (const t of allTypes) {
      expect(toCombatCategory(t)).toBeDefined();
    }
    // 战斗域分类覆盖 5 类
    const categories = new Set(allTypes.map(toCombatCategory));
    expect(categories.size).toBe(5);
  });
});
