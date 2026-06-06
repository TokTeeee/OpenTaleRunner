/**
 * 多人联机 REST 访问层。
 * 提供房间创建、加入、角色就绪、行动轮提交、历史叙事、观战就绪和联机存档请求等端点封装，
 * 并负责把服务端 snake_case 响应适配为客户端使用的 camelCase 结构。
 */

import { request as httpRequest } from '../sync/HttpClient';
import type {
  Room, RoomConfig, RoomPlayer, CharacterSlot, CommonBackstory,
  RoundStatus, RoundResult, RoundSubmission, NarrativeHistory, MultiplayerSaveData, SpectatorReadyResponse,
  RoomNotification,
} from '../../types/multiplayer';

// ─── API 基础请求 ───

function apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  return httpRequest<T>(method, path, body);
}

function normalizeRoomConfig(raw: Record<string, unknown>): RoomConfig {
  return {
    roomName: String(raw.room_name ?? raw.roomName ?? '冒险小队'),
    maxPlayers: Number(raw.max_players ?? raw.maxPlayers ?? 4),
    password: (raw.password as string | undefined) || undefined,
    storybookId: (raw.storybook_id ?? raw.storybookId) as string | undefined,
    startingRegion: (raw.starting_region ?? raw.startingRegion) as string | undefined,
    narrativeStyle: (raw.narrative_style ?? raw.narrativeStyle ?? 'detailed') as RoomConfig['narrativeStyle'],
    narrativeLanguage: (raw.narrative_language ?? raw.narrativeLanguage ?? 'zh') as RoomConfig['narrativeLanguage'],
    difficultyModifier: Number(raw.difficulty_modifier ?? raw.difficultyModifier ?? 0),
    allowNpcRecruitment: Boolean(raw.allow_npc_recruitment ?? raw.allowNpcRecruitment ?? true),
    enableFastTravel: Boolean(raw.enable_fast_travel ?? raw.enableFastTravel ?? true),
    deathPenalty: (raw.death_penalty ?? raw.deathPenalty ?? 'soft') as RoomConfig['deathPenalty'],
    restRecoveryMultiplier: Number(raw.rest_recovery_multiplier ?? raw.restRecoveryMultiplier ?? 1),
    actionRoundTimeout: Number(raw.action_round_timeout ?? raw.actionRoundTimeout ?? 300),
    autoSkipOnTimeout: Boolean(raw.auto_skip_on_timeout ?? raw.autoSkipOnTimeout ?? true),
    allowSkipAction: Boolean(raw.allow_skip_action ?? raw.allowSkipAction ?? true),
    allowLateJoin: Boolean(raw.allow_late_join ?? raw.allowLateJoin ?? true),
    lateJoinIntroDelay: Number(raw.late_join_intro_delay ?? raw.lateJoinIntroDelay ?? 2),
    allowSpectators: Boolean(raw.allow_spectators ?? raw.allowSpectators ?? false),
  };
}

function normalizeRoomPlayer(raw: Record<string, unknown>): RoomPlayer {
  return {
    playerId: String(raw.player_id ?? raw.playerId ?? ''),
    playerName: String(raw.player_name ?? raw.playerName ?? ''),
    characterId: (raw.character_id ?? raw.characterId) as string | null,
    characterName: (raw.character_name ?? raw.characterName) as string | null,
    characterBackground: (raw.character_background ?? raw.characterBackground) as string | null,
    isHost: Boolean(raw.is_host ?? raw.isHost ?? false),
    isReady: Boolean(raw.is_ready ?? raw.isReady ?? false),
    isOnline: Boolean(raw.is_online ?? raw.isOnline ?? true),
    lastHeartbeat: String(raw.last_heartbeat ?? raw.lastHeartbeat ?? ''),
    status: (raw.status ?? 'waiting') as RoomPlayer['status'],
    slotId: (raw.slot_id ?? raw.slotId) as string | undefined,
    joinedAtRound: Number(raw.joined_at_round ?? raw.joinedAtRound ?? 0),
  };
}

function normalizeCharacterSlot(raw: Record<string, unknown>): CharacterSlot {
  return {
    slotId: String(raw.slot_id ?? raw.slotId ?? ''),
    characterId: String(raw.character_id ?? raw.characterId ?? ''),
    characterName: String(raw.character_name ?? raw.characterName ?? ''),
    characterSummary: String(raw.character_summary ?? raw.characterSummary ?? ''),
    claimedByPlayerId: (raw.claimed_by_player_id ?? raw.claimedByPlayerId) as string | null,
  };
}

