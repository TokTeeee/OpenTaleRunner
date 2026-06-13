import { describe, it, expect } from 'vitest';
import { aggregateClassEffects, computeAttributeBreakdowns, EMPTY_CLASS_BONUS } from '../../../src/services/class/classEffects';
import type { Character, Attributes } from '../../../src/types/character';
import type { ClassSkillNode } from '../../../src/types/character';
import type { Item } from '../../../src/types/item';

const BASE_ATTRS: Attributes = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };

function makeChar(classId: string | null, classSkills: ClassSkillNode[], overrides?: Partial<Character>): Character {
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
    mp: 10, maxMp: 10,
    elementalResistances: { fire: 0, ice: 0, lightning: 0, wind: 0, earth: 0, arcane: 0, holy: 0, shadow: 0 },
    learnedAbilities: [],
    defaultLearnedAbilities: [],
    ...overrides,
  } as Character;
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

describe('computeAttributeBreakdowns', () => {
  const staffWithINT: Item = {
    name: '精良法杖',
    category: 'weapon',
    subCategory: 'staff',
    quality: '精良',
    effects: [
      { id: 'e1', type: 'attribute_mod', value: { INT: 2 }, description: 'INT +2' },
      { id: 'e2', type: 'mp_bonus', value: 5, description: 'MP +5' },
    ],
  };

  const armorWithSTR: Item = {
    name: '力量甲',
    category: 'armor',
    quality: '稀有',
    effects: [
      { id: 'e3', type: 'attribute_mod', value: { STR: 3 }, description: 'STR +3' },
    ],
  };

  it('no equipment no class: base = total, equipment = 0, classTalent = 0', () => {
    const c = makeChar(null, []);
    const bd = computeAttributeBreakdowns(c);
    expect(bd.STR.base).toBe(10);
    expect(bd.STR.equipment).toBe(0);
    expect(bd.STR.classTalent).toBe(0);
    expect(bd.STR.total).toBe(10);
    expect(bd.INT.total).toBe(10);
  });

  it('weapon with INT+2: equipment.INT = 2, total.INT = 12', () => {
    const c = makeChar(null, [], {
      inventory: {
        items: [],
        equipped: { weapon: staffWithINT, armor: null, accessory: null },
        currency: { gold: 0, silver: 0, copper: 0 },
      },
    });
    const bd = computeAttributeBreakdowns(c);
    expect(bd.INT.base).toBe(10);
    expect(bd.INT.equipment).toBe(2);
    expect(bd.INT.classTalent).toBe(0);
    expect(bd.INT.total).toBe(12);
    expect(bd.STR.equipment).toBe(0);
    expect(bd.STR.total).toBe(10);
  });

  it('warrior with STR+1 talent: classTalent.STR = 1, total.STR = 11', () => {
    const c = makeChar('warrior', [{ classId: 'warrior', nodeId: 'warrior_t1_1', unlockedAt: 1 }]);
    const bd = computeAttributeBreakdowns(c);
    expect(bd.STR.base).toBe(10);
    expect(bd.STR.equipment).toBe(0);
    expect(bd.STR.classTalent).toBe(1);
    expect(bd.STR.total).toBe(11);
  });

  it('equipment + classTalent combined: INT base=10, equip+2, talent+1, total=13', () => {
    const c = makeChar('mage', [{ classId: 'mage', nodeId: 'mage_t1_1', unlockedAt: 1 }], {
      inventory: {
        items: [],
        equipped: { weapon: staffWithINT, armor: null, accessory: null },
        currency: { gold: 0, silver: 0, copper: 0 },
      },
    });
    const bd = computeAttributeBreakdowns(c);
    expect(bd.INT.equipment).toBe(2);
    expect(bd.INT.classTalent).toBe(1);
    expect(bd.INT.total).toBe(13);
  });

  it('multiple equipment pieces: STR base=10, armor+3, total=13', () => {
    const c = makeChar(null, [], {
      inventory: {
        items: [],
        equipped: { weapon: null, armor: armorWithSTR, accessory: null },
        currency: { gold: 0, silver: 0, copper: 0 },
      },
    });
    const bd = computeAttributeBreakdowns(c);
    expect(bd.STR.equipment).toBe(3);
    expect(bd.STR.total).toBe(13);
  });
});
