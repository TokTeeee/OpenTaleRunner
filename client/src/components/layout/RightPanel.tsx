import { EnvironmentInfo } from '../panels/EnvironmentInfo';
import { AutoPlayControl } from '../game/AutoPlayControl';
import { ActiveEntitiesPanel } from '../panels/ActiveEntitiesPanel';
import { useState, useRef, useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { usePMEngine } from '../../hooks/usePMEngine';
import { useUIStore } from '../../stores/uiStore';
import { useCodexStore } from '../../stores/codexStore';
import { MemoryManager } from '../../services/memory/MemoryManager';

interface Props {
  onAutoPlayStart: () => void;
  onAutoPlayPause: () => void;
  onAutoPlayStop: () => void;
  onAutoPlayStep: () => void;
}

export function RightPanel({ onAutoPlayStart, onAutoPlayPause, onAutoPlayStop, onAutoPlayStep }: Props) {
  const phase = useGameStore((s) => s.phase);
  const gameClock = useGameStore((s) => s.gameClock);
  const isWaiting = useGameStore((s) => s.isWaitingForPM);
  const { requestScene, startNewDay, submitCustom } = usePMEngine();
  const openModal = useUIStore((s) => s.openModal);
  // 防卡死: 刷新场景并发 + 1.5s 冷却
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastRefreshRef = useRef<number>(0);
  const handleRefreshScene = useCallback(async () => {
    const now = Date.now();
    if (isRefreshing || now - lastRefreshRef.current < 1500) return;
    lastRefreshRef.current = now;
    setIsRefreshing(true);
    try {
      await requestScene();
    } finally {
      // 最少显示 600ms 反馈, 避免按钮闪烁
      setTimeout(() => setIsRefreshing(false), 600);
    }
  }, [isRefreshing, requestScene]);

  return (
    <div className="w-[260px] shrink-0 border-l border-white/[.03] flex flex-col glass-strong z-20">
      <div className="flex-1 overflow-y-auto"><EnvironmentInfo /></div>
      <AutoPlayControl
        onStart={onAutoPlayStart}
        onPause={onAutoPlayPause}
        onStop={onAutoPlayStop}
        onStep={onAutoPlayStep}
      />
      <ActiveEntitiesPanel />
      {phase === 'playing' && (
        <div className="border-t border-white/[.04] p-3 space-y-1.5">
          <div className="flex gap-1.5">
            <button onClick={() => openModal('backpack')} className="flex-1 text-[11px] py-2 rounded-xl bg-amber-500/5 border border-amber-500/10 text-amber-400/70 hover:bg-amber-500/10 transition-all">
              🎒 背包
            </button>
            <button
              onClick={() => openModal('codex')}
              data-testid="nav-codex"
              className="flex-1 text-[11px] py-2 rounded-xl bg-violet-500/5 border border-violet-500/10 text-violet-400/70 hover:bg-violet-500/10 transition-all"
            >
              📖 图鉴 ({Object.keys(useCodexStore.getState().discoveries).length})
            </button>
            <button
              onClick={() => openModal('memory')}
              data-testid="nav-memory"
              className="flex-1 text-[11px] py-2 rounded-xl bg-cyan-500/5 border border-cyan-500/10 text-cyan-400/70 hover:bg-cyan-500/10 transition-all"
            >
              🧠 记忆 ({MemoryManager.size()})
            </button>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => submitCustom('[仔细观察周围环境]')} className="flex-1 text-[11px] py-1.5 rounded-xl bg-indigo-500/5 border border-indigo-500/10 text-indigo-400/70 hover:bg-indigo-500/10 transition-all">
              👁 观察
            </button>
            <button onClick={() => submitCustom('[原地等待]')} className="flex-1 text-[11px] py-1.5 rounded-xl bg-slate-500/5 border border-slate-500/10 text-slate-400/70 hover:bg-slate-500/10 transition-all">
              ⏳ 等待
            </button>
          </div>
          {gameClock > 20 && (
            <div className="text-[9px] text-amber-500/70 text-center">🌙 天色已晚，建议休息</div>
          )}
          <button onClick={startNewDay} className="w-full text-[11px] py-2 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-emerald-400/70 hover:bg-emerald-500/10 transition-all">
            🌙 休息
          </button>
          <button
            onClick={handleRefreshScene}
            disabled={isRefreshing || isWaiting}
            className="w-full text-[11px] py-2 rounded-xl bg-indigo-500/5 border border-indigo-500/10 text-indigo-400/70 hover:bg-indigo-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            {isRefreshing ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-indigo-400/20 border-t-indigo-400 rounded-full animate-spin" />
                <span>刷新中...</span>
              </>
            ) : (
              <span>🔄 刷新场景</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
