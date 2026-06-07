import { describe, it, expect, beforeEach } from 'vitest';
import { useCharacterStore } from '../../src/stores/characterStore';
import type { Character, Attributes } from '../../src/types/character';

const BASE_ATTRS: Attributes = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    characterId: 'c1',
    playerId: 'p1',
    name: 'TestChar',
    race: '人类',
    background: '为了测',
    appearance: '',
    attributes: { ...BASE_ATTRS },
    skills: [],
    inventory: { items: [], equipped: { weapon: null, armor: null, accessory: null }, currency: { gold: 0, silver: 0, copper: 0 } },
    hp: 30, maxHp: 30,
    vital: { hunger: 50, thirst: 50, fatigue: 50, temperature: 37, morale: 50 },
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    conditions: [],
    joinedRegion: 'royal_plains',
    joinedWorldDay: 1,
    currentLocalDay: 1,
    lastActionTime: '2026-01-01T00:00:00Z',
    recentHistory: [],
    level: 1, exp: 0, expToNext: 100, unspentAttributePoints: 0,
    classId: null, classSkills: [],
    ...overrides,
  };
}

describe('characterStore — v0.5.1 attribute clamp [1, 20]', () => {
  beforeEach(() => useCharacterStore.setState({ character: makeChar(), isLoaded: true }));

  it('clamps STR above 20', () => {
    useCharacterStore.getState().updateAttributes({ STR: 25 });
    expect(useCharacterStore.getState().character!.attributes.STR).toBe(20);
  });

  it('clamps STR below 1', () => {
    useCharacterStore.getState().updateAttributes({ STR: -3 });
    expect(useCharacterStore.getState().character!.attributes.STR).toBe(1);
  });

  it('leaves value in range untouched', () => {
    useCharacterStore.getState().updateAttributes({ STR: 15 });
    expect(useCharacterStore.getState().character!.attributes.STR).toBe(15);
  });
});

describe('characterStore — applyServerExpGrant', () => {
  beforeEach(() => useCharacterStore.setState({ character: makeChar(), isLoaded: true }));

  it('updates level/exp/expToNext/unspentAttributePoints atomically', () => {
    useCharacterStore.getState().applyServerExpGrant({
      level: 3, exp: 200, expToNext: 1852, unspentAttributePoints: 2,
    });
    const c = useCharacterStore.getState().character!;
    expect(c.level).toBe(3);
    expect(c.exp).toBe(200);
    expect(c.expToNext).toBe(1852);
    expect(c.unspentAttributePoints).toBe(2);
  });

  it('no-op when no character is loaded', () => {
    useCharacterStore.setState({ character: null, isLoaded: false });
    useCharacterStore.getState().applyServerExpGrant({ level: 5, exp: 0, expToNext: 0, unspentAttributePoints: 4 });
    expect(useCharacterStore.getState().character).toBeNull();
  });
});
