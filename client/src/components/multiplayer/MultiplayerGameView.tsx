/**
 * 多人游戏主界面 — 替代单人 AppLayout
 * 三栏布局 + 行动轮同步 + 跳过按钮 + 服务器叙事
 */

import { useState, useCallback, useEffect } from 'react';
import { useMultiplayerStore } from '../../stores/multiplayerStore';
import { useGameStore } from '../../stores/gameStore';
import { saveGame } from '../../services/multiplayer/SaveManager';
import { reconnectService, type ReconnectState } from '../../services/multiplayer/ReconnectService';
import {
  startHeartbeat, startRoomPoll, startRoundPoll,
  stopHeartbeat, stopRoomPoll, stopRoundPoll,
} from '../../services/multiplayer/SyncServices';
import { ActionRoundStatus } from './ActionRoundStatus';
import { PlayerMiniPanel } from './PlayerMiniPanel';
import { RoomNotifications } from './RoomNotifications';
import { usePMEngine } from '../../hooks/usePMEngine';
import { NarrativeArea } from '../game/NarrativeArea';
import { InteractionArea } from '../game/InteractionArea';

export function MultiplayerGameView({ onCreateCharacter }: { onCreateCharacter?: () => void }) {
  const store = useMultiplayerStore();
  const {
    roomId, players, isHost, roomConfig, currentPlayerId,
    currentRound,
  } = store;
  const messages = useGameStore((s) => s.messages);
  const addMessage = useGameStore((s) => s.addMessage);
  const { requestScene } = usePMEngine();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reconnectState, setReconnectState] = useState<ReconnectState>(reconnectService.getState());
  const mySession = players.find((player) => player.playerId === currentPlayerId);

  useEffect(() => reconnectService.subscribe(setReconnectState), []);

  useEffect(() => {
    if (!roomId) {
      reconnectService.stop();
      return;
    }

    reconnectService.start(roomId);
    return () => {
      reconnectService.stop();
    };
  }, [roomId]);

  // ─── 启动同步服务 ───

  useEffect(() => {
    if (!roomId) return;
    startHeartbeat(roomId);
    startRoomPoll(roomId);
    startRoundPoll(roomId);
    requestScene().catch(() => {});

    return () => {
      stopHeartbeat();
      stopRoundPoll();
      stopRoomPoll();
    };
  }, [roomId, requestScene]);

  const handleSaveGame = useCallback(async () => {
    if (!roomId || !isHost) return;
    setSaving(true);
    setError('');
    try {
      const archive = await saveGame(roomId);
      store.saveLocalArchive(archive);
      addMessage({
        id: `save-${archive.archiveId}`,
        type: 'system',
        content: `已保存多人存档：${archive.archiveName}`,
        timestamp: Date.now(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }, [addMessage, isHost, roomId, store]);

  return (
    <div className="h-screen flex flex-col bg-ink-900">
      {/* 顶部状态栏 */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900/80 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-300">
            {roomConfig?.roomName || '多人游戏'}
          </h2>
          <span className="text-xs text-gray-500">
            第 {currentRound} 轮 · {players.length} 人
          </span>
          {reconnectState.phase !== 'connected' && (
            <span className={`px-2 py-1 rounded-full text-[10px] border ${
              reconnectState.phase === 'offline'
                ? 'border-red-500/20 bg-red-500/[0.05] text-red-300/80'
                : 'border-amber-500/20 bg-amber-500/[0.05] text-amber-300/80'
            }`}>
              {reconnectState.phase === 'offline'
                ? '网络离线'
                : reconnectState.attempts > 0
                  ? `重连中 · 第 ${reconnectState.attempts} 次`
                  : '重连中'}
            </span>
          )}
          {mySession && mySession.status !== 'in_game' && (
            <span className="px-2 py-1 rounded-full text-[10px] border border-amber-500/15 bg-amber-500/[0.04] text-amber-300/80">
              {mySession.status === 'spectating' ? '观战中' : mySession.status === 'pending_intro' ? '等待引入' : mySession.status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isHost && (
            <button
              onClick={handleSaveGame}
              className="px-3 py-1 rounded text-xs text-gray-400 hover:text-gray-300 border border-gray-700 hover:border-gray-500 transition-colors"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          )}
          <span className="text-xs text-gray-600">
            {roomId?.slice(0, 10)}...
          </span>
        </div>
      </div>

      {/* 主内容区 — 三栏 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左栏：队友列表 */}
        <div className="w-56 shrink-0 border-r border-gray-800 p-3 overflow-y-auto">
          <PlayerMiniPanel players={players} currentPlayerId={currentPlayerId || null} />
        </div>

        {/* 中栏：叙事 + 交互 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {messages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-600 px-6 text-center">
              <div>
                <div className="text-lg mb-2">正在同步多人叙事...</div>
                <div className="text-sm">历史轮次、观战内容和当前场景会在这里展示</div>
              </div>
            </div>
          ) : (
            <NarrativeArea />
          )}
          {error && (
            <div className="px-4 py-2 text-xs text-red-400 border-t border-red-500/10 bg-red-500/[0.03]">{error}</div>
          )}
          {reconnectState.lastError && reconnectState.phase !== 'connected' && (
            <div className="px-4 py-2 text-xs text-amber-300 border-t border-amber-500/10 bg-amber-500/[0.03]">
              最近错误：{reconnectState.lastError}
            </div>
          )}
          <InteractionArea onOpenMultiplayerCharacterWizard={onCreateCharacter} />
        </div>

        {/* 右栏：行动轮状态 + 通知 */}
        <div className="w-64 shrink-0 border-l border-gray-800 p-3 overflow-y-auto space-y-4">
          <RoomNotifications />
          <ActionRoundStatus players={players} />
        </div>
      </div>
    </div>
  );
}
