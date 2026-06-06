/**
 * 多人房间轮询与实时同步协调器。
 * 负责大厅轮询、行动轮轮询、心跳保活，以及单人实时附近玩家同步这几条“短周期同步”链路。
 * 它消费 MultiplayerAPI 与各 store，但不保存长期业务状态。
 */

import { sendHeartbeat, getRoom, getRoundStatus, processRound } from './MultiplayerAPI';
import { reconnectService } from './ReconnectService';
import { request as httpRequest } from '../sync/HttpClient';
import { useCharacterStore } from '../../stores/characterStore';
import { useMultiplayerStore } from '../../stores/multiplayerStore';
import { useGameStore } from '../../stores/gameStore';
import { useWorldStore } from '../../stores/worldStore';
import type { NearbyPlayer } from '../../types/multiplayer';

// ─── 心跳服务 ───

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
const HEARTBEAT_MS = 30000;

export function startHeartbeat(roomId: string): void {
  stopHeartbeat();
  // 立即发送一次
  sendHeartbeat(roomId).catch((error) => {
    reconnectService.notifyTransportFailure(roomId, error);
  });
  heartbeatInterval = setInterval(() => {
    sendHeartbeat(roomId).catch((error) => {
      reconnectService.notifyTransportFailure(roomId, error);
    });
  }, HEARTBEAT_MS);
}

export function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

// ─── 房间状态轮询 ───

let roomPollInterval: ReturnType<typeof setInterval> | null = null;
const ROOM_POLL_MS = 5000;

export function startRoomPoll(roomId: string): void {
  stopRoomPoll();
  roomPollInterval = setInterval(async () => {
    try {
      const room = await getRoom(roomId);
      const store = useMultiplayerStore.getState();

      // 检测 phase 变化
      const newPhase = room.state.phase;
      if (newPhase === 'playing' && store.roomConfig && !roundPollInterval) {
        // 游戏已开始，切换到行动轮轮询
        startRoundPoll(roomId);
      }

      store.syncRoomSnapshot(room);
    } catch (e) {
      reconnectService.notifyTransportFailure(roomId, e);
    }
  }, ROOM_POLL_MS);
}

export function stopRoomPoll(): void {
  if (roomPollInterval) {
    clearInterval(roomPollInterval);
    roomPollInterval = null;
  }
}

// ─── 行动轮状态轮询 ───

let roundPollInterval: ReturnType<typeof setInterval> | null = null;
const ROUND_POLL_MS = 3000;
let lastProcessedRound = 0;

export function startRoundPoll(roomId: string): void {
  stopRoundPoll();
  lastProcessedRound = 0;
  roundPollInterval = setInterval(async () => {
    try {
      const status = await getRoundStatus(roomId);
      const store = useMultiplayerStore.getState();

      if (status.latestRoundResult) {
        lastProcessedRound = Math.max(lastProcessedRound, status.latestRoundResult.nextRound);
      }

      // 检测是否所有玩家都已行动 → 触发处理
      if (status.pendingPlayers.length === 0 && !status.latestRoundResult && status.currentRound > lastProcessedRound) {
        lastProcessedRound = status.currentRound;
        try {
          const result = await processRound(roomId);
          store.handleRoundResult(result);
        } catch { /* 处理失败，下一轮再试 */ }
      } else {
        store.updateRoundStatus(status);
      }
    } catch (e) {
      reconnectService.notifyTransportFailure(roomId, e);
    }
  }, ROUND_POLL_MS);
}

export function stopRoundPoll(): void {
  if (roundPollInterval) {
    clearInterval(roundPollInterval);
    roundPollInterval = null;
  }
  lastProcessedRound = 0;
}

// ─── 单人实时同步 ───

let realtimeInterval: ReturnType<typeof setInterval> | null = null;
const REALTIME_MS = 30000;

function deriveRealtimeStatus(action: string, game: ReturnType<typeof useGameStore.getState>): string {
  if (game.travelState) return 'traveling';
  if (/战斗|攻击|砍|刺|射|劈|挥拳|斩杀|击倒|应战|迎战|拔剑|冲锋/.test(action)) return 'combat';
  if (/组队|邀请|招募|同行/.test(action)) return 'party';
  if (/前往|远行|旅行|赶往|移动/.test(action)) return 'travel';
  if (game.isWaitingForPM) return 'awaiting_pm';
  return action ? 'active' : 'idle';
}

export function startRealtimeSync(): void {
  stopRealtimeSync();
  _uploadSession().catch(() => {});
  realtimeInterval = setInterval(() => {
    _uploadSession().catch(() => {});
  }, REALTIME_MS);
}

export function stopRealtimeSync(): void {
  if (realtimeInterval) {
    clearInterval(realtimeInterval);
    realtimeInterval = null;
  }
}

export async function uploadSessionImmediate(): Promise<void> {
  await _uploadSession();
}

async function _uploadSession(): Promise<void> {
  const game = useGameStore.getState();
  const world = useWorldStore.getState();
  const char = useCharacterStore.getState().character;
  const latestAction = game.recentActions[0] || '';
  const body = {
    character_name: char?.name || '',
    region: game.currentRegion || '',
    sub_region: game.currentSubRegion || '',
    coordinates: game.coordinates || { x: 0, y: 0, z: 0 },
    world_day: world.currentWorldDay || 1,
    current_action: latestAction,
    status: deriveRealtimeStatus(latestAction, game),
  };
  try {
    await httpRequest<void>('PUT', '/api/v1/sync/session', body);
  } catch {
    /* fire-and-forget: keep polling alive on transient errors */
  }
}

export async function fetchNearbyPlayers(): Promise<NearbyPlayer[]> {
  const game = useGameStore.getState();
  const region = game.currentRegion || '';
  if (!region) return [];
  let raw: { nearby_players?: Array<Record<string, unknown>> };
  try {
    raw = await httpRequest<{ nearby_players?: Array<Record<string, unknown>> }>(
      'GET',
      `/api/v1/sync/nearby-players?region=${encodeURIComponent(region)}`,
    );
  } catch {
    return [];
  }
  return ((raw.nearby_players ?? []) as Array<Record<string, unknown>>).map((player) => ({
    playerId: String(player.player_id ?? player.playerId ?? ''),
    characterName: String(player.character_name ?? player.characterName ?? ''),
    region: String(player.region ?? ''),
    subRegion: String(player.sub_region ?? player.subRegion ?? ''),
    coordinates: (player.coordinates ?? {}) as NearbyPlayer['coordinates'],
    currentAction: String(player.current_action ?? player.currentAction ?? ''),
    status: String(player.status ?? 'idle'),
    worldDay: Number(player.world_day ?? player.worldDay ?? 1),
    lastHeartbeat: String(player.last_heartbeat ?? player.lastHeartbeat ?? ''),
  }));
}

// ─── 全部停止 ───

export function stopAllServices(): void {
  stopHeartbeat();
  stopRoomPoll();
  stopRoundPoll();
  stopRealtimeSync();
}
