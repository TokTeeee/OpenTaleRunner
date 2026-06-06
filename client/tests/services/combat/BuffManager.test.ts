import { describe, expect, it } from 'vitest';
import {
  addBuff,
  removeBuff,
  tickBuffs,
  getBuffModifiers,
  getConditionRefs,
  getActiveBuff,
  addBuffToCombatant,
  removeBuffFromCombatant,
  tickBuffsOnCombatant,
  getCombatantBuffModifiers,
  validateBuff,
  InvalidBuffError,
} from '../../../src/services/combat/BuffManager';
import type { BuffInstance } from '../../../src/services/combat/types';
import type { Combatant } from '../../../src/services/combat/types';

function makeBuff(overrides: Partial<BuffInstance> = {}): BuffInstance {
  return {
    ref: 'test_buff',
    stacks: 1,
    remainingTurns: 3,
    source: 'test',
    appliedAtTurn: 1,
    modifiers: {},
    ...overrides,
  };
}

function makeCombatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'p1',
    side: 'player',
    name: '玩家',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: 20, maxHp: 20,
    ap: 6, maxAp: 6,
    conditions: [],
    isDead: false,
    isFleeing: false,
    equipped: { weapon: null, armor: null, accessory: null },
    ...overrides,
  };
}

// ============================================================
// validateBuff
// ============================================================

describe('BuffManager: validateBuff 校验', () => {
  it('合法 buff 不抛错', () => {
    expect(() => validateBuff(makeBuff())).not.toThrow();
  });

  it('ref 为空抛 InvalidBuffError', () => {
    expect(() => validateBuff(makeBuff({ ref: '' }))).toThrow(InvalidBuffError);
  });

  it('remainingTurns=0 抛错 (必须是 -1 或正整数)', () => {
    expect(() => validateBuff(makeBuff({ remainingTurns: 0 }))).toThrow(InvalidBuffError);
  });

  it('remainingTurns=-2 抛错 (永久只能是 -1)', () => {
    expect(() => validateBuff(makeBuff({ remainingTurns: -2 }))).toThrow(InvalidBuffError);
  });

  it('stacks=0 抛错', () => {
    expect(() => validateBuff(makeBuff({ stacks: 0 }))).toThrow(InvalidBuffError);
  });

  it('modifiers 非数字抛错', () => {
    expect(() => validateBuff(makeBuff({ modifiers: { STR: 'oops' as unknown as number } }))).toThrow(InvalidBuffError);
  });
});

// ============================================================
// addBuff — stackRule
// ============================================================

describe('BuffManager: addBuff stackRule', () => {
  it('无同 ref → added', () => {
    const conditions: BuffInstance[] = [];
    const r = addBuff(conditions, makeBuff({ ref: 'buff_a' }));
    expect(r.outcome).toBe('added');
    expect(r.conditions).toHaveLength(1);
    expect(r.conditions[0]?.ref).toBe('buff_a');
  });

  it('同 ref + default rule=replace → 覆盖', () => {
    const conditions = [makeBuff({ ref: 'x', remainingTurns: 1, source: 'old' })];
    const r = addBuff(conditions, makeBuff({ ref: 'x', remainingTurns: 5, source: 'new' }));
    expect(r.outcome).toBe('replaced');
    expect(r.conditions[0]?.source).toBe('new');
    expect(r.conditions[0]?.remainingTurns).toBe(5);
  });

  it('同 ref + rule=stack → stacks 累加', () => {
    const conditions = [makeBuff({ ref: 'poison', stacks: 2, remainingTurns: 2, modifiers: { CON: -1 } })];
    const r = addBuff(conditions, makeBuff({ ref: 'poison', stacks: 3, remainingTurns: 5, modifiers: { CON: -2 }, stackRule: 'stack' }));
    expect(r.outcome).toBe('stacked');
    expect(r.conditions[0]?.stacks).toBe(5); // 2 + 3
    expect(r.conditions[0]?.remainingTurns).toBe(5); // max(2, 5)
    expect(r.conditions[0]?.modifiers.CON).toBe(-3); // -1 + -2
  });

  it('同 ref + rule=refresh → 倒计时取 max, modifiers 替换', () => {
    const conditions = [makeBuff({ ref: 'shield', remainingTurns: 1, source: 'old', modifiers: { STR: 1 } })];
    const r = addBuff(conditions, makeBuff({ ref: 'shield', remainingTurns: 4, source: 'new', modifiers: { STR: 2 }, stackRule: 'refresh' }));
    expect(r.outcome).toBe('refreshed');
    expect(r.conditions[0]?.remainingTurns).toBe(4);
    expect(r.conditions[0]?.source).toBe('new');
    expect(r.conditions[0]?.modifiers.STR).toBe(2); // 覆盖, 不累加
  });

  it('同 ref + rule=ignore → conditions 不变', () => {
    const conditions = [makeBuff({ ref: 'wound', remainingTurns: 3, source: 'orig' })];
    const r = addBuff(conditions, makeBuff({ ref: 'wound', remainingTurns: 5, source: 'new', stackRule: 'ignore' }));
    expect(r.outcome).toBe('ignored');
    expect(r.conditions).toEqual(conditions);
  });

  it('纯函数: 不修改原数组', () => {
    const conditions = [makeBuff({ ref: 'a' })];
    const snapshot = [...conditions];
    addBuff(conditions, makeBuff({ ref: 'b' }));
    expect(conditions).toEqual(snapshot);
  });
});

