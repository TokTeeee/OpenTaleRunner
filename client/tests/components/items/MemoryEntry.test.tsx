import { afterEach, describe, expect, it } from 'vitest';
import React from 'react';
import { cleanup, render, fireEvent } from '@testing-library/react';
import { MemoryEntry } from '../../../src/components/items/MemoryEntry';
import type { MemoryRecord } from '../../../src/types/memory';

afterEach(() => cleanup());

const makeRec = (over: Partial<MemoryRecord> = {}): MemoryRecord => ({
  id: 'mem_test_1',
  scope: 'npc',
  entityId: 'npc_1',
  content: '与酒馆老板王二发生冲突, 好感度-15',
  metadata: { worldDay: 3, timestamp: Date.now(), importance: 0.7 },
  createdAt: new Date().toISOString(),
  deletedAt: null,
  ...over,
});

describe('MemoryEntry', () => {
  it('渲染 scope 图标 + content 截断 + worldDay/importance', () => {
    const { getByTestId, getByText } = render(<MemoryEntry record={makeRec()} />);
    expect(getByTestId('memory-entry')).toBeTruthy();
    expect(getByTestId('memory-entry-icon')).toBeTruthy();
    expect(getByText(/王二/)).toBeTruthy();
    expect(getByText(/第 3 天/)).toBeTruthy();
    expect(getByText(/重要性 0.7/)).toBeTruthy();
  });

  it('点击触发 onClick, 传递 record.id', () => {
    let called = '';
    const { getByTestId } = render(
      <MemoryEntry record={makeRec()} onClick={(id) => { called = id; }} />,
    );
    fireEvent.click(getByTestId('memory-entry'));
    expect(called).toBe('mem_test_1');
  });

  it('selected=true 时高亮 (className 含 cyan)', () => {
    const { getByTestId } = render(<MemoryEntry record={makeRec()} selected />);
    const el = getByTestId('memory-entry');
    expect(el.className).toMatch(/border-cyan|bg-cyan/);
  });
});
