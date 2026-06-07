import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCharacterStore } from '../../src/stores/characterStore';
import { applyConditions } from '../../src/services/consequence/applyConditions';
import { resetClientStores } from '../utils/resetStores';
import type { Character } from '../../src/types/character';

function makeChar(conditions: string[] = []): Character {
  return {
    characterId: 'char1',
    playerId: 'char1',
    name: 'Test',
    race: '人类',
    background: '',
    appearance: '',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    inventory: { equipped: { weapon: null, armor: null, accessory: null }, backpack: [], currency: { gold: 0, silver: 0, copper: 0 } },
    hp: 100, maxHp: 100,
    vital: { hunger: 0, thirst: 0, fatigue: 0, hygiene: 0, morale: 0 },
    reputation: { factions: {}, lastUpdated: 0 },
    conditions,
    joinedRegion: 'test',
    joinedWorldDay: 1,
    currentLocalDay: 1,
    lastActionTime: new Date().toISOString(),
  } as unknown as Character;
}

describe('applyConditions (v0.5.13 业务域 2)', () => {
  beforeEach(() => {
    resetClientStores();
    useCharacterStore.setState({ character: makeChar() });
  });

  it('adds conditions', () => {
    applyConditions({ conditionsAdded: ['poisoned', 'stunned'], conditionsRemoved: [] });
    expect(useCharacterStore.getState().character?.conditions).toEqual(['poisoned', 'stunned']);
  });

  it('removes conditions', () => {
    useCharacterStore.setState({ character: makeChar(['poisoned', 'stunned']) });
    applyConditions({ conditionsAdded: [], conditionsRemoved: ['poisoned'] });
    expect(useCharacterStore.getState().character?.conditions).toEqual(['stunned']);
  });

  it('deduplicates adds (existing condition not re-added)', () => {
    useCharacterStore.setState({ character: makeChar(['poisoned']) });
    applyConditions({ conditionsAdded: ['poisoned', 'stunned'], conditionsRemoved: [] });
    expect(useCharacterStore.getState().character?.conditions).toEqual(['poisoned', 'stunned']);
  });

  it('handles both empty (no-op)', () => {
    expect(() => applyConditions({ conditionsAdded: [], conditionsRemoved: [] })).not.toThrow();
  });

  it('isolates errors via try/catch', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // removeCondition 找不到的不报错,内部已 try/catch
    applyConditions({ conditionsAdded: ['c1'], conditionsRemoved: ['nonexistent'] });
    expect(useCharacterStore.getState().character?.conditions).toEqual(['c1']);
    warnSpy.mockRestore();
  });
});
