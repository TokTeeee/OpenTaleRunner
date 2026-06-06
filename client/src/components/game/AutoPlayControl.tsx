import { useAutoPlayStore } from '../../stores/autoPlayStore';
import { useSettingsStore } from '../../stores/settingsStore';

interface Props {
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onStep: () => void;
}

export function AutoPlayControl({ onStart, onPause, onStop, onStep }: Props) {
  const { status, currentRound, totalRounds, lastAction, lastReasoning, errorMessage, intervalMs } = useAutoPlayStore();
  const autoPlayUseSeparate = useSettingsStore((s) => s.autoPlayUseSeparateConfig);
  const autoPlayLLM = useSettingsStore((s) => s.autoPlayLLM);
  const gmLLM = useSettingsStore((s) => s.llm);
  const hasApiKey = autoPlayUseSeparate ? !!autoPlayLLM.apiKey : !!gmLLM.apiKey;

  if (errorMessage) {
    return (
      <div className="border-t border-red-500/10 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-rose-400 text-xs">🤖 AutoPlay 错误</span>
        </div>
        <div className="text-[10px] text-rose-500/70">{errorMessage}</div>
        <button onClick={onStop} className="w-full text-[11px] py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-all">
          停止并清除错误
        </button>
      </div>
    );
  }

  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const isIdle = status === 'idle';

  return (
    <div className="border-t border-white/[.04] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Auto Play</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
          isRunning ? 'bg-emerald-500/10 text-emerald-400' :
          isPaused ? 'bg-amber-500/10 text-amber-400' :
          'bg-gray-500/10 text-gray-500'
        }`}>
          {isRunning ? '运行中' : isPaused ? '已暂停' : '就绪'}
        </span>
      </div>

      <div className="flex gap-1.5">
        {isIdle && (
          <>
            <button onClick={onStart} disabled={!hasApiKey}
              className="flex-1 text-[11px] py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title={!hasApiKey ? '请先配置AI API Key' : '开始自动游玩'}>
              ▶ 开始
            </button>
            <button onClick={onStep} disabled={!hasApiKey}
              className="text-[11px] px-2 py-1.5 rounded-lg bg-indigo-500/5 border border-indigo-500/10 text-indigo-400/70 hover:bg-indigo-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title="执行单轮后自动停止">
              ⏭
            </button>
          </>
        )}
        {isRunning && (
          <button onClick={onPause}
            className="flex-1 text-[11px] py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-all">
            ⏸ 暂停
          </button>
        )}
        {isPaused && (
          <button onClick={onStart}
            className="flex-1 text-[11px] py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 transition-all">
            ▶ 继续
          </button>
        )}
        {(isRunning || isPaused) && (
          <button onClick={onStop}
            className="flex-1 text-[11px] py-1.5 rounded-lg bg-rose-500/5 border border-rose-500/10 text-rose-400/70 hover:bg-rose-500/10 transition-all">
            ⏹ 停止
          </button>
        )}
      </div>

      {(isRunning || isPaused) && (
        <div className="space-y-1 text-[10px] text-gray-500">
          <div className="flex justify-between">
            <span>轮次</span>
            <span>{currentRound}{totalRounds > 0 ? ` / ${totalRounds}` : ''}</span>
          </div>
          {lastAction && (
            <div className="flex justify-between gap-2">
              <span className="shrink-0">行动</span>
              <span className="text-right text-gray-400 truncate">{lastAction.slice(0, 30)}</span>
            </div>
          )}
          {lastReasoning && (
            <div className="text-gray-600 truncate italic">&quot;{lastReasoning.slice(0, 50)}&quot;</div>
          )}
        </div>
      )}

      {isIdle && (
        <div className="space-y-1 text-[10px] text-gray-600">
          <div className="flex justify-between">
            <span>间隔</span>
            <span>{intervalMs / 1000}秒</span>
          </div>
          <div className="flex justify-between">
            <span>API源</span>
            <span>{autoPlayUseSeparate ? '独立配置' : '复用GM'}</span>
          </div>
        </div>
      )}
    </div>
  );
}