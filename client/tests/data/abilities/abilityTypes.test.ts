// client/tests/data/abilities/abilityTypes.test.ts
// v0.6.2 Task 2: 验证 ELEMENT_LABELS / ELEMENT_ICONS / SCHOOL_LABELS / SCHOOL_ICONS 形状
import { describe, it, expect } from 'vitest';
import {
  ELEMENT_LABELS, ELEMENT_ICONS, SCHOOL_LABELS, SCHOOL_ICONS,
} from '../../../src/types/ability';

describe('Ability 常量', () => {
  it('ELEMENT_LABELS 含 8 元素', () => {
    expect(Object.keys(ELEMENT_LABELS).sort()).toEqual(
      ['arcane', 'earth', 'fire', 'holy', 'ice', 'lightning', 'shadow', 'wind'].sort()
    );
  });

  it('ELEMENT_LABELS 8 项都是 non-empty string', () => {
    for (const [k, v] of Object.entries(ELEMENT_LABELS)) {
      expect(typeof v, `${k} label type`).toBe('string');
      expect(v.length, `${k} label length`).toBeGreaterThan(0);
    }
  });

  it('ELEMENT_ICONS 含 8 元素', () => {
    expect(Object.keys(ELEMENT_ICONS)).toHaveLength(8);
  });

  it('SCHOOL_LABELS 含 3 school', () => {
    expect(Object.keys(SCHOOL_LABELS).sort()).toEqual(
      ['battle_art', 'magic', 'prayer'].sort()
    );
  });

  it('SCHOOL_LABELS 3 项都是 non-empty string', () => {
    for (const [k, v] of Object.entries(SCHOOL_LABELS)) {
      expect(typeof v, `${k} label type`).toBe('string');
      expect(v.length, `${k} label length`).toBeGreaterThan(0);
    }
  });

  it('SCHOOL_ICONS 含 3 school', () => {
    expect(Object.keys(SCHOOL_ICONS)).toHaveLength(3);
  });
});
