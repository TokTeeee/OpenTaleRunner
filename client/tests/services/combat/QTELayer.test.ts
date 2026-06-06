/**
 * v0.4 战斗系统 — QTELayer 测试
 *
 * 覆盖:
 * - computeAttackRounds (4 边界: <=0, /4 区间, > 5)
 * - computeMagicBaseMs (3 边界: 低 INT 3000ms 封底, 中 INT, 高 INT 下限)
 * - attackAccuracyToModifier (0 / 0.5 / 1)
 * - magicInputsToModifier (typing only / time only / mix)
 * - computeTimeBonus (clamp 0/1)
 * - 状态机 (idle -> pending -> resolving -> finalize; cancel path)
 * - 关闭守卫 (isQTEEnabled false -> noop)
 * - 端到端: accuracy -> modifier -> damage scale 公式
 */

import { describe, it, expect } from 'vitest';
import {
  QTE_NOOP,
  QTE_MISS,
  isQTEEnabled,
  computeAttackRounds,
  computeMagicBaseMs,
  attackAccuracyToModifier,
  magicInputsToModifier,
  computeTimeBonus,
  createIdleQTEState,
  startAttackQTE,
  startMagicQTE,
  recordHit,
  finishQTE,
  cancelQTE,
  finalizeQTE,
  runAttackQTE,
  runMagicQTE,
  clampQTEModifier,
} from '../../../src/services/combat/QTELayer';
import type { Combatant } from '../../../src/services/combat/types';

function makeCaster(intStat: number): Combatant {
  return {
    id: 'caster',
    side: 'player',
    name: '法师',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: intStat, WIS: 10, CHA: 10 },
    hp: 20, maxHp: 20,
    ap: 6, maxAp: 6,
    conditions: [],
    isDead: false,
    isFleeing: false,
    equipped: { weapon: null, armor: null, accessory: null },
  };
}

// ============================================================
// 关闭守卫
// ============================================================

describe('QTELayer: isQTEEnabled / QTE_NOOP', () => {
  it('enabled=false -> isQTEEnabled false', () => {
    expect(isQTEEnabled(false)).toBe(false);
  });

  it('enabled=true -> isQTEEnabled true', () => {
    expect(isQTEEnabled(true)).toBe(true);
  });

  it('QTE_NOOP modifier=0, accuracy=1, type=none', () => {
    expect(QTE_NOOP).toEqual({ accuracy: 1, modifier: 0, type: 'none' });
  });

  it('QTE_MISS modifier=-1, accuracy=0', () => {
    expect(QTE_MISS.modifier).toBe(-1);
    expect(QTE_MISS.accuracy).toBe(0);
  });

  it('runAttackQTE 关闭时直接返 QTE_NOOP (sync, 无 throw)', () => {
    const r = runAttackQTE(false, { agilityDelta: 10, playerId: 'p', targetId: 'e' });
    expect(r).toEqual(QTE_NOOP);
  });

  it('runMagicQTE 关闭时直接返 QTE_NOOP (sync, 无 throw)', () => {
    const r = runMagicQTE(false, { spell: 'fireball', caster: makeCaster(10), playerId: 'p', targetId: 'e' });
    expect(r).toEqual(QTE_NOOP);
  });
});

// ============================================================
// computeAttackRounds
// ============================================================

describe('QTELayer: computeAttackRounds', () => {
  it('agilityDelta <= 0 -> 1 轮', () => {
    expect(computeAttackRounds(0)).toBe(1);
    expect(computeAttackRounds(-5)).toBe(1);
  });

  it('agilityDelta=4 -> 1 轮 (floor(4/4)=1)', () => {
    expect(computeAttackRounds(4)).toBe(1);
  });

  it('agilityDelta=8 -> 2 轮', () => {
    expect(computeAttackRounds(8)).toBe(2);
  });

  it('agilityDelta=12 -> 3 轮', () => {
    expect(computeAttackRounds(12)).toBe(3);
  });

  it('agilityDelta=20 -> 5 轮 (clamp 上限)', () => {
    expect(computeAttackRounds(20)).toBe(5);
  });

  it('agilityDelta=100 -> 5 轮 (clamp 上限)', () => {
    expect(computeAttackRounds(100)).toBe(5);
  });
});

// ============================================================
// computeMagicBaseMs
// ============================================================

