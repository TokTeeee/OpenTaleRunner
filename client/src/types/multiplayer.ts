/**
 * 多人联机系统类型定义
 * 对应服务端 models/multiplayer.py
 */

import type { Character } from './character';

// ─── 房间配置 ───

export type NarrativeStyle = 'concise' | 'detailed' | 'epic' | 'humorous';
export type NarrativeLanguage = 'zh' | 'en' | 'auto';
export type DeathPenalty = 'permanent' | 'soft' | 'narrative_only';

export const NARRATIVE_STYLE_LABELS: Record<NarrativeStyle, string> = {
  concise: '简洁',
  detailed: '细腻',
  epic: '宏大',
  humorous: '幽默',
};

export const DEATH_PENALTY_LABELS: Record<DeathPenalty, string> = {
  permanent: '永久死亡',
  soft: '重伤可恢复',
  narrative_only: '仅叙事',
};

export interface RoomConfig {
  // 基本设置
  roomName: string;           // 1-30字
  maxPlayers: number;         // 1-10
  password?: string;          // 可选密码

  // 故事设置
  storybookId?: string;       // null=服务器默认
  startingRegion?: string;    // null=GM决定
  narrativeStyle: NarrativeStyle;
  narrativeLanguage: NarrativeLanguage;

  // 游戏规则
  difficultyModifier: number; // -5 ~ +5
  allowNpcRecruitment: boolean;
  enableFastTravel: boolean;
  deathPenalty: DeathPenalty;
  restRecoveryMultiplier: number; // 0.5 ~ 2.0

  // 行动轮规则
  actionRoundTimeout: number; // 60 ~ 600 秒
  autoSkipOnTimeout: boolean;
  allowSkipAction: boolean;

  // 房间管理
  allowLateJoin: boolean;
  lateJoinIntroDelay: number;  // 1 ~ 5 轮
  allowSpectators: boolean;
}

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  roomName: '冒险小队',
  maxPlayers: 4,
  password: undefined,
  storybookId: undefined,
  startingRegion: undefined,
  narrativeStyle: 'detailed',
  narrativeLanguage: 'zh',
  difficultyModifier: 0,
  allowNpcRecruitment: true,
  enableFastTravel: true,
  deathPenalty: 'soft',
  restRecoveryMultiplier: 1.0,
  actionRoundTimeout: 300,
  autoSkipOnTimeout: true,
  allowSkipAction: true,
  allowLateJoin: true,
  lateJoinIntroDelay: 2,
  allowSpectators: false,
};

export const ROOM_PRESETS: Record<string, Partial<RoomConfig>> = {
  beginner: {
    roomName: '新手冒险',
    difficultyModifier: 0,
    narrativeStyle: 'detailed',
    actionRoundTimeout: 300,
    deathPenalty: 'soft',
    allowNpcRecruitment: true,
  },
  hardcore: {
    roomName: '硬核征途',
    difficultyModifier: 3,
    narrativeStyle: 'detailed',
    actionRoundTimeout: 180,
    deathPenalty: 'permanent',
    allowNpcRecruitment: true,
  },
  casual: {
    roomName: '轻松时光',
    difficultyModifier: -2,
    narrativeStyle: 'humorous',
    actionRoundTimeout: 600,
    deathPenalty: 'narrative_only',
    allowNpcRecruitment: true,
  },
  speedrun: {
    roomName: '速通模式',
    difficultyModifier: 0,
    narrativeStyle: 'concise',
    actionRoundTimeout: 120,
    deathPenalty: 'soft',
    allowNpcRecruitment: false,
  },
  epic: {
    roomName: '史诗之旅',
    difficultyModifier: 1,
    narrativeStyle: 'epic',
    actionRoundTimeout: 600,
    deathPenalty: 'soft',
    allowNpcRecruitment: true,
  },
};

export const PRESET_LABELS: Record<string, string> = {
  beginner: '新手友好',
  hardcore: '硬核写实',
  casual: '轻松幽默',
  speedrun: '速通快节奏',
  epic: '史诗长篇',
};

// ─── 玩家会话 ───

export type PlayerStatus =
  | 'waiting'
  | 'creating_character'
  | 'ready'
  | 'in_game'
  | 'spectating'
  | 'pending_intro'
  | 'disconnected';

export const PLAYER_STATUS_LABELS: Record<PlayerStatus, string> = {
  waiting: '等待中',
  creating_character: '创建角色中',
  ready: '已就绪',
  in_game: '游戏中',
  spectating: '观战中',
  pending_intro: '等待引入',
  disconnected: '已离线',
};

export interface RoomPlayer {
  playerId: string;
  playerName: string;
  characterId: string | null;
  characterName: string | null;
  characterBackground: string | null;
  isHost: boolean;
  isReady: boolean;
  isOnline: boolean;
  lastHeartbeat: string;
  status: PlayerStatus;
  slotId?: string;
  joinedAtRound: number;
}

