import { describe, it, expect } from 'vitest';
import { aggregateClassEffects, EMPTY_CLASS_BONUS } from '../../../src/services/class/classEffects';
import type { Character, Attributes } from '../../../src/types/character';
import type { ClassSkillNode } from '../../../src/types/character';

const BASE_ATTRS: Attributes = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };

function makeChar(classId: string | null, classSkills: ClassSkillNode[]): Character {
  return {
    characterId: 'c1', playerId: 'p1', name: 'Test', race: 'human', background: '', appearance: '',
    attributes: BASE_ATTRS, skills: [],
    inventory: { items: [], equipped: { weapon: null, armor: null, accessory: null }, currency: { gold: 0, silver: 0, copper: 0 } },
    hp: 30, maxHp: 30,
    vital: { hunger: 50, thirst: 50, fatigue: 50, temperature: 37, morale: 50 },
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    conditions: [], recentHistory: [],
    joinedRegion: '', joinedWorldDay: 1, currentLocalDay: 1, lastActionTime: '',
    level: 1, exp: 0, expToNext: 100, unspentAttributePoints: 0,
    unspentSkillPoints: 0,
    classId, classSkills,
  };
}

describe('aggregateClassEffects', () => {
  it('no classId: returns EMPTY_CLASS_BONUS', () => {
    const c = makeChar(null, []);
    expect(aggregateClassEffects(c)).toEqual(EMPTY_CLASS_BONUS);
  });

  it('invalid classId: returns EMPTY_CLASS_BONUS', () => {
    const c = makeChar('rogue', []);
    expect(aggregateClassEffects(c)).toEqual(EMPTY_CLASS_BONUS);
  });

  it('warrior_t1_1 (STR+1): adds 1 to attributeMods.STR', () => {
    const c = makeChar('warrior', [{ classId: 'warrior', nodeId: 'warrior_t1_1', unlockedAt: 1 }]);
    expect(aggregateClassEffects(c).attributeMods.STR).toBe(1);
  });

  it('warrior_t1_2 (HP+5): adds 5 to hpMaxBonus', () => {
    const c = makeChar('warrior', [{ classId: 'warrior', nodeId: 'warrior_t1_2', unlockedAt: 1 }]);
    expect(aggregateClassEffects(c).hpMaxBonus).toBe(5);
  });

  it('warrior_t1_3 (伤害+10%): adds 0.1 to damageModifier', () => {
    const c = makeChar('warrior', [{ classId: 'warrior', nodeId: 'warrior_t1_3', unlockedAt: 1 }]);
    expect(aggregateClassEffects(c).damageModifier).toBeCloseTo(0.1);
  });

  it('multiple nodes accumulate', () => {
    const c = makeChar('warrior', [
      { classId: 'warrior', nodeId: 'warrior_t1_3', unlockedAt: 1 },
      { classId: 'warrior', nodeId: 'warrior_t2_3', unlockedAt: 5 },
    ]);
    expect(aggregateClassEffects(c).damageModifier).toBeCloseTo(0.25);
  });

  it('all 12 warrior nodes: full bonus', () => {
    const nodes = [
      'warrior_t1_1','warrior_t1_2','warrior_t1_3',
      'warrior_t2_1','warrior_t2_2','warrior_t2_3',
      'warrior_t3_1','warrior_t3_2','warrior_t3_3',
      'warrior_t4_1','warrior_t4_2','warrior_t4_3',
    ];
    const c = makeChar('warrior', nodes.map((n) => ({ classId: 'warrior', nodeId: n, unlockedAt: 1 })));
    const b = aggregateClassEffects(c);
    expect(b.attributeMods.STR).toBe(4);
    expect(b.attributeMods.CON).toBe(2);
    expect(b.hpMaxBonus).toBe(28);
    expect(b.damageModifier).toBeCloseTo(0.7);
    expect(b.dodgeThresholdBonus).toBe(-2);
    expect(b.expBonus).toBeCloseTo(0.1);
  });

  it('cross-class node: defensive skip (returns no bonus from it)', () => {
    const c = makeChar('warrior', [{ classId: 'warrior', nodeId: 'mage_t1_1', unlockedAt: 1 }]);
    expect(aggregateClassEffects(c)).toEqual(EMPTY_CLASS_BONUS);
  });
});
