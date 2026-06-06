import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { CodexEntry } from '../../../src/components/items/CodexEntry';
import type { DiscoveryRecord } from '../../../src/stores/codexStore';
import type { ItemCategory, ItemQuality, ItemEffect } from '../../../src/types/item';

const makeRecord = (over: Partial<DiscoveryRecord> = {}): DiscoveryRecord => ({
  signature: 'sig1',
  name: '精钢剑',
  category: 'weapon' as ItemCategory,
  quality: '精良' as ItemQuality,
  effects: [] as ItemEffect[],
  firstSeenItemId: 'i1',
  firstSeenAt: '2026-06-05T00:00:00Z',
  lastSeenAt: '2026-06-05T00:00:00Z',
  encounterCount: 3,
  isNew: false,
  ...over,
});

afterEach(() => cleanup());

describe('CodexEntry', () => {
  it('基础渲染: 图标 + 名称(品质色) + 分类 + 品质 + 遇到次数', () => {
    const { getByTestId, getByText } = render(
      <CodexEntry record={makeRecord({ name: '精钢剑', quality: '精良' })} selected={false} onClick={() => {}} />
    );
    const btn = getByTestId('codex-entry');
    expect(btn.getAttribute('data-signature')).toBe('sig1');
    expect(btn.getAttribute('data-is-new')).toBe('false');
    expect(getByText(/精钢剑/)).toBeTruthy();
    expect(getByText(/武器/)).toBeTruthy();
    expect(getByText(/精良/)).toBeTruthy();
    expect(getByText(/遇到 3 次/)).toBeTruthy();
  });

  it('isNew=true → 显示 ✨', () => {
    const { getByTestId } = render(
      <CodexEntry record={makeRecord({ isNew: true })} selected={false} onClick={() => {}} />
    );
    expect(getByTestId('codex-entry-new')).toBeTruthy();
    expect(getByTestId('codex-entry').getAttribute('data-is-new')).toBe('true');
  });

  it('selected=true → 高亮 (data-selected="true")', () => {
    const { getByTestId } = render(
      <CodexEntry record={makeRecord()} selected={true} onClick={() => {}} />
    );
    expect(getByTestId('codex-entry').getAttribute('data-selected')).toBe('true');
  });
});
