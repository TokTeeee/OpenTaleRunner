import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { ItemEffectList } from '../../../src/components/items/ItemEffectList';
import type { ItemEffect } from '../../../src/types/item';

const makeEffect = (over: Partial<ItemEffect>): ItemEffect => ({
  id: over.id ?? 'e1',
  type: over.type ?? 'attribute_mod',
  value: over.value ?? 0,
  description: over.description ?? '测试词条',
  ...over,
});

afterEach(() => cleanup());

describe('ItemEffectList', () => {
  it('grouped mode: 拆分 attribute_mod 展开 + 其他词条', () => {
    const effects: ItemEffect[] = [
      makeEffect({ id: 'a1', type: 'attribute_mod', value: { STR: 5, DEX: -2 }, description: 'STR+5' }),
      makeEffect({ id: 'b1', type: 'special', value: 1, description: '火焰伤害' }),
    ];
    const { getByTestId, queryAllByTestId } = render(
      <ItemEffectList effects={effects} mode="grouped" />
    );
    expect(getByTestId('item-effect-grouped-attribute')).toBeTruthy();
    expect(getByTestId('item-effect-grouped-other')).toBeTruthy();
    const attrRows = queryAllByTestId('item-effect-attribute-row');
    expect(attrRows.length).toBe(2);
    expect(attrRows[0].getAttribute('data-attr')).toBe('STR');
    expect(attrRows[1].getAttribute('data-attr')).toBe('DEX');
    const otherRows = queryAllByTestId('item-effect-other-row');
    expect(otherRows.length).toBe(1);
    expect(otherRows[0].textContent).toBe('火焰伤害');
  });

  it('flat mode: 列出 description, maxItems 截断显示 +N', () => {
    const effects: ItemEffect[] = [
      makeEffect({ id: '1', description: 'A' }),
      makeEffect({ id: '2', description: 'B' }),
      makeEffect({ id: '3', description: 'C' }),
      makeEffect({ id: '4', description: 'D' }),
    ];
    const { getByTestId, queryAllByTestId } = render(
      <ItemEffectList effects={effects} mode="flat" maxItems={2} />
    );
    const rows = queryAllByTestId('item-effect-flat-row');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toBe('A');
    expect(rows[1].textContent).toBe('B');
    expect(getByTestId('item-effect-flat-more').textContent).toBe('+2');
  });

  it('flat mode: 空数组显示 emptyMessage', () => {
    const { getByTestId, queryByTestId } = render(
      <ItemEffectList effects={[]} mode="flat" emptyMessage="无词条" />
    );
    expect(getByTestId('item-effect-empty').textContent).toBe('无词条');
    expect(queryByTestId('item-effect-flat')).toBeNull();
  });

  it('diff mode: added 绿显, removed 灰划', () => {
    const { getByTestId } = render(
      <ItemEffectList
        added={[makeEffect({ id: 'x1', description: '吸血' })]}
        removed={[makeEffect({ id: 'y1', description: '冰冻' })]}
        mode="diff"
      />
    );
    const added = getByTestId('item-effect-diff-added');
    const removed = getByTestId('item-effect-diff-removed');
    expect(added.textContent).toBe('+ 新增: 吸血');
    expect(added.className).toContain('text-emerald-500');
    expect(removed.textContent).toBe('- 移除: 冰冻');
    expect(removed.className).toContain('line-through');
    expect(removed.className).toContain('text-gray-500');
  });

  it('diff mode: 空 added+removed 返回 null', () => {
    const { container } = render(<ItemEffectList added={[]} removed={[]} mode="diff" />);
    expect(container.firstChild).toBeNull();
  });
});