function normalizeRoom(raw: Record<string, unknown>): Room {
  const state = (raw.state ?? {}) as Record<string, unknown>;
  return {
    roomId: String(raw.room_id ?? raw.roomId ?? ''),
    hostPlayerId: String(raw.host_player_id ?? raw.hostPlayerId ?? ''),
    config: normalizeRoomConfig((raw.config ?? {}) as Record<string, unknown>),
    mode: (raw.mode ?? 'new') as Room['mode'],
    createdAt: String(raw.created_at ?? raw.createdAt ?? ''),
    startedAt: (raw.started_at ?? raw.startedAt) as string | null,
    state: {
      phase: (state.phase ?? 'waiting') as Room['state']['phase'],
      worldDay: Number(state.world_day ?? state.worldDay ?? 1),
      currentRound: Number(state.current_round ?? state.currentRound ?? 0),
      location: (state.location ?? null) as Room['state']['location'],
      playersActed: (state.players_acted ?? state.playersActed ?? []) as string[],
      roundStartTime: (state.round_start_time ?? state.roundStartTime ?? null) as string | null,
      commonBackstory: (state.common_backstory ?? state.commonBackstory ?? null) as string | null,
    },
    players: ((raw.players ?? []) as Record<string, unknown>[]).map(normalizeRoomPlayer),
    characterSlots: ((raw.character_slots ?? raw.characterSlots ?? []) as Record<string, unknown>[]).map(normalizeCharacterSlot),
    roomNotifications: ((raw.room_notifications ?? raw.roomNotifications ?? []) as Record<string, unknown>[]).map(normalizeRoomNotification),
  };
}

function normalizeRoomNotification(raw: Record<string, unknown>): RoomNotification {
  return {
    event: String(raw.event ?? '') as RoomNotification['event'],
    playerId: String(raw.player_id ?? raw.playerId ?? ''),
    playerName: String(raw.player_name ?? raw.playerName ?? ''),
    characterName: String(raw.character_name ?? raw.characterName ?? ''),
    characterBackground: String(raw.character_background ?? raw.characterBackground ?? ''),
    round: Number(raw.round ?? 0),
    narrative: String(raw.narrative ?? ''),
    timestamp: String(raw.timestamp ?? ''),
  };
}

function normalizeRoundResult(raw: Record<string, unknown>): RoundResult {
  return {
    round: Number(raw.round ?? 0),
    playerActions: (raw.player_actions ?? raw.playerActions ?? {}) as Record<string, string>,
    diceResults: (raw.dice_results ?? raw.diceResults ?? {}) as Record<string, unknown>,
    conflicts: (raw.conflicts ?? []) as RoundResult['conflicts'],
    narrative: String(raw.narrative ?? ''),
    consequences: (raw.consequences ?? {}) as Record<string, unknown>,
    worldStateChanges: (raw.world_state_changes ?? raw.worldStateChanges ?? {}) as Record<string, unknown>,
    introducedPlayers: ((raw.introduced_players ?? raw.introducedPlayers ?? []) as Array<Record<string, unknown>>).map((player) => ({
      playerId: String(player.player_id ?? player.playerId ?? ''),
      characterName: String(player.character_name ?? player.characterName ?? ''),
      narrative: String(player.narrative ?? ''),
    })),
    nextRound: Number(raw.next_round ?? raw.nextRound ?? 0),
  };
}

function normalizeRoundStatus(raw: Record<string, unknown>): RoundStatus {
  return {
    currentRound: Number(raw.current_round ?? raw.currentRound ?? 0),
    playersActed: (raw.players_acted ?? raw.playersActed ?? []) as string[],
    pendingPlayers: (raw.pending_players ?? raw.pendingPlayers ?? []) as string[],
    actions: (raw.actions ?? {}) as Record<string, string>,
    diceResults: (raw.dice_results ?? raw.diceResults ?? {}) as Record<string, unknown>,
    roundStartTime: (raw.round_start_time ?? raw.roundStartTime ?? null) as string | null,
    timeoutAt: (raw.timeout_at ?? raw.timeoutAt ?? null) as string | null,
    latestRoundResult: raw.latest_round_result
      ? normalizeRoundResult(raw.latest_round_result as Record<string, unknown>)
      : raw.latestRoundResult
        ? normalizeRoundResult(raw.latestRoundResult as Record<string, unknown>)
        : null,
    recentNotifications: ((raw.recent_notifications ?? raw.recentNotifications ?? []) as Record<string, unknown>[]).map(normalizeRoomNotification),
  };
}

