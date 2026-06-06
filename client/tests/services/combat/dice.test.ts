import { describe, expect, it } from 'vitest';
import {
  defaultRoll,
  rollD,
  rollD20,
  roll2d6,
  rollNd6,
  rollInitiative,
  makeConstRoll,
  makeSeededRoll,
} from '../../../src/services/combat/dice';

describe('dice: defaultRoll 真随机', () => {
  it('范围 [1, sides]', () => {
    for (let i = 0; i < 100; i++) {
      const v = defaultRoll(20);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(20);
    }
  });

  it('sides=1 永远返回 1', () => {
    expect(defaultRoll(1)).toBe(1);
  });
});

describe('dice: rollD / rollD20 / roll2d6 / rollNd6', () => {
  it('rollD: 注入 const roll 返回常数', () => {
    expect(rollD(20, makeConstRoll([15]))).toBe(15);
  });

  it('rollD20: 范围 [1, 20]', () => {
    const v = rollD20(makeConstRoll([20]));
    expect(v).toBe(20);
  });

  it('roll2d6: 范围 [2, 12]', () => {
    expect(roll2d6(makeConstRoll([3, 5]))).toBe(8);
  });

  it('rollNd6(3): 范围 [3, 18]', () => {
    expect(rollNd6(3, makeConstRoll([1, 1, 1]))).toBe(3);
    expect(rollNd6(3, makeConstRoll([6, 6, 6]))).toBe(18);
  });
});

describe('dice: makeConstRoll 顺序抹子', () => {
  it('按顺序返回给定值', () => {
    const r = makeConstRoll([5, 10, 15]);
    expect(r(20)).toBe(5);
    expect(r(20)).toBe(10);
    expect(r(20)).toBe(15);
  });

  it('超过序列长度时循环', () => {
    const r = makeConstRoll([5, 10]);
    r(20); r(20);
    expect(r(20)).toBe(5);
    expect(r(20)).toBe(10);
  });

  it('值 > sides 时 clamp 到 sides', () => {
    const r = makeConstRoll([100]);
    expect(r(20)).toBe(20);
  });

  it('值 < 1 时 clamp 到 1', () => {
    const r = makeConstRoll([-5]);
    expect(r(20)).toBe(1);
  });
});

describe('dice: makeSeededRoll 种子化随机', () => {
  it('相同 seed 产生相同序列 (可重现)', () => {
    const r1 = makeSeededRoll(42);
    const r2 = makeSeededRoll(42);
    const seq1 = [r1(20), r1(20), r1(20)];
    const seq2 = [r2(20), r2(20), r2(20)];
    expect(seq1).toEqual(seq2);
  });

  it('不同 seed 产生不同序列', () => {
    const r1 = makeSeededRoll(1);
    const r2 = makeSeededRoll(2);
    expect(r1(100)).not.toBe(r2(100));
  });

  it('范围 [1, sides]', () => {
    const r = makeSeededRoll(123);
    for (let i = 0; i < 100; i++) {
      const v = r(20);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(20);
    }
  });
});

describe('dice: rollInitiative d20 + DEX 修正', () => {
  it('DEX 10 → 修正 0', () => {
    const r = rollInitiative(10, makeConstRoll([15]));
    expect(r.d20).toBe(15);
    expect(r.dexMod).toBe(0);
    expect(r.total).toBe(15);
  });

  it('DEX 14 → 修正 +2', () => {
    const r = rollInitiative(14, makeConstRoll([10]));
    expect(r.dexMod).toBe(2);
    expect(r.total).toBe(12);
  });

  it('DEX 18 → 修正 +4', () => {
    const r = rollInitiative(18, makeConstRoll([10]));
    expect(r.dexMod).toBe(4);
    expect(r.total).toBe(14);
  });

  it('DEX 8 → 修正 -1', () => {
    const r = rollInitiative(8, makeConstRoll([10]));
    expect(r.dexMod).toBe(-1);
    expect(r.total).toBe(9);
  });

  it('DEX 6 → 修正 -2', () => {
    const r = rollInitiative(6, makeConstRoll([10]));
    expect(r.dexMod).toBe(-2);
    expect(r.total).toBe(8);
  });

  it('DEX 1 → 修正 -5 (极端低值, floor((1-10)/2) = -5)', () => {
    const r = rollInitiative(1, makeConstRoll([10]));
    expect(r.dexMod).toBe(-5);
    expect(r.total).toBe(5);
  });

  it('DEX 20 → 修正 +5 (极端高值)', () => {
    const r = rollInitiative(20, makeConstRoll([10]));
    expect(r.dexMod).toBe(5);
    expect(r.total).toBe(15);
  });
});
