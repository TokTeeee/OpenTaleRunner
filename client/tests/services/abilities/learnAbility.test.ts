// client/tests/services/abilities/learnAbility.test.ts
// v0.6.2 Task 7: checkCanLearn 3 维硬要求 (职业/属性/等级)
import { describe, it, expect } from 'vitest';
import { checkCanLearn } from '../../../src/services/abilities/learnAbility';
import { fireBolt } from '../../../src/data/abilities/abilities/fireBolt';
import { holyHeal } from '../../../src/data/abilities/abilities/holyHeal';
import { warriorSmash } from '../../../src/data/abilities/abilities/warriorSmash';
import { mageArcaneWard } from '../../../src/data/abilities/abilities/mageArcaneWard';

const baseCharacter = (overrides = {}) => ({
  classId: 'mage' as const,
  level: 3,
  attributes: { STR: 10, DEX: 10, CON: 10, INT: 12, WIS: 10, CHA: 10 },
  ...overrides,
});

describe('checkCanLearn', () => {
  it('mage Lv.3 INT 12 通过 fireBolt', () => {
    expect(checkCanLearn({ character: baseCharacter(), ability: fireBolt }).canLearn).toBe(true);
  });

  it('mage Lv.3 INT 11 失败 fireBolt (属性)', () => {
    const c = baseCharacter({ attributes: { STR: 10, DEX: 10, CON: 10, INT: 11, WIS: 10, CHA: 10 } });
    const r = checkCanLearn({ character: c, ability: fireBolt });
    expect(r.canLearn).toBe(false);
    if (!r.canLearn) expect(r.reason).toBe('attribute');
  });

  it('warrior Lv.3 INT 14 成功 fireBolt (any 兜底, 与职业无强绑定)', () => {
    const c = baseCharacter({ classId: 'warrior', attributes: { STR: 10, DEX: 10, CON: 10, INT: 14, WIS: 10, CHA: 10 } });
    expect(checkCanLearn({ character: c, ability: fireBolt }).canLearn).toBe(true);
  });

  it('mage Lv.2 INT 14 失败 fireBolt (等级)', () => {
    const c = baseCharacter({ level: 2, attributes: { STR: 10, DEX: 10, CON: 10, INT: 14, WIS: 10, CHA: 10 } });
    const r = checkCanLearn({ character: c, ability: fireBolt });
    expect(r.canLearn).toBe(false);
    if (!r.canLearn) expect(r.reason).toBe('level');
  });

  it('cleric Lv.3 WIS 12 通过 holyHeal', () => {
    const c = { classId: 'cleric' as const, level: 3, attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 12, CHA: 10 } };
    expect(checkCanLearn({ character: c, ability: holyHeal }).canLearn).toBe(true);
  });

  it('mage 学 holyHeal 成功 (any 兜底, 与职业无强绑定)', () => {
    const c = { classId: 'mage' as const, level: 3, attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 14, CHA: 10 } };
    expect(checkCanLearn({ character: c, ability: holyHeal }).canLearn).toBe(true);
  });

  it('thief Lv.3 DEX 13 通过 warriorSmash (any 兜底)', () => {
    const c = { classId: 'thief' as const, level: 3, attributes: { STR: 13, DEX: 13, CON: 10, INT: 10, WIS: 10, CHA: 10 } };
    expect(checkCanLearn({ character: c, ability: warriorSmash }).canLearn).toBe(true);
  });

  it('warrior Lv.3 INT 10 学 mageArcaneWard 失败 (属性 INT≥13)', () => {
    const c = { classId: 'warrior' as const, level: 3, attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 } };
    const r = checkCanLearn({ character: c, ability: mageArcaneWard });
    expect(r.canLearn).toBe(false);
    if (!r.canLearn) expect(r.reason).toBe('attribute');
  });

  it('null classId 任何 ability 成功 (any 兜底)', () => {
    const c = { classId: null, level: 3, attributes: { STR: 10, DEX: 10, CON: 10, INT: 14, WIS: 10, CHA: 10 } };
    expect(checkCanLearn({ character: c, ability: fireBolt }).canLearn).toBe(true);
  });
});
