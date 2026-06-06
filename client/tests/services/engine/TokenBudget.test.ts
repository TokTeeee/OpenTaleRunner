import { describe, expect, it } from 'vitest';
import { determineBudgetLevel } from '../../../src/services/engine/TokenBudget';

describe('determineBudgetLevel (audit P1 fix)', () => {
  it('returns "abundant" when usage is below 40%', () => {
    expect(determineBudgetLevel(30, 100)).toBe('abundant');
    expect(determineBudgetLevel(0, 100)).toBe('abundant');
    expect(determineBudgetLevel(40, 100)).toBe('abundant');
  });

  it('returns "moderate" when usage is between 40% and 70%', () => {
    expect(determineBudgetLevel(41, 100)).toBe('moderate');
    expect(determineBudgetLevel(50, 100)).toBe('moderate');
    expect(determineBudgetLevel(70, 100)).toBe('moderate');
  });

  it('returns "tight" when usage is above 70%', () => {
    expect(determineBudgetLevel(71, 100)).toBe('tight');
    expect(determineBudgetLevel(100, 100)).toBe('tight');
  });

  it('returns "tight" when maxTokens is 0 or negative (safe-guard)', () => {
    expect(determineBudgetLevel(0, 0)).toBe('tight');
    expect(determineBudgetLevel(100, -1)).toBe('tight');
  });

  it('边界: 等于 0.4 / 0.7 时归属低档(避免浮点误判)', () => {
    // ratio == 0.4 → 不应进 moderate → 应为 abundant
    expect(determineBudgetLevel(40, 100)).toBe('abundant');
    // ratio == 0.7 → 不应进 tight → 应为 moderate
    expect(determineBudgetLevel(70, 100)).toBe('moderate');
  });
});
