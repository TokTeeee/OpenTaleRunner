/**
 * characterStore v0.6.4b — learnAbilityWithPoint + unspentSkillPoints 测试
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
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 14, WIS: 12, CHA: 10 },
    skills: [],
    inventory: { items: [], equipped: { weapon: null, armor: null, accessory: null }, currency: { gold: 0, silver: 0, copper: 0 } },
    hp: 30, maxHp: 30, mp: 10, maxMp: 10,
    vital: { hunger: 50, thirst: 50, fatigue: 50, temperature: 37, morale: 50 },
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    conditions: [],
    joinedRegion: 'r', joinedWorldDay: 1, currentLocalDay: 1,
    lastActionTime: '',
    recentHistory: [],
    level: 3, exp: 0, expToNext: 100, unspentAttributePoints: 0, unspentSkillPoints: 2,
    classId: 'mage', classSkills: [],
    elementalResistances: { ...ZERO_RESISTANCES },
    learnedAbilities: [],
    defaultLearnedAbilities: [],
    ...overrides,
  } as Character;
}

beforeEach(() => {
  useCharacterStore.setState({ character: null, isLoaded: false } as any);
});

describe('learnAbilityWithPoint', () => {
  it('消耗 1 技能点学习 ability', () => {
    useCharacterStore.getState().setCharacter(makeChar({ unspentSkillPoints: 2 }));
    useCharacterStore.getState().learnAbilityWithPoint('spell_fire_bolt');
    const s = useCharacterStore.getState().character!;
    expect(s.learnedAbilities.some((la) => la.abilityId === 'spell_fire_bolt')).toBe(true);
    expect(s.unspentSkillPoints).toBe(1);
  });

  it('技能点不足时 no-op', () => {
    useCharacterStore.getState().setCharacter(makeChar({ unspentSkillPoints: 0 }));
    useCharacterStore.getState().learnAbilityWithPoint('spell_fire_bolt');
    const s = useCharacterStore.getState().character!;
    expect(s.learnedAbilities.length).toBe(0);
    expect(s.unspentSkillPoints).toBe(0);
  });

  it('已学过时 no-op (幂等)', () => {
    useCharacterStore.getState().setCharacter(makeChar({
      unspentSkillPoints: 2,
      learnedAbilities: [{ abilityId: 'spell_fire_bolt', school: 'magic', learnedAt: 1 }],
    }));
    useCharacterStore.getState().learnAbilityWithPoint('spell_fire_bolt');
    const s = useCharacterStore.getState().character!;
    expect(s.unspentSkillPoints).toBe(2);
  });

  it('不满足学习条件时 no-op', () => {
    useCharacterStore.getState().setCharacter(makeChar({
      attributes: { STR: 10, DEX: 10, CON: 10, INT: 8, WIS: 10, CHA: 10 },
      unspentSkillPoints: 2,
    }));
    useCharacterStore.getState().learnAbilityWithPoint('spell_fire_bolt');
    const s = useCharacterStore.getState().character!;
    expect(s.learnedAbilities.length).toBe(0);
    expect(s.unspentSkillPoints).toBe(2);
  });

  it('character 为 null 时 no-op', () => {
    expect(() => useCharacterStore.getState().learnAbilityWithPoint('spell_fire_bolt')).not.toThrow();
  });
});

describe('unspentSkillPoints 在 applyServerExpGrant 中同步', () => {
  it('applyServerExpGrant 同步 unspentSkillPoints', () => {
    useCharacterStore.getState().setCharacter(makeChar({ unspentSkillPoints: 0 }));
    useCharacterStore.getState().applyServerExpGrant({
      level: 4, exp: 10, expToNext: 200, unspentAttributePoints: 1, unspentSkillPoints: 1,
    });
    const s = useCharacterStore.getState().character!;
    expect(s.unspentSkillPoints).toBe(1);
  });
});
