/**
 * 多人模式设置弹窗 — 创建房间 / 加入房间 / 选择存档
 */

import { useState } from 'react';
import { useMultiplayerStore } from '../../stores/multiplayerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore } from '../../stores/authStore';
import {
  DEFAULT_ROOM_CONFIG,
  PRESET_LABELS,
  ROOM_PRESETS,
} from '../../types/multiplayer';
import type { RoomConfig, MultiplayerSaveData } from '../../types/multiplayer';
import { createRoom, joinRoom } from '../../services/multiplayer/MultiplayerAPI';
import { APIClient } from '../../services/sync/APIClient';
import {
  startHeartbeat,
  startRoomPoll,
  stopAllServices,
} from '../../services/multiplayer/SyncServices';

type SetupStep = 'menu' | 'create' | 'join' | 'config' | 'inherit_select';

interface Props {
  onClose: () => void;
}

export function MultiplayerSetupModal({ onClose }: Props) {
  const [step, setStep] = useState<SetupStep>('menu');
  const [accountName, setAccountName] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [roomIdInput, setRoomIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [config, setConfig] = useState<RoomConfig>({ ...DEFAULT_ROOM_CONFIG });
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [error, setError] = useState('');
  const [selectedArchive, setSelectedArchive] = useState<MultiplayerSaveData | null>(null);
  const authToken = useAuthStore((s) => s.token);
  const clearAuthToken = useAuthStore((s) => s.clearToken);
  const serverEndpoint = useSettingsStore((s) => s.server.endpoint);

  const { loadLocalArchives, localArchives, setRoomData, setGameMode } = useMultiplayerStore();

  const handleAuth = async (mode: 'login' | 'register') => {
    if (!accountName.trim() || !accountPassword.trim()) {
      setAuthError('请输入用户名和密码');
      return;
    }

    setAuthLoading(true);
    setAuthError('');
    try {
      const api = new APIClient(serverEndpoint);
      if (mode === 'login') {
        await api.login(accountName.trim(), accountPassword);
      } else {
        await api.register(accountName.trim(), accountPassword);
      }
      setAccountPassword('');
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : '认证失败');
    } finally {
      setAuthLoading(false);
    }
  };

  // ─── 加载存档列表 ───
  const handleLoadArchives = () => {
    loadLocalArchives();
    setStep('inherit_select');
  };

  // ─── 创建房间 ───
  const handleCreate = async () => {
    if (!authToken) {
      setError('请先登录或注册多人账号');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const room = await createRoom(
        toSnakeConfig(config),
        selectedArchive ? 'inherit' : 'new',
        selectedArchive ? {
          archive_name: selectedArchive.archiveName,
          world_day: selectedArchive.worldDay,
          current_round: selectedArchive.currentRound,
          location: selectedArchive.location,
          player_characters: selectedArchive.playerCharacters,
          shared_world_state: selectedArchive.sharedWorldState,
          chronicle_entries: selectedArchive.chronicleEntries,
        } : undefined,
      );

      const hostSession = room.players.find((player) => player.isHost) || null;
      setGameMode('multiplayer');
      setRoomData({
        roomId: room.roomId,
        roomMode: room.mode,
        roomPhase: room.state.phase,
        isHost: true,
        currentPlayerId: room.hostPlayerId,
        roomConfig: config,
        players: room.players,
        characterSlots: room.characterSlots,
        mySlotId: hostSession?.slotId || null,
        currentRound: room.state.currentRound,
        commonBackstory: room.state.commonBackstory,
      });

      startHeartbeat(room.roomId);
      startRoomPoll(room.roomId);
      onClose();
    } catch (e) {
      if (e instanceof Error && e.message.includes('[API 401]')) {
        clearAuthToken();
      }
      setError(e instanceof Error ? e.message : '创建房间失败');
    } finally {
      setLoading(false);
    }
  };

  // ─── 加入房间 ───
  const handleJoin = async () => {
    if (!roomIdInput.trim()) {
      setError('请输入房间ID');
      return;
    }
    if (!authToken) {
      setError('请先登录或注册多人账号');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const room = await joinRoom(roomIdInput.trim(), passwordInput || undefined);
      const joinedPlayer = room.players[room.players.length - 1] || null;

      setGameMode('multiplayer');
      setRoomData({
        roomId: room.roomId,
        roomMode: room.mode,
        roomPhase: room.state.phase,
        isHost: false,
        currentPlayerId: joinedPlayer?.playerId || null,
        roomConfig: room.config,
        players: room.players,
        characterSlots: room.characterSlots,
        mySlotId: joinedPlayer?.slotId || null,
        currentRound: room.state.currentRound,
        commonBackstory: room.state.commonBackstory,
      });

      startHeartbeat(room.roomId);
      startRoomPoll(room.roomId);
      onClose();
    } catch (e) {
      if (e instanceof Error && e.message.includes('[API 401]')) {
        clearAuthToken();
      }
      setError(e instanceof Error ? e.message : '加入房间失败');
    } finally {
      setLoading(false);
    }
  };

  // ─── 预设选择 ───
  const applyPreset = (presetKey: string) => {
    setSelectedPreset(presetKey);
    const preset = ROOM_PRESETS[presetKey];
    if (preset) {
      setConfig({ ...DEFAULT_ROOM_CONFIG, ...preset });
    }
  };

  const authPanel = authToken ? (
    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-emerald-300">多人认证已连接</div>
          <div className="text-xs text-emerald-200/70">当前会话会自动携带认证 token。</div>
        </div>
        <button
          onClick={() => {
            clearAuthToken();
            stopAllServices();
          }}
          className="shrink-0 px-3 py-1.5 rounded-lg border border-emerald-500/20 text-xs text-emerald-200 hover:bg-emerald-500/10 transition-colors"
        >
          退出登录
        </button>
      </div>
    </div>
  ) : (
    <div className="rounded-lg border border-amber-500/15 bg-amber-500/5 p-4 space-y-3">
      <div>
        <div className="text-sm font-semibold text-amber-200">多人账号认证</div>
        <div className="text-xs text-amber-100/70 mt-1">创建和加入房间前需要先登录或注册。</div>
      </div>
      <div className="grid grid-cols-1 gap-3">
        <input
          type="text"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          placeholder="用户名"
          className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
        />
        <input
          type="password"
          value={accountPassword}
          onChange={(e) => setAccountPassword(e.target.value)}
          placeholder="密码"
          className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
        />
      </div>
      {authError && <p className="text-red-400 text-sm">{authError}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => void handleAuth('login')}
          disabled={authLoading}
          className="py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold transition-colors"
        >
          {authLoading ? '处理中...' : '登录'}
        </button>
        <button
          onClick={() => void handleAuth('register')}
          disabled={authLoading}
          className="py-2.5 rounded-lg bg-gray-800 border border-gray-700 hover:border-gray-500 disabled:text-gray-500 text-gray-200 text-sm font-semibold transition-colors"
        >
          {authLoading ? '处理中...' : '注册'}
        </button>
      </div>
    </div>
  );

  const menuView = (
    <div className="space-y-3">
      <button
        onClick={() => setStep('create')}
        className="w-full py-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors"
      >
        {"创建房间"}
      </button>
      <button
        onClick={() => setStep('join')}
        className="w-full py-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
      >
        {"加入房间"}
      </button>
    </div>
  );

  const joinView = (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-200">加入房间</h3>
      <div>
        <label className="block text-sm text-gray-400 mb-1">房间ID</label>
        <input
          type="text"
          value={roomIdInput}
          onChange={(e) => setRoomIdInput(e.target.value)}
          placeholder="粘贴房间ID..."
          className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 font-mono text-lg placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
          autoFocus
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">密码（可选）</label>
        <input
          type="password"
          value={passwordInput}
          onChange={(e) => setPasswordInput(e.target.value)}
          placeholder="房间密码"
          className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
        />
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        onClick={handleJoin}
        disabled={loading || authLoading || !authToken || !roomIdInput.trim()}
        className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold transition-colors"
      >
        {loading ? '加入中...' : '加入房间'}
      </button>
      <button
        onClick={() => { setStep('menu'); setError(''); }}
        className="w-full py-2 text-sm text-gray-400 hover:text-gray-300 transition-colors"
      >
        {'← 返回'}
      </button>
    </div>
  );

  const createView = (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-200">创建房间</h3>

      {/* 房间名 */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">房间名称</label>
        <input
          type="text"
          value={config.roomName}
          onChange={(e) => setConfig({ ...config, roomName: e.target.value })}
          maxLength={30}
          className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
          autoFocus
        />
      </div>

      {/* 预设方案 */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">快速预设</label>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(PRESET_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedPreset === key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 基本配置 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">最大人数</label>
          <select
            value={config.maxPlayers}
            onChange={(e) => setConfig({ ...config, maxPlayers: Number(e.target.value) })}
            className="w-full px-3 py-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 focus:border-indigo-500 focus:outline-none"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
              <option key={n} value={n}>{n} 人</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">难度修正</label>
          <select
            value={config.difficultyModifier}
            onChange={(e) => setConfig({ ...config, difficultyModifier: Number(e.target.value) })}
            className="w-full px-3 py-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 focus:border-indigo-500 focus:outline-none"
          >
            {[-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map(n => (
              <option key={n} value={n}>{n > 0 ? `+${n}` : n} {n === 0 ? '(标准)' : n > 0 ? '(困难)' : '(简单)'}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 房间密码 */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">房间密码（留空为公开房间）</label>
        <input
          type="text"
          value={config.password || ''}
          onChange={(e) => setConfig({ ...config, password: e.target.value || undefined })}
          placeholder="可选密码"
          className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {/* 继承存档 */}
      <button
        onClick={handleLoadArchives}
        className="w-full py-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-500 transition-colors text-sm"
      >
        {selectedArchive
          ? `继承存档: ${selectedArchive.archiveName}`
          : '从存档恢复（可选）'}
      </button>
      {selectedArchive && (
        <p className="text-xs text-indigo-400">
          将从存档恢复: 第 {selectedArchive.worldDay} 天, 第 {selectedArchive.currentRound} 轮, {Object.keys(selectedArchive.playerCharacters).length} 个角色
        </p>
      )}

      {/* 高级设置 */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="w-full py-2 text-sm text-gray-400 hover:text-gray-300 transition-colors"
      >
        {showAdvanced ? '收起高级设置 ▲' : '高级设置 ▼'}
      </button>

      {showAdvanced && (
        <div className="space-y-3 p-4 rounded-lg bg-gray-800/50 border border-gray-700">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">叙事风格</label>
              <select
                value={config.narrativeStyle}
                onChange={(e) => setConfig({ ...config, narrativeStyle: e.target.value as RoomConfig['narrativeStyle'] })}
                className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-200 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="concise">简洁</option>
                <option value="detailed">细腻</option>
                <option value="epic">宏大</option>
                <option value="humorous">幽默</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">死亡规则</label>
              <select
                value={config.deathPenalty}
                onChange={(e) => setConfig({ ...config, deathPenalty: e.target.value as RoomConfig['deathPenalty'] })}
                className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-200 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="soft">重伤可恢复</option>
                <option value="permanent">永久死亡</option>
                <option value="narrative_only">仅叙事</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">行动超时</label>
              <select
                value={config.actionRoundTimeout}
                onChange={(e) => setConfig({ ...config, actionRoundTimeout: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-200 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value={60}>1 分钟</option>
                <option value={120}>2 分钟</option>
                <option value={180}>3 分钟</option>
                <option value={300}>5 分钟</option>
                <option value={600}>10 分钟</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">恢复倍率</label>
              <select
                value={config.restRecoveryMultiplier}
                onChange={(e) => setConfig({ ...config, restRecoveryMultiplier: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-200 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value={0.5}>0.5x (困难)</option>
                <option value={1.0}>1.0x (标准)</option>
                <option value={1.5}>1.5x (快速)</option>
                <option value={2.0}>2.0x (轻松)</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={config.allowNpcRecruitment}
                onChange={(e) => setConfig({ ...config, allowNpcRecruitment: e.target.checked })}
                className="rounded bg-gray-700 border-gray-600"
              />
              允许招募NPC加入队伍
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={config.enableFastTravel}
                onChange={(e) => setConfig({ ...config, enableFastTravel: e.target.checked })}
                className="rounded bg-gray-700 border-gray-600"
              />
              允许快速旅行
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={config.allowLateJoin}
                onChange={(e) => setConfig({ ...config, allowLateJoin: e.target.checked })}
                className="rounded bg-gray-700 border-gray-600"
              />
              允许中途加入（观战模式）
            </label>
          </div>
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        onClick={handleCreate}
        disabled={loading || authLoading || !authToken || !config.roomName.trim()}
        className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold transition-colors"
      >
        {loading ? '创建中...' : '创建房间'}
      </button>
      <button
        onClick={() => { setStep('menu'); setError(''); }}
        className="w-full py-2 text-sm text-gray-400 hover:text-gray-300 transition-colors"
      >
        {'← 返回'}
      </button>
    </div>
  );

  const archiveSelectView = (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-200">选择存档</h3>
      {localArchives.length === 0 ? (
        <p className="text-gray-500 text-center py-4">暂无多人存档</p>
      ) : (
        <div className="max-h-60 overflow-y-auto space-y-2">
          {localArchives.map((archive) => (
            <button
              key={archive.archiveId}
              onClick={() => {
                setSelectedArchive(archive);
                setStep('create');
              }}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                selectedArchive?.archiveId === archive.archiveId
                  ? 'bg-indigo-900/30 border-indigo-600'
                  : 'bg-gray-800 border-gray-700 hover:border-gray-500'
              }`}
            >
              <div className="font-semibold text-gray-200">{archive.archiveName}</div>
              <div className="text-xs text-gray-400 mt-1">
                第 {archive.worldDay} 天 · {archive.playerList.length} 名玩家 · {new Date(archive.createdAt).toLocaleString()}
              </div>
            </button>
          ))}
        </div>
      )}
      {selectedArchive && (
        <p className="text-xs text-indigo-400">已选择: {selectedArchive.archiveName}</p>
      )}
      <button
        onClick={() => setStep('create')}
        className="w-full py-2 text-sm text-gray-400 hover:text-gray-300 transition-colors"
      >
        {'← 返回创建'}
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h2 className="text-xl font-bold text-gray-200">多人联机</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">
            {'\u2715'}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-5">
            {authPanel}
          {step === 'menu' && menuView}
          {step === 'create' && createView}
          {step === 'join' && joinView}
          {step === 'inherit_select' && archiveSelectView}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800 p-4">
          <div className="text-xs text-gray-500">
            {step === 'menu' ? '创建或加入一个多人游戏房间' : '按返回键回到主菜单'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helper: camelCase → snake_case for API ───

function toSnakeConfig(config: RoomConfig): Record<string, unknown> {
  return {
    room_name: config.roomName,
    max_players: config.maxPlayers,
    password: config.password,
    storybook_id: config.storybookId,
    starting_region: config.startingRegion,
    narrative_style: config.narrativeStyle,
    narrative_language: config.narrativeLanguage,
    difficulty_modifier: config.difficultyModifier,
    allow_npc_recruitment: config.allowNpcRecruitment,
    enable_fast_travel: config.enableFastTravel,
    death_penalty: config.deathPenalty,
    rest_recovery_multiplier: config.restRecoveryMultiplier,
    action_round_timeout: config.actionRoundTimeout,
    auto_skip_on_timeout: config.autoSkipOnTimeout,
    allow_skip_action: config.allowSkipAction,
    allow_late_join: config.allowLateJoin,
    late_join_intro_delay: config.lateJoinIntroDelay,
    allow_spectators: config.allowSpectators,
  };
}
