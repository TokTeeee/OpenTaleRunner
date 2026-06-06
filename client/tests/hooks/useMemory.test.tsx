/**
 * useMemory hooks 单元测试 (订阅 + 过滤 + 搜索)
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React from 'react';
import { cleanup, render, act } from '@testing-library/react';
import { useMemoryRecords, useMemoryByEntitySync, useMemorySearch } from '../../src/hooks/useMemory';
import { MemoryManager } from '../../src/services/memory/MemoryManager';
import type { MemoryRecordInput } from '../../../src/types/memory';

afterEach(() => cleanup());

const makeInput = (over: Partial<MemoryRecordInput> = {}): MemoryRecordInput => ({
  scope: 'npc',
  entityId: 'npc_a',
  content: '与王二发生冲突',
  metadata: { worldDay: 3, timestamp: Date.now(), importance: 0.7 },
  ...over,
});

describe('useMemory hooks', () => {
  beforeEach(() => {
    MemoryManager.resetForTest();
  });

  it('useMemoryRecords 返回当前所有未软删除 records (订阅)', async () => {
    function Probe() {
      const records = useMemoryRecords();
      return <div data-testid="count">{records.length}</div>;
    }
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('count').textContent).toBe('0');

    await act(async () => {
      await MemoryManager.add([makeInput({ entityId: 'npc_a', content: '事实1' })]);
    });
    expect(getByTestId('count').textContent).toBe('1');

    await act(async () => {
      await MemoryManager.add([makeInput({ entityId: 'npc_b', content: '事实2' })]);
    });
    expect(getByTestId('count').textContent).toBe('2');
  });

  it('useMemoryByEntitySync 按 scope + entityId 过滤', async () => {
    await MemoryManager.add([
      makeInput({ scope: 'npc', entityId: 'npc_a', content: 'a1' }),
      makeInput({ scope: 'npc', entityId: 'npc_b', content: 'b1' }),
      makeInput({ scope: 'item', entityId: 'npc_a', content: 'a2' }),
    ]);
    function Probe() {
      const records = useMemoryByEntitySync('npc', 'npc_a');
      return <div data-testid="result">{records.map((r) => r.content).join(',')}</div>;
    }
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('result').textContent).toBe('a1');
  });

  it('useMemorySearch 同步检索', async () => {
    await MemoryManager.add([
      makeInput({ content: '与王二冲突' }),
      makeInput({ content: '获得治疗药水' }),
    ]);
    function Probe() {
      const hits = useMemorySearch({ query: '王二', topK: 5 });
      return <div data-testid="result">{hits.length}</div>;
    }
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('result').textContent).toBe('1');
  });

  it('forget 后订阅触发, listAll 不再包含', async () => {
    await MemoryManager.add([makeInput({ content: '待删' })]);
    function Probe() {
      const records = useMemoryRecords();
      return <div data-testid="count">{records.length}</div>;
    }
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('count').textContent).toBe('1');
    const id = MemoryManager.listAll()[0].id;
    await act(async () => {
      await MemoryManager.forget(id, 'test');
    });
    // forget 是软删除, listAll 过滤 deletedAt, 应该为 0
    expect(getByTestId('count').textContent).toBe('0');
  });
});
