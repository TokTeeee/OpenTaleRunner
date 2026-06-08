// client/tests/services/abilities/applySpecial.test.ts
// v0.6.2 Task 9: 4 战技 special 接入
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applySpecial } from '../../../src/services/abilities/abilityUtils';
import { useCombatStore } from '../../../src/stores/combatStore';
import { ZERO_RESISTANCES } from '../../../src/types/character';

const baseAttacker = {
  id: 'p1', side: 'player' as const, name: 'Hero',
  hp: 20, maxHp: 30, ap: 5, maxAp: 5, mp: 0, maxMp: 0,
  isDead: false, isFleeing: false,
  attributes: { STR: 14, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
  elementalResistances: { ...ZERO_RESISTANCES },
  conditions: [], equipped: { weapon: null, armor: null, accessory: null },
};

beforeEach(() => {
  useCombatStore.setState({
    combatants: { p1: { ...baseAttacker } },
  });
});

describe('applySpecial', () => {
  it('undefined special 原值返回', () => {
    const r = applySpecial(undefined, 10, baseAttacker, null, 0);
    expect(r.damage).toBe(10);
    expect(r.extra).toEqual([]);
  });

  it('high_crit 伤害 × 1.3', () => {
    const r = applySpecial('high_crit', 10, baseAttacker, null, 0);
    expect(r.damage).toBe(13);
    expect(r.extra[0]).toContain('命中要害');
  });

  it('armor_pierce 不改 damage (由 caller 减半 defense)', () => {
    const r = applySpecial('armor_pierce', 10, baseAttacker, null, 0);
    expect(r.damage).toBe(10);
    expect(r.extra[0]).toContain('穿甲');
  });

  it('life_steal 30% 转治疗, 调用 applyHeal', () => {
    const spy = vi.spyOn(useCombatStore.getState(), 'applyHeal');
    const r = applySpecial('life_steal', 10, baseAttacker, null, 0);
    expect(r.damage).toBe(10);
    expect(spy).toHaveBeenCalledWith('p1', 3); // 30% of 10 = 3
    expect(r.extra[0]).toContain('吸取 3');
  });

  it('self_dodge_penalty 添加 buff 给自身', () => {
    const spy = vi.spyOn(useCombatStore.getState(), 'addBuff');
    applySpecial('self_dodge_penalty', 10, baseAttacker, null, 5);
    expect(spy).toHaveBeenCalledWith('p1', expect.objectContaining({
      ref: 'self_dodge_penalty', stacks: 1, remainingTurns: 1, appliedAtTurn: 5,
    }));
  });
});
