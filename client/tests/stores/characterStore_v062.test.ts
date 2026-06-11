/**
 * characterStore v0.6.2 测试 — 默认值 + ability mutators + resistance mutator
 *
 * 覆盖:
 * - 默认 character = null (初始 state)
 * - setCharacter 后, 默认 initial state 的新字段也保留
 * - learnAbility(id): 添加到 learnedAbilities (按 ability 的 school)
 * - learnAbility 重复: 幂等, 不重复添加
 * - forgetAbility(id): 从 learnedAbilities 移除
 * - setResistance(element, value): 钳制到 [-100, 100]
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useCharacterStore } from '../../src/stores/characterStore';
import { ZERO_RESISTANCES, type Character, type Element } from '../../src/types/character';

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
    level: 1, exp: 0, expToNext: 100, unspentAttributePoints: 0,
    unspentSkillPoints: 0,
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

describe('characterStore v0.6.2 — 默认值 + mutators', () => {
  it('初始 state 的 character = null (无默认角色)', () => {
    const s = useCharacterStore.getState();
    expect(s.character).toBeNull();
  });

  it('setCharacter 后, 新字段 (抗性/abilities) 从传入值保留', () => {
    const char = makeChar({
      elementalResistances: { ...ZERO_RESISTANCES, fire: 25, ice: -10 },
      learnedAbilities: [{ abilityId: 'spell_fire_bolt', school: 'magic', learnedAt: 1 }],
      defaultLearnedAbilities: ['spell_fire_bolt'],
    });
    useCharacterStore.getState().setCharacter(char);
    const s = useCharacterStore.getState();
    expect(s.character?.elementalResistances.fire).toBe(25);
    expect(s.character?.elementalResistances.ice).toBe(-10);
    expect(s.character?.learnedAbilities.length).toBe(1);
    expect(s.character?.defaultLearnedAbilities).toEqual(['spell_fire_bolt']);
  });

  describe('learnAbility', () => {
    it('添加 ability 到 learnedAbilities, 用 ability 的真实 school', () => {
      useCharacterStore.getState().setCharacter(makeChar());
      useCharacterStore.getState().learnAbility('spell_fire_bolt');  // school: 'magic'
      const s = useCharacterStore.getState();
      expect(s.character?.learnedAbilities).toEqual([
        expect.objectContaining({ abilityId: 'spell_fire_bolt', school: 'magic' }),
      ]);
    });

    it('对未注册的 abilityId 也能添加 (fallback school: magic)', () => {
      useCharacterStore.getState().setCharacter(makeChar());
      useCharacterStore.getState().learnAbility('spell_unknown_xyz');
      const s = useCharacterStore.getState();
      expect(s.character?.learnedAbilities.length).toBe(1);
      expect(s.character?.learnedAbilities[0].school).toBe('magic');  // fallback
    });

    it('重复 learnAbility 幂等, 不添加重复项', () => {
      useCharacterStore.getState().setCharacter(makeChar());
      useCharacterStore.getState().learnAbility('spell_fire_bolt');
      useCharacterStore.getState().learnAbility('spell_fire_bolt');
      useCharacterStore.getState().learnAbility('spell_fire_bolt');
      expect(useCharacterStore.getState().character?.learnedAbilities.length).toBe(1);
    });

    it('character 为 null 时 learnAbility 是 no-op (不抛错)', () => {
      expect(() => useCharacterStore.getState().learnAbility('spell_fire_bolt')).not.toThrow();
      expect(useCharacterStore.getState().character).toBeNull();
    });
  });

  describe('forgetAbility', () => {
    it('从 learnedAbilities 移除指定 abilityId', () => {
      useCharacterStore.getState().setCharacter(makeChar({
        learnedAbilities: [
          { abilityId: 'spell_fire_bolt', school: 'magic', learnedAt: 1 },
          { abilityId: 'prayer_holy_heal', school: 'prayer', learnedAt: 2 },
        ],
      }));
      useCharacterStore.getState().forgetAbility('spell_fire_bolt');
      const s = useCharacterStore.getState();
      expect(s.character?.learnedAbilities).toEqual([
        { abilityId: 'prayer_holy_heal', school: 'prayer', learnedAt: 2 },
      ]);
    });

    it('forget 不存在的 abilityId 是 no-op', () => {
      useCharacterStore.getState().setCharacter(makeChar());
      expect(() => useCharacterStore.getState().forgetAbility('spell_xyz')).not.toThrow();
      expect(useCharacterStore.getState().character?.learnedAbilities.length).toBe(0);
    });

    it('character 为 null 时 forgetAbility 是 no-op', () => {
      expect(() => useCharacterStore.getState().forgetAbility('spell_fire_bolt')).not.toThrow();
    });
  });

  describe('setResistance', () => {
    it('设置元素抗性, 不超界 (-100 ~ 100)', () => {
      useCharacterStore.getState().setCharacter(makeChar());
      useCharacterStore.getState().setResistance('fire', 30);
      expect(useCharacterStore.getState().character?.elementalResistances.fire).toBe(30);
    });

    it('setResistance 钳制到 [-100, 100]', () => {
      useCharacterStore.getState().setCharacter(makeChar());
      useCharacterStore.getState().setResistance('fire', 200);
      expect(useCharacterStore.getState().character?.elementalResistances.fire).toBe(100);
      useCharacterStore.getState().setResistance('ice', -200);
      expect(useCharacterStore.getState().character?.elementalResistances.ice).toBe(-100);
    });

    it('setResistance 不影响其他元素', () => {
      useCharacterStore.getState().setCharacter(makeChar());
      useCharacterStore.getState().setResistance('fire', 50);
      const r = useCharacterStore.getState().character?.elementalResistances;
      if (!r) throw new Error('expected resistances set');
      expect(r.fire).toBe(50);
      expect(r.ice).toBe(0);
      expect(r.holy).toBe(0);
    });

    it('character 为 null 时 setResistance 是 no-op', () => {
      expect(() => useCharacterStore.getState().setResistance('fire', 50)).not.toThrow();
    });

    it('支持 8 元素', () => {
      useCharacterStore.getState().setCharacter(makeChar());
      const allEls: Element[] = ['fire', 'ice', 'lightning', 'wind', 'earth', 'arcane', 'holy', 'shadow'];
      for (const el of allEls) {
        useCharacterStore.getState().setResistance(el, 10);
      }
      const r = useCharacterStore.getState().character?.elementalResistances;
      if (!r) throw new Error('expected resistances set');
      for (const el of allEls) {
        expect(r[el]).toBe(10);
      }
    });
  });
});