function normalizeNarrativeHistory(raw: Record<string, unknown>): NarrativeHistory {
  return {
    round: Number(raw.round ?? 0),
    narrative: String(raw.narrative ?? ''),
    playerActions: (raw.player_actions ?? raw.playerActions ?? {}) as Record<string, string>,
    diceResults: (raw.dice_results ?? raw.diceResults ?? {}) as Record<string, unknown>,
    timestamp: String(raw.timestamp ?? ''),
  };
}

function normalizeSaveData(raw: Record<string, unknown>, roomId: string): MultiplayerSaveData {
  return {
    archiveId: String(raw.archive_id ?? raw.archiveId ?? ''),
    archiveName: String(raw.archive_name ?? raw.archiveName ?? '自动保存'),
    createdAt: String(raw.created_at ?? raw.createdAt ?? new Date().toISOString()),
    roomId,
    worldDay: Number(raw.world_day ?? raw.worldDay ?? 1),
    currentRound: Number(raw.current_round ?? raw.currentRound ?? 0),
    location: (raw.location ?? null) as MultiplayerSaveData['location'],
    playerCharacters: (raw.player_characters ?? raw.playerCharacters ?? {}) as MultiplayerSaveData['playerCharacters'],
    sharedWorldState: (raw.shared_world_state ?? raw.sharedWorldState ?? {}) as Record<string, unknown>,
    chronicleEntries: (raw.chronicle_entries ?? raw.chronicleEntries ?? []) as MultiplayerSaveData['chronicleEntries'],
    playerList: ((raw.player_list ?? raw.playerList ?? []) as Array<Record<string, unknown>>).map((player) => ({
      playerId: String(player.player_id ?? player.playerId ?? ''),
      characterName: String(player.character_name ?? player.characterName ?? ''),
    })),
  };
}

function normalizeSpectatorReady(raw: Record<string, unknown>): SpectatorReadyResponse {
  return {
    status: String(raw.status ?? ''),
    message: String(raw.message ?? ''),
    estimatedIntroRound: Number(raw.estimated_intro_round ?? raw.estimatedIntroRound ?? 0),
  };
}

// ─── 房间操作 ───

export async function createRoom(
  config: Record<string, unknown>,
  mode: 'new' | 'inherit' = 'new',
  inheritData?: Record<string, unknown>,
): Promise<Room> {
  const body: Record<string, unknown> = { mode, config };
  if (inheritData) body.inherit_data = inheritData;
  return normalizeRoom(await apiRequest<Record<string, unknown>>('POST', '/api/v1/multiplayer/rooms', body));
}

export async function getRoom(roomId: string): Promise<Room> {
  return normalizeRoom(await apiRequest<Record<string, unknown>>('GET', `/api/v1/multiplayer/rooms/${roomId}`));
}

export async function joinRoom(
  roomId: string, password?: string, claimedSlotId?: string,
): Promise<Room> {
  return normalizeRoom(await apiRequest<Record<string, unknown>>('POST', `/api/v1/multiplayer/rooms/${roomId}/join`, {
    password,
    claimed_slot_id: claimedSlotId,
  }));
}

export async function leaveRoom(roomId: string): Promise<void> {
  await apiRequest<void>('POST', `/api/v1/multiplayer/rooms/${roomId}/leave`);
}

export async function sendHeartbeat(roomId: string): Promise<void> {
  await apiRequest<void>('POST', `/api/v1/multiplayer/rooms/${roomId}/heartbeat`);
}

// ─── 角色操作 ───

export async function claimSlot(roomId: string, slotId: string): Promise<void> {
  await apiRequest<void>('POST', `/api/v1/multiplayer/rooms/${roomId}/claim-slot`, { slot_id: slotId });
}

export async function releaseSlot(roomId: string): Promise<void> {
  await apiRequest<void>('POST', `/api/v1/multiplayer/rooms/${roomId}/release-slot`);
}

export async function markCharacterReady(
  roomId: string, characterId: string, characterName: string,
  characterData?: unknown, characterBackground?: string,
): Promise<void> {
  await apiRequest<void>('POST', `/api/v1/multiplayer/rooms/${roomId}/character-ready`, {
    character_id: characterId,
    character_name: characterName,
    character_data: characterData,
    character_background: characterBackground,
  });
}

