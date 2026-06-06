import { describe, expect, it, beforeEach } from 'vitest';
import { useItemRegistryStore } from '../../src/stores/itemRegistryStore';
import type { RegisterItemInput } from '../../src/stores/itemRegistryStore';

const SAMPLE: RegisterItemInput = {
  name: '黑铁剑',
  category: 'weapon',
  quality: '精良',
  description: '一把厚重的黑铁长剑',
  value: 100,
  quantity: 1,
  effects: [
    { id: 'eff_1', type: 'attribute_mod', value: { STR: 1 }, description: '力量+1' },
  ],
  durability: { current: 100, max: 100 },
  spawnInfo: { worldDay: 1, region: '北方雪原', source: 'loot' },
  holder: { kind: 'character', refId: 'p_alice' },
  canBeEquipped: true,
  equipSlot: 'weapon',
};

beforeEach(() => {
  useItemRegistryStore.getState().reset();
});

describe('itemRegistryStore — PR-1 Item 域基础', () => {
  describe('register', () => {
    it('生成 itemId 并写入 items', () => {
      const item = useItemRegistryStore.getState().register(SAMPLE);
      expect(item.itemId).toMatch(/^item_/);
      expect(item.name).toBe('黑铁剑');
      expect(item.holder).toEqual({ kind: 'character', refId: 'p_alice' });
      expect(item.history.length).toBe(1);
      expect(item.history[0].event).toBe('spawned');
    });

    it('新注册的物品标记为 dirty', () => {
      const item = useItemRegistryStore.getState().register(SAMPLE);
      expect(useItemRegistryStore.getState().dirtyIds.has(item.itemId)).toBe(true);
    });

    it('registerBatch 一次注册多个物品', () => {
      const items = useItemRegistryStore.getState().registerBatch([
        SAMPLE,
        { ...SAMPLE, name: '破旧布甲' },
        { ...SAMPLE, name: '幸运符' },
      ]);
      expect(items.length).toBe(3);
      expect(Object.keys(useItemRegistryStore.getState().items).length).toBe(3);
    });
  });

  describe('transfer', () => {
    it('物品从 character 转移到 npc 时更新 holder 并追加 history', () => {
      const item = useItemRegistryStore.getState().register(SAMPLE);
      const beforeHistoryLen = item.history.length;
      useItemRegistryStore.getState().transfer(item.itemId, { kind: 'npc', refId: 'npc_merchant' }, '卖给商人');

      const after = useItemRegistryStore.getState().get(item.itemId)!;
      expect(after.holder).toEqual({ kind: 'npc', refId: 'npc_merchant' });
      expect(after.history.length).toBe(beforeHistoryLen + 1);
      expect(after.history[after.history.length - 1].event).toBe('transferred');
      expect(after.history[after.history.length - 1].description).toContain('商人');
    });

    it('物品丢入世界容器 (container)', () => {
      const item = useItemRegistryStore.getState().register(SAMPLE);
      useItemRegistryStore.getState().transfer(item.itemId, { kind: 'container', refId: 'chest_42' }, '放入箱子');
      const after = useItemRegistryStore.getState().get(item.itemId)!;
      expect(after.holder).toEqual({ kind: 'container', refId: 'chest_42' });
    });

    it('物品游离世界 (kind=world, refId=null)', () => {
      const item = useItemRegistryStore.getState().register(SAMPLE);
      useItemRegistryStore.getState().transfer(item.itemId, { kind: 'world', refId: null }, '遗落在地');
      const after = useItemRegistryStore.getState().get(item.itemId)!;
      expect(after.holder).toEqual({ kind: 'world', refId: null });
    });

    it('已销毁的物品 (holder=null) 不可再 transfer', () => {
      const item = useItemRegistryStore.getState().register(SAMPLE);
      useItemRegistryStore.getState().destroy(item.itemId, '被熔化');
      const before = useItemRegistryStore.getState().get(item.itemId)!;
      const histLenBefore = before.history.length;
      useItemRegistryStore.getState().transfer(item.itemId, { kind: 'character', refId: 'p_alice' }, '试图复活');
      const after = useItemRegistryStore.getState().get(item.itemId)!;
      expect(after.holder).toBeNull();
      expect(after.history.length).toBe(histLenBefore);
    });
  });

  describe('destroy', () => {
    it('销毁物品: holder=null, history 追加 destroyed 事件', () => {
      const item = useItemRegistryStore.getState().register(SAMPLE);
      useItemRegistryStore.getState().destroy(item.itemId, '被火焰吞噬');
      const after = useItemRegistryStore.getState().get(item.itemId)!;
      expect(after.holder).toBeNull();
      expect(after.history[after.history.length - 1].event).toBe('destroyed');
      expect(after.history[after.history.length - 1].description).toBe('被火焰吞噬');
    });
  });

  describe('addHistory / patch', () => {
    it('addHistory 追加自定义事件', () => {
      const item = useItemRegistryStore.getState().register(SAMPLE);
      useItemRegistryStore.getState().addHistory(item.itemId, {
        event: 'enchanted',
        description: '附魔: 火焰附加',
      });
      const after = useItemRegistryStore.getState().get(item.itemId)!;
      expect(after.history[after.history.length - 1].event).toBe('enchanted');
    });

    it('patch 修改名称/描述/词条, 触发 modified 历史', () => {
      const item = useItemRegistryStore.getState().register(SAMPLE);
      useItemRegistryStore.getState().patch(item.itemId, {
        name: '炽热黑铁剑',
        description: '剑身泛着红光',
      });
      const after = useItemRegistryStore.getState().get(item.itemId)!;
      expect(after.name).toBe('炽热黑铁剑');
      expect(after.description).toBe('剑身泛着红光');
      expect(after.history[after.history.length - 1].event).toBe('modified');
    });
  });

  describe('queries', () => {
    it('byHolder 过滤指定 holder 的物品', () => {
      useItemRegistryStore.getState().register(SAMPLE);
      useItemRegistryStore.getState().register({ ...SAMPLE, name: '布甲', category: 'armor' });
      useItemRegistryStore.getState().register({ ...SAMPLE, name: '商人货物', holder: { kind: 'npc', refId: 'npc_x' } });

      const aliceItems = useItemRegistryStore.getState().byHolder({ kind: 'character', refId: 'p_alice' });
      expect(aliceItems.length).toBe(2);

      const npcItems = useItemRegistryStore.getState().byHolder({ kind: 'npc', refId: 'npc_x' });
      expect(npcItems.length).toBe(1);
    });

    it('byPlayer 返回该玩家持有的所有物品', () => {
      useItemRegistryStore.getState().register(SAMPLE);
      const playerItems = useItemRegistryStore.getState().byPlayer('p_alice');
      expect(playerItems.length).toBe(1);
      expect(useItemRegistryStore.getState().byPlayer('p_bob').length).toBe(0);
    });

    it('exists 反映物品是否在 registry 中 (含已销毁)', () => {
      const item = useItemRegistryStore.getState().register(SAMPLE);
      expect(useItemRegistryStore.getState().exists(item.itemId)).toBe(true);
      useItemRegistryStore.getState().destroy(item.itemId, '消失');
      expect(useItemRegistryStore.getState().exists(item.itemId)).toBe(true);
    });
  });

  describe('dirty tracking', () => {
    it('每次 mutation 后 dirtyIds 包含该 itemId', () => {
      const item = useItemRegistryStore.getState().register(SAMPLE);
      expect(useItemRegistryStore.getState().getDirtyIds()).toContain(item.itemId);
    });

    it('hydrate 后 dirtyIds 清空', () => {
      useItemRegistryStore.getState().register(SAMPLE);
      useItemRegistryStore.getState().hydrate([
        { ...SAMPLE, itemId: 'item_external_1', createdAt: '', updatedAt: '' } as never,
      ]);
      expect(useItemRegistryStore.getState().dirtyIds.size).toBe(0);
    });
  });
});
