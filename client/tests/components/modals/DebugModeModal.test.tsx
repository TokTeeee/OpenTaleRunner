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

  it('open=true: 渲染 4 张卡 (每档 1 张)', () => {
    render(<DebugModeModal open={true} onClose={() => {}} />);
    expect(screen.getByTestId('debug-modal')).toBeInTheDocument();
    const cards = screen.getAllByTestId(/^debug-card-/);
    expect(cards).toHaveLength(4);
    expect(screen.getByTestId('debug-card-trivial')).toBeInTheDocument();
    expect(screen.getByTestId('debug-card-normal')).toBeInTheDocument();
    expect(screen.getByTestId('debug-card-hard')).toBeInTheDocument();
    expect(screen.getByTestId('debug-card-deadly')).toBeInTheDocument();
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
});
