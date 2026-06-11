import { describe, it, expect, beforeEach, vi } from 'vitest';
import { inventorySearch } from '../../src/services/engine/QueryResolver';
import { useCharacterStore } from '../../src/stores/characterStore';
import { resetClientStores } from '../utils/resetStores';
import type { Character, Item } from '../../src/types/character';
import type { Item as ItemType } from '../../src/types/item';

function makeChar(id: string, items: { equipped?: Partial<ItemType>; backpack?: Partial<ItemType>[] }): Character {
  return {
    characterId: id,
    playerId: id,
    name: '测试角色',
    race: '人类',
    background: '测试',
    appearance: '测试',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    inventory: {
      equipped: {
        weapon: items.equipped ? { name: items.equipped.name ?? '', ...(items.equipped as Item) } as Item : null,
        armor: null,
        accessory: null,
      },
      backpack: (items.backpack || []).map(p => ({ name: p.name ?? '', ...(p as Item) } as Item)),
      currency: { gold: 0, silver: 0, copper: 0 },
    },
    hp: 100, maxHp: 100,
    vital: { hunger: 0, thirst: 0, fatigue: 0, hygiene: 0, morale: 0 },
    reputation: { factions: {}, lastUpdated: 0 },
    conditions: [],
    joinedRegion: 'test',
    joinedWorldDay: 1,
    currentLocalDay: 1,
    lastActionTime: new Date().toISOString(),
    unspentAttributePoints: 0,
    unspentSkillPoints: 0,
  } as unknown as Character;
}

describe('inventorySearch (v0.5.12)', () => {
  beforeEach(() => {
    resetClientStores();
    vi.clearAllMocks();
  });

  it('returns items matching keyword in character backpack', () => {
    const char = makeChar('char1', {
      backpack: [
        { name: '治疗药水', description: '恢复生命' },
        { name: '魔法剑', description: '增加攻击' },
        { name: '毒药瓶', description: '涂武器' },
      ],
    });
    useCharacterStore.setState({ character: char });

    const results = inventorySearch({ keyword: '药' });
    expect(results.length).toBe(2);
    expect(results.map(r => r.name).sort()).toEqual(['毒药瓶', '治疗药水']);
  });

  it('returns empty array when no match', () => {
    const char = makeChar('char1', {
      backpack: [{ name: '治疗药水' }],
    });
    useCharacterStore.setState({ character: char });

    const results = inventorySearch({ keyword: '不存在的物品' });
    expect(results).toEqual([]);
  });

  it('matches description text, not just name', () => {
    const char = makeChar('char1', {
      backpack: [{ name: '神秘瓶子', description: '含剧毒' }],
    });
    useCharacterStore.setState({ character: char });

    const results = inventorySearch({ keyword: '剧毒' });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('神秘瓶子');
  });

  it('returns equipped items too', () => {
    const char = makeChar('char1', {
      equipped: { name: '驱魔剑', description: '对恶魔增伤' },
      backpack: [{ name: '干粮' }],
    });
    useCharacterStore.setState({ character: char });

    const results = inventorySearch({ keyword: '驱魔' });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('驱魔剑');
    expect(results[0].slot).toBe('weapon');
  });

  it('returns all items when keyword is empty', () => {
    const char = makeChar('char1', {
      equipped: { name: '驱魔剑' },
      backpack: [
        { name: '治疗药水' },
        { name: '魔法剑' },
      ],
    });
    useCharacterStore.setState({ character: char });

    const results = inventorySearch({ keyword: '' });
    expect(results).toHaveLength(3);
  });

  it('is case-insensitive (lowercase keyword matches uppercase name)', () => {
    const char = makeChar('char1', {
      backpack: [{ name: 'POTION' }],
    });
    useCharacterStore.setState({ character: char });

    const results = inventorySearch({ keyword: 'potion' });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('POTION');
  });
});
