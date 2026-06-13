import { describe, it, expect, beforeEach } from 'vitest';
import { JudgmentSystem } from '../../../src/services/judgment/JudgmentSystem';
import { calculateDiceResult } from '../../../src/utils/dice';
import { useGameStore } from '../../../src/stores/gameStore';
import { useCharacterStore } from '../../../src/stores/characterStore';
import { usePartyStore } from '../../../src/stores/partyStore';
import type { Character } from '../../../src/types/character';

function makeChar(overrides?: Partial<Character>): Character {
  return {
    characterId: 'c1', playerId: 'p1', name: 'Test', race: 'human', background: '', appearance: '',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    inventory: { equipped: { weapon: null, armor: null, accessory: null }, backpack: [], currency: { gold: 0, silver: 0, copper: 0 } },
    hp: 30, maxHp: 30, mp: 10, maxMp: 10,
    vital: { hunger: 50, thirst: 50, fatigue: 50, temperature: 37, morale: 50, hygiene: 50, wound: 0, encumbrance: 0 },
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

describe('JudgmentSystem', () => {
  let judge: JudgmentSystem;

  beforeEach(() => {
    judge = new JudgmentSystem();
    // Reset stores
    useGameStore.setState({ sceneModifier: 0, gameClock: 12, terrain: '平原' });
    useCharacterStore.setState({ character: makeChar() });
    usePartyStore.setState({ members: [] });
  });

  it('returns a DiceResult with sceneModifier = 0 when gameStore.sceneModifier is 0', () => {
    useGameStore.setState({ sceneModifier: 0 });
    const result = judge.evaluate({
      absurdityLevel: 3, difficultyLC: 5,
      reason: 'test', relevantSkill: null, relevantAttribute: 'STR',
    }, makeChar());
    expect(result.sceneModifier).toBe(0);
  });

  it('reads sceneModifier from gameStore (combat scene +3)', () => {
    useGameStore.setState({ sceneModifier: 3 });
    const result = judge.evaluate({
      absurdityLevel: 3, difficultyLC: 5,
      reason: 'combat', relevantSkill: null, relevantAttribute: 'STR',
    }, makeChar());
    expect(result.sceneModifier).toBe(3);
  });

  it('reads sceneModifier from gameStore (rest scene -2)', () => {
    useGameStore.setState({ sceneModifier: -2 });
    const result = judge.evaluate({
      absurdityLevel: 3, difficultyLC: 5,
      reason: 'rest', relevantSkill: null, relevantAttribute: 'STR',
    }, makeChar());
    expect(result.sceneModifier).toBe(-2);
  });

  it('sceneModifier affects finalResult positively', () => {
    useGameStore.setState({ sceneModifier: 0 });
    const result0 = judge.evaluate({
      absurdityLevel: 3, difficultyLC: 5,
      reason: 'test', relevantSkill: null, relevantAttribute: 'STR',
    }, makeChar());

    useGameStore.setState({ sceneModifier: 5 });
    const result5 = judge.evaluate({
      absurdityLevel: 3, difficultyLC: 5,
      reason: 'test', relevantSkill: null, relevantAttribute: 'STR',
    }, makeChar());

    // finalResult = ... + sceneModifier - difficultyLC
    // The difference should be exactly the sceneModifier delta, minus any dice randomness
    // Since dice are random, verify via the stored sceneModifier field + formula:
    // result5.finalResult = dice5 + attrMod + skill + equip + 5 - cond - night - LC
    // result0.finalResult = dice0 + attrMod + skill + equip + 0 - cond - night - LC
    // diff = (dice5 - dice0) + 5
    // So: result5.finalResult - result0.finalResult - 5 = dice5 - dice0
    const diceDiff = (result5.finalResult - result0.finalResult) - 5;
    // diceDiff should be in range [-10, +10] (2d6 each, max diff 10)
    expect(Math.abs(diceDiff)).toBeLessThanOrEqual(10);
  });

  it('sceneModifier affects finalResult negatively', () => {
    useGameStore.setState({ sceneModifier: 0 });
    const result0 = judge.evaluate({
      absurdityLevel: 3, difficultyLC: 5,
      reason: 'test', relevantSkill: null, relevantAttribute: 'STR',
    }, makeChar());

    useGameStore.setState({ sceneModifier: -3 });
    const resultNeg = judge.evaluate({
      absurdityLevel: 3, difficultyLC: 5,
      reason: 'test', relevantSkill: null, relevantAttribute: 'STR',
    }, makeChar());

    // diff = (diceNeg - dice0) + (-3)
    const diceDiff = (resultNeg.finalResult - result0.finalResult) + 3;
    expect(Math.abs(diceDiff)).toBeLessThanOrEqual(10);
  });

  it('sceneModifier can change outcome tier', () => {
    // Use a character with low attributes to make outcome sensitive to sceneModifier
    const weakChar = makeChar({ attributes: { STR: 3, DEX: 3, CON: 3, INT: 3, WIS: 3, CHA: 3 } });

    useGameStore.setState({ sceneModifier: -5 });
    const resultNeg = judge.evaluate({
      absurdityLevel: 3, difficultyLC: 5,
      reason: 'test', relevantSkill: null, relevantAttribute: 'STR',
    }, weakChar);

    useGameStore.setState({ sceneModifier: 10 });
    const resultPos = judge.evaluate({
      absurdityLevel: 3, difficultyLC: 5,
      reason: 'test', relevantSkill: null, relevantAttribute: 'STR',
    }, weakChar);

    // Positive sceneModifier should produce a better or equal outcome
    const outcomeRank = { critical_failure: 0, failure: 1, partial_success: 2, success: 3, critical_success: 4 };
    expect(outcomeRank[resultPos.outcome]).toBeGreaterThanOrEqual(outcomeRank[resultNeg.outcome]);
  });

  it('sceneModifier is independent of nightPenalty', () => {
    // Night time + no light = nightPenalty
    useGameStore.setState({ sceneModifier: 3, gameClock: 22, terrain: '平原' });
    const result = judge.evaluate({
      absurdityLevel: 3, difficultyLC: 5,
      reason: 'test', relevantSkill: null, relevantAttribute: 'STR',
    }, makeChar());

    // sceneModifier should be 3, nightPenalty should be > 0
    expect(result.sceneModifier).toBe(3);
    expect((result.nightPenalty ?? 0)).toBeGreaterThan(0);
  });
});

describe('calculateDiceResult: sceneModifier integration', () => {
  it('sceneModifier +5 increases finalResult by exactly 5 (deterministic)', () => {
    const base = calculateDiceResult([3, 4], 0, 0, 0, 0, 5, 0, 0, []);
    const withMod = calculateDiceResult([3, 4], 0, 0, 0, 5, 5, 0, 0, []);
    expect(withMod.finalResult - base.finalResult).toBe(5);
  });

  it('sceneModifier -3 decreases finalResult by exactly 3 (deterministic)', () => {
    const base = calculateDiceResult([3, 4], 0, 0, 0, 0, 5, 0, 0, []);
    const withMod = calculateDiceResult([3, 4], 0, 0, 0, -3, 5, 0, 0, []);
    expect(base.finalResult - withMod.finalResult).toBe(3);
  });

  it('sceneModifier is stored in DiceResult.sceneModifier', () => {
    const result = calculateDiceResult([3, 4], 0, 0, 0, 7, 5, 0, 0, []);
    expect(result.sceneModifier).toBe(7);
  });

  it('sceneModifier = 0 is the default (no effect)', () => {
    const result = calculateDiceResult([3, 4], 0, 0, 0, 0, 5, 0, 0, []);
    expect(result.sceneModifier).toBe(0);
    // finalResult = (dice(7) + attrMod(-5) + skill(0) + equip(0) + scene(0) - cond(0) - night(0)) - LC(5)
    // = (7 - 5) - 5 = -3
    expect(result.finalResult).toBe(-3);
  });
});
