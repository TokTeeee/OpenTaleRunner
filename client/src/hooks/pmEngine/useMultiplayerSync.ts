import { useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useNPCStore } from '../../stores/npcStore';
import { usePartyStore } from '../../stores/partyStore';
import { useMultiplayerStore } from '../../stores/multiplayerStore';
import { buildPartyMemberFromNPC } from '../../services/party/inferAbilities';
import { resolveNarrativePartyJoinNames } from '../../services/narrative/partySync';
import type { Message, ConsequenceData } from '../../types/game';
import type { NarrativeHistory, RoomPlayer } from '../../types/multiplayer';
import type { RoundResult } from '../../types/multiplayer';
import {
  getNarratives,
  getRoom as getMultiplayerRoom,
  getRoundStatus as getMultiplayerRoundStatus,
} from '../../services/multiplayer/MultiplayerAPI';
import { applyConsequences } from '../../services/consequence/applyConsequences';
import { formatMultiplayerDiceSummary, syncedMultiplayerRounds, appliedMultiplayerConsequences } from './shared';

function buildRoundMessages(
  roomId: string,
  round: number,
  narrative: string,
  playerActions: Record<string, string>,
  diceResults: Record<string, unknown>,
  players: RoomPlayer[],
  timestamp: number,
): Message[] {
  const details = Object.entries(playerActions).map(([playerId, action]) => {
    const player = players.find((item) => item.playerId === playerId);
    return {
      playerId,
      playerName: player?.characterName || player?.playerName || playerId,
      action,
      dice: formatMultiplayerDiceSummary(diceResults[playerId]),
    };
  });

  return [
    {
      id: `mp-${roomId}-round-summary-${round}`,
      type: 'round_summary',
      content: '行动与判定',
      timestamp,
      round,
      details,
    },
    {
      id: `mp-${roomId}-narrative-${round}`,
      type: 'pm',
      content: narrative,
      timestamp: timestamp + 1,
      round,
    },
  ];
}

export function syncRoundResultMessages(roomId: string, result: RoundResult, players: RoomPlayer[]): void {
  const roundKey = `${roomId}:${result.round}`;
  if (syncedMultiplayerRounds.has(roundKey)) {
    return;
  }

  const game = useGameStore.getState();
  const baseTimestamp = Date.now();
  const messages = [
    ...buildRoundMessages(
      roomId,
      result.round,
      result.narrative,
      result.playerActions,
      result.diceResults,
      players,
      baseTimestamp,
    ),
    ...(result.introducedPlayers || []).map((player, index) => ({
      id: `mp-${roomId}-intro-${result.round}-${player.playerId}`,
      type: 'system' as const,
      content: `${player.characterName} 加入了队伍！`,
      timestamp: baseTimestamp + index + 2,
    })),
  ];

  for (const message of messages) {
    game.upsertMessage(message);
  }
  syncedMultiplayerRounds.add(roundKey);
}

export function buildHistoryMessages(roomId: string, histories: NarrativeHistory[], players: RoomPlayer[]): Message[] {
  return histories
    .slice()
    .sort((left, right) => left.round - right.round)
    .flatMap((history) => {
      const timestamp = Number.isNaN(Date.parse(history.timestamp)) ? Date.now() : Date.parse(history.timestamp);
      return buildRoundMessages(
        roomId,
        history.round,
        history.narrative,
        history.playerActions,
        history.diceResults,
        players,
        timestamp,
      );
    });
}

export function syncNarrativePartyMembers(actionText: string, narrative: string): void {
  const joinNames = resolveNarrativePartyJoinNames(actionText, narrative);
  if (joinNames.length === 0) {
    return;
  }

  const npcStore = useNPCStore.getState();
  const partyStore = usePartyStore.getState();
  for (const name of joinNames) {
    const npc = Object.values(npcStore.npcs).find((entry) => entry.name === name);
    if (!npc) {
      continue;
    }
    npcStore.meetNPC(npc.npcId);
    partyStore.addMember(buildPartyMemberFromNPC(npc, npc.relationship.level, 'GM 叙事加入队伍'));
  }
}

export function applyMultiplayerConsequenceIfNew(
  roomId: string,
  roundResult: RoundResult,
  currentPlayerId: string | null,
): void {
  const consequenceKey = `${roomId}:${roundResult.round}`;
  if (
    currentPlayerId
    && !appliedMultiplayerConsequences.has(consequenceKey)
    && roundResult.consequences[currentPlayerId]
  ) {
    applyConsequences(roundResult.consequences[currentPlayerId] as ConsequenceData);
    appliedMultiplayerConsequences.add(consequenceKey);
  }
}

export function useMultiplayerSync(
  gameApi: ReturnType<typeof useGameStore.getState>,
) {
  const hydrateMultiplayerScene = useCallback(async () => {
    const multiplayer = useMultiplayerStore.getState();
    if (!multiplayer.roomId) return;

    const [room, status, histories] = await Promise.all([
      getMultiplayerRoom(multiplayer.roomId),
      getMultiplayerRoundStatus(multiplayer.roomId),
      getNarratives(multiplayer.roomId, -1),
    ]);

    multiplayer.syncRoomSnapshot(room);
    multiplayer.updateRoundStatus(status);
    multiplayer.setNarrativeHistory(histories);

    const historyMessages = buildHistoryMessages(multiplayer.roomId, histories, room.players);
    gameApi.setMessages(historyMessages);
    gameApi.clearStreaming();
    gameApi.setChoices([]);
    gameApi.setWaitingForPM(false);

    if (status.latestRoundResult && !histories.some((history) => history.round === status.latestRoundResult?.round)) {
      syncRoundResultMessages(multiplayer.roomId, status.latestRoundResult, room.players);
    }
  }, [gameApi]);

  return { hydrateMultiplayerScene };
}