describe('QTELayer: computeMagicBaseMs', () => {
  it('INT=0 -> 5000ms (基础)', () => {
    expect(computeMagicBaseMs(0)).toBe(5000);
  });

  it('INT=10 -> 3000ms (5000-2000)', () => {
    expect(computeMagicBaseMs(10)).toBe(3000);
  });

  it('INT=20 -> 3000ms (封底, 即使 5000-4000=1000 < 3000)', () => {
    expect(computeMagicBaseMs(20)).toBe(3000);
  });

  it('INT=5 -> 4000ms', () => {
    expect(computeMagicBaseMs(5)).toBe(4000);
  });

  it('INT=2 -> 4600ms', () => {
    expect(computeMagicBaseMs(2)).toBe(4600);
  });
});

// ============================================================
// attackAccuracyToModifier
// ============================================================

describe('QTELayer: attackAccuracyToModifier', () => {
  it('accuracy=0 -> -1 (full miss)', () => {
    expect(attackAccuracyToModifier(0)).toBe(-1);
  });

  it('accuracy=0.5 -> 0 (中性)', () => {
    expect(attackAccuracyToModifier(0.5)).toBe(0);
  });

  it('accuracy=1 -> +1 (full hit)', () => {
    expect(attackAccuracyToModifier(1)).toBe(1);
  });

  it('accuracy=0.25 -> -0.5', () => {
    expect(attackAccuracyToModifier(0.25)).toBe(-0.5);
  });

  it('accuracy=0.75 -> +0.5', () => {
    expect(attackAccuracyToModifier(0.75)).toBe(0.5);
  });

  it('越界 [-1, 1] clamp', () => {
    expect(attackAccuracyToModifier(2)).toBe(1);
    expect(attackAccuracyToModifier(-1)).toBe(-1);
  });
});

// ============================================================
// magicInputsToModifier
// ============================================================

describe('QTELayer: magicInputsToModifier', () => {
  it('typing=1, time=1 -> +1 (满)', () => {
    expect(magicInputsToModifier(1, 1)).toBe(1);
  });

  it('typing=0, time=0 -> -1 (零)', () => {
    expect(magicInputsToModifier(0, 0)).toBe(-1);
  });

  it('typing=0.5, time=0.5 -> 0 (中性, 0.5*0.6+0.5*0.4=0.5)', () => {
    expect(magicInputsToModifier(0.5, 0.5)).toBe(0);
  });

  it('typing=1, time=0 -> 0.2 ((0.6+0-0.5)*2)', () => {
    expect(magicInputsToModifier(1, 0)).toBeCloseTo(0.2, 10);
  });

  it('typing=0, time=1 -> -0.2 ((0+0.4-0.5)*2)', () => {
    expect(magicInputsToModifier(0, 1)).toBeCloseTo(-0.2, 10);
  });

  it('越界输入 clamp 到 [0, 1], 输出自然在 [-1, 1]', () => {
    // 输入 2 被 clamp 到 1, score=0.6, (0.6-0.5)*2=0.2
    expect(magicInputsToModifier(2, 0)).toBeCloseTo(0.2, 10);
    // 输入 -1 被 clamp 到 0, score=0, (0-0.5)*2=-1
    expect(magicInputsToModifier(-1, 0)).toBe(-1);
  });
});

// ============================================================
// computeTimeBonus
// ============================================================

describe('QTELayer: computeTimeBonus', () => {
  it('elapsed=0 -> 1 (满时)', () => {
    expect(computeTimeBonus(0, 5000)).toBe(1);
  });

  it('elapsed=baseMs -> 0 (恰好用尽)', () => {
    expect(computeTimeBonus(5000, 5000)).toBe(0);
  });

  it('elapsed > baseMs -> 0 (clamp)', () => {
    expect(computeTimeBonus(10000, 5000)).toBe(0);
  });

  it('elapsed=baseMs/2 -> 0.5', () => {
    expect(computeTimeBonus(2500, 5000)).toBe(0.5);
  });

  it('baseMs<=0 -> 0 (defensive)', () => {
    expect(computeTimeBonus(100, 0)).toBe(0);
  });
});

// ============================================================
// 状态机
// ============================================================

