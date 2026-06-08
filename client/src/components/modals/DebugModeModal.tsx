/**
 * 调试模式 Modal — 4 张预设战斗卡, 战斗结束自动重开
 *
 * 自管理重开循环: 内部 internalShow state 控制显示, useEffect 监听
 * combatStore.phase 转 settled/idle 触发 reset + 自开. 父组件只需永远 mount.
 *
 * 0 改核心引擎. 通过 startDebugBattle 间接 dispatch startCombat.
 * 详细见 spec: docs/superpowers/specs/2026-06-04-combat-debug-design.md
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { DEBUG_BATTLES, type DebugBattle } from '../../data/debugPresets';
import { startDebugBattle } from '../../services/combat/debugCombatStarter';
import { useCombatStore, INITIAL_COMBAT_STATE } from '../../stores/combatStore';
import { useGameStore } from '../../stores/gameStore';

export interface DebugModeModalProps {
  open: boolean;
  onClose: () => void;
}

const DIFFICULTY_LABEL: Record<DebugBattle['difficulty'], string> = {
  trivial: 'EASY',
  normal: 'NORMAL',
  hard: 'HARD',
  deadly: 'DEADLY',
  ability: 'SPELL',  // v0.6.2
};

const DIFFICULTY_COLOR: Record<DebugBattle['difficulty'], string> = {
  trivial: 'bg-green-100 text-green-800 border-green-300',
  normal: 'bg-blue-100 text-blue-800 border-blue-300',
  hard: 'bg-orange-100 text-orange-800 border-orange-300',
  deadly: 'bg-red-100 text-red-800 border-red-300',
  ability: 'bg-purple-100 text-purple-800 border-purple-300',  // v0.6.2
};

export function DebugModeModal({ open, onClose }: DebugModeModalProps) {
  const phase = useCombatStore((s) => s.phase);
  const [pendingReturn, setPendingReturn] = useState(false);
  const [internalShow, setInternalShow] = useState(open);
  const [error, setError] = useState<string | null>(null);
  const settledTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 同步外部 open prop 到 internalShow
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 自管理 show 状态, 同步外部 open prop
    setInternalShow(open);
  }, [open]);

  // 监听战斗结束 → 自动重开 modal
  useEffect(() => {
    if (pendingReturn && (phase === 'settled' || phase === 'idle')) {
      // 战斗结束, 清理状态 + 自开 modal
      useCombatStore.setState({ ...INITIAL_COMBAT_STATE, phase: 'idle' });
      useGameStore.getState().setDebugMode(false);
      useGameStore.getState().setPhase('title');
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 战斗结束回调, 触发自管理重开循环
      setPendingReturn(false);
      setError(null);
      setInternalShow(true);
    }
  }, [phase, pendingReturn]);

  // 30s 兜底: phase 卡 settled 永不回 → 强制重置
  useEffect(() => {
    if (pendingReturn && phase === 'settled') {
      settledTimerRef.current = setTimeout(() => {
        useCombatStore.setState({ ...INITIAL_COMBAT_STATE, phase: 'idle' });
        useGameStore.getState().setDebugMode(false);
        useGameStore.getState().setPhase('title');
        setPendingReturn(false);
        setError(null);
        setInternalShow(true);
      }, 30_000);
      return () => {
        if (settledTimerRef.current) {
          clearTimeout(settledTimerRef.current);
          settledTimerRef.current = null;
        }
      };
    }
    return undefined;
  }, [pendingReturn, phase]);

  const handleCardClick = useCallback(async (preset: DebugBattle) => {
    setError(null);
    setPendingReturn(true);
    setInternalShow(false); // 隐藏 modal, 等战斗结束自动重开
    try {
      await startDebugBattle(preset);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '启动失败';
      setError(msg);
      setPendingReturn(false);
      setInternalShow(true); // 失败, 重新显示
    }
  }, []);

  if (!internalShow) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      data-testid="debug-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl max-w-3xl w-full mx-4 p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">🐞 调试模式</h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="debug-modal-close"
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-zinc-500 mb-4">
          选一个预设战斗进入演示 (玩家: 测试勇者). 战斗结束会自动回到此菜单.
        </p>
        {error && (
          <div
            data-testid="debug-error"
            className="mb-4 p-3 bg-red-100 text-red-800 rounded text-sm"
          >
            预设启动失败: {error}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DEBUG_BATTLES.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleCardClick(preset)}
              data-testid={`debug-card-${preset.difficulty}`}
              className="text-left p-4 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:border-blue-400 hover:shadow transition"
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded border ${DIFFICULTY_COLOR[preset.difficulty]}`}
                >
                  {DIFFICULTY_LABEL[preset.difficulty]}
                </span>
                <h3 className="font-semibold">{preset.title}</h3>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">{preset.description}</p>
              <p className="text-xs text-zinc-500">预期: {preset.expectedOutcome}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
