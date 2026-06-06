import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startDebugBattle, createDebugPlayer } from '../../../src/services/combat/debugCombatStarter';
import { useCombatStore, INITIAL_COMBAT_STATE } from '../../../src/stores/combatStore';
import { useGameStore } from '../../../src/stores/gameStore';
import { useCharacterStore } from '../../../src/stores/characterStore';
import { toolCallRegistry } from '../../../src/services/llm/ToolCallRegistry';
import {
  registerCombatTools,
  unregisterCombatTools,
  _resetCombatEngine,
} from '../../../src/services/combat/combatTools';
import { DEBUG_BATTLES } from '../../../src/data/debugPresets';
import { resetClientStores } from '../../utils/resetStores';

describe('debugCombatStarter', () => {
  beforeEach(() => {
    resetClientStores();
    useCombatStore.setState({ ...INITIAL_COMBAT_STATE, phase: 'idle' });
    useCharacterStore.getState().setCharacter({
      characterId: 'real_char',
      playerId: 'real_player',
      name: 'real',
      race: '人类',
      background: 'real bg',
      appearance: 'real look',
      attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      skills: [],
      inventory: {
        equipped: { weapon: null, armor: null, accessory: null },
        backpack: [],
        currency: { gold: 999, silver: 0, copper: 0 },
      },
      hp: 20, maxHp: 20,
      vital: { hunger: 0, thirst: 0, fatigue: 0, hygiene: 0, morale: 0, wound: 0, temperature: 0, encumbrance: 0 },
      reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
      conditions: [],
      joinedRegion: 'r',
      joinedWorldDay: 1,
      currentLocalDay: 1,
      lastActionTime: '',
      recentHistory: [],
    });
    _resetCombatEngine();
    registerCombatTools();
  });

  afterEach(() => {
    unregisterCombatTools();
    _resetCombatEngine();
  });

  it('createDebugPlayer 是纯函数, 不读 characterStore', () => {
    const p1 = createDebugPlayer();
    const p2 = createDebugPlayer();
    expect(p1).toEqual(p2);
    expect(useCharacterStore.getState().character?.inventory.currency.gold).toBe(999);
  });

  it('startDebugBattle(trivial): dispatch startCombat, phase 变 active', async () => {
    await startDebugBattle(DEBUG_BATTLES[0]!); // trivial
    expect(['active', 'initializing']).toContain(useCombatStore.getState().phase);
  });

  it('startDebugBattle: 不写 characterStore (gold 仍 999)', async () => {
    await startDebugBattle(DEBUG_BATTLES[0]!);
    expect(useCharacterStore.getState().character?.inventory.currency.gold).toBe(999);
    expect(useCharacterStore.getState().character?.conditions.length).toBe(0);
  });

  it('startDebugBattle: dispatch 失败时 reset + throw', async () => {
    // 模拟 dispatch 失败 (handler 抛错或 unregistered)
    vi.spyOn(toolCallRegistry, 'dispatch').mockResolvedValueOnce([
      { toolCall: { name: 'startCombat', arguments: {} }, ok: false, error: 'mock error' },
    ]);
    await expect(startDebugBattle(DEBUG_BATTLES[0]!)).rejects.toThrow();
    expect(useCombatStore.getState().phase).toBe('idle');
    expect(useGameStore.getState().phase).toBe('title');
  });

  it('startDebugBattle: handler 返回 ok=false 时 reset + throw', async () => {
    // 模拟 handler 自身返回 ok=false
    vi.spyOn(toolCallRegistry, 'dispatch').mockResolvedValueOnce([
      { toolCall: { name: 'startCombat', arguments: {} }, ok: true, result: { ok: false, reason: 'mock validate fail' } },
    ]);
    await expect(startDebugBattle(DEBUG_BATTLES[0]!)).rejects.toThrow(/validate fail/);
    expect(useCombatStore.getState().phase).toBe('idle');
    expect(useGameStore.getState().phase).toBe('title');
  });
});
