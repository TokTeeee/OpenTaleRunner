import { describe, it, expect, beforeEach } from 'vitest';
import { useCharacterStore } from '../../src/stores/characterStore';
import type { Character, Attributes } from '../../src/types/character';

const BASE_ATTRS: Attributes = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };

function makeChar(overrides?: Partial<Character>): Character {
  return {
    characterId: 'c1', playerId: 'p1', name: 'Test', race: 'human', background: '', appearance: '',
    attributes: { ...BASE_ATTRS }, skills: [],
    inventory: { items: [], equipped: { weapon: null, armor: null, accessory: null }, currency: { gold: 0, silver: 0, copper: 0 } },
    hp: 30, maxHp: 30, mp: 10, maxMp: 10,
    vital: { hunger: 50, thirst: 50, fatigue: 50, temperature: 37, morale: 50 },
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    conditions: [], recentHistory: [],
    joinedRegion: '', joinedWorldDay: 1, currentLocalDay: 1, lastActionTime: '',
    level: 1, exp: 0, expToNext: 100, unspentAttributePoints: 0, unspentSkillPoints: 0,
    classId: null, classSkills: [],
    elementalResistances: { fire: 0, ice: 0, lightning: 0, wind: 0, earth: 0, arcane: 0, holy: 0, shadow: 0 },
    learnedAbilities: [], defaultLearnedAbilities: [],
    ...overrides,
  } as Character;
}

describe('setCharacter migration: strip equipment attribute_mod from attributes', () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null, isLoaded: false });
  });

  it('no equipment: attributes unchanged', () => {
    const char = makeChar();
    useCharacterStore.getState().setCharacter(char);
    const loaded = useCharacterStore.getState().character!;
    expect(loaded.attributes.INT).toBe(10);
    expect(loaded.attributes.STR).toBe(10);
  });

  it('weapon with INT+2: attributes.INT reduced by 2 (strip old baked-in bonus)', () => {
    const weapon = {
      name: '法杖', category: 'weapon' as const, quality: '精良' as const,
      effects: [{ id: 'e1', type: 'attribute_mod', value: { INT: 2 }, description: 'INT +2' }],
    };
    // 模拟旧版数据: attributes.INT = 12 (base 10 + 装备 2 已揉入)
    const char = makeChar({
      attributes: { ...BASE_ATTRS, INT: 12 },
      inventory: {
        items: [],
        equipped: { weapon: weapon as any, armor: null, accessory: null },
        currency: { gold: 0, silver: 0, copper: 0 },
      },
    });
    useCharacterStore.getState().setCharacter(char);
    const loaded = useCharacterStore.getState().character!;
    // 迁移后 INT 应还原为 10 (12 - 2)
    expect(loaded.attributes.INT).toBe(10);
  });

  it('multiple equipment: all attribute_mod stripped', () => {
    const weapon = {
      name: '法杖', category: 'weapon' as const, quality: '精良' as const,
      effects: [{ id: 'e1', type: 'attribute_mod', value: { INT: 2 }, description: 'INT +2' }],
    };
    const armor = {
      name: '力量甲', category: 'armor' as const, quality: '稀有' as const,
      effects: [{ id: 'e2', type: 'attribute_mod', value: { STR: 3 }, description: 'STR +3' }],
    };
    // 旧版数据: INT=12, STR=13 (含装备加成)
    const char = makeChar({
      attributes: { ...BASE_ATTRS, INT: 12, STR: 13 },
      inventory: {
        items: [],
        equipped: { weapon: weapon as any, armor: armor as any, accessory: null },
        currency: { gold: 0, silver: 0, copper: 0 },
      },
    });
    useCharacterStore.getState().setCharacter(char);
    const loaded = useCharacterStore.getState().character!;
    expect(loaded.attributes.INT).toBe(10);
    expect(loaded.attributes.STR).toBe(10);
  });

  it('non-attribute_mod effects (elemental_resist, mp_bonus) not affected', () => {
    const weapon = {
      name: '法杖', category: 'weapon' as const, quality: '精良' as const,
      effects: [
        { id: 'e1', type: 'attribute_mod', value: { INT: 2 }, description: 'INT +2' },
        { id: 'e2', type: 'mp_bonus', value: 5, description: 'MP +5' },
      ],
    };
    const char = makeChar({
      attributes: { ...BASE_ATTRS, INT: 12 },
      inventory: {
        items: [],
        equipped: { weapon: weapon as any, armor: null, accessory: null },
        currency: { gold: 0, silver: 0, copper: 0 },
      },
    });
    useCharacterStore.getState().setCharacter(char);
    const loaded = useCharacterStore.getState().character!;
    expect(loaded.attributes.INT).toBe(10);
    // mp_bonus 不影响 attributes
    expect(loaded.attributes.WIS).toBe(10);
  });
});
