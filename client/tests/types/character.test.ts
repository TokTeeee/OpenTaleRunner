// client/tests/types/character.test.ts
// v0.6.2 Task 1: sanity 测试 — AttributeName / ElementalResistances / Character 字段
import { describe, it, expect } from 'vitest';
import type { AttributeName, Attributes, ElementalResistances, LearnedAbility } from '../../src/types/character';
// value import: ZERO_RESISTANCES 是 v0.6.2 需新增的导出常量
import { ZERO_RESISTANCES } from '../../src/types/character';

describe('character types', () => {
  it('AttributeName 是 keyof Attributes (6 项)', () => {
    const keys: AttributeName[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
    const sample: Attributes = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
    for (const k of keys) {
      expect(typeof sample[k]).toBe('number');
    }
  });

  it('ZERO_RESISTANCES 含 8 元素且都为 0', () => {
    expect(ZERO_RESISTANCES).toEqual({
      fire: 0, ice: 0, lightning: 0, wind: 0, earth: 0,
      arcane: 0, holy: 0, shadow: 0,
    });
  });

  it('ElementalResistances 8 元素都是 number', () => {
    const sample: ElementalResistances = {
      fire: 0, ice: 0, lightning: 0, wind: 0, earth: 0,
      arcane: 0, holy: 0, shadow: 0,
    };
    expect(Object.values(sample).every(v => v === 0)).toBe(true);
  });

  it('LearnedAbility 包含 abilityId/school/learnedAt', () => {
    const sample: LearnedAbility = {
      abilityId: 'spell_fire_bolt',
      school: 'magic',
      learnedAt: 1234567890,
    };
    expect(sample.abilityId).toBe('spell_fire_bolt');
    expect(sample.school).toBe('magic');
  });
});