// ============================================================
// removeBuff
// ============================================================

describe('BuffManager: removeBuff', () => {
  it('找到 ref → 移除', () => {
    const conditions = [makeBuff({ ref: 'a' }), makeBuff({ ref: 'b' })];
    const r = removeBuff(conditions, 'a');
    expect(r.removed).toBe(1);
    expect(r.conditions).toHaveLength(1);
    expect(r.conditions[0]?.ref).toBe('b');
  });

  it('找不到 ref → removed=0, conditions 不变', () => {
    const conditions = [makeBuff({ ref: 'a' })];
    const r = removeBuff(conditions, 'zzz');
    expect(r.removed).toBe(0);
    expect(r.conditions).toEqual(conditions);
  });
});

// ============================================================
// tickBuffs
// ============================================================

describe('BuffManager: tickBuffs 倒计时', () => {
  it('remainingTurns: 3 → 2', () => {
    const conditions = [makeBuff({ ref: 'a', remainingTurns: 3 })];
    const r = tickBuffs(conditions);
    expect(r.conditions[0]?.remainingTurns).toBe(2);
    expect(r.expired).toEqual([]);
  });

  it('remainingTurns: 1 → 0 → 移除 + 记入 expired', () => {
    const conditions = [makeBuff({ ref: 'a', remainingTurns: 1 })];
    const r = tickBuffs(conditions);
    expect(r.conditions).toEqual([]);
    expect(r.expired).toEqual(['a']);
  });

  it('remainingTurns: -1 (永久) → 不减, 保留', () => {
    const conditions = [makeBuff({ ref: 'perm', remainingTurns: -1 })];
    const r = tickBuffs(conditions);
    expect(r.conditions[0]?.remainingTurns).toBe(-1);
    expect(r.expired).toEqual([]);
  });

  it('多 buff 混合: 永久 / 倒计时 / 归零', () => {
    const conditions = [
      makeBuff({ ref: 'perm', remainingTurns: -1 }),
      makeBuff({ ref: 'mid', remainingTurns: 5 }),
      makeBuff({ ref: 'end', remainingTurns: 1 }),
    ];
    const r = tickBuffs(conditions);
    expect(r.conditions.map((b) => b.ref)).toEqual(['perm', 'mid']);
    expect(r.conditions.find((b) => b.ref === 'mid')?.remainingTurns).toBe(4);
    expect(r.expired).toEqual(['end']);
  });

  it('纯函数: 不修改原数组', () => {
    const conditions = [makeBuff({ ref: 'a', remainingTurns: 3 })];
    const snapshot = [...conditions];
    tickBuffs(conditions);
    expect(conditions).toEqual(snapshot);
  });
});

