import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useCharacterStore } from '../../../src/stores/characterStore';
import { useItemRegistryStore } from '../../../src/stores/itemRegistryStore';
import { applyConsequences } from '../../../src/services/consequence/applyConsequences';
import { resetClientStores } from '../../utils/resetStores';
import type { ConsequenceData } from '../../../src/types/game';
import type { Character } from '../../../src/types/character';

const CHAR_ID = 'p_alice';

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    characterId: CHAR_ID,
    playerId: 'p1',
    name: 'Alice',
    race: 'human',
    background: '',
    appearance: '',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    inventory: {
      backpack: [],
      equipped: { weapon: null, armor: null, accessory: null },
      currency: { gold: 0, silver: 0, copper: 0 },
    },
    hp: 30, maxHp: 30,
    vital: { hunger: 0, thirst: 0, fatigue: 0, hygiene: 0, morale: 0, wound: 0, temperature: 0, encumbrance: 0 },
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    conditions: [],
    joinedRegion: 'r1', joinedWorldDay: 1, currentLocalDay: 1, lastActionTime: '',
    recentHistory: [],
    currentRegion: 'r1',
    unspentAttributePoints: 0,
    unspentSkillPoints: 0,
    ...overrides,
  };
}

function makeCons(overrides: Partial<ConsequenceData> = {}): ConsequenceData {
  return {
    itemsGained: [],
    itemsLost: [],
    itemsModified: [],
    skillsModified: [],
    currencyChange: { gold: 0, silver: 0, copper: 0 },
    reputationChange: {},
    worldEffects: [],
    skillsLearned: [],
    hpChange: 0,
    stateChanges: {},
    ...overrides,
  };
}

beforeEach(() => {
  resetClientStores();
  useCharacterStore.getState().setCharacter(makeChar());
});

afterEach(() => {
  resetClientStores();
});

