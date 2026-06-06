/**
 * 装备对比纯函数
 *
 * 零依赖 store / React / 副作用, 纯数据处理.
 * ItemCompareTooltip 消费这些函数渲染差异.
 *
 * 详细见 spec: docs/superpowers/specs/2026-06-04-item-compare-ui-design.md §3.2
 */
import type { Item, ItemEffect } from '../types/item';

export const SIX_ATTRIBUTES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
export type SixAttribute = (typeof SIX_ATTRIBUTES)[number];
export type AttributeTable = Record<SixAttribute, number>;

export interface AttributeDelta {
  attr: SixAttribute;
  currentValue: number;
  candidateValue: number;
  delta: number;  // candidate - current
}

export interface EffectDelta {
  added: ItemEffect[];   // 仅在 candidate 中
  removed: ItemEffect[]; // 仅在 current 中
  kept: ItemEffect[];    // 两边都有
}

// ============================================================
// 1. aggregateAttributeMods — 聚合物品所有 attribute_mod 词条
// ============================================================
export function aggregateAttributeMods(item: Item): AttributeTable {
  const result: AttributeTable = { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 };
  if (!item.effects) return result;
  for (const eff of item.effects) {
    if (eff.type !== 'attribute_mod') continue;
    if (typeof eff.value !== 'object' || eff.value === null) continue;
    const mods = eff.value as Record<string, unknown>;
    for (const key of SIX_ATTRIBUTES) {
      const v = mods[key];
      if (typeof v === 'number') {
        result[key] += v;
      }
    }
  }
  return result;
}

// ============================================================
// 2. computeDeltas — 计算 current vs candidate 的 6 维差异
// ============================================================
export function computeDeltas(current: Item, candidate: Item): AttributeDelta[] {
  const c = aggregateAttributeMods(current);
  const n = aggregateAttributeMods(candidate);
  return SIX_ATTRIBUTES.map((attr) => ({
    attr,
    currentValue: c[attr],
    candidateValue: n[attr],
    delta: n[attr] - c[attr],
  }));
}

// ============================================================
// 3. summarizeEffects — 分类 added / removed / kept (非 attribute_mod 词条)
// ============================================================
export function summarizeEffects(current: Item, candidate: Item): EffectDelta {
  const currentEffects = (current.effects || []).filter((e) => e.type !== 'attribute_mod');
  const candidateEffects = (candidate.effects || []).filter((e) => e.type !== 'attribute_mod');

  // 用 description + type 作为去重 key
  const keyOf = (e: ItemEffect) => `${e.type}::${e.description}`;
  const currentKeys = new Set(currentEffects.map(keyOf));
  const candidateKeys = new Set(candidateEffects.map(keyOf));

  const added: ItemEffect[] = [];
  const removed: ItemEffect[] = [];
  const kept: ItemEffect[] = [];

  for (const eff of candidateEffects) {
    if (currentKeys.has(keyOf(eff))) {
      kept.push(eff);
    } else {
      added.push(eff);
    }
  }
  for (const eff of currentEffects) {
    if (!candidateKeys.has(keyOf(eff))) {
      removed.push(eff);
    }
  }

  return { added, removed, kept };
}
