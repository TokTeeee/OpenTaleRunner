import { describe, it, expect } from 'vitest';
import { grantExp, type ExpGrantResult, type Difficulty } from '../../../src/services/level/grantExp';

const OK = (r: ExpGrantResult, level: number, exp: number, attrPoints: number) => {
  expect(r.level).toBe(level);
  expect(r.exp).toBe(exp);
  expect(r.unspentAttributePoints).toBe(attrPoints);
};

describe('grantExp', () => {
  it('normal +50 < threshold, no level-up', () => {
    const r = grantExp({ level: 1, exp: 0, unspentAttributePoints: 0 }, 50, 'normal');
    OK(r, 1, 50, 0);
  });

  it('normal +150 levels up once', () => {
    const r = grantExp({ level: 1, exp: 0, unspentAttributePoints: 0 }, 150, 'normal');
    OK(r, 2, 50, 1);
  });

  it('normal +2000 from L1 chains to L5 with 297 leftover, +4 points', () => {
    const r = grantExp({ level: 1, exp: 0, unspentAttributePoints: 0 }, 2000, 'normal');
    OK(r, 5, 297, 4);
  });

  it('easy halves: 200 easy -> L2 exp 0', () => {
    const r = grantExp({ level: 1, exp: 0, unspentAttributePoints: 0 }, 200, 'easy');
    OK(r, 2, 0, 1);
  });

  it('hard 1.5x: 200 hard -> L2 exp 200', () => {
    const r = grantExp({ level: 1, exp: 0, unspentAttributePoints: 0 }, 200, 'hard');
    OK(r, 2, 200, 1);
  });

  it('deadly 2x: 100 deadly -> L2 exp 100', () => {
    const r = grantExp({ level: 1, exp: 0, unspentAttributePoints: 0 }, 100, 'deadly');
    OK(r, 2, 100, 1);
  });

  it('preserves unspent pool across grants', () => {
    const r = grantExp({ level: 1, exp: 0, unspentAttributePoints: 3 }, 150, 'normal');
    OK(r, 2, 50, 4);
  });

  it('max level: extra exp absorbed, no more points', () => {
    const r = grantExp({ level: 20, exp: 0, unspentAttributePoints: 0 }, 9999, 'normal');
    OK(r, 20, 0, 0);
  });

  it('unknown difficulty falls back to normal', () => {
    const r = grantExp({ level: 1, exp: 0, unspentAttributePoints: 0 }, 150, 'mythic' as Difficulty);
    OK(r, 2, 50, 1);
  });

  it('zero/negative amount is a no-op', () => {
    const r = grantExp({ level: 1, exp: 0, unspentAttributePoints: 0 }, 0, 'normal');
    OK(r, 1, 0, 0);
  });
});