// ============================================================
// getBuffModifiers
// ============================================================

describe('BuffManager: getBuffModifiers 汇总', () => {
  it('空 conditions → 空对象', () => {
    expect(getBuffModifiers([])).toEqual({});
  });

  it('单个 buff modifiers 透传', () => {
    const conditions = [makeBuff({ ref: 'a', modifiers: { STR: 2, DEX: -1 } })];
    expect(getBuffModifiers(conditions)).toEqual({ STR: 2, DEX: -1 });
  });

  it('多 buff 同 attribute 累加', () => {
    const conditions = [
      makeBuff({ ref: 'a', modifiers: { STR: 2 } }),
      makeBuff({ ref: 'b', modifiers: { STR: 3, DEX: 1 } }),
    ];
    expect(getBuffModifiers(conditions)).toEqual({ STR: 5, DEX: 1 });
  });

  it('忽略非数字 modifier (防御性)', () => {
    const conditions = [makeBuff({ ref: 'a', modifiers: { STR: 2, WIS: 'bad' as unknown as number } })];
    expect(getBuffModifiers(conditions)).toEqual({ STR: 2 });
  });
});

// ============================================================
// getConditionRefs — v0.3 向后兼容视图
// ============================================================

describe('BuffManager: getConditionRefs 派生视图', () => {
  it('空 conditions → 空数组', () => {
    expect(getConditionRefs([])).toEqual([]);
  });

  it('多 buff → refs 字符串数组', () => {
    const conditions = [makeBuff({ ref: 'a' }), makeBuff({ ref: 'b' })];
    expect(getConditionRefs(conditions)).toEqual(['a', 'b']);
  });
});

// ============================================================
// getActiveBuff
// ============================================================

describe('BuffManager: getActiveBuff 查询', () => {
  it('找到 → 返回 buff', () => {
    const conditions = [makeBuff({ ref: 'a' }), makeBuff({ ref: 'b' })];
    expect(getActiveBuff(conditions, 'b')?.ref).toBe('b');
  });

  it('找不到 → undefined', () => {
    expect(getActiveBuff([], 'x')).toBeUndefined();
    expect(getActiveBuff([makeBuff({ ref: 'a' })], 'x')).toBeUndefined();
  });
});

// ============================================================
// Combatant 便捷方法
// ============================================================

describe('BuffManager: Combatant 便捷方法', () => {
  it('addBuffToCombatant / removeBuffFromCombatant / getCombatantBuffModifiers / tickBuffsOnCombatant', () => {
    const c = makeCombatant({
      conditions: [makeBuff({ ref: 'str_up', modifiers: { STR: 2 } })],
    });
    expect(getCombatantBuffModifiers(c)).toEqual({ STR: 2 });

    const r = addBuffToCombatant(c, makeBuff({ ref: 'str_up', remainingTurns: 3, modifiers: { STR: 1 }, stackRule: 'stack' }));
    expect(r.outcome).toBe('stacked');

    const t = tickBuffsOnCombatant(c);
    expect(t.conditions[0]?.remainingTurns).toBe(2);

    const rm = removeBuffFromCombatant(c, 'str_up');
    expect(rm.removed).toBe(1);
  });

  it('便捷方法不修改原 combatant.conditions (纯函数)', () => {
    const c = makeCombatant({ conditions: [makeBuff({ ref: 'a', remainingTurns: 5 })] });
    const originalLen = c.conditions.length;
    addBuffToCombatant(c, makeBuff({ ref: 'b' }));
    expect(c.conditions).toHaveLength(originalLen);
  });
});

// ============================================================
// 校验空对象 (边界)
// ============================================================

describe('BuffManager: 边界', () => {
  it('空 conditions 调所有方法安全', () => {
    expect(() => getBuffModifiers([])).not.toThrow();
    expect(() => getConditionRefs([])).not.toThrow();
    expect(tickBuffs([])).toEqual({ conditions: [], ticks: [], expired: [] });
    expect(removeBuff([], 'a')).toEqual({ conditions: [], removed: 0 });
  });
});
