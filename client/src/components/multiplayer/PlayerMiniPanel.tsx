/**
 * 队友mini状态面板 — 左侧栏显示其他玩家的简要信息
 */

import type { RoomPlayer } from '../../types/multiplayer';

interface Props {
  players: RoomPlayer[];
  currentPlayerId: string | null;
}

export function PlayerMiniPanel({ players, currentPlayerId }: Props) {
  const teammates = players.filter(p => p.playerId !== currentPlayerId);

  if (teammates.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">
        队友 ({teammates.length})
      </div>
      {teammates.map((p) => (
        <div
          key={p.playerId}
          className="bg-gray-800/50 border border-gray-700 rounded-lg p-2.5"
        >
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-300 truncate">
              {p.characterName || p.playerName}
            </div>
            <div className={`w-2 h-2 rounded-full shrink-0 ml-2 ${
              p.isOnline ? 'bg-emerald-500' : 'bg-gray-600'
            }`} />
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500">
              {!p.isOnline ? '离线' :
               p.status === 'in_game' ? '游戏中' :
               p.status === 'spectating' ? '观战中' :
               p.status === 'pending_intro' ? '等待引入' : ''}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
