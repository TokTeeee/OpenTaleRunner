import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ItemChip } from '../../../src/components/items/ItemChip';
import type { Item } from '../../../src/types/item';

function makeItem(overrides: Partial<Item> = {}): Item {
  return { name: '铁剑', effects: [], ...overrides };
}

describe('ItemChip', () => {
  afterEach(() => cleanup());

  it('equipped 基础渲染: 槽位标签 + 物品名(品质色)', () => {
    render(
      <ItemChip
        item={makeItem({ name: '精钢剑', quality: '精良' })}
        variant="equipped"
        slot="weapon"
        onClick={() => {}}
      />,
    );
    const btn = screen.getByTestId('item-chip-equipped');
    expect(btn).toBeDefined();
    expect(btn.getAttribute('data-slot')).toBe('weapon');
    expect(btn.getAttribute('data-has-item')).toBe('true');
    expect(screen.getByText('精钢剑')).toBeDefined();
    expect(screen.getByText('⚔武器')).toBeDefined();
  });

  it('equipped 无物品: 禁用 + 显示"无"', () => {
    render(<ItemChip item={null} variant="equipped" slot="armor" onClick={() => {}} />);
    const btn = screen.getByTestId('item-chip-equipped');
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.getAttribute('data-has-item')).toBe('false');
    expect(screen.getByText('无')).toBeDefined();
  });

  it('equipped click 触发 onClick', () => {
    const onClick = vi.fn();
    render(
      <ItemChip item={makeItem({ name: 'X' })} variant="equipped" slot="weapon" onClick={onClick} />,
    );
    fireEvent.click(screen.getByTestId('item-chip-equipped'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('minimal variant: chip 样式 + name + title(从 description/effects)', () => {
    render(
      <ItemChip
        item={makeItem({
          name: '披风',
          quality: '稀有',
          description: '魔法披风',
          effects: [{ id: 'e1', type: 'special', value: 1, description: '隐身' }],
        })}
        variant="minimal"
        onClick={() => {}}
      />,
    );
    const chip = screen.getByTestId('item-chip-minimal');
    expect(chip).toBeDefined();
    expect(chip.getAttribute('data-item-name')).toBe('披风');
    expect(chip.getAttribute('title')).toBe('魔法披风');
    expect(chip.className).toContain('rounded-md');
    expect(screen.getByText(/披风/)).toBeDefined();
  });

  it('minimal: quantity > 1 显示 "xN"', () => {
    render(
      <ItemChip
        item={makeItem({ name: '草药', quantity: 5 })}
        variant="minimal"
        onClick={() => {}}
      />,
    );
    const chip = screen.getByTestId('item-chip-minimal');
    expect(chip.textContent).toBe('草药 x5');
  });

  it('minimal: 无物品时渲染空 (CharacterPanel 已过滤空列表)', () => {
    render(<ItemChip item={null} variant="minimal" onClick={() => {}} />);
    const chip = screen.getByTestId('item-chip-minimal');
    expect(chip.textContent).toBe('');
    expect(chip.getAttribute('data-item-name')).toBeNull();
  });
});
