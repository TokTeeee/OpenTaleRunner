import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useCharacterStore } from '../../../src/stores/characterStore';
import { useCodexStore } from '../../../src/stores/codexStore';
import { applyConsequences } from '../../../src/services/consequence/applyConsequences';
import { resetClientStores } from '../../utils/resetStores';
import type { RNG } from '../../../src/data/affixPool';
import type { ConsequenceData } from '../../../src/types/game';
import type { Character } from '../../../src/types/character';

/** 全 0 RNG: int(n) 返 0, next() 返 0. 让 affix 池返 0 词条, 保证测试纯净. */
const zeroRng: RNG = { next: () => 0, int: () => 0 };

function makeBaseCharacter(overrides: Partial<Character> = {}): Character {
  return {
    playerId: 'test-player',
    name: '测试冒险者',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [{ id: 'skill-1', name: '剑术', level: 2, maxLevel: 10, type: 'acquired', relatedAttribute: 'STR' as any, description: '', acquiredAt: 'd1', experience: 0, expToNext: 3 }],
    hp: 20,
    maxHp: 20,
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    inventory: {
      backpack: [],
      equipped: { weapon: null, armor: null, accessory: null },
      currency: { gold: 10, silver: 0, copper: 0 },
    },
    conditions: [],
    history: [],
    currentLocalDay: 1,
    currentRegion: 'test-region',
    currentSubRegion: '',
    currentLocation: 'test-town',
    currentCoordinates: { x: 0, y: 0, z: 0 },
    currentTerrain: 'plain',
    currentWeather: 'clear',
    joinedRegion: 'test-region',
    background: '一位流浪者',
    appearance: '',
    ...overrides,
  } as Character;
}

