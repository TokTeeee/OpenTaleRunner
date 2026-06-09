import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { DebugModeModal } from '../../../src/components/modals/DebugModeModal';
import { useCombatStore, INITIAL_COMBAT_STATE } from '../../../src/stores/combatStore';
import { useGameStore } from '../../../src/stores/gameStore';
import {
  registerCombatTools,
  unregisterCombatTools,
  _resetCombatEngine,
} from '../../../src/services/combat/combatTools';
import { toolCallRegistry } from '../../../src/services/llm/ToolCallRegistry';
import { resetClientStores } from '../../utils/resetStores';

describe('DebugModeModal', () => {
  beforeEach(() => {
    resetClientStores();
    useCombatStore.setState({ ...INITIAL_COMBAT_STATE, phase: 'idle' });
    _resetCombatEngine();
    registerCombatTools();
  });

  afterEach(() => {
    cleanup();
    unregisterCombatTools();
    _resetCombatEngine();
  });

  it('open=true: 渲染 5 张卡 (4 档 + 1 能力测试)', () => {
    render(<DebugModeModal open={true} onClose={() => {}} />);
    expect(screen.getByTestId('debug-modal')).toBeInTheDocument();
    const cards = screen.getAllByTestId(/^debug-card-/);
    expect(cards).toHaveLength(5);
    expect(screen.getByTestId('debug-card-trivial')).toBeInTheDocument();
    expect(screen.getByTestId('debug-card-normal')).toBeInTheDocument();
    expect(screen.getByTestId('debug-card-hard')).toBeInTheDocument();
    expect(screen.getByTestId('debug-card-deadly')).toBeInTheDocument();
    expect(screen.getByTestId('debug-card-ability')).toBeInTheDocument();  // v0.6.2
  });

  it('open=false: 不渲染 (return null)', () => {
    render(<DebugModeModal open={false} onClose={() => {}} />);
    expect(screen.queryByTestId('debug-modal')).toBeNull();
  });

  it('点击卡 → 隐藏 modal + phase 变 active (走 startDebugBattle)', async () => {
    const onClose = vi.fn();
    render(<DebugModeModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('debug-card-trivial'));
    await waitFor(() => {
      expect(['active', 'initializing']).toContain(useCombatStore.getState().phase);
    });
    // modal 隐藏 (selfHide)
    expect(screen.queryByTestId('debug-modal')).toBeNull();
  });

  it('点 [X] → 调 onClose + phase 保持 idle', () => {
    const onClose = vi.fn();
    render(<DebugModeModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('debug-modal-close'));
    expect(onClose).toHaveBeenCalled();
    expect(useCombatStore.getState().phase).toBe('idle');
  });

  it('战斗结束 (phase=settled) + pendingReturn=true → 自动重开 modal + reset 状态', async () => {
    const onClose = vi.fn();
    render(<DebugModeModal open={true} onClose={onClose} />);

    // 1. 触发卡片 (pendingReturn=true, modal 自隐藏)
    fireEvent.click(screen.getByTestId('debug-card-normal'));
    await waitFor(() => {
      expect(['active', 'initializing']).toContain(useCombatStore.getState().phase);
    });
    expect(screen.queryByTestId('debug-modal')).toBeNull();

    // 2. 模拟战斗结束
    await act(async () => {
      await toolCallRegistry.dispatch([{
        name: 'endCombat',
        arguments: { outcome: 'victory', durationRounds: 1, appliedBalanceRating: 'normal' },
      }]);
    });

    // 3. 等 useEffect 触发: phase=settled/idle → modal 自开 + reset
    await waitFor(() => {
      expect(screen.queryByTestId('debug-modal')).not.toBeNull();
    });
    expect(useCombatStore.getState().phase).toBe('idle');
    expect(useGameStore.getState().phase).toBe('title');
  });

  it('dispatch 失败 → 显示错误 + modal 重新显示', async () => {
    vi.spyOn(toolCallRegistry, 'dispatch').mockResolvedValueOnce([
      { toolCall: { name: 'startCombat', arguments: {} }, ok: false, error: 'mock fail' },
    ]);
    render(<DebugModeModal open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('debug-card-trivial'));
    await waitFor(() => {
      expect(screen.getByTestId('debug-error')).toBeInTheDocument();
    });
    // modal 重新显示 (内部 useState 重新置 true)
    expect(screen.getByTestId('debug-modal')).toBeInTheDocument();
  });

  // ============================================================
  // v0.6.2 — 修复: 起始 'idle' 不再被误判为战斗结束, page 不再回到 title
  // ============================================================
  it('bug 修复: 点 ability 卡 → gameStore.phase 保持 playing (不被误判回 title)', async () => {
    const { useCharacterStore } = await import('../../../src/stores/characterStore');
    render(<DebugModeModal open={true} onClose={() => {}} />);

    fireEvent.click(screen.getByTestId('debug-card-ability'));
    await waitFor(() => {
      expect(['active', 'initializing']).toContain(useCombatStore.getState().phase);
    });

    // 关键断言: 启动后 gameStore.phase 应保持 'playing', 不应被误判回 'title'
    // (原 bug: useEffect 在起始 'idle' 触发, 调 setPhase('title'), 导致 page 跳回首页)
    expect(useGameStore.getState().phase).toBe('playing');
    // 合成"调试法师"角色应已被注入 characterStore
    const char = useCharacterStore.getState().character;
    expect(char).not.toBeNull();
    expect(char?.learnedAbilities.some((la) => la.abilityId === 'spell_fire_bolt')).toBe(true);
    expect(char?.maxMp).toBe(30);
  });

  it('bug 修复: 真实 character 存在时点 ability 卡 → 合并 learnedAbilities, 保留原 hp/gold', async () => {
    const { useCharacterStore } = await import('../../../src/stores/characterStore');
    const REAL_GOLD = 999;
    const REAL_HP = 18;
    useCharacterStore.getState().setCharacter({
      characterId: 'real_char', playerId: 'p', name: '真勇者', race: '人类',
      background: 'real', appearance: 'real',
      attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      skills: [],
      inventory: {
        equipped: { weapon: null, armor: null, accessory: null },
        backpack: [], currency: { gold: REAL_GOLD, silver: 0, copper: 0 },
      },
      hp: REAL_HP, maxHp: REAL_HP, mp: 0, maxMp: 0,
      vital: { hunger: 0, thirst: 0, fatigue: 0, hygiene: 0, morale: 0, wound: 0, temperature: 0, encumbrance: 0 },
      reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
      conditions: [], joinedRegion: 'r', joinedWorldDay: 1, currentLocalDay: 1,
      lastActionTime: '', recentHistory: [],
      level: 1, exp: 0, expToNext: 100, unspentAttributePoints: 0,
      classId: null, classSkills: [],
      elementalResistances: { fire: 0, ice: 0, lightning: 0, wind: 0, earth: 0, arcane: 0, holy: 0, shadow: 0 },
      learnedAbilities: [], defaultLearnedAbilities: [],
    });

    render(<DebugModeModal open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('debug-card-ability'));
    await waitFor(() => {
      expect(['active', 'initializing']).toContain(useCombatStore.getState().phase);
    });

    const char = useCharacterStore.getState().character!;
    // 不污染: 保留原 characterId/hp/gold
    expect(char.characterId).toBe('real_char');
    expect(char.hp).toBe(REAL_HP);
    expect(char.inventory.currency.gold).toBe(REAL_GOLD);
    // 注入: 加 learnedAbilities 和 MP
    expect(char.learnedAbilities.some((la) => la.abilityId === 'spell_fire_bolt')).toBe(true);
    expect(char.maxMp).toBe(30);
  });
});
