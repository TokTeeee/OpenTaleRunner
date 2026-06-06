import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { ItemCompareTooltip } from '../../../src/components/modals/ItemCompareTooltip';
import { resetClientStores } from '../../utils/resetStores';
import type { Item, ItemEffect } from '../../../src/types/item';

// ============================================================
// 工厂 (确定性 id)
// ============================================================
let _idCounter = 0;
function nextId(): string {
  _idCounter += 1;
  return `eff-${_idCounter}`;
}
function attrMod(value: Record<string, number>, description = '属性修正'): ItemEffect {
  return { id: nextId(), type: 'attribute_mod', value, description };
}
function makeItem(overrides: Partial<Item> = {}): Item {
  return { name: '测试物品', effects: [], ...overrides };
}

const ANCHOR = { x: 100, y: 200 };
const CONTAINER = new DOMRect(0, 0, 1200, 800);

describe('ItemCompareTooltip', () => {
  beforeEach(() => resetClientStores());
  afterEach(() => cleanup());

  it('渲染当前 vs 候选:属性差异绿/红高亮', () => {
    const current = makeItem({ name: '短剑', effects: [attrMod({ STR: 0 })] });
    const candidate = makeItem({ name: '铁剑', effects: [attrMod({ STR: 2 })] });
    render(
      <ItemCompareTooltip
        current={current}
        candidate={candidate}
        anchor={ANCHOR}
        containerBounds={CONTAINER}
      />,
    );
    expect(screen.getByTestId('item-compare-tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('item-compare-current-name')).toHaveTextContent('短剑');
    expect(screen.getByTestId('item-compare-candidate-name')).toHaveTextContent('铁剑');
    const strDelta = screen.getByTestId('item-compare-delta-STR');
    expect(strDelta).toHaveTextContent('+0');
    expect(strDelta).toHaveTextContent('+2');
    expect(strDelta.querySelector('[data-delta="positive"]')).toBeInTheDocument();
  });

  it('current === null: 降级纯详情浮窗, 不显示对比侧', () => {
    const candidate = makeItem({ name: '铁剑', effects: [attrMod({ STR: 2 })] });
    render(
      <ItemCompareTooltip
        current={null}
        candidate={candidate}
        anchor={ANCHOR}
        containerBounds={CONTAINER}
      />,
    );
    expect(screen.getByTestId('item-compare-candidate-name')).toHaveTextContent('铁剑');
    expect(screen.queryByTestId('item-compare-current-name')).toBeNull();
    expect(screen.queryByTestId('item-compare-deltas')).toBeNull();
  });

  it('candidate 切换 prop: 浮窗内容更新', () => {
    const current = makeItem({ name: '短剑' });
    const candidateA = makeItem({ name: '铁剑', effects: [attrMod({ STR: 1 })] });
    const candidateB = makeItem({ name: '精钢剑', effects: [attrMod({ STR: 3 })] });
    const { rerender } = render(
      <ItemCompareTooltip current={current} candidate={candidateA} anchor={ANCHOR} containerBounds={CONTAINER} />,
    );
    expect(screen.getByTestId('item-compare-candidate-name')).toHaveTextContent('铁剑');
    rerender(
      <ItemCompareTooltip current={current} candidate={candidateB} anchor={ANCHOR} containerBounds={CONTAINER} />,
    );
    expect(screen.getByTestId('item-compare-candidate-name')).toHaveTextContent('精钢剑');
  });

  it('物品超右边界: 浮窗改贴左侧', () => {
    const current = makeItem({ name: '短剑' });
    const candidate = makeItem({ name: '铁剑' });
    render(
      <ItemCompareTooltip
        current={current}
        candidate={candidate}
        anchor={{ x: 1150, y: 400 }}
        containerBounds={CONTAINER}
      />,
    );
    const tooltip = screen.getByTestId('item-compare-tooltip');
    // tooltip 宽度默认 360, anchor.x=1150 + 360 > 1200 → 改贴左侧
    expect(tooltip.getAttribute('data-position')).toBe('left');
  });

  it('物品超下边界: 浮窗向上偏移', () => {
    const current = makeItem({ name: '短剑' });
    const candidate = makeItem({ name: '铁剑' });
    render(
      <ItemCompareTooltip
        current={current}
        candidate={candidate}
        anchor={{ x: 100, y: 750 }}
        containerBounds={CONTAINER}
      />,
    );
    const tooltip = screen.getByTestId('item-compare-tooltip');
    expect(tooltip.getAttribute('data-position')).toBe('top');
  });

  it('渲染空 effects 物品: 不崩, 显示 0 占位', () => {
    const current = makeItem({ name: '空物品' });
    const candidate = makeItem({ name: '无词条剑' });
    render(
      <ItemCompareTooltip
        current={current}
        candidate={candidate}
        anchor={ANCHOR}
        containerBounds={CONTAINER}
      />,
    );
    const SIX = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
    SIX.forEach((attr) => {
      const delta = screen.getByTestId(`item-compare-delta-${attr}`);
      expect(delta).toHaveTextContent('+0');
      expect(delta).toHaveTextContent('+0');
    });
  });
});
