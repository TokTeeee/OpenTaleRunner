import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCharacterStore } from '../../src/stores/characterStore';
import { applyReputation } from '../../src/services/consequence/applyReputation';
import { resetClientStores } from '../utils/resetStores';
import type { Character } from '../../src/types/character';

function makeChar(): Character {
  return {
    characterId: 'char1',
    playerId: 'char1',
    name: 'Test',
    race: '人类',
    background: '',
    appearance: '',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    inventory: { equipped: { weapon: null, armor: null, accessory: null }, backpack: [], currency: { gold: 100, silver: 50, copper: 20 } },
    hp: 100, maxHp: 100,
    vital: { hunger: 0, thirst: 0, fatigue: 0, hygiene: 0, morale: 0 },
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: { faction1: 0, faction2: 0 } },
    conditions: [],
    joinedRegion: 'test',
    joinedWorldDay: 1,
    currentLocalDay: 1,
    lastActionTime: new Date().toISOString(),
  } as unknown as Character;
}

describe('applyReputation (v0.5.13 业务域 4)', () => {
  beforeEach(() => {
    resetClientStores();
    useCharacterStore.setState({ character: makeChar() });
  });

  it('applies global reputation change (goodness)', () => {
    applyReputation({ reputationChange: { goodness: 5 }, currencyChange: undefined });
    expect(useCharacterStore.getState().character?.reputation.goodness).toBe(5);
  });

  it('applies regional reputation change', () => {
    applyReputation({ reputationChange: { faction1: 10, faction2: -3 }, currencyChange: undefined });
    const r = useCharacterStore.getState().character?.reputation;
    expect(r?.regional?.faction1).toBe(10);
    expect(r?.regional?.faction2).toBe(-3);
  });

  it('redirects charisma key to CHA attribute (P5 fix)', () => {
    applyReputation({ reputationChange: { charisma: 3 }, currencyChange: undefined });
    const char = useCharacterStore.getState().character;
    expect(char?.attributes.CHA).toBe(13);
  });

  it('applies currency change (gold/silver/copper)', () => {
    applyReputation({ reputationChange: undefined, currencyChange: { gold: 50, silver: -10, copper: 100 } });
    const c = useCharacterStore.getState().character?.inventory.currency;
    expect(c?.gold).toBe(150);
    expect(c?.silver).toBe(40);
    expect(c?.copper).toBe(120);
  });

  it('handles both null (no-op)', () => {
    expect(() => applyReputation({ reputationChange: undefined, currencyChange: undefined })).not.toThrow();
  });

  it('isolates errors via try/catch', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Empty reputationChange object should not break
    applyReputation({ reputationChange: {}, currencyChange: undefined });
    warnSpy.mockRestore();
  });
});
