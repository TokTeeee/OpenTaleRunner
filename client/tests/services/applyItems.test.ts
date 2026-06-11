import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useItemRegistryStore } from '../../src/stores/itemRegistryStore';
import { useCodexStore } from '../../src/stores/codexStore';
import { useCharacterStore } from '../../src/stores/characterStore';
import { applyItems } from '../../src/services/consequence/applyItems';
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
    reputation: { factions: {}, lastUpdated: 0 },
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

describe('applyItems (v0.5.13 业务域 5)', () => {
  beforeEach(() => {
    resetClientStores();
    useCharacterStore.setState({ character: makeChar() });
    useItemRegistryStore.setState({ registry: new Map() } as never);
    useCodexStore.getState().reset?.();
  });

  it('gained: registers new item + records discovery', () => {
    const discoveries = applyItems({
      itemsGained: [{ name: '治疗药水', category: 'consumable', quality: '普通', quantity: 1 }],
      itemsLost: [],
      itemsModified: [],
    });
    expect(discoveries).toHaveLength(1);
    expect(discoveries[0].itemName).toBe('治疗药水');
  });

  it('gained: returns empty discoveries on second pick (already known)', () => {
    applyItems({ itemsGained: [{ name: '治疗药水' }], itemsLost: [], itemsModified: [] });
    const second = applyItems({ itemsGained: [{ name: '治疗药水' }], itemsLost: [], itemsModified: [] });
    expect(second).toHaveLength(0);
  });

  it('lost: removes from registry when full quantity lost', () => {
    applyItems({ itemsGained: [{ name: '剑', category: 'weapon', quality: '普通' }], itemsLost: [], itemsModified: [] });
    applyItems({ itemsGained: [], itemsLost: [{ name: '剑' }], itemsModified: [] });
    const char = useCharacterStore.getState().character;
    expect(char?.inventory.backpack).toHaveLength(0);
  });

  it('lost: reduces quantity for partial loss', () => {
    applyItems({ itemsGained: [{ name: '箭矢', category: 'consumable', quantity: 10 }], itemsLost: [], itemsModified: [] });
    applyItems({ itemsGained: [], itemsLost: [{ name: '箭矢', quantity: 3 }], itemsModified: [] });
    const char = useCharacterStore.getState().character;
    expect(char?.inventory.backpack[0].quantity).toBe(7);
  });

  it('handles all empty (no-op)', () => {
    expect(() => applyItems({ itemsGained: [], itemsLost: [], itemsModified: [] })).not.toThrow();
  });

  it('isolates errors via try/catch (returns [])', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // null fields still ok
    const result = applyItems({ itemsGained: null as never, itemsLost: null as never, itemsModified: null as never });
    expect(result).toEqual([]);
    warnSpy.mockRestore();
  });
});
