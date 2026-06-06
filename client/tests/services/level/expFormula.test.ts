import { describe, it, expect } from 'vitest';
import { expToNext, MAX_LEVEL } from '../../../src/services/level/expFormula';

describe('expToNext', () => {
  it('l1 -> l2 is 100', () => {
    expect(expToNext(1)).toBe(100);
  });
  it('l5 -> l6 is 1118', () => {
    expect(expToNext(5)).toBe(1118);
  });
  it('l19 -> l20 is 8282', () => {
    expect(expToNext(19)).toBe(8282);
  });
  it('l20 returns 0 (sentinel for max level, mirrors server exp_formula)', () => {
    expect(expToNext(MAX_LEVEL)).toBe(0);
  });
  it('l0 returns 0 (sentinel for uninitialised)', () => {
    expect(expToNext(0)).toBe(0);
  });
});
