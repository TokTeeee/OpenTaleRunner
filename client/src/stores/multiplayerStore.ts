/**
 * 多人联机状态中心。
 * 管理房间信息、玩家会话、角色槽认领、大厅阶段、行动轮结果和本地联机存档索引，
 * 负责把多人 API 返回的快照转换成 UI 可直接消费的房间状态。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  persistArchive,
  loadLocalArchives as loadStoredArchives,
  deleteLocalArchive as deleteStoredArchive,
} from '../services/multiplayer/SaveManager';
import type {
  Room, RoomConfig, RoomPlayer, CharacterSlot, RoomMode, RoomLocation,
  RoundStatus, RoundResult, MultiplayerSaveData, CommonBackstory, NarrativeHistory,
  RoomNotification,
} from '../types/multiplayer';

export type LobbyPhase = 'waiting' | 'creating_character' | 'ready' | 'all_ready' | 'starting';

interface MultiplayerState {
  // ─── 模式 ───
  gameMode: 'single' | 'multiplayer' | null;

  // ─── 房间 ───
  roomId: string | null;
  roomMode: RoomMode | null;
  roomPhase: Room['state']['phase'];
  isHost: boolean;
  currentPlayerId: string | null;
  roomConfig: RoomConfig | null;
  players: RoomPlayer[];
  characterSlots: CharacterSlot[];
  mySlotId: string | null;

  // ─── 大厅状态 ───
  lobbyPhase: LobbyPhase;

  // ─── 游戏状态 ───
  currentRound: number;
  playersActed: string[];
  pendingPlayers: string[];
  commonBackstory: string | null;
  suggestedLocation: RoomLocation | null;
  individualHooks: Record<string, string>;
  roundStartTime: string | null;
  timeoutAt: string | null;
  currentActions: Record<string, string>;
  currentDiceResults: Record<string, unknown>;

  // ─── 叙事 ───
  latestNarrative: string | null;
  latestRoundResult: RoundResult | null;
  narrativeHistory: NarrativeHistory[];
  estimatedIntroRound: number | null;

  // ─── 存档（房主本地） ───
  localArchives: MultiplayerSaveData[];

  // ─── 房间通知 ───
  roomNotifications: RoomNotification[];
  lastSeenNotificationIndex: number;

  // ─── 操作：模式 ───
  setGameMode: (mode: 'single' | 'multiplayer' | null) => void;

  // ─── 操作：房间 ───
  setRoomData: (data: Partial<{
    roomId: string; roomMode: RoomMode; roomPhase: Room['state']['phase']; isHost: boolean;
    currentPlayerId: string | null;
    roomConfig: RoomConfig; players: RoomPlayer[];
    characterSlots: CharacterSlot[]; mySlotId: string | null;
    currentRound: number; commonBackstory: string | null;
    narrativeHistory: NarrativeHistory[];
    estimatedIntroRound: number | null;
  }>) => void;
  syncRoomSnapshot: (room: Room) => void;
  updatePlayersFromSync: (players: RoomPlayer[]) => void;
  updateSlotsFromSync: (slots: CharacterSlot[]) => void;
  resetRoom: () => void;

  // ─── 操作：准备 ───
  setLobbyPhase: (phase: LobbyPhase) => void;
  setCommonBackstory: (backstory: CommonBackstory) => void;

  // ─── 操作：游戏 ───
  updateRoundStatus: (status: RoundStatus) => void;
  handleRoundResult: (result: RoundResult) => void;
  markPlayerReady: () => void;
  setNarrativeHistory: (narratives: NarrativeHistory[]) => void;
  setEstimatedIntroRound: (round: number | null) => void;

  // ─── 操作：通知 ───
  setRoomNotifications: (notifications: RoomNotification[]) => void;
  markNotificationsSeen: () => void;

  // ─── 操作：存档 ───
  saveLocalArchive: (archive: MultiplayerSaveData) => void;
  loadLocalArchives: () => MultiplayerSaveData[];
  deleteLocalArchive: (archiveId: string) => void;
}

const INITIAL_ROOM_STATE = {
  roomId: null,
  roomMode: null,
  roomPhase: 'waiting' as Room['state']['phase'],
  isHost: false,
  currentPlayerId: null,
  roomConfig: null,
  players: [],
  characterSlots: [],
  mySlotId: null,
  lobbyPhase: 'waiting' as LobbyPhase,
  currentRound: 0,
  playersActed: [],
  pendingPlayers: [],
  commonBackstory: null,
  suggestedLocation: null,
  individualHooks: {},
  roundStartTime: null,
  timeoutAt: null,
  currentActions: {},
  currentDiceResults: {},
  latestNarrative: null,
  latestRoundResult: null,
  narrativeHistory: [],
  estimatedIntroRound: null,
  roomNotifications: [],
  lastSeenNotificationIndex: -1,
};

export const useMultiplayerStore = create<MultiplayerState>()(
  persist(
    (set, get) => ({
      // ─── 模式 ───
      gameMode: null,
      ...INITIAL_ROOM_STATE,

      // ─── 存档 ───
      localArchives: [],

      // ─── 通知 ───
      roomNotifications: [],
      lastSeenNotificationIndex: -1,

      // ─── 操作 ───

      setGameMode: (mode) => set({ gameMode: mode }),

      setRoomData: (data) => set((state) => ({
        roomId: data.roomId ?? state.roomId,
        roomMode: data.roomMode ?? state.roomMode,
        roomPhase: data.roomPhase ?? state.roomPhase,
        isHost: data.isHost ?? state.isHost,
        currentPlayerId: data.currentPlayerId ?? state.currentPlayerId,
        roomConfig: data.roomConfig ?? state.roomConfig,
        players: data.players ?? state.players,
        characterSlots: data.characterSlots ?? state.characterSlots,
        mySlotId: data.mySlotId ?? state.mySlotId,
        currentRound: data.currentRound ?? state.currentRound,
        commonBackstory: data.commonBackstory ?? state.commonBackstory,
        narrativeHistory: data.narrativeHistory ?? state.narrativeHistory,
        estimatedIntroRound: data.estimatedIntroRound ?? state.estimatedIntroRound,
      })),

      syncRoomSnapshot: (room) => set((state) => ({
        roomId: room.roomId,
        roomMode: room.mode,
        roomPhase: room.state.phase,
        roomConfig: room.config,
        players: room.players,
        characterSlots: room.characterSlots,
        currentRound: room.state.currentRound,
        commonBackstory: room.state.commonBackstory,
        pendingPlayers: room.players
          .filter((player) => player.status === 'in_game' && player.isOnline && !state.playersActed.includes(player.playerId))
          .map((player) => player.playerId),
        roomNotifications: room.roomNotifications && room.roomNotifications.length > 0
          ? (() => {
              const merged = [...state.roomNotifications];
              for (const note of room.roomNotifications) {
                if (!merged.some((existing) => existing.timestamp === note.timestamp && existing.event === note.event && existing.playerId === note.playerId)) {
                  merged.push(note);
                }
              }
              merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
              return merged.slice(-30);
            })()
          : state.roomNotifications,
      })),

      updatePlayersFromSync: (players) => set((state) => ({
        players,
        pendingPlayers: players
          .filter((player) => player.status === 'in_game' && player.isOnline && !get().playersActed.includes(player.playerId))
          .map((player) => player.playerId),
        estimatedIntroRound: players.find((player) => player.playerId === state.currentPlayerId)?.status === 'in_game'
          ? null
          : state.estimatedIntroRound,
      })),

      updateSlotsFromSync: (slots) => set({ characterSlots: slots }),

      resetRoom: () => set({
        gameMode: null,
        ...INITIAL_ROOM_STATE,
        localArchives: get().localArchives,
      }),

      setLobbyPhase: (phase) => set({ lobbyPhase: phase }),

      setCommonBackstory: (backstory) => set({
        commonBackstory: backstory.commonBackstory,
        suggestedLocation: backstory.suggestedStartingLocation,
        individualHooks: backstory.individualHooks,
      }),

      updateRoundStatus: (status) => set((state) => {
        const next: Partial<MultiplayerState> = {
          currentRound: status.currentRound,
          playersActed: status.playersActed,
          pendingPlayers: status.pendingPlayers,
          roundStartTime: status.roundStartTime,
          timeoutAt: status.timeoutAt,
          currentActions: status.actions,
          currentDiceResults: status.diceResults,
        };

        if (status.latestRoundResult && status.latestRoundResult.round !== state.latestRoundResult?.round) {
          next.latestNarrative = status.latestRoundResult.narrative;
          next.latestRoundResult = status.latestRoundResult;
          if (!state.narrativeHistory.some((narrative) => narrative.round === status.latestRoundResult?.round)) {
            next.narrativeHistory = [
              ...state.narrativeHistory,
              {
                round: status.latestRoundResult.round,
                narrative: status.latestRoundResult.narrative,
                playerActions: status.latestRoundResult.playerActions,
                diceResults: status.latestRoundResult.diceResults,
                timestamp: new Date().toISOString(),
              },
            ];
          }
        }

        if (status.recentNotifications && status.recentNotifications.length > 0) {
          const merged = [...state.roomNotifications];
          for (const note of status.recentNotifications) {
            if (!merged.some((existing) => existing.timestamp === note.timestamp && existing.event === note.event && existing.playerId === note.playerId)) {
              merged.push(note);
            }
          }
          merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
          next.roomNotifications = merged.slice(-30);
        }

        return next;
      }),

      handleRoundResult: (result) => set((state) => ({
        currentRound: result.nextRound,
        latestNarrative: result.narrative,
        latestRoundResult: result,
        playersActed: [],
        pendingPlayers: [],
        currentActions: {},
        currentDiceResults: {},
        narrativeHistory: state.narrativeHistory.some((narrative) => narrative.round === result.round)
          ? state.narrativeHistory
          : [
              ...state.narrativeHistory,
              {
                round: result.round,
                narrative: result.narrative,
                playerActions: result.playerActions,
                diceResults: result.diceResults,
                timestamp: new Date().toISOString(),
              },
            ],
      })),

      markPlayerReady: () => set((s) => ({
        lobbyPhase: 'ready',
        players: s.players.map(p =>
          p.playerId === s.currentPlayerId ? { ...p, isReady: true, status: 'ready' } : p
        ),
      })),

      setNarrativeHistory: (narratives) => set({
        narrativeHistory: [...narratives].sort((left, right) => left.round - right.round),
      }),

      setEstimatedIntroRound: (round) => set({ estimatedIntroRound: round }),

      setRoomNotifications: (notifications) => {
        const state = get();
        const merged = [...state.roomNotifications];
        for (const note of notifications) {
          if (!merged.some((existing) => existing.timestamp === note.timestamp && existing.event === note.event && existing.playerId === note.playerId)) {
            merged.push(note);
          }
        }
        merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        const trimmed = merged.slice(-30);
        set({ roomNotifications: trimmed });
      },

      markNotificationsSeen: () => {
        set((s) => ({ lastSeenNotificationIndex: s.roomNotifications.length - 1 }));
      },

      // ─── 存档操作 ───
      saveLocalArchive: (archive) => {
        try {
          persistArchive(archive);
        } catch (e) {
          console.warn('[Multiplayer] Failed to save archive:', e);
        }
        set((s) => {
          const existing = s.localArchives.filter(a => a.archiveId !== archive.archiveId);
          const updated = [archive, ...existing].slice(0, 20); // 最多保留20个存档
          return { localArchives: updated };
        });
      },

      loadLocalArchives: () => {
        const archives = loadStoredArchives();
        set({ localArchives: archives });
        return archives;
      },

      deleteLocalArchive: (archiveId) => {
        deleteStoredArchive(archiveId);
        set((s) => ({
          localArchives: s.localArchives.filter(a => a.archiveId !== archiveId),
        }));
      },
    }),
    {
      name: 'aeslan-multiplayer',
      partialize: (s) => ({
        localArchives: s.localArchives,
      }),
    },
  ),
);
