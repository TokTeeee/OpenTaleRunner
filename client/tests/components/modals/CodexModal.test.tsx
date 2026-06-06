import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { CodexModal } from '../../../src/components/modals/CodexModal';
import { useCodexStore } from '../../../src/stores/codexStore';
import { useItemRegistryStore } from '../../../src/stores/itemRegistryStore';
import type { WorldItem } from '../../../src/types/item';

const makeItem = (over: Partial<WorldItem>): WorldItem => ({
  itemId: 'i1', name: '精钢剑', category: 'weapon', quality: '精良',
  effects: [], description: '', value: 0, history: [],
  holder: { kind: 'character', refId: 'p1' }, quantity: 1,
  spawnInfo: { worldDay: 1, region: 'r', source: 'loot' },
  createdAt: '', updatedAt: '',
  ...over,
});

beforeEach(() => {
  useCodexStore.getState().reset();
  useItemRegistryStore.getState().reset();
});
afterEach(() => cleanup());

describe('CodexModal', () => {
  it('基础渲染: 标题 + 总数 + 分类 sidebar + 网格', () => {
    useCodexStore.getState().recordDiscovery(makeItem({}));
    useCodexStore.getState().recordDiscovery(
      makeItem({ name: '治疗药水', category: 'consumable', itemId: 'i2' })
    );
    const { getByTestId, getAllByTestId, getByText } = render(<CodexModal onClose={() => {}} />);
    expect(getByTestId('codex-modal')).toBeTruthy();
    expect(getByText(/物品图鉴 \(2\)/)).toBeTruthy();
    // 分类 sidebar
    expect(getByTestId('codex-cat-all')).toBeTruthy();
    expect(getByTestId('codex-cat-weapon')).toBeTruthy();
    expect(getByTestId('codex-cat-consumable')).toBeTruthy();
    // 网格条目
    expect(getAllByTestId('codex-entry').length).toBe(2);
  });

  it('点击分类 → 网格过滤为该分类', () => {
    useCodexStore.getState().recordDiscovery(makeItem({ name: '精钢剑', category: 'weapon' }));
    useCodexStore.getState().recordDiscovery(
      makeItem({ name: '治疗药水', category: 'consumable', itemId: 'i2' })
    );
    const { getAllByTestId } = render(<CodexModal onClose={() => {}} />);
    fireEvent.click(getAllByTestId('codex-cat-consumable')[0]);
    const entries = getAllByTestId('codex-entry');
    expect(entries.length).toBe(1);
  });

  it('搜索 → 模糊匹配 name 过滤', () => {
    useCodexStore.getState().recordDiscovery(makeItem({ name: '精钢剑' }));
    useCodexStore.getState().recordDiscovery(
      makeItem({ name: '治疗药水', category: 'consumable', itemId: 'i2' })
    );
    const { getAllByTestId, getByTestId } = render(<CodexModal onClose={() => {}} />);
    const input = getByTestId('codex-search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '精钢' } });
    const entries = getAllByTestId('codex-entry');
    expect(entries.length).toBe(1);
  });

  it('点击网格条目 → 右栏显示 ItemDetailPanel', () => {
    useCodexStore.getState().recordDiscovery(makeItem({ name: '精钢剑' }));
    const { getByTestId, queryByTestId } = render(<CodexModal onClose={() => {}} />);
    expect(queryByTestId('item-detail-panel')).toBeNull();
    fireEvent.click(getByTestId('codex-entry'));
    expect(getByTestId('item-detail-panel')).toBeTruthy();
  });

  it('关闭 → 调 onClose + markAllSeen', () => {
    useCodexStore.getState().recordDiscovery(makeItem({}));
    const onClose = vi.fn();
    const { getByTestId } = render(<CodexModal onClose={onClose} />);
    fireEvent.click(getByTestId('codex-modal-close'));
    expect(onClose).toHaveBeenCalledOnce();
    expect(
      Object.values(useCodexStore.getState().discoveries).every((r) => !r.isNew)
    ).toBe(true);
  });
});
