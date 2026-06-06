import { describe, expect, it } from 'vitest';
import type { Item, ItemEffect } from '../../src/types/item';
import {
  aggregateAttributeMods,
  computeDeltas,
  summarizeEffects,
  type EffectDelta,
} from '../../src/data/itemComparison';

// ============================================================
// 工厂: 构造测试用 Item (确定性 id, 可重现)
// ============================================================
let _idCounter = 0;
function nextId(): string {
  _idCounter += 1;
  return `eff-${_idCounter}`;
}
function attrMod(value: Record<string, number>, description = '属性修正'): ItemEffect {
  return { id: nextId(), type: 'attribute_mod', value, description };
}
function otherEffect(type: ItemEffect['type'], value: ItemEffect['value'], description: string): ItemEffect {
  return { id: nextId(), type, value, description };
}
function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    name: '测试物品',
    effects: [],
    ...overrides,
  };
}

describe('aggregateAttributeMods', () => {
  it('聚合单个 attribute_mod 词条', () => {
    const item = makeItem({ effects: [attrMod({ STR: 2 })] });
    const result = aggregateAttributeMods(item);
    expect(result.STR).toBe(2);
    expect(result.DEX).toBe(0);
    expect(result.CON).toBe(0);
    expect(result.INT).toBe(0);
    expect(result.WIS).toBe(0);
    expect(result.CHA).toBe(0);
  });

  it('聚合多个 attribute_mod 词条 (同物品 2 个 STR 词条 → STR 总和)', () => {
    const item = makeItem({
      effects: [attrMod({ STR: 1 }), attrMod({ STR: 1, DEX: 2 })],
    });
    const result = aggregateAttributeMods(item);
    expect(result.STR).toBe(2);
    expect(result.DEX).toBe(2);
  });

  it('跳过非 attribute_mod 词条', () => {
    const item = makeItem({
      effects: [otherEffect('damage_bonus', 5, '+5 攻击'), attrMod({ STR: 1 })],
    });
    const result = aggregateAttributeMods(item);
    expect(result.STR).toBe(1);
  });

  it('跳过非法 value 格式 (非 Record<string, number>)', () => {
    const item = makeItem({
      effects: [
        { id: nextId(), type: 'attribute_mod', value: 'invalid string' as unknown as number, description: '非法' },
        { id: nextId(), type: 'attribute_mod', value: 42 as unknown as number, description: '数字而非 Record' },
        attrMod({ STR: 3 }),
      ],
    });
    const result = aggregateAttributeMods(item);
    expect(result.STR).toBe(3);
  });
});

describe('computeDeltas', () => {
  it('计算 STR 升 (delta=+2)', () => {
    const current = makeItem({ effects: [attrMod({ STR: 0 })] });
    const candidate = makeItem({ effects: [attrMod({ STR: 2 })] });
    const deltas = computeDeltas(current, candidate);
    const strDelta = deltas.find((d) => d.attr === 'STR');
    expect(strDelta?.currentValue).toBe(0);
    expect(strDelta?.candidateValue).toBe(2);
    expect(strDelta?.delta).toBe(2);
  });

  it('计算 DEX 平 (delta=0)', () => {
    const current = makeItem({ effects: [attrMod({ DEX: 1 })] });
    const candidate = makeItem({ effects: [attrMod({ DEX: 1 })] });
    const deltas = computeDeltas(current, candidate);
    const dexDelta = deltas.find((d) => d.attr === 'DEX');
    expect(dexDelta?.delta).toBe(0);
  });

  it('计算 CON 降 (delta=-1)', () => {
    const current = makeItem({ effects: [attrMod({ CON: 2 })] });
    const candidate = makeItem({ effects: [attrMod({ CON: 1 })] });
    const deltas = computeDeltas(current, candidate);
    const conDelta = deltas.find((d) => d.attr === 'CON');
    expect(conDelta?.delta).toBe(-1);
  });
});

describe('summarizeEffects', () => {
  it('区分 added / removed / kept', () => {
    const eff1 = otherEffect('damage_bonus', 5, '+5 攻击');
    const eff2 = otherEffect('defense_bonus', 2, '+2 防御');
    const eff3 = otherEffect('hp_max_bonus', 10, '+10 HP');
    const current = makeItem({ effects: [eff1, eff2] });
    const candidate = makeItem({ effects: [eff2, eff3] });
    const summary: EffectDelta = summarizeEffects(current, candidate);
    // eff1 在 current 不在 candidate → removed
    expect(summary.removed).toHaveLength(1);
    expect(summary.removed[0]?.description).toBe('+5 攻击');
    // eff3 在 candidate 不在 current → added
    expect(summary.added).toHaveLength(1);
    expect(summary.added[0]?.description).toBe('+10 HP');
    // eff2 都在 → kept
    expect(summary.kept).toHaveLength(1);
    expect(summary.kept[0]?.description).toBe('+2 防御');
  });
});
