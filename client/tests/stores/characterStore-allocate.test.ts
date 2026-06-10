/**
 * characterStore v0.6.4 — allocateAttribute 测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useCharacterStore } from '../../src/stores/characterStore';
import type { Character } from '../../src/types/character';
import { ZERO_RESISTANCES } from '../../src/types/character';

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    characterId: 'c1',
    playerId: 'p1',
    name: 'TestChar',
    race: '人类',
    background: '',
    appearance: '',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    inventory: { items: [], equipped: { weapon: null, armor: null, accessory: null }, currency: { gold: 0, silver: 0, copper: 0 } },
    hp: 30, maxHp: 30,
    vital: { hunger: 50, thirst: 50, fatigue: 50, temperature: 37, morale: 50 },
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    conditions: [],
    joinedRegion: 'r', joinedWorldDay: 1, currentLocalDay: 1,
    lastActionTime: '',
    recentHistory: [],
    level: 1, exp: 0, expToNext: 100, unspentAttributePoints: 3,
    classId: null, classSkills: [],
    elementalResistances: { ...ZERO_RESISTANCES },
    learnedAbilities: [],
    defaultLearnedAbilities: [],
    ...overrides,
  } as Character;
}

beforeEach(() => {
  useCharacterStore.setState({ character: null, isLoaded: false } as any);
});

describe('allocateAttribute', () => {
  it('分配 1 点到 STR: 属性 +1, unspentPoints -1', () => {
    useCharacterStore.getState().setCharacter(makeChar({ unspentAttributePoints: 3 }));
    useCharacterStore.getState().allocateAttribute({ STR: 1 });
    const s = useCharacterStore.getState().character!;
    expect(s.attributes.STR).toBe(11);
    expect(s.unspentAttributePoints).toBe(2);
  });

  it('分配多属性: STR+2, INT+1 (共 3 点)', () => {
    useCharacterStore.getState().setCharacter(makeChar({ unspentAttributePoints: 3 }));
    useCharacterStore.getState().allocateAttribute({ STR: 2, INT: 1 });
    const s = useCharacterStore.getState().character!;
    expect(s.attributes.STR).toBe(12);
    expect(s.attributes.INT).toBe(11);
    expect(s.unspentAttributePoints).toBe(0);
  });

  it('分配总数超过 unspentPoints: 静默 no-op', () => {
    useCharacterStore.getState().setCharacter(makeChar({ unspentAttributePoints: 1 }));
    useCharacterStore.getState().allocateAttribute({ STR: 2 });
    const s = useCharacterStore.getState().character!;
    expect(s.attributes.STR).toBe(10);
    expect(s.unspentAttributePoints).toBe(1);
  });

  it('分配含 0 或负值: 静默 no-op', () => {
    useCharacterStore.getState().setCharacter(makeChar({ unspentAttributePoints: 2 }));
    useCharacterStore.getState().allocateAttribute({ STR: 0, DEX: -1 });
    const s = useCharacterStore.getState().character!;
    expect(s.attributes.STR).toBe(10);
    expect(s.attributes.DEX).toBe(10);
    expect(s.unspentAttributePoints).toBe(2);
  });

  it('character 为 null 时 no-op (不抛错)', () => {
    expect(() => useCharacterStore.getState().allocateAttribute({ STR: 1 })).not.toThrow();
  });

  it('属性值钳制到 [1, 20]', () => {
    useCharacterStore.getState().setCharacter(makeChar({
      attributes: { STR: 19, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      unspentAttributePoints: 5,
    }));
    useCharacterStore.getState().allocateAttribute({ STR: 3 }); // 19+3=22 → clamp to 20
    const s = useCharacterStore.getState().character!;
    expect(s.attributes.STR).toBe(20);
    expect(s.unspentAttributePoints).toBe(4);
  });

  it('空 Partial 分配: no-op', () => {
    useCharacterStore.getState().setCharacter(makeChar({ unspentAttributePoints: 2 }));
    useCharacterStore.getState().allocateAttribute({});
    const s = useCharacterStore.getState().character!;
    expect(s.unspentAttributePoints).toBe(2);
  });
});
