import { afterEach, describe, expect, it } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ItemDetailPanel } from '../../../src/components/items/ItemDetailPanel';
import type { Item, ItemEffect } from '../../../src/types/item';

let _idCounter = 0;
function nextId(): string {
  _idCounter += 1;
  return `eff-${_idCounter}`;
}
function attrMod(value: Record<string, number>, description = '属性修正'): ItemEffect {
  return { id: nextId(), type: 'attribute_mod', value, description };
}
function otherEffect(type: string, description: string): ItemEffect {
  return { id: nextId(), type: type as ItemEffect['type'], value: 0, description };
}
function makeItem(overrides: Partial<Item> = {}): Item {
  return { name: '测试物品', effects: [], ...overrides };
}

describe('ItemDetailPanel', () => {
  afterEach(() => cleanup());

  it('基础渲染: 名称(品质色) + 描述 + 槽位信息', () => {
    render(
      <ItemDetailPanel
        item={makeItem({
          name: '精钢剑',
          quality: '精良',
          category: 'weapon',
          description: '锋利的钢剑',
        })}
      />,
    );
    expect(screen.getByTestId('item-detail-panel')).toBeDefined();
    expect(screen.getByText(/精钢剑/)).toBeDefined();
    expect(screen.getByText('锋利的钢剑')).toBeDefined();
    // 副标题 "weapon · 精良"
    expect(screen.getByText(/weapon.*精良/)).toBeDefined();
  });

  it('attribute_mod 展开为 STR/DEX 等键值对 + 正负数色', () => {
    render(
      <ItemDetailPanel
        item={makeItem({
          effects: [attrMod({ STR: 3, DEX: -1 }, '属性修正')],
        })}
      />,
    );
    expect(screen.getByText('STR')).toBeDefined();
    expect(screen.getByText('DEX')).toBeDefined();
    expect(screen.getByText('+3')).toBeDefined();
    expect(screen.getByText('-1')).toBeDefined();
  });

  it('其他词条组 (非 attribute_mod) 渲染在 amber box', () => {
    render(
      <ItemDetailPanel
        item={makeItem({
          effects: [otherEffect('critical', '暴击率+5%')],
        })}
      />,
    );
    expect(screen.getByText('暴击率+5%')).toBeDefined();
    expect(screen.getByText('📜 其他词条')).toBeDefined();
  });

  it('历史 details 折叠: 点击展开条目', () => {
    render(
      <ItemDetailPanel
        item={makeItem({
          history: [
            { event: 'forged', description: '铁匠打造' },
            { event: 'enchanted', description: '附魔火焰' },
          ],
        })}
      />,
    );
    const summary = screen.getByText(/物品历史 \(2\)/);
    fireEvent.click(summary);
    // 展开后看到描述
    expect(screen.getByText(/铁匠打造/)).toBeDefined();
  });

  it('onClose 可选: 不传时不显示 ✕ 按钮', () => {
    render(<ItemDetailPanel item={makeItem({ name: 'X' })} />);
    expect(screen.queryByTestId('item-detail-close')).toBeNull();
  });
});
