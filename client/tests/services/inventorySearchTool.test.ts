import { describe, it, expect, beforeEach } from 'vitest';
import { toolCallRegistry } from '../../src/services/llm/ToolCallRegistry';
import {
  registerInventorySearchTool,
  unregisterInventorySearchTool,
  isInventorySearchToolRegistered,
} from '../../src/services/engine/inventorySearchTool';
import { useCharacterStore } from '../../src/stores/characterStore';
import { resetClientStores } from '../utils/resetStores';
import type { Character } from '../../src/types/character';

function makeChar(id: string): Character {
  return {
    characterId: id,
    playerId: id,
    name: '测试角色',
    race: '人类',
    background: '',
    appearance: '',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    inventory: {
      equipped: { weapon: null, armor: null, accessory: null },
      backpack: [
        { name: '治疗药水', description: '恢复 30 HP', quantity: 3, quality: '普通', effects: [] } as never,
        { name: '驱魔剑', description: '对恶魔增伤', quantity: 1, quality: '稀有', effects: [] } as never,
      ],
      currency: { gold: 0, silver: 0, copper: 0 },
    },
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

describe('inventory_search tool (v0.5.12)', () => {
  beforeEach(() => {
    unregisterInventorySearchTool();
    toolCallRegistry.clear();
    resetClientStores();
  });

  it('registers as inventory_search and unregisters cleanly', () => {
    expect(isInventorySearchToolRegistered()).toBe(false);
    const unregister = registerInventorySearchTool();
    expect(isInventorySearchToolRegistered()).toBe(true);
    expect(toolCallRegistry.has('inventory_search')).toBe(true);
    unregister();
    expect(isInventorySearchToolRegistered()).toBe(false);
    expect(toolCallRegistry.has('inventory_search')).toBe(false);
  });

  it('is idempotent on double-register (no duplicate)', () => {
    registerInventorySearchTool();
    registerInventorySearchTool();
    expect(toolCallRegistry.has('inventory_search')).toBe(true);
  });

  it('returns ok:false on missing keyword', async () => {
    registerInventorySearchTool();
    const handler = toolCallRegistry['entries'].get('inventory_search')?.handler as (a: unknown) => Promise<{ ok: boolean; reason?: string }>;
    const result = await handler({});
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('keyword');
  });

  it('returns matching items from current character', async () => {
    useCharacterStore.setState({ character: makeChar('char1') });
    registerInventorySearchTool();
    const handler = toolCallRegistry['entries'].get('inventory_search')?.handler as (a: unknown) => Promise<{ ok: boolean; results?: Array<{ name: string }>; count?: number }>;
    const result = await handler({ keyword: '药' });
    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
    expect(result.results?.[0].name).toBe('治疗药水');
  });

  it('returns ok:false when no character loaded and no characterId given', async () => {
    registerInventorySearchTool();
    const handler = toolCallRegistry['entries'].get('inventory_search')?.handler as (a: unknown) => Promise<{ ok: boolean; reason?: string }>;
    const result = await handler({ keyword: 'anything' });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('characterId');
  });
});
