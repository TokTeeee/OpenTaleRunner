import { describe, it, expect } from 'vitest';
import { computeSignature } from '../../src/data/codexSignature';
import type { WorldItem } from '../../src/types/item';

const makeWorld = (over: Partial<WorldItem>): WorldItem => ({
  itemId: 'i1', name: '精钢剑', category: 'weapon', quality: '精良',
  effects: [], description: '', value: 0, history: [], holder: null,
  quantity: 1, spawnInfo: { worldDay: 1, region: 'r', source: 'loot' },
  createdAt: '', updatedAt: '',
  ...over,
});

describe('computeSignature', () => {
  it('同 name + quality + effects → 同 signature', () => {
    const a = makeWorld({ name: '精钢剑', quality: '精良' });
    const b = makeWorld({ name: '精钢剑', quality: '精良' });
    expect(computeSignature(a)).toBe(computeSignature(b));
  });

  it('改 name → 不同 signature', () => {
    const a = makeWorld({ name: '精钢剑' });
    const b = makeWorld({ name: '铁剑' });
    expect(computeSignature(a)).not.toBe(computeSignature(b));
  });

  it('改 quality → 不同 signature', () => {
    const a = makeWorld({ quality: '精良' });
    const b = makeWorld({ quality: '稀有' });
    expect(computeSignature(a)).not.toBe(computeSignature(b));
  });

  it('改 description/durability/value → 同 signature (这些不影响"是同一件物品")', () => {
    const a = makeWorld({ description: '一把剑', durability: { current: 10, max: 10 }, value: 100 });
    const b = makeWorld({ description: '一把锋利的剑', durability: { current: 5, max: 10 }, value: 50 });
    expect(computeSignature(a)).toBe(computeSignature(b));
  });

  it('effects 数组顺序无关 → 同 signature', () => {
    const a = makeWorld({
      effects: [
        { id: 'e1', type: 'damage_bonus', value: 2, description: '伤害+2' },
        { id: 'e2', type: 'critical', value: 5, description: '暴击+5%' },
      ],
    });
    const b = makeWorld({
      effects: [
        { id: 'e2', type: 'critical', value: 5, description: '暴击+5%' },
        { id: 'e1', type: 'damage_bonus', value: 2, description: '伤害+2' },
      ],
    });
    expect(computeSignature(a)).toBe(computeSignature(b));
  });

  it('改 effect value → 不同 signature', () => {
    const a = makeWorld({ effects: [{ id: 'e1', type: 'damage_bonus', value: 2, description: '' }] });
    const b = makeWorld({ effects: [{ id: 'e1', type: 'damage_bonus', value: 3, description: '' }] });
    expect(computeSignature(a)).not.toBe(computeSignature(b));
  });
});
