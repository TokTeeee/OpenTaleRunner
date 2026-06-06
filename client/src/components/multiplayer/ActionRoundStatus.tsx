/**
 * 行动轮状态显示面板 — 游戏中在右侧栏显示
 * 当前轮数 / 各玩家提交状态 / 进度条 / 跳过按钮
 */

import { useMemo } from 'react';
import { useMultiplayerStore } from '../../stores/multiplayerStore';
import type { RoomPlayer } from '../../types/multiplayer';

interface Props {
  players: RoomPlayer[];
}

export function ActionRoundStatus({ players }: Props) {
  const {
    currentRound, playersActed,
    timeoutAt, currentActions, currentDiceResults, currentPlayerId,
    players: roomPlayers,
  } = useMultiplayerStore();

  // 计算超时剩余时间
  const timeLeft = useMemo(() => {
    if (!timeoutAt) return null;
    const delta = new Date(timeoutAt).getTime() - Date.now();
    if (delta <= 0) return '00:00';
    const mins = Math.floor(delta / 60000);
    const secs = Math.floor((delta % 60000) / 1000);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [timeoutAt]);

  const inGamePlayers = players.filter(p => p.status === 'in_game');
  const total = inGamePlayers.length;
  const done = playersActed.length;
  const currentSession = roomPlayers.find((player) => player.playerId === currentPlayerId);
  const isReadOnly = currentSession?.status === 'spectating' || currentSession?.status === 'pending_intro';

  const formatDiceSummary = (raw: unknown): string | null => {
    if (!raw || typeof raw !== 'object') return null;
    const dice = raw as Record<string, unknown>;
    if (dice.auto) return '无需检定';
    const outcome = String(dice.outcome ?? 'unknown');
    const outcomeLabel: Record<string, string> = {
      critical_success: '大成功',
      success: '成功',
      partial_success: '部分成功',
      failure: '失败',
      critical_failure: '大失败',
    };
    const diceValues = Array.isArray(dice.diceValues) ? dice.diceValues.join(', ') : '';
    const finalResult = dice.finalResult;
    const difficulty = dice.difficultyLC;
    if (!diceValues && finalResult == null) return null;
    return `2d6[${diceValues}] → ${outcomeLabel[outcome] || outcome} (${finalResult ?? '-'}/${difficulty ?? '-'})`;
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-indigo-300">
          第 {currentRound} 轮
        </div>
        {timeLeft && (
          <div className={`text-xs font-mono ${
            timeLeft === '00:00' || (parseInt(timeLeft) < 1)
              ? 'text-red-400 animate-pulse'
              : 'text-gray-400'
          }`}>
            {timeLeft}
          </div>
        )}
      </div>

      {/* 玩家状态列表 */}
      <div className="space-y-1.5">
        {inGamePlayers.map((p) => {
          const hasActed = playersActed.includes(p.playerId);
          return (
            <div key={p.playerId} className="py-1.5 border-b border-gray-800/60 last:border-b-0">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-300 truncate flex-1">
                  {p.characterName || p.playerName}
                </span>
                <span className={`ml-2 shrink-0 ${
                  hasActed ? 'text-emerald-400' :
                  !p.isOnline ? 'text-red-400' :
                  'text-gray-500'
                }`}>
                  {hasActed ? '\u2713' : !p.isOnline ? '\u2715' : '\u23F3'}
                </span>
              </div>
              {currentActions[p.playerId] && (
                <div className="mt-1 text-[11px] leading-relaxed text-gray-500">
                  <div>{currentActions[p.playerId]}</div>
                  {formatDiceSummary(currentDiceResults[p.playerId]) && (
                    <div className="text-indigo-300/80 mt-1">{formatDiceSummary(currentDiceResults[p.playerId])}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 进度条 */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{done} / {total} 已提交</span>
          {done < total && <span>{total - done} 人在等待</span>}
        </div>
        <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
            style={{ width: total > 0 ? `${(done / total) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {isReadOnly && (
        <div className="rounded-lg border border-amber-500/10 bg-amber-500/[0.04] px-3 py-2 text-[11px] text-amber-300/80">
          当前为观战/等待引入状态，本面板仅显示队伍行动进度。
        </div>
      )}
    </div>
  );
}
