import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCharacterStore } from '../../src/stores/characterStore';
import { useItemRegistryStore } from '../../src/stores/itemRegistryStore';
import { useCodexStore } from '../../src/stores/codexStore';
import { applyConsequences } from '../../src/services/consequence/applyConsequences';
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
    inventory: { equipped: { weapon: null, armor: null, accessory: null }, backpack: [], currency: { gold: 0, silver: 0, copper: 0 } },
    hp: 100, maxHp: 100,
    vital: { hunger: 0, thirst: 0, fatigue: 0, hygiene: 0, morale: 0 },
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    conditions: [],
    joinedRegion: 'test',
    joinedWorldDay: 1,
    currentLocalDay: 1,
    currentRegion: 'test',
    lastActionTime: new Date().toISOString(),
    unspentAttributePoints: 0,
    unspentSkillPoints: 0,
  } as unknown as Character;
}

describe('applyConsequences integration (v0.5.13)', () => {
  beforeEach(() => {
    resetClientStores();
    useCharacterStore.setState({ character: makeChar() });
    useItemRegistryStore.setState({ registry: new Map() } as never);
    useCodexStore.getState().reset?.();
  });

  it('applies all 5 business domains in order', () => {
    const result = applyConsequences({
      attributeChanges: { STR: 1 },
      identityChanges: undefined,
      conditionsAdded: ['buff'],
      conditionsRemoved: [],
      skillsModified: [{ skillId: 'sword', levelChange: 1 }],
      reputationChange: { faction1: 5 },
      currencyChange: { gold: 100 },
      itemsGained: [{ name: '剑', category: 'weapon', quality: '普通' }],
      itemsLost: [],
      itemsModified: [],
    } as never);
    expect(result?.newDiscoveries).toHaveLength(1);
    const char = useCharacterStore.getState().character;
    expect(char?.attributes.STR).toBe(11);
    expect(char?.conditions).toContain('buff');
    expect(char?.skills).toBeDefined();
    expect(char?.reputation.regional?.faction1).toBe(5);
    expect(char?.inventory.currency.gold).toBe(100);
    expect(char?.inventory.backpack).toHaveLength(1);
  });

  it('continues after one domain throws (error isolation)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // 即使某域失败,后续域仍跑. 这里通过 conditionsAdded 是 ['xxx'] (valid) 验证
    applyConsequences({
      attributeChanges: null,
      identityChanges: null,
      conditionsAdded: ['c1'],
      conditionsRemoved: [],
      skillsModified: null,
      reputationChange: null,
      currencyChange: null,
      itemsGained: [],
      itemsLost: [],
      itemsModified: [],
    } as never);
    expect(useCharacterStore.getState().character?.conditions).toEqual(['c1']);
    warnSpy.mockRestore();
  });

  it('returns undefined when no character loaded', () => {
    useCharacterStore.setState({ character: null });
    const result = applyConsequences({} as never);
    expect(result).toBeUndefined();
  });

  it('returns undefined when cons is null/undefined', () => {
    expect(applyConsequences(null as never)).toBeUndefined();
    expect(applyConsequences(undefined as never)).toBeUndefined();
  });
});
