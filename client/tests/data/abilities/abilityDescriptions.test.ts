// client/tests/data/abilities/abilityDescriptions.test.ts
// v0.6.2 Task 8: 验证 16 个 ability 都有 non-empty description 字段
import { describe, it, expect } from 'vitest';
import { listAllAbilities } from '../../../src/data/abilities';

describe('ability descriptions', () => {
  it('每个 ability 有 non-empty shortEffect', () => {
    for (const a of listAllAbilities()) {
      expect(a.description.shortEffect.length, `${a.id} shortEffect`).toBeGreaterThan(0);
    }
  });

  it('每个 ability 有 non-empty narrative (>= 20 字)', () => {
    for (const a of listAllAbilities()) {
      expect(a.description.narrative.length, `${a.id} narrative`).toBeGreaterThanOrEqual(20);
    }
  });

  it('每个 ability 有 non-empty visualTag', () => {
    for (const a of listAllAbilities()) {
      expect(a.description.visualTag.length, `${a.id} visualTag`).toBeGreaterThan(0);
    }
  });
});
