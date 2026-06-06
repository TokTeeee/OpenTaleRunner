import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React from 'react';
import { cleanup, render, fireEvent } from '@testing-library/react';
import { MemoryModal } from '../../../src/components/modals/MemoryModal';
import { MemoryManager } from '../../../src/services/memory/MemoryManager';
import type { MemoryRecordInput } from '../../../src/types/memory';

afterEach(() => cleanup());

const makeInput = (over: Partial<MemoryRecordInput> = {}): MemoryRecordInput => ({
  scope: 'npc',
  entityId: 'npc_1',
  content: '与王二冲突',
  metadata: { worldDay: 1, timestamp: Date.now(), importance: 0.7 },
  ...over,
});

describe('MemoryModal', () => {
  beforeEach(async () => {
    MemoryManager.resetForTest();
    await MemoryManager.add([makeInput({ content: '事实A' }), makeInput({ content: '事实B' })]);
  });

  it('渲染 modal 框架 (data-testid="memory-modal")', () => {
    const { getByTestId } = render(<MemoryModal onClose={() => {}} />);
    expect(getByTestId('memory-modal')).toBeTruthy();
  });

  it('显示所有 records 数量', () => {
    const { getAllByTestId } = render(<MemoryModal onClose={() => {}} />);
    expect(getAllByTestId('memory-entry').length).toBe(2);
  });

  it('scope 筛选: 点击 npc 按钮只剩 npc records', async () => {
    await MemoryManager.add([makeInput({ scope: 'item', content: '物品事实' })]);
    const { getByTestId, getAllByTestId } = render(<MemoryModal onClose={() => {}} />);
    expect(getAllByTestId('memory-entry').length).toBe(3);  // 2 npc + 1 item
    fireEvent.click(getByTestId('memory-scope-npc'));
    expect(getAllByTestId('memory-entry').length).toBe(2);
  });

  it('搜索: 输入 "事实A" 过滤 records', () => {
    const { getByTestId, getAllByTestId } = render(<MemoryModal onClose={() => {}} />);
    fireEvent.change(getByTestId('memory-search'), { target: { value: '事实A' } });
    expect(getAllByTestId('memory-entry').length).toBe(1);
  });

  it('关闭按钮触发 onClose', () => {
    let closed = false;
    const { getByTestId } = render(<MemoryModal onClose={() => { closed = true; }} />);
    fireEvent.click(getByTestId('memory-modal-close'));
    expect(closed).toBe(true);
  });
});
