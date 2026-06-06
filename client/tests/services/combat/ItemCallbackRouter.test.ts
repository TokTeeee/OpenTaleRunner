import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  routeItem,
  registerCustomHandler,
  unregisterCustomHandler,
  clearCustomHandlers,
  hasCustomHandler,
  hasGMFallbackEffect,
  listEffectCategories,
  NeedsGMFallbackError,
} from '../../../src/services/combat/ItemCallbackRouter';
import type { Item, ItemEffect } from '../../../src/types/item';
import type { Combatant, CombatState, ItemCombatUseContext } from '../../../src/services/combat/types';
import { INITIAL_COMBAT_STATE } from '../../../src/stores/combatStore';

function makeCombatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'p1',
    side: 'player',
    name: '玩家',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: 20, maxHp: 30,
    ap: 6, maxAp: 6,
    conditions: [],
    isDead: false,
    isFleeing: false,
    equipped: { weapon: null, armor: null, accessory: null },
    ...overrides,
  };
}

function makeItem(effects: ItemEffect[], overrides: Partial<Item> = {}): Item {
  return {
    name: '测试物品',
    effects,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<ItemCombatUseContext> = {}): ItemCombatUseContext {
  return {
    user: makeCombatant({ id: 'p1', name: '玩家' }),
    target: makeCombatant({ id: 'e1', name: '敌人', side: 'enemy', hp: 12, maxHp: 12 }),
    action: { kind: 'item', userId: 'p1', itemId: 'item_test', targetId: 'e1' },
    state: { ...INITIAL_COMBAT_STATE, phase: 'active', round: 1 } as CombatState,
    ...overrides,
  };
}

beforeEach(() => {
  clearCustomHandlers();
});

afterEach(() => {
  clearCustomHandlers();
});

// ============================================================
// routeItem — 7 种 default mapping
// ============================================================

describe('ItemCallbackRouter: routeItem 7 种 default mapping', () => {
  it('hp_restore → heal, target.hp +value', () => {
    const item = makeItem([{ id: 'e1', type: 'hp_restore', value: 10, description: '恢复 10 HP' }]);
    const ctx = makeCtx({
      user: makeCombatant({ id: 'p1', hp: 5, maxHp: 30 }),
      target: null, // target null → target = user
    });
    const r = routeItem(item, ctx);
    expect(r.success).toBe(true);
    // damage 字段: 正数=伤害, 负数=治疗 (spec CombatActionResult 约定)
    expect(r.damage).toBe(-10);
    expect(r.messages.some((m) => m.includes('恢复 10 HP'))).toBe(true);
  });

  it('hp_restore 不超过 maxHp', () => {
    const item = makeItem([{ id: 'e1', type: 'hp_restore', value: 100, description: '大量恢复' }]);
    const ctx = makeCtx({
      user: makeCombatant({ id: 'p1', hp: 5, maxHp: 30 }),
      target: null,
    });
    const r = routeItem(item, ctx);
    // 实际 heal = min(100, 30-5) = 25
    expect(r.damage).toBe(-25);
    expect(r.messages.some((m) => m.includes('25'))).toBe(true);
  });

  it('hp_max_bonus → buff, 推 +CON BuffInstance', () => {
    const item = makeItem([{ id: 'e1', type: 'hp_max_bonus', value: 5, description: '+5 maxHp' }]);
    const ctx = makeCtx();
    const r = routeItem(item, ctx);
    expect(r.appliedBuffs).toBeDefined();
    expect(r.appliedBuffs).toHaveLength(1);
    expect(r.appliedBuffs![0]?.modifiers.CON).toBe(5);
    expect(r.appliedBuffs![0]?.remainingTurns).toBe(5);
  });

  it('vital_restore → buff', () => {
    const item = makeItem([{ id: 'e1', type: 'vital_restore', value: 5, description: '恢复 MP' }]);
    const ctx = makeCtx();
    const r = routeItem(item, ctx);
    expect(r.appliedBuffs).toHaveLength(1);
    expect(r.appliedBuffs![0]?.ref).toContain('vital_restore');
  });

  it('attribute_mod → buff, modifiers 透传', () => {
    const item = makeItem([{ id: 'e1', type: 'attribute_mod', value: { STR: 2, DEX: 1 }, description: '+STR/DEX' }]);
    const ctx = makeCtx();
    const r = routeItem(item, ctx);
    expect(r.appliedBuffs![0]?.modifiers).toEqual({ STR: 2, DEX: 1 });
  });

  it('elemental_resist → buff (CON 代偿)', () => {
    const item = makeItem([{ id: 'e1', type: 'elemental_resist', value: 3, description: '+3 抗性' }]);
    const ctx = makeCtx();
    const r = routeItem(item, ctx);
    expect(r.appliedBuffs![0]?.modifiers.CON).toBe(3);
  });

  it('skill_bonus → buff (INT 代偿)', () => {
    const item = makeItem([{ id: 'e1', type: 'skill_bonus', value: 2, description: '+2 技能' }]);
    const ctx = makeCtx();
    const r = routeItem(item, ctx);
    expect(r.appliedBuffs![0]?.modifiers.INT).toBe(2);
  });

  it('elemental_damage → damage, 走 hit 判定 + value', () => {
    const item = makeItem([{ id: 'e1', type: 'elemental_damage', value: 8, description: '火焰 8' }]);
    const ctx = makeCtx();
    const r = routeItem(item, ctx);
    expect(r.damage).toBe(8);
    expect(r.messages.some((m) => m.includes('8'))).toBe(true);
  });
});

// ============================================================
// 4 种 weapon-perm 跳过
// ============================================================

describe('ItemCallbackRouter: weapon-perm 4 种不触发', () => {
  it('damage_bonus 不计入 messages / buffs / damage', () => {
    const item = makeItem([{ id: 'e1', type: 'damage_bonus', value: 4, description: '+4 dmg' }]);
    const ctx = makeCtx();
    const r = routeItem(item, ctx);
    expect(r.messages).toEqual([]);
    expect(r.appliedBuffs).toBeUndefined();
    expect(r.damage).toBeUndefined();
    expect(r.success).toBe(false);
  });

  it('defense_bonus 不触发', () => {
    const item = makeItem([{ id: 'e1', type: 'defense_bonus', value: 2, description: '+2 def' }]);
    const r = routeItem(item, makeCtx());
    expect(r.messages).toEqual([]);
  });
});

// ============================================================
// 2 种 gm-fallback 抛错
// ============================================================

describe('ItemCallbackRouter: gm-fallback 抛 NeedsGMFallbackError', () => {
  it('light_source 抛 NeedsGMFallbackError', () => {
    const item = makeItem([{ id: 'e1', type: 'light_source', value: 30, description: '火把' }], { itemId: 'torch' });
    expect(() => routeItem(item, makeCtx())).toThrow(NeedsGMFallbackError);
    try {
      routeItem(item, makeCtx());
    } catch (e) {
      expect((e as NeedsGMFallbackError).effectType).toBe('light_source');
      expect((e as NeedsGMFallbackError).itemId).toBe('torch');
    }
  });

  it('special 抛 NeedsGMFallbackError', () => {
    const item = makeItem([{ id: 'e1', type: 'special', value: 'curious', description: '奇怪效果' }]);
    expect(() => routeItem(item, makeCtx())).toThrow(NeedsGMFallbackError);
  });

  it('hasGMFallbackEffect 预判正确', () => {
    expect(hasGMFallbackEffect(makeItem([{ id: 'e1', type: 'special', value: 1, description: '' }]))).toBe(true);
    expect(hasGMFallbackEffect(makeItem([{ id: 'e1', type: 'hp_restore', value: 1, description: '' }]))).toBe(false);
    expect(hasGMFallbackEffect({ name: 'x' })).toBe(false);
  });
});

// ============================================================
// 空 effects / 多 effects 合并
// ============================================================

describe('ItemCallbackRouter: 边界', () => {
  it('effects 为空 → success=false, 无 messages', () => {
    const r = routeItem({ name: '空物品' }, makeCtx());
    expect(r.success).toBe(false);
    expect(r.messages).toEqual([]);
  });

  it('effects=undefined → 同上', () => {
    const r = routeItem({ name: '空物品', effects: undefined }, makeCtx());
    expect(r.success).toBe(false);
  });

  it('多 effect 混合: heal + buff + damage 合并', () => {
    const item = makeItem([
      { id: 'e1', type: 'hp_restore', value: 5, description: '+5' },
      { id: 'e2', type: 'attribute_mod', value: { STR: 2 }, description: '+STR' },
      { id: 'e3', type: 'elemental_damage', value: 3, description: '火焰 3' },
    ]);
    const r = routeItem(item, makeCtx());
    expect(r.messages.length).toBeGreaterThanOrEqual(3);
    expect(r.appliedBuffs).toHaveLength(1);
    expect(r.damage).toBe(3);
  });

  it('listEffectCategories 列出所有分类', () => {
    const item = makeItem([
      { id: 'e1', type: 'hp_restore', value: 5, description: '' },
      { id: 'e2', type: 'damage_bonus', value: 2, description: '' },
    ]);
    expect(listEffectCategories(item)).toEqual(['heal', 'weapon-perm']);
  });
});

// ============================================================
// customHandlerRegistry
// ============================================================

describe('ItemCallbackRouter: customHandlerRegistry 覆盖默认', () => {
  it('注册后自定义 handler 优先于默认', () => {
    const customMessages: string[] = [];
    registerCustomHandler('hp_restore', (effect) => {
      customMessages.push(`custom: ${effect.value}`);
      return { success: true, messages: ['CUSTOM_HEAL'], damage: 999 };
    });

    expect(hasCustomHandler('hp_restore')).toBe(true);

    const item = makeItem([{ id: 'e1', type: 'hp_restore', value: 5, description: '' }]);
    const r = routeItem(item, makeCtx());
    expect(r.messages).toContain('CUSTOM_HEAL');
    expect(r.damage).toBe(999);
    expect(customMessages).toHaveLength(1);
  });

  it('unregisterCustomHandler 注销', () => {
    registerCustomHandler('hp_restore', () => ({ success: true, messages: [] }));
    expect(hasCustomHandler('hp_restore')).toBe(true);
    expect(unregisterCustomHandler('hp_restore')).toBe(true);
    expect(hasCustomHandler('hp_restore')).toBe(false);
  });

  it('clearCustomHandlers 清空', () => {
    registerCustomHandler('hp_restore', () => ({ success: true, messages: [] }));
    registerCustomHandler('attribute_mod', () => ({ success: true, messages: [] }));
    clearCustomHandlers();
    expect(hasCustomHandler('hp_restore')).toBe(false);
    expect(hasCustomHandler('attribute_mod')).toBe(false);
  });
});

// ============================================================
// 错误边界
// ============================================================

describe('ItemCallbackRouter: 错误处理', () => {
  it('非数字 value (heal) 不抛, 走 warn 记入 messages', () => {
    const item = makeItem([{ id: 'e1', type: 'hp_restore', value: 'oops' as unknown as number, description: '' }]);
    const r = routeItem(item, makeCtx());
    expect(r.messages.some((m) => m.includes('不是数字'))).toBe(true);
  });

  it('attribute_mod 传非对象 value 不抛, 走 warn', () => {
    const item = makeItem([{ id: 'e1', type: 'attribute_mod', value: 5 as unknown as Record<string, number>, description: '' }]);
    const r = routeItem(item, makeCtx());
    expect(r.messages.some((m) => m.includes('无法解析'))).toBe(true);
  });

  it('target=null 时回退到 user (self-heal)', () => {
    const item = makeItem([{ id: 'e1', type: 'hp_restore', value: 5, description: '' }]);
    const ctx = makeCtx({ user: makeCombatant({ id: 'p1', hp: 5, maxHp: 30 }), target: null });
    const r = routeItem(item, ctx);
    expect(r.damage).toBe(-5); // 5 heal, damage 字段 = -5 (spec 约定)
  });
});