// ─── 角色槽（继承存档模式） ───

export interface CharacterSlot {
  slotId: string;
  characterId: string;
  characterName: string;
  characterSummary: string;
  claimedByPlayerId: string | null;
}

// ─── 房间状态 ───

export type RoomPhase = 'waiting' | 'preparing' | 'playing' | 'ended';

export interface RoomLocation {
  region: string;
  subRegion: string;
  specificPlace: string;
  coordinates: { x: number; y: number; z: number };
}

export interface RoomState {
  phase: RoomPhase;
  worldDay: number;
  currentRound: number;
  location: RoomLocation | null;
  playersActed: string[];
  roundStartTime: string | null;
  commonBackstory: string | null;
}

// ─── 房间 ───

export type RoomMode = 'new' | 'inherit';

export interface Room {
  roomId: string;
  hostPlayerId: string;
  config: RoomConfig;
  mode: RoomMode;
  createdAt: string;
  startedAt: string | null;
  state: RoomState;
  players: RoomPlayer[];
  characterSlots: CharacterSlot[];
  roomNotifications?: RoomNotification[];
}

// ─── 多人存档 ───

export interface MultiplayerSaveData {
  archiveId: string;
  archiveName: string;
  createdAt: string;
  roomId: string;
  worldDay: number;
  currentRound: number;
  location: RoomLocation | null;
  playerCharacters: Record<string, Character>;
  sharedWorldState: Record<string, unknown>;
  chronicleEntries: MultiplayerChronicleEntry[];
  playerList: Array<{ playerId: string; characterName: string }>;
}

// ─── 行动轮 ───

export interface RoundStatus {
  currentRound: number;
  playersActed: string[];
  pendingPlayers: string[];
  actions: Record<string, string>;
  diceResults: Record<string, unknown>;
  roundStartTime: string | null;
  timeoutAt: string | null;
  latestRoundResult?: RoundResult | null;
  recentNotifications?: RoomNotification[];
}

export interface RoomNotification {
  event: 'spectator_joined' | 'character_created' | 'player_introduced';
  playerId: string;
  playerName: string;
  characterName: string;
  characterBackground: string;
  round: number;
  narrative: string;
  timestamp: string;
}

export interface RoomNotificationsResponse {
  notifications: RoomNotification[];
}

export interface RoundSubmission {
  playersActed: string[];
  totalPlayers: number;
  isRoundComplete: boolean;
  roundResult?: RoundResult;
}

export interface SpectatorReadyResponse {
  status: string;
  message: string;
  estimatedIntroRound: number;
}

export interface Conflict {
  type: 'target_conflict' | 'space_conflict' | 'causal_conflict';
  players: string[];
  target?: string;
  resolution: 'simultaneous' | 'sequential';
  description?: string;
}

export interface RoundResult {
  round: number;
  playerActions: Record<string, string>;
  diceResults: Record<string, unknown>;
  conflicts: Conflict[];
  narrative: string;
  consequences: Record<string, unknown>;
  worldStateChanges: Record<string, unknown>;
  introducedPlayers: Array<{
    playerId: string;
    characterName: string;
    narrative: string;
  }>;
  nextRound: number;
}

// ─── 编年史 ───

export interface MultiplayerChronicleEntry {
  id: string;
  worldDay: number;
  round: number;
  location: {
    region: string;
    subRegion: string;
    specificPlace: string;
  };
  playerActions: Record<string, {
    action: string;
    diceResult?: unknown;
    skipped: boolean;
  }>;
  conflicts: Conflict[];
  narrative: string;
  playerConsequences: Record<string, unknown>;
  worldStateChanges: Record<string, unknown>;
  timestamp: string;
}

// ─── 共同背景故事 ───

export interface CommonBackstory {
  commonBackstory: string;
  suggestedStartingLocation: RoomLocation | null;
  individualHooks: Record<string, string>;
}

// ─── 叙事历史 ───

export interface NarrativeHistory {
  round: number;
  narrative: string;
  playerActions: Record<string, string>;
  diceResults: Record<string, unknown>;
  timestamp: string;
}

// ─── 单人实时同步 ───

export interface NearbyPlayer {
  playerId: string;
  characterName: string;
  region: string;
  subRegion: string;
  coordinates: { x: number; y: number; z: number };
  currentAction: string;
  status: string;
  worldDay: number;
  lastHeartbeat: string;
}

export interface RealtimeSessionUpload {
  characterName: string;
  region: string;
  subRegion: string;
  coordinates: { x: number; y: number; z: number };
  worldDay: number;
  currentAction: string;
  status: string;
}