function makeConsequenceData(overrides: Partial<ConsequenceData> = {}): ConsequenceData {
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

describe('applyConsequences', () => {
  beforeEach(() => {
    resetClientStores();
  });

  afterEach(() => {
    resetClientStores();
  });

  it('no-ops when character is null', () => {
    expect(() => applyConsequences(makeConsequenceData({ hpChange: -5 }))).not.toThrow();
  });

  it('no-ops when consequences is empty', () => {
    const char = makeBaseCharacter();
    useCharacterStore.getState().setCharacter(char);
    applyConsequences(makeConsequenceData());
    const updated = useCharacterStore.getState().character;
    expect(updated?.hp).toBe(20);
  });

  describe('attribute changes', () => {
    it('applies positive attribute changes', () => {
      useCharacterStore.getState().setCharacter(makeBaseCharacter());
      applyConsequences(makeConsequenceData({
        attributeChanges: { STR: 2, INT: 1 },
      }));
      const updated = useCharacterStore.getState().character;
      expect(updated?.attributes.STR).toBe(12);
      expect(updated?.attributes.INT).toBe(11);
    });

    it('applies negative attribute changes', () => {
      useCharacterStore.getState().setCharacter(makeBaseCharacter());
      applyConsequences(makeConsequenceData({
        attributeChanges: { STR: -3, DEX: -1 },
      }));
      const updated = useCharacterStore.getState().character;
      expect(updated?.attributes.STR).toBe(7);
      expect(updated?.attributes.DEX).toBe(9);
    });

    it('clamps attributes to range [3, 18]', () => {
      useCharacterStore.getState().setCharacter(makeBaseCharacter({ attributes: { STR: 3, DEX: 3, CON: 10, INT: 10, WIS: 10, CHA: 10 } }));
      applyConsequences(makeConsequenceData({ attributeChanges: { STR: -2, DEX: 2, INT: 20 } }));
      const updated = useCharacterStore.getState().character;
      expect(updated?.attributes.STR).toBe(3);
      expect(updated?.attributes.DEX).toBe(5);
      expect(updated?.attributes.INT).toBe(18);
    });
  });

  describe('conditions', () => {
    it('adds conditions', () => {
      useCharacterStore.getState().setCharacter(makeBaseCharacter());
      applyConsequences(makeConsequenceData({ conditionsAdded: ['中毒', '疲劳'] }));
      const updated = useCharacterStore.getState().character;
      expect(updated?.conditions).toContain('中毒');
      expect(updated?.conditions).toContain('疲劳');
    });

    it('removes conditions', () => {
      useCharacterStore.getState().setCharacter(makeBaseCharacter());
      useCharacterStore.getState().addCondition('中毒');
      applyConsequences(makeConsequenceData({ conditionsRemoved: ['中毒'] }));
      const updated = useCharacterStore.getState().character;
      expect(updated?.conditions).not.toContain('中毒');
    });
  });

  describe('currency', () => {
    it('modifies gold, silver, copper', () => {
      useCharacterStore.getState().setCharacter(makeBaseCharacter());
      applyConsequences(makeConsequenceData({ currencyChange: { gold: -5, silver: 10 } }));
      const updated = useCharacterStore.getState().character;
      expect(updated?.inventory.currency.gold).toBe(5);
      expect(updated?.inventory.currency.silver).toBe(10);
      expect(updated?.inventory.currency.copper).toBe(0);
    });
  });

  describe('reputation', () => {
    it('updates global reputation keys', () => {
      useCharacterStore.getState().setCharacter(makeBaseCharacter({ reputation: { goodness: 0, violence: 5, lawfulness: 0, regional: {} } }));
      applyConsequences(makeConsequenceData({ reputationChange: { goodness: 3, violence: -2 } }));
      const updated = useCharacterStore.getState().character;
      expect(updated?.reputation.goodness).toBe(3);
      expect(updated?.reputation.violence).toBe(3);
    });

    it('updates regional reputation for non-global keys', () => {
      useCharacterStore.getState().setCharacter(makeBaseCharacter());
      applyConsequences(makeConsequenceData({ reputationChange: { '王国守卫': 5 } }));
      const updated = useCharacterStore.getState().character;
      expect(updated?.reputation.regional).toEqual({ '王国守卫': 5 });
    });
  });

  describe('items gained', () => {
    it('adds a new item to backpack', () => {
      useCharacterStore.getState().setCharacter(makeBaseCharacter());
      applyConsequences(makeConsequenceData({
        itemsGained: [{ name: '治疗药水', category: 'consumable', quantity: 3 }],
      }));
      const updated = useCharacterStore.getState().character;
      expect(updated?.inventory.backpack.length).toBe(1);
      expect(updated?.inventory.backpack[0].name).toBe('治疗药水');
      expect(updated?.inventory.backpack[0].quantity).toBe(3);
    });

    it('stacks quantity for existing same-named consumable', () => {
      useCharacterStore.getState().setCharacter(makeBaseCharacter());
      applyConsequences(makeConsequenceData({
        itemsGained: [{ name: '治疗药水', category: 'consumable', quantity: 2 }],
      }));
      applyConsequences(makeConsequenceData({
        itemsGained: [{ name: '治疗药水', category: 'consumable', quantity: 3 }],
      }));
      const updated = useCharacterStore.getState().character;
      expect(updated?.inventory.backpack.length).toBe(1);
      expect(updated?.inventory.backpack[0].quantity).toBe(5);
    });

    // 审计 P1 修复: 升级(replacesItemId)后必须保留旧 itemId, 以维持装备引用稳定
    it('preserves itemId when upgrading an existing item via replacesItemId', () => {
      useCharacterStore.getState().setCharacter(makeBaseCharacter());
      applyConsequences(makeConsequenceData({
        itemsGained: [{ name: '铁剑', category: 'weapon', quantity: 1 }],
      }));
      const originalItemId = useCharacterStore.getState().character?.inventory.backpack[0]?.itemId;
      expect(originalItemId).toBeTruthy();

      applyConsequences(makeConsequenceData({
        itemsGained: [{
          name: '精钢长剑',
          category: 'weapon',
          quantity: 1,
          replacesItemId: originalItemId,
          description: '升级',
        }],
      }));
      const updated = useCharacterStore.getState().character;
      expect(updated?.inventory.backpack.length).toBe(1);
      // 关键断言: itemId 必须保留
      expect(updated?.inventory.backpack[0].itemId).toBe(originalItemId);
      expect(updated?.inventory.backpack[0].name).toBe('精钢长剑');
      // 历史记录应当记录升级事件
      expect(updated?.inventory.backpack[0].history?.some(h => h.event === 'upgraded')).toBe(true);
    });

    it('generates a new id when adding a brand-new item (no replacesItemId)', () => {
      useCharacterStore.getState().setCharacter(makeBaseCharacter());
      applyConsequences(makeConsequenceData({
        itemsGained: [{ name: '新药水', category: 'consumable', quantity: 1 }],
      }));
      const itemId = useCharacterStore.getState().character?.inventory.backpack[0]?.itemId;
      expect(itemId).toMatch(/^item_\d+_[a-z0-9]+$/);
    });
  });

  describe('items lost', () => {
    it('removes item by name', () => {
      useCharacterStore.getState().setCharacter(makeBaseCharacter());
      applyConsequences(makeConsequenceData({
        itemsGained: [{ name: '钥匙', category: 'consumable', quantity: 1 }],
      }));
      applyConsequences(makeConsequenceData({
        itemsLost: [{ name: '钥匙' }],
      }));
      const updated = useCharacterStore.getState().character;
      expect(updated?.inventory.backpack.length).toBe(0);
    });

    it('reduces quantity when stack partially removed', () => {
      useCharacterStore.getState().setCharacter(makeBaseCharacter());
      applyConsequences(makeConsequenceData({
        itemsGained: [{ name: '箭矢', category: 'consumable', quantity: 10 }],
      }));
      applyConsequences(makeConsequenceData({
        itemsLost: [{ name: '箭矢', quantity: 3 }],
      }));
      const updated = useCharacterStore.getState().character;
      expect(updated?.inventory.backpack[0].quantity).toBe(7);
    });
  });

  describe('skills modified', () => {
    it('modifies skill level via skillsModified', () => {
      useCharacterStore.getState().setCharacter(makeBaseCharacter());
      const char = useCharacterStore.getState().character;
      const skillId = char?.skills[0]?.id || '';
      applyConsequences(makeConsequenceData({
        skillsModified: [{ skillId, levelChange: 1 }],
      }));
      const updated = useCharacterStore.getState().character;
      expect(updated?.skills[0].level).toBe(3);
    });
  });

  describe('items modified', () => {
    it('renames and adds effects to an existing item', () => {
      useCharacterStore.getState().setCharacter(makeBaseCharacter());
      applyConsequences(makeConsequenceData({
        itemsGained: [{ name: '铁剑', category: 'weapon', quantity: 1 }],
      }), { rng: zeroRng });
      const itemId = useCharacterStore.getState().character?.inventory.backpack[0]?.itemId || '';
      applyConsequences(makeConsequenceData({
        itemsModified: [{
          itemId,
          newName: '附魔铁剑',
          newQuality: '稀有' as any,
          addedEffects: [{ type: 'damage_bonus' as any, value: 5, description: '火焰附魔' }],
        }],
      }), { rng: zeroRng });
      const updated = useCharacterStore.getState().character;
      expect(updated?.inventory.backpack[0].name).toBe('附魔铁剑');
      expect(updated?.inventory.backpack[0].quality).toBe('稀有');
      expect(updated?.inventory.backpack[0].effects.length).toBe(1);
    });
  });

  describe('v0.4-codex: applyConsequences → codexStore 集成', () => {
    beforeEach(() => {
      // codexStore 不在 resetClientStores 里, 单独清
      useCodexStore.getState().reset();
    });

    it('Loot 后 codex 出现新条目 (isNew=true)', () => {
      useCharacterStore.getState().setCharacter(makeBaseCharacter());
      const result = applyConsequences(makeConsequenceData({
        itemsGained: [{ name: '精钢剑', category: 'weapon', quality: '精良', quantity: 1 }],
      }));
      const discoveries = Object.values(useCodexStore.getState().discoveries);
      expect(discoveries.length).toBe(1);
      expect(discoveries[0].name).toBe('精钢剑');
      expect(discoveries[0].isNew).toBe(true);
      expect(discoveries[0].encounterCount).toBe(1);
      expect(result?.newDiscoveries.length).toBe(1);
    });

    it('二次同 loot 仅递增 encounterCount, isNew=false', () => {
      useCharacterStore.getState().setCharacter(makeBaseCharacter());
      const itemsGained = [{ name: '精钢剑', category: 'weapon', quality: '精良', quantity: 1 }];
      applyConsequences(makeConsequenceData({ itemsGained }));
      useCodexStore.getState().markAllSeen();
      const result2 = applyConsequences(makeConsequenceData({ itemsGained }));
      const rec = Object.values(useCodexStore.getState().discoveries)[0];
      expect(rec.encounterCount).toBe(2);
      expect(rec.isNew).toBe(false);
      expect(result2?.newDiscoveries.length).toBe(0);
    });
  });
});