describe('applyConsequences — PR-2 接入 itemRegistry', () => {
  describe('itemsGained', () => {
    it('获得新物品时写入 itemRegistry, holder 指向当前 character', () => {
      applyConsequences(makeCons({
        itemsGained: [
          { name: '长剑', category: 'weapon', quality: '精良', quantity: 1 },
        ],
      }));

      const items = useItemRegistryStore.getState().byHolder({ kind: 'character', refId: CHAR_ID });
      expect(items.length).toBe(1);
      expect(items[0].name).toBe('长剑');
      expect(items[0].holder).toEqual({ kind: 'character', refId: CHAR_ID });
      expect(items[0].history[0].event).toBe('spawned');
    });

    it('同一物品多次获得时数量累加, 不创建新 WorldItem', () => {
      applyConsequences(makeCons({
        itemsGained: [{ name: '草药', category: 'consumable', quantity: 3 }],
      }));
      applyConsequences(makeCons({
        itemsGained: [{ name: '草药', category: 'consumable', quantity: 2 }],
      }));
      const items = useItemRegistryStore.getState().byHolder({ kind: 'character', refId: CHAR_ID });
      expect(items.length).toBe(1);
      expect(items[0].quantity).toBe(5);
    });

    it('replacesItemId 升级: 修改原 WorldItem 保留 itemId 与历史', () => {
      // 先获得一个
      applyConsequences(makeCons({
        itemsGained: [{ name: '粗铁剑', category: 'weapon', quality: '普通' }],
      }));
      const original = useItemRegistryStore.getState().byHolder({ kind: 'character', refId: CHAR_ID })[0];
      const originalId = original.itemId;
      const originalHistoryLen = original.history.length;

      // 升级
      applyConsequences(makeCons({
        itemsGained: [{
          name: '精钢长剑', category: 'weapon', quality: '精良',
          replacesItemId: originalId,
          description: '从粗铁剑升级为精钢长剑',
        }],
      }));

      const items = useItemRegistryStore.getState().byHolder({ kind: 'character', refId: CHAR_ID });
      expect(items.length).toBe(1);
      expect(items[0].itemId).toBe(originalId);  // 保留 ID
      expect(items[0].name).toBe('精钢长剑');
      expect(items[0].quality).toBe('精良');
      // patch() 触发 modified, addHistory() 触发 upgraded, 共 +2
      expect(items[0].history.length).toBe(originalHistoryLen + 2);
      const lastEvent = items[0].history[items[0].history.length - 1].event;
      expect(['upgraded', 'modified']).toContain(lastEvent);
    });

    it('更新 char.inventory.backpack 派生视图 (兼容旧 UI)', () => {
      applyConsequences(makeCons({
        itemsGained: [
          { name: '盾牌', category: 'armor', quality: '精良' },
          { name: '药水', category: 'consumable', quantity: 3 },
        ],
      }));
      const backpack = useCharacterStore.getState().character!.inventory.backpack;
      expect(backpack.length).toBe(2);
      const names = backpack.map((b) => b.name).sort();
      expect(names).toEqual(['盾牌', '药水']);
    });
  });

  describe('itemsLost', () => {
    it('部分丢失: 仅减 quantity, 物品仍存在', () => {
      applyConsequences(makeCons({
        itemsGained: [{ name: '草药', category: 'consumable', quantity: 5 }],
      }));
      const id = useItemRegistryStore.getState().byHolder({ kind: 'character', refId: CHAR_ID })[0].itemId;

      applyConsequences(makeCons({
        itemsLost: [{ name: '草药', quantity: 2 }],
      }));

      const item = useItemRegistryStore.getState().get(id);
      expect(item).toBeDefined();
      expect(item!.quantity).toBe(3);
      expect(item!.holder).toEqual({ kind: 'character', refId: CHAR_ID });
    });

    it('全部丢失: 销毁物品 (itemRegistry 中 holder=null)', () => {
      applyConsequences(makeCons({
        itemsGained: [{ name: '宝石', category: 'key_item', quantity: 1 }],
      }));
      const id = useItemRegistryStore.getState().byHolder({ kind: 'character', refId: CHAR_ID })[0].itemId;

      applyConsequences(makeCons({
        itemsLost: [{ itemId: id }],
      }));

      const item = useItemRegistryStore.getState().get(id);
      expect(item).toBeDefined();  // 仍在 registry
      expect(item!.holder).toBeNull();  // 已销毁
      expect(item!.history[item!.history.length - 1].event).toBe('destroyed');
    });

    it('销毁的物品不再出现在背包视图', () => {
      applyConsequences(makeCons({
        itemsGained: [{ name: '宝石', category: 'key_item' }],
      }));
      const id = useItemRegistryStore.getState().byHolder({ kind: 'character', refId: CHAR_ID })[0].itemId;

      applyConsequences(makeCons({ itemsLost: [{ itemId: id }] }));
      const backpack = useCharacterStore.getState().character!.inventory.backpack;
      expect(backpack.length).toBe(0);
    });
  });

  describe('itemsModified', () => {
    it('修改名称/描述/耐久度, 触发 modified 历史', () => {
      applyConsequences(makeCons({
        itemsGained: [{ name: '长剑', category: 'weapon', quality: '精良' }],
      }));
      const id = useItemRegistryStore.getState().byHolder({ kind: 'character', refId: CHAR_ID })[0].itemId;

      applyConsequences(makeCons({
        itemsModified: [{
          itemId: id,
          newName: '炽热长剑',
          newQuality: '史诗',
          description: '剑身泛着红光',
          durabilityChange: -10,
        }],
      }));

      const item = useItemRegistryStore.getState().get(id);
      expect(item!.name).toBe('炽热长剑');
      expect(item!.quality).toBe('史诗');
      expect(item!.description).toBe('剑身泛着红光');
      expect(item!.history[item!.history.length - 1].event).toBe('modified');
    });

    it('追加词条到 effect 列表', () => {
      applyConsequences(makeCons({
        itemsGained: [{ name: '剑', category: 'weapon' }],
      }));
      const id = useItemRegistryStore.getState().byHolder({ kind: 'character', refId: CHAR_ID })[0].itemId;

      applyConsequences(makeCons({
        itemsModified: [{
          itemId: id,
          addedEffects: [
            { type: 'attribute_mod', value: { STR: 2 }, description: '力量+2' },
          ],
        }],
      }));

      const item = useItemRegistryStore.getState().get(id);
      const attrMod = item!.effects.find((e) => e.type === 'attribute_mod');
      expect(attrMod).toBeDefined();
    });
  });
});
