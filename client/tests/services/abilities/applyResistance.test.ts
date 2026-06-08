// client/tests/services/abilities/applyResistance.test.ts
// v0.6.2 Task 8: parseDiceFormula + resistanceMultiplier + applyResistance
import { describe, it, expect } from 'vitest';
import { resistanceMultiplier, applyResistance, parseDiceFormula } from '../../../src/services/abilities/abilityUtils';
import { ZERO_RESISTANCES } from '../../../src/types/character';

describe('parseDiceFormula', () => {
  const fixedRoll = (sides: number) => 4; // 固定返回 4

  it('1d6 → 4', () => expect(parseDiceFormula('1d6', fixedRoll).total).toBe(4));
  it('1d6+2 → 6', () => expect(parseDiceFormula('1d6+2', fixedRoll).total).toBe(6));
  it('1d6+1 → 5', () => expect(parseDiceFormula('1d6+1', fixedRoll).total).toBe(5));
  it('-1d6 → 治疗 0 (负数 floor 0, 实际不用 leading minus)', () => expect(parseDiceFormula('-1d6', fixedRoll).total).toBe(0));
  it('2d4 → 8 (2 骰 4 面, fixedRoll 给 4+4)', () => expect(parseDiceFormula('2d4', () => 4).total).toBe(8));
  it('0 → 0', () => expect(parseDiceFormula('0', fixedRoll).total).toBe(0));
  it('无效公式抛错', () => expect(() => parseDiceFormula('abc', fixedRoll)).toThrow());
});

describe('resistanceMultiplier', () => {
  it('0 抗性 → 1.0', () => expect(resistanceMultiplier(0)).toBe(1));
  it('20 → 0.8', () => expect(resistanceMultiplier(20)).toBe(0.8));
  it('-50 → 1.5', () => expect(resistanceMultiplier(-50)).toBe(1.5));
  it('100 → 0', () => expect(resistanceMultiplier(100)).toBe(0));
  it('clamp 上界', () => expect(resistanceMultiplier(150)).toBe(0));
  it('clamp 下界', () => expect(resistanceMultiplier(-150)).toBe(2));
});

describe('applyResistance', () => {
  it('element=null 物理不应用', () => {
    expect(applyResistance(10, null, ZERO_RESISTANCES)).toBe(10);
  });
  it('fire + 20 抗 → 8', () => {
    expect(applyResistance(10, 'fire', { ...ZERO_RESISTANCES, fire: 20 })).toBe(8);
  });
  it('holy + -50 抗 → 15', () => {
    expect(applyResistance(10, 'holy', { ...ZERO_RESISTANCES, holy: -50 })).toBe(15);
  });
  it('damage 不为负', () => {
    expect(applyResistance(10, 'fire', { ...ZERO_RESISTANCES, fire: 100 })).toBe(0);
  });
});
