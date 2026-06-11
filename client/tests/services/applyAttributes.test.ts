import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCharacterStore } from '../../src/stores/characterStore';
import { applyAttributes } from '../../src/services/consequence/applyAttributes';
import { resetClientStores } from '../utils/resetStores';
import type { Character } from '../../src/types/character';

function makeChar(): Character {
  return {
    characterId: 'char1',
    playerId: 'char1',
    name: 'Test',
    race: '人类',
    background: '冒险者',
    appearance: '普通',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    inventory: { equipped: { weapon: null, armor: null, accessory: null }, backpack: [], currency: { gold: 0, silver: 0, copper: 0 } },
    hp: 100, maxHp: 100,
    vital: { hunger: 0, thirst: 0, fatigue: 0, hygiene: 0, morale: 0 },
    reputation: { factions: {}, lastUpdated: 0 },
    conditions: [],
    joinedRegion: 'test',
    joinedWorldDay: 1,
    currentLocalDay: 1,
    lastActionTime: new Date().toISOString(),
    unspentAttributePoints: 0,
    unspentSkillPoints: 0,
  } as unknown as Character;
}

describe('applyAttributes (v0.5.13 业务域 1)', () => {
  beforeEach(() => {
    resetClientStores();
    useCharacterStore.setState({ character: makeChar() });
  });

  it('applies attribute changes', () => {
    applyAttributes({
      attributeChanges: { STR: 2, DEX: -1 },
      identityChanges: undefined,
    });
    const char = useCharacterStore.getState().character;
    expect(char?.attributes.STR).toBe(12);
    expect(char?.attributes.DEX).toBe(9);
  });

  it('clamps attribute to 3..18', () => {
    applyAttributes({ attributeChanges: { STR: 100 }, identityChanges: undefined });
    expect(useCharacterStore.getState().character?.attributes.STR).toBe(18);
  });

  it('applies identity changes', () => {
    applyAttributes({
      attributeChanges: undefined,
      identityChanges: { name: '新名', background: '新背景' },
    });
    const char = useCharacterStore.getState().character;
    expect(char?.name).toBe('新名');
    expect(char?.background).toBe('新背景');
  });

  it('handles both null/undefined (no-op)', () => {
    expect(() => applyAttributes({ attributeChanges: undefined, identityChanges: undefined })).not.toThrow();
  });

  it('isolates errors: attribute fail does not break identity', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Invalid attributeChanges 仍要 apply identity 路径
    applyAttributes({
      attributeChanges: { NONEXISTENT: 5 }, // non-existing attr is silently skipped
      identityChanges: { name: 'AfterError' },
    });
    expect(useCharacterStore.getState().character?.name).toBe('AfterError');
    warnSpy.mockRestore();
  });
});
