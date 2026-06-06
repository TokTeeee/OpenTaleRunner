/**
 * 调试模式 — 端到端集成测试
 *
 * 覆盖:
 * - 完整循环: 开 modal → 选卡 → 战斗 active → endCombat → modal 自动重开
 * - characterStore 完全未污染 (gold / conditions)
 * - 循环可重复 (再选另一档)
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { DebugModeModal } from '../../../src/components/modals/DebugModeModal';
import { useCombatStore, INITIAL_COMBAT_STATE } from '../../../src/stores/combatStore';
import { useGameStore } from '../../../src/stores/gameStore';
import { useCharacterStore } from '../../../src/stores/characterStore';
import {
  registerCombatTools,
  unregisterCombatTools,
  _resetCombatEngine,
} from '../../../src/services/combat/combatTools';
import { toolCallRegistry } from '../../../src/services/llm/ToolCallRegistry';
import { resetClientStores } from '../../utils/resetStores';

const REAL_GOLD = 500;
const REAL_HP = 20;

function seedRealCharacter(): void {
  useCharacterStore.getState().setCharacter({
    characterId: 'real_char',
    playerId: 'real_player',
    name: '真实勇者',
    race: '人类',
    background: 'real bg',
    appearance: 'real look',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    inventory: {
      equipped: { weapon: null, armor: null, accessory: null },
      backpack: [],
      currency: { gold: REAL_GOLD, silver: 0, copper: 0 },
    },
    hp: REAL_HP, maxHp: REAL_HP,
    vital: { hunger: 0, thirst: 0, fatigue: 0, hygiene: 0, morale: 0, wound: 0, temperature: 0, encumbrance: 0 },
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    conditions: [],
    joinedRegion: 'r',
    joinedWorldDay: 1,
    currentLocalDay: 1,
    lastActionTime: '',
    recentHistory: [],
  });
}

describe('DebugModeModal 端到端循环', () => {
  beforeEach(() => {
    resetClientStores();
    useCombatStore.setState({ ...INITIAL_COMBAT_STATE, phase: 'idle' });
    useGameStore.getState().setPhase('title');
    seedRealCharacter();
    _resetCombatEngine();
    registerCombatTools();
  });

  afterEach(() => {
    cleanup();
    unregisterCombatTools();
    _resetCombatEngine();
  });

  it('端到端: 开 modal → 选 trivial → 战斗 → endCombat → modal 自动重开 + characterStore 完整保留', async () => {
    render(<DebugModeModal open={true} onClose={() => {}} />);

    // 1. 初始 modal 渲染 + 真实角色已就位
    expect(screen.getByTestId('debug-modal')).toBeInTheDocument();
    const charBefore = useCharacterStore.getState().character!;
    const goldBefore = charBefore.inventory.currency.gold;
    const conditionsBefore = [...charBefore.conditions];
    const hpBefore = charBefore.hp;
    const condsCountBefore = conditionsBefore.length;

    // 2. 选 trivial 卡
    fireEvent.click(screen.getByTestId('debug-card-trivial'));
    await waitFor(() => {
      expect(['active', 'initializing']).toContain(useCombatStore.getState().phase);
    });
    // modal 自我隐藏
    expect(screen.queryByTestId('debug-modal')).toBeNull();

    // 3. 模拟战斗结束 (不传 finalState, 不应污染 characterStore)
    await act(async () => {
      await toolCallRegistry.dispatch([{
        name: 'endCombat',
        arguments: { outcome: 'victory', durationRounds: 1, appliedBalanceRating: 'trivial' },
      }]);
    });

    // 4. 等待 modal 自开 (useEffect 触发)
    await waitFor(() => {
      expect(screen.queryByTestId('debug-modal')).not.toBeNull();
    });
    expect(useCombatStore.getState().phase).toBe('idle');
    expect(useGameStore.getState().phase).toBe('title');

    // 5. 核心断言: characterStore 完整保留
    const charAfter = useCharacterStore.getState().character!;
    expect(charAfter.inventory.currency.gold).toBe(goldBefore);
    expect(charAfter.conditions.length).toBe(condsCountBefore);
    expect(charAfter.conditions).toEqual(conditionsBefore);
    expect(charAfter.hp).toBe(hpBefore);
  });

  it('循环可重复: 第一档结束后再选 deadly, 同样不污染', async () => {
    render(<DebugModeModal open={true} onClose={() => {}} />);

    const goldBefore = useCharacterStore.getState().character!.inventory.currency.gold;
    const condsCountBefore = useCharacterStore.getState().character!.conditions.length;

    // 第一轮: trivial
    fireEvent.click(screen.getByTestId('debug-card-trivial'));
    await waitFor(() => {
      expect(['active', 'initializing']).toContain(useCombatStore.getState().phase);
    });
    await act(async () => {
      await toolCallRegistry.dispatch([{
        name: 'endCombat',
        arguments: { outcome: 'victory', durationRounds: 1, appliedBalanceRating: 'trivial' },
      }]);
    });
    await waitFor(() => {
      expect(screen.queryByTestId('debug-modal')).not.toBeNull();
    });
    expect(useCharacterStore.getState().character!.inventory.currency.gold).toBe(goldBefore);
    expect(useCharacterStore.getState().character!.conditions.length).toBe(condsCountBefore);

    // 第二轮: deadly
    fireEvent.click(screen.getByTestId('debug-card-deadly'));
    await waitFor(() => {
      expect(['active', 'initializing']).toContain(useCombatStore.getState().phase);
    });
    await act(async () => {
      await toolCallRegistry.dispatch([{
        name: 'endCombat',
        arguments: { outcome: 'victory', durationRounds: 3, appliedBalanceRating: 'deadly' },
      }]);
    });
    await waitFor(() => {
      expect(screen.queryByTestId('debug-modal')).not.toBeNull();
    });

    // 同样不污染
    expect(useCharacterStore.getState().character!.inventory.currency.gold).toBe(goldBefore);
    expect(useCharacterStore.getState().character!.conditions.length).toBe(condsCountBefore);
  });
});
