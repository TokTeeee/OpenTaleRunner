/**
 * 等待大厅面板 — 创建/加入房间后显示
 * 玩家列表 / 角色槽认领 / 房主操作 / 开始游戏
 */

import { useState, useCallback } from 'react';
import { useMultiplayerStore } from '../../stores/multiplayerStore';
import {
  claimSlot, releaseSlot, generateCommonBackstory, startGame, leaveRoom,
} from '../../services/multiplayer/MultiplayerAPI';
import { stopAllServices } from '../../services/multiplayer/SyncServices';
import { saveGame } from '../../services/multiplayer/SaveManager';
import type { CharacterSlot, RoomPlayer } from '../../types/multiplayer';
import { PLAYER_STATUS_LABELS } from '../../types/multiplayer';

export function LobbyPanel({ onEnterGame, onCreateCharacter }: { onEnterGame: () => void; onCreateCharacter?: () => void }) {
  const store = useMultiplayerStore();
  const {
    roomId, roomMode, isHost, currentPlayerId, roomConfig, players, characterSlots,
    mySlotId, commonBackstory, setCommonBackstory, setRoomData,
  } = store;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // ─── 复制房间ID ───

  const copyRoomId = useCallback(async () => {
    if (!roomId) return;
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const input = document.createElement('input');
      input.value = roomId;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [roomId]);

  // ─── 角色槽认领/释放 ───

  const handleClaimSlot = async (slotId: string) => {
    if (!roomId) return;
    setLoading(true);
    try {
      await claimSlot(roomId, slotId);
      setRoomData({ mySlotId: slotId });
    } catch (e) {
      setError(e instanceof Error ? e.message : '认领失败');
    } finally {
      setLoading(false);
    }
  };

  const handleReleaseSlot = async () => {
    if (!roomId) return;
    try {
      await releaseSlot(roomId);
      setRoomData({ mySlotId: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : '释放失败');
    }
  };

  // ─── 生成共同背景故事 ───

  const handleGenerateBackstory = async () => {
    if (!roomId || !isHost) return;
    setLoading(true);
    try {
      const result = await generateCommonBackstory(roomId);
      setCommonBackstory(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败');
    } finally {
      setLoading(false);
    }
  };

  // ─── 开始游戏 ───

  const handleStartGame = async () => {
    if (!roomId || !isHost) return;
    setLoading(true);
    setError('');
    try {
      await startGame(roomId);
      onEnterGame();
    } catch (e) {
      setError(e instanceof Error ? e.message : '开始游戏失败');
    } finally {
      setLoading(false);
    }
  };

  // ─── 离开/保存 ───

  const handleLeave = async () => {
    if (!roomId) return;
    try {
      if (isHost) {
        // 房主离开前尝试保存
        try {
          const save = await saveGame(roomId);
          store.saveLocalArchive(save);
        } catch { /* 忽略保存失败 */ }
      }
      await leaveRoom(roomId);
    } catch { /* 忽略 */ }
    stopAllServices();
    store.resetRoom();
  };

  // ─── 检查是否可以开始 ───

  const canStart = (): boolean => {
    if (roomMode === 'inherit') {
      return characterSlots.length > 0 && characterSlots.every(s => s.claimedByPlayerId != null);
    }
    return players.length > 0 && players.every(p => p.isReady);
  };

  const getStartButtonText = (): string => {
    if (roomMode === 'inherit') {
      const unclaimed = characterSlots.filter(s => !s.claimedByPlayerId);
      if (unclaimed.length > 0) {
        return `等待认领角色 (${characterSlots.length - unclaimed.length}/${characterSlots.length})`;
      }
    } else {
      const notReady = players.filter(p => !p.isReady);
      if (notReady.length > 0) {
        return `等待玩家准备 (${players.length - notReady.length}/${players.length})`;
      }
    }
    return '开始游戏';
  };

  // ─── 检查当前玩家是否已就绪 ───

  const mySession = players.find((player) => player.playerId === currentPlayerId);
  const amIReady = Boolean(mySession?.isReady);

  // ─── 角色创建 ───

  const handleCreateMyCharacter = () => {
    if (onCreateCharacter) onCreateCharacter();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h2 className="text-xl font-bold text-gray-200">
            {roomConfig?.roomName || '等待大厅'}
          </h2>
          <button onClick={handleLeave} className="text-gray-500 hover:text-red-400 text-sm transition-colors">
            离开
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 房间ID */}
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <div className="text-xs text-gray-500 mb-2">房间 ID</div>
            <div className="flex items-center gap-3">
              <code className="text-2xl font-mono text-indigo-300 tracking-wider select-all">
                {roomId}
              </code>
              <button
                onClick={copyRoomId}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                }`}
              >
                {copied ? '已复制' : '复制'}
              </button>
            </div>
            {roomConfig?.password && (
              <div className="flex items-center gap-1 mt-2 text-xs text-amber-400">
                <span>{'\u{1F512}'}</span>
                <span>私密房间（加入需要密码）</span>
              </div>
            )}
          </div>

          {/* 房间配置摘要 */}
          {roomConfig && (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-1 rounded bg-gray-800 text-gray-400">
                {roomConfig.maxPlayers} 人
              </span>
              <span className="px-2 py-1 rounded bg-gray-800 text-gray-400">
                难度 {roomConfig.difficultyModifier >= 0 ? '+' : ''}{roomConfig.difficultyModifier}
              </span>
              <span className="px-2 py-1 rounded bg-gray-800 text-gray-400">
                超时 {Math.floor(roomConfig.actionRoundTimeout / 60)} 分钟
              </span>
              <span className="px-2 py-1 rounded bg-gray-800 text-gray-400">
                {roomConfig.narrativeStyle === 'detailed' ? '细腻叙事'
                  : roomConfig.narrativeStyle === 'concise' ? '简洁叙事'
                  : roomConfig.narrativeStyle === 'epic' ? '宏大叙事'
                  : '幽默叙事'}
              </span>
            </div>
          )}

          {/* 玩家列表（new 模式） */}
          {roomMode === 'new' && (
            <div>
              <h3 className="text-sm font-semibold text-indigo-300 mb-3">
                玩家状态 ({players.length}/{roomConfig?.maxPlayers || 4})
              </h3>
              <div className="space-y-2">
                {players.map((p) => (
                  <PlayerRow key={p.playerId} player={p} />
                ))}
                {players.length === 0 && (
                  <p className="text-gray-600 text-center py-4 text-sm">等待玩家加入...</p>
                )}
              </div>
            </div>
          )}

          {/* 角色槽列表（inherit 模式） */}
          {roomMode === 'inherit' && (
            <div>
              <h3 className="text-sm font-semibold text-amber-300 mb-3">
                角色认领 ({characterSlots.filter(s => s.claimedByPlayerId).length}/{characterSlots.length})
              </h3>
              <p className="text-xs text-gray-500 mb-3">每个角色需要一名玩家认领后才能开始游戏</p>
              <div className="space-y-2">
                {characterSlots.map((slot) => (
                  <SlotRow
                    key={slot.slotId}
                    slot={slot}
                    isMine={slot.claimedByPlayerId === mySlotId || false}
                    onClaim={() => handleClaimSlot(slot.slotId)}
                    onRelease={handleReleaseSlot}
                    loading={loading}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 共同背景故事 */}
          {commonBackstory && (
            <div className="bg-indigo-900/20 border border-indigo-600/30 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-indigo-300 mb-2">共同背景故事</h3>
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                {commonBackstory}
              </p>
            </div>
          )}

          {/* 错误 */}
          {error && (
            <div className="bg-red-900/20 border border-red-600/30 rounded-lg p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* 当前玩家角色创建 */}
          {roomMode === 'new' && !amIReady && (
            <div className="space-y-3 pt-3 border-t border-gray-700">
              <button
                onClick={handleCreateMyCharacter}
                className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors text-sm"
              >
                创建我的角色
              </button>
              <p className="text-xs text-gray-500 text-center">
                完成6步出身向导后即可准备就绪
              </p>
            </div>
          )}

          {/* 房主控制区 */}
          {isHost && (
            <div className="space-y-3 pt-3 border-t border-gray-700">
              {roomMode === 'new' && !commonBackstory && (
                <button
                  onClick={handleGenerateBackstory}
                  disabled={loading || !canStart()}
                  className="w-full py-3 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium transition-colors text-sm"
                >
                  {loading ? '生成中...' : '生成共同背景故事'}
                </button>
              )}

              <button
                onClick={handleStartGame}
                disabled={loading || !canStart()}
                className="w-full py-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold transition-colors"
              >
                {loading ? '正在开始...' : getStartButtonText()}
              </button>

              {!canStart() && (
                <p className="text-xs text-gray-500 text-center">
                  {roomMode === 'inherit'
                    ? '所有角色槽被认领后即可开始'
                    : '所有玩家完成角色创建后即可开始'}
                </p>
              )}
            </div>
          )}

          {/* 非房主：等待 */}
          {!isHost && roomMode === 'new' && amIReady && (
            <div className="space-y-3 pt-3 border-t border-gray-700">
              <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-4 text-center">
                <p className="text-sm text-blue-300">
                  等待房主开始游戏...
                </p>
              </div>
            </div>
          )}

          {/* 非房主：inherit模式或其他 */}
          {!isHost && roomMode !== 'new' && (
            <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-4 text-center pt-3 border-t border-gray-700">
              <p className="text-sm text-blue-300">
                等待房主开始游戏...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 子组件：玩家行 ───

function PlayerRow({ player }: { player: RoomPlayer }) {
  const statusColor =
    !player.isOnline ? 'text-red-400' :
    player.status === 'ready' || player.status === 'in_game' ? 'text-emerald-400' :
    player.status === 'creating_character' ? 'text-amber-400' :
    player.status === 'disconnected' ? 'text-red-400' :
    'text-gray-400';

  const statusIcon =
    !player.isOnline ? '\u2715' :
    player.status === 'ready' || player.isReady ? '\u2713' :
    player.status === 'disconnected' ? '\u2715' :
    '\u23F3';

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
      player.isHost ? 'bg-indigo-900/20 border-indigo-600/30' :
      player.isOnline ? 'bg-gray-800 border-gray-700' :
      'bg-gray-800/50 border-gray-700/50 opacity-70'
    }`}>
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${
          player.isOnline ? 'bg-emerald-500' : 'bg-gray-600'
        }`} />
        <div>
          <div className="text-sm font-medium text-gray-200">
            {player.characterName || player.playerName || '未知玩家'}
            {player.isHost && (
              <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-amber-600/30 text-amber-400 border border-amber-600/30">
                房主
              </span>
            )}
          </div>
          {player.status === 'creating_character' && (
            <div className="text-xs text-amber-400 mt-0.5">创建角色中...</div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-sm ${statusColor}`}>
          {statusIcon} {!player.isOnline ? '已离线' : PLAYER_STATUS_LABELS[player.status]}
        </span>
      </div>
    </div>
  );
}

// ─── 子组件：角色槽行 ───

function SlotRow({
  slot, isMine, onClaim, onRelease, loading,
}: {
  slot: CharacterSlot;
  isMine: boolean;
  onClaim: () => void;
  onRelease: () => void;
  loading: boolean;
}) {
  const isClaimed = slot.claimedByPlayerId != null;

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
      isMine ? 'bg-emerald-900/20 border-emerald-600/30' :
      isClaimed ? 'bg-gray-800/50 border-gray-700/50' :
      'bg-gray-800 border-gray-700 hover:border-gray-500'
    }`}>
      <div>
        <div className="text-sm font-semibold text-gray-200">
          {slot.characterName}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {slot.characterSummary}
        </div>
      </div>
      <div>
        {isMine ? (
          <button
            onClick={onRelease}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
          >
            释放
          </button>
        ) : isClaimed ? (
          <span className="text-xs text-gray-500">已认领</span>
        ) : (
          <button
            onClick={onClaim}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            认领
          </button>
        )}
      </div>
    </div>
  );
}
