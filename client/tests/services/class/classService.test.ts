import { describe, it, expect } from 'vitest';
import { pendingTierChoice, isValidClassNodeId } from '../../../src/services/class/classService';
import type { Character } from '../../../src/types/character';
import type { ClassSkillNode } from '../../../src/types/character';

function makeChar(level: number, classId: string | null, pickedTiers: number[] = []): Character {
  const classSkills: ClassSkillNode[] = [];
  for (const tier of pickedTiers) {
    const slot = 1;
    classSkills.push({ classId: classId!, nodeId: `${classId}_t${tier}_${slot}`, unlockedAt: 1 });
  }
  return {
    characterId: 'c1', playerId: 'p1', name: 'Test', race: 'human', background: '', appearance: '',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    inventory: { items: [], equipped: { weapon: null, armor: null, accessory: null }, currency: { gold: 0, silver: 0, copper: 0 } },
    hp: 30, maxHp: 30,
    vital: { hunger: 50, thirst: 50, fatigue: 50, temperature: 37, morale: 50 },
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    conditions: [], recentHistory: [],
    joinedRegion: '', joinedWorldDay: 1, currentLocalDay: 1, lastActionTime: '',
    level, exp: 0, expToNext: 100, unspentAttributePoints: 0,
    unspentSkillPoints: 0,
    classId, classSkills,
  };
}

describe('pendingTierChoice', () => {
  it('null classId: null', () => {
    expect(pendingTierChoice(makeChar(1, null))).toBeNull();
  });

  it('L1 warrior with no picks: null (T1 auto-picked at class choice)', () => {
    expect(pendingTierChoice(makeChar(1, 'warrior', []))).toBeNull();
  });

  it('L5 warrior with T1 picked: returns 2', () => {
    expect(pendingTierChoice(makeChar(5, 'warrior', [1]))).toBe(2);
  });

  it('L5 warrior with T1+T2 picked: null', () => {
    expect(pendingTierChoice(makeChar(5, 'warrior', [1, 2]))).toBeNull();
  });

  it('L9 warrior with T1 picked: returns 2', () => {
    expect(pendingTierChoice(makeChar(9, 'warrior', [1]))).toBe(2);
  });

  it('L10 warrior with T1+T2 picked: returns 3', () => {
    expect(pendingTierChoice(makeChar(10, 'warrior', [1, 2]))).toBe(3);
  });

  it('L15 warrior with T1+T2+T3 picked: returns 4', () => {
    expect(pendingTierChoice(makeChar(15, 'warrior', [1, 2, 3]))).toBe(4);
  });

  it('L20 warrior with all 4 tiers picked: null', () => {
    expect(pendingTierChoice(makeChar(20, 'warrior', [1, 2, 3, 4]))).toBeNull();
  });

  it('L4 warrior with T1 picked: null (T2 unlocks at L5)', () => {
    expect(pendingTierChoice(makeChar(4, 'warrior', [1]))).toBeNull();
  });
});

describe('isValidClassNodeId', () => {
  it('warrior_t1_1 is valid for warrior', () => {
    expect(isValidClassNodeId('warrior', 'warrior_t1_1')).toBe(true);
  });

  it('warrior_t1_1 is invalid for mage', () => {
    expect(isValidClassNodeId('mage', 'warrior_t1_1')).toBe(false);
  });

  it('unknown classId returns false', () => {
    expect(isValidClassNodeId('rogue', 'rogue_t1_1')).toBe(false);
  });

  it('unknown nodeId returns false', () => {
    expect(isValidClassNodeId('warrior', 'warrior_t5_1')).toBe(false);
  });
});