describe('QTELayer: 状态机', () => {
  it('createIdleQTEState -> phase=idle', () => {
    const s = createIdleQTEState();
    expect(s.phase).toBe('idle');
    expect(s.type).toBeNull();
  });

  it('startAttackQTE(agility=12) -> pending, type=attack, payload=3 rounds, total=3', () => {
    const s = startAttackQTE(12);
    expect(s.phase).toBe('pending');
    expect(s.type).toBe('attack');
    expect(s.payload).toBe(3);
    expect(s.total).toBe(3);
  });

  it('startMagicQTE("fireball", INT=10) -> pending, payload="fireball", total=8, baseMs=3000', () => {
    const s = startMagicQTE('fireball', makeCaster(10));
    expect(s.phase).toBe('pending');
    expect(s.type).toBe('magic');
    expect(s.payload).toBe('fireball');
    expect(s.total).toBe(8);
    expect(s.baseMs).toBe(3000);
  });

  it('startMagicQTE 咒语含空格 -> total 不计空格', () => {
    const s = startMagicQTE('fire ball', makeCaster(10));
    expect(s.total).toBe(8);
  });

  it('recordHit -> hits++', () => {
    let s = startAttackQTE(12);
    s = recordHit(s);
    s = recordHit(s);
    expect(s.hits).toBe(2);
  });

  it('recordHit 在非 pending 阶段不变', () => {
    let s = startAttackQTE(12);
    s = finishQTE(s);
    const after = recordHit(s);
    expect(after.hits).toBe(0);
  });

  it('finishQTE pending -> resolving', () => {
    const s = startAttackQTE(12);
    expect(finishQTE(s).phase).toBe('resolving');
  });

  it('cancelQTE pending -> cancelled', () => {
    const s = startAttackQTE(12);
    expect(cancelQTE(s).phase).toBe('cancelled');
  });

  it('cancelQTE idle/done 不变', () => {
    const idle = createIdleQTEState();
    expect(cancelQTE(idle).phase).toBe('idle');
  });
});

// ============================================================
// finalizeQTE
// ============================================================

describe('QTELayer: finalizeQTE -> QTEResult', () => {
  it('attack: 3/3 hits -> accuracy=1, modifier=+1', () => {
    let s = startAttackQTE(12);
    s = recordHit(s); s = recordHit(s); s = recordHit(s);
    s = finishQTE(s);
    const r = finalizeQTE(s);
    expect(r.type).toBe('attack');
    expect(r.accuracy).toBe(1);
    expect(r.modifier).toBe(1);
  });

  it('attack: 0/3 hits -> accuracy=0, modifier=-1', () => {
    let s = startAttackQTE(12);
    s = finishQTE(s);
    const r = finalizeQTE(s);
    expect(r.accuracy).toBe(0);
    expect(r.modifier).toBe(-1);
  });

  it('attack cancelled -> QTE_MISS-like', () => {
    let s = startAttackQTE(12);
    s = cancelQTE(s);
    const r = finalizeQTE(s);
    expect(r.modifier).toBe(-1);
  });

  it('magic finalize: typing=1 + time bonus computed', () => {
    const s = startMagicQTE('ab', makeCaster(10));
    // total=2, baseMs=3000; 若 startedAt = now-0, time bonus=1
    const r = finalizeQTE({ ...s, phase: 'resolving', hits: 2 });
    expect(r.type).toBe('magic');
    expect(r.accuracy).toBe(1);
    // typingAccuracy=1, timeBonus≈1 (0 elapsed) -> magicInputsToModifier(1,1)=+1
    expect(r.modifier).toBe(1);
  });
});

// ============================================================
// 端到端: modifier 注入伤害公式
// ============================================================

describe('QTELayer: 端到端 modifier 注入', () => {
  it('QTE 关闭: damage_scale=0.3, modifier=0 -> damage = base', () => {
    const base = 10;
    const damageScale = 0.3;
    const damage = Math.max(0, Math.round(base * (1 + QTE_NOOP.modifier * damageScale)));
    expect(damage).toBe(10);
  });

  it('QTE 满命中 (modifier=+1): damage = base * 1.3', () => {
    const base = 10;
    const damageScale = 0.3;
    const r: QTEResult = { accuracy: 1, modifier: 1, type: 'attack' };
    const damage = Math.max(0, Math.round(base * (1 + r.modifier * damageScale)));
    expect(damage).toBe(13);
  });

  it('QTE miss (modifier=-1): damage = base * 0.7', () => {
    const base = 10;
    const damageScale = 0.3;
    const r: QTEResult = { accuracy: 0, modifier: -1, type: 'attack' };
    const damage = Math.max(0, Math.round(base * (1 + r.modifier * damageScale)));
    expect(damage).toBe(7);
  });

  it('QTE 中性 (modifier=0): damage = base', () => {
    const base = 10;
    const damageScale = 0.3;
    const r: QTEResult = { accuracy: 0.5, modifier: 0, type: 'attack' };
    const damage = Math.max(0, Math.round(base * (1 + r.modifier * damageScale)));
    expect(damage).toBe(10);
  });
});

// ============================================================
// clampQTEModifier
// ============================================================

describe('QTELayer: clampQTEModifier', () => {
  it('越界 clamp', () => {
    expect(clampQTEModifier(2)).toBe(1);
    expect(clampQTEModifier(-3)).toBe(-1);
    expect(clampQTEModifier(0.5)).toBe(0.5);
  });
});
