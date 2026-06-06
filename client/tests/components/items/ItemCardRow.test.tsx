import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ItemCardRow } from '../../../src/components/items/ItemCardRow';
import type { Item, ItemEffect } from '../../../src/types/item';

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

describe('ItemCardRow', () => {
  afterEach(() => cleanup());
  it('基础渲染: 图标 + 名称(品质色) + 数量', () => {
    render(<ItemCardRow item={makeItem({ name: '铁剑', quality: '精良', category: 'weapon', quantity: 2 })} />);
    expect(screen.getByText('铁剑')).toBeDefined();
    expect(screen.getByText('×2')).toBeDefined();
  });

  it('selected 状态切换 className', () => {
    const { rerender } = render(<ItemCardRow item={makeItem({ name: 'A' })} selected={false} />);
    const btn = screen.getByTestId('item-card-row');
    expect(btn.getAttribute('data-selected')).toBe('false');
    rerender(<ItemCardRow item={makeItem({ name: 'A' })} selected={true} />);
    expect(btn.getAttribute('data-selected')).toBe('true');
  });

  it('词条 preview 截前 3 + 显示 +N', () => {
    const effects = [1, 2, 3, 4, 5].map((i) => attrMod({ STR: i }, `词条${i}`));
    render(<ItemCardRow item={makeItem({ name: 'X', effects })} />);
    expect(screen.getByText('词条1')).toBeDefined();
    expect(screen.getByText('词条3')).toBeDefined();
    expect(screen.queryByText('词条4')).toBeNull();
    expect(screen.getByText('+2')).toBeDefined(); // 5 - 3
  });

  it('无 description 不渲染描述行', () => {
    const { container } = render(<ItemCardRow item={makeItem({ name: 'X' })} />);
    // 描述行 className 唯一标识是 text-gray-600
    const descLines = container.querySelectorAll('.text-gray-600');
    expect(descLines.length).toBe(0);
  });

  it('click 触发 onClick', () => {
    const onClick = vi.fn();
    render(<ItemCardRow item={makeItem({ name: 'X' })} onClick={onClick} />);
    fireEvent.click(screen.getByTestId('item-card-row'));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