export async function generateCommonBackstory(roomId: string): Promise<CommonBackstory> {
  const raw = await apiRequest<Record<string, unknown>>(
    'POST', `/api/v1/multiplayer/rooms/${roomId}/generate-common-backstory`,
  );
  return {
    commonBackstory: String(raw.common_backstory ?? raw.commonBackstory ?? ''),
    suggestedStartingLocation: (raw.suggested_starting_location ?? raw.suggestedStartingLocation ?? null) as CommonBackstory['suggestedStartingLocation'],
    individualHooks: (raw.individual_hooks ?? raw.individualHooks ?? {}) as Record<string, string>,
  };
}

export async function startGame(roomId: string, startingLocation?: Record<string, unknown>): Promise<Room> {
  return normalizeRoom(await apiRequest<Record<string, unknown>>('POST', `/api/v1/multiplayer/rooms/${roomId}/start`, {
    starting_location: startingLocation,
  }));
}

// ─── 行动轮 ───

export async function submitAction(
  roomId: string,
  action: string,
  diceResult?: Record<string, unknown>,
): Promise<RoundSubmission> {
  const raw = await apiRequest<Record<string, unknown>>('POST', `/api/v1/multiplayer/rooms/${roomId}/action`, {
    action,
    dice_result: diceResult,
  });
  return {
    playersActed: (raw.players_acted ?? raw.playersActed ?? []) as string[],
    totalPlayers: Number(raw.total_players ?? raw.totalPlayers ?? 0),
    isRoundComplete: Boolean(raw.is_round_complete ?? raw.isRoundComplete ?? false),
    roundResult: raw.round_result ? normalizeRoundResult(raw.round_result as Record<string, unknown>) : undefined,
  };
}

export async function skipRound(roomId: string): Promise<RoundSubmission> {
  const raw = await apiRequest<Record<string, unknown>>('POST', `/api/v1/multiplayer/rooms/${roomId}/action-skip`);
  return {
    playersActed: (raw.players_acted ?? raw.playersActed ?? []) as string[],
    totalPlayers: Number(raw.total_players ?? raw.totalPlayers ?? 0),
    isRoundComplete: Boolean(raw.is_round_complete ?? raw.isRoundComplete ?? false),
    roundResult: raw.round_result ? normalizeRoundResult(raw.round_result as Record<string, unknown>) : undefined,
  };
}

export async function getRoundStatus(roomId: string): Promise<RoundStatus> {
  return normalizeRoundStatus(await apiRequest<Record<string, unknown>>('GET', `/api/v1/multiplayer/rooms/${roomId}/round-status`));
}

export async function processRound(roomId: string): Promise<RoundResult> {
  return normalizeRoundResult(await apiRequest<Record<string, unknown>>('POST', `/api/v1/multiplayer/rooms/${roomId}/round-process`));
}

export async function getNarratives(roomId: string, sinceRound = 0): Promise<NarrativeHistory[]> {
  const raw = await apiRequest<{ narratives?: Array<Record<string, unknown>> }>(
    'GET',
    `/api/v1/multiplayer/rooms/${roomId}/narratives?since_round=${sinceRound}`,
  );
  return (raw.narratives ?? []).map(normalizeNarrativeHistory);
}

export async function getRoomNotifications(roomId: string, sinceRound = -1): Promise<RoomNotification[]> {
  const raw = await apiRequest<{ notifications?: Array<Record<string, unknown>> }>(
    'GET',
    `/api/v1/multiplayer/rooms/${roomId}/notifications?since_round=${sinceRound}`,
  );
  return (raw.notifications ?? []).map(normalizeRoomNotification);
}

// ─── 观战 ───

export async function spectatorReady(
  roomId: string, characterId: string, characterName: string,
  characterData?: unknown, characterBackground?: string,
): Promise<SpectatorReadyResponse> {
  return normalizeSpectatorReady(await apiRequest<Record<string, unknown>>('POST', `/api/v1/multiplayer/rooms/${roomId}/spectator-ready`, {
    character_id: characterId,
    character_name: characterName,
    character_data: characterData,
    character_background: characterBackground,
  }));
}

// ─── 存档 ───

export async function requestSaveData(roomId: string): Promise<MultiplayerSaveData> {
  return normalizeSaveData(
    await apiRequest<Record<string, unknown>>('POST', `/api/v1/multiplayer/rooms/${roomId}/save`),
    roomId,
  );
}
