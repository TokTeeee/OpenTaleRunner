import { describe, it, expect, beforeEach } from 'vitest';
import { useCodexStore } from '../../src/stores/codexStore';
import type { WorldItem } from '../../src/types/item';

const makeItem = (over: Partial<WorldItem>): WorldItem => ({
  itemId: over.itemId ?? 'item_a',
  name: '精钢剑',
  category: 'weapon',
  quality: '精良',
  effects: [],
  description: '',
  value: 0,
  history: [],
  holder: { kind: 'character', refId: 'p1' },
  quantity: 1,
  spawnInfo: { worldDay: 1, region: 'r', source: 'loot' },
  createdAt: '2026-06-05T00:00:00Z',
  updatedAt: '2026-06-05T00:00:00Z',
  ...over,
});

describe('useCodexStore', () => {
  beforeEach(() => useCodexStore.getState().reset());

  it('首次 recordDiscovery → isNew=true, encounterCount=1', () => {
    const r = useCodexStore.getState().recordDiscovery(makeItem({}));
    expect(r.isNew).toBe(true);
    const rec = useCodexStore.getState().discoveries[r.signature];
    expect(rec.encounterCount).toBe(1);
    expect(rec.isNew).toBe(true);
    expect(rec.name).toBe('精钢剑');
    expect(rec.category).toBe('weapon');
    expect(rec.quality).toBe('精良');
  });

  it('二次同 signature → isNew=false, encounterCount=2, lastSeenAt 更新', () => {
    const first = useCodexStore.getState().recordDiscovery(makeItem({ itemId: 'i1' }));
    useCodexStore.getState().markAllSeen();
    const second = useCodexStore.getState().recordDiscovery(
      makeItem({ itemId: 'i2', updatedAt: '2026-06-06T00:00:00Z' })
    );
    expect(first.signature).toBe(second.signature);
    expect(second.isNew).toBe(false);
    const rec = useCodexStore.getState().discoveries[first.signature];
    expect(rec.encounterCount).toBe(2);
    expect(rec.firstSeenItemId).toBe('i1');
  });

  it('不同 signature → 独立 record', () => {
    const a = useCodexStore.getState().recordDiscovery(makeItem({ name: '精钢剑' }));
    const b = useCodexStore.getState().recordDiscovery(makeItem({ name: '铁剑', itemId: 'i2' }));
    expect(a.signature).not.toBe(b.signature);
    expect(Object.keys(useCodexStore.getState().discoveries).length).toBe(2);
  });

  it('markAllSeen → 所有 isNew 字段清 false', () => {
    useCodexStore.getState().recordDiscovery(makeItem({}));
    useCodexStore.getState().recordDiscovery(makeItem({ name: '铁剑', itemId: 'i2' }));
    expect(Object.values(useCodexStore.getState().discoveries).every((r) => r.isNew)).toBe(true);
    useCodexStore.getState().markAllSeen();
    expect(Object.values(useCodexStore.getState().discoveries).every((r) => !r.isNew)).toBe(true);
  });

  it('hydrate → 恢复 records 不重置', () => {
    useCodexStore.getState().recordDiscovery(makeItem({}));
    const recs = useCodexStore.getState().serialize();
    useCodexStore.getState().reset();
    expect(Object.keys(useCodexStore.getState().discoveries).length).toBe(0);
    useCodexStore.getState().hydrate(recs);
    expect(Object.keys(useCodexStore.getState().discoveries).length).toBe(1);
  });

  it('reset → 清空 discoveries', () => {
    useCodexStore.getState().recordDiscovery(makeItem({}));
    useCodexStore.getState().reset();
    expect(Object.keys(useCodexStore.getState().discoveries).length).toBe(0);
  });
});
