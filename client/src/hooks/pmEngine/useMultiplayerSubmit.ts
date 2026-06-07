import { useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useCharacterStore } from '../../stores/characterStore';
import { useMultiplayerStore } from '../../stores/multiplayerStore';
import { eventBus } from '../../services/event/EventBus';
import { EVENTS } from '../../services/event/events';
import { sanitizePromptInput } from '../../services/security/sanitize';
import {
  submitAction as submitMultiplayerRoundAction,
  skipRound as skipMultiplayerRound,
} from '../../services/multiplayer/MultiplayerAPI';
import { isCombatAction } from './shared';
import { syncRoundResultMessages } from './useMultiplayerSync';
import { useDiceJudge } from './useDiceJudge';

export interface MultiplayerSubmitDeps {
  clearError: () => void;
  handlePMError: (err: unknown, context: string) => void;
}

/**
 * v0.5.11: 多人 mode submit / skip 路径。从 useActionSubmit 抽出。
 * - submitActionMulti(action): 走 room round (judge + sync + send)
 * - skipRound(): 跳本轮
 */
export function useMultiplayerSubmit(deps: MultiplayerSubmitDeps) {
  const { clearError, handlePMError } = deps;
  const { judgeAction } = useDiceJudge();

  const submitActionMulti = useCallback(async (action: string) => {
    const multiplayer = useMultiplayerStore.getState();
    const roomId = multiplayer.roomId;
    const currentPlayerId = multiplayer.currentPlayerId;
    const currentSession = multiplayer.players.find((player) => player.playerId === currentPlayerId);
    const trimmedAction = action.trim();
    if (!roomId || !currentPlayerId || !trimmedAction || currentSession?.status !== 'in_game') return;

    clearError();
    try {
      const diceResult = judgeAction(trimmedAction, useCharacterStore.getState().character);
      if (diceResult && !('auto' in diceResult)) {
        const game = useGameStore.getState();
        game.setDiceResult(diceResult as unknown as import('../../types/game').DiceResult);
      }
      const diceResultWire = diceResult as unknown as Record<string, unknown> | undefined;

      const game = useGameStore.getState();
      game.upsertMessage({
        id: `mp-${roomId}-player-action-${multiplayer.currentRound}-${currentPlayerId}`,
        type: 'player',
        content: trimmedAction,
        timestamp: Date.now(),
      });
      game.addRecentAction(trimmedAction);
      if (isCombatAction(trimmedAction)) {
        eventBus.emit(EVENTS.CRITICAL_SYNC_FLUSH, {
          reason: 'combat_started',
          action: trimmedAction,
        });
      }

      const nextPlayersActed = Array.from(new Set([...multiplayer.playersActed, currentPlayerId]));
      const inGamePlayerIds = multiplayer.players
        .filter((player) => player.status === 'in_game')
        .map((player) => player.playerId);
      multiplayer.updateRoundStatus({
        currentRound: multiplayer.currentRound,
        playersActed: nextPlayersActed,
        pendingPlayers: inGamePlayerIds.filter((playerId) => !nextPlayersActed.includes(playerId)),
        actions: { ...multiplayer.currentActions, [currentPlayerId]: trimmedAction },
        diceResults: diceResultWire
          ? { ...multiplayer.currentDiceResults, [currentPlayerId]: diceResultWire }
          : multiplayer.currentDiceResults,
        roundStartTime: multiplayer.roundStartTime || new Date().toISOString(),
        timeoutAt: multiplayer.timeoutAt,
        latestRoundResult: multiplayer.latestRoundResult,
      });

      const result = await submitMultiplayerRoundAction(roomId, sanitizePromptInput(trimmedAction), diceResultWire);
      if (result.roundResult) {
        multiplayer.handleRoundResult(result.roundResult);
        syncRoundResultMessages(roomId, result.roundResult, multiplayer.players);
      }
    } catch (err) {
      handlePMError(err, '多人动作处理');
    }
  }, [clearError, handlePMError, judgeAction]);

  const skipRound = useCallback(async () => {
    const multiplayer = useMultiplayerStore.getState();
    if (multiplayer.gameMode !== 'multiplayer' || !multiplayer.roomId || !multiplayer.currentPlayerId) {
      return;
    }

    const currentSession = multiplayer.players.find((player) => player.playerId === multiplayer.currentPlayerId);
    if (currentSession?.status !== 'in_game') {
      return;
    }

    clearError();
    try {
      const game = useGameStore.getState();
      game.upsertMessage({
        id: `mp-${multiplayer.roomId}-player-skip-${multiplayer.currentRound}-${multiplayer.currentPlayerId}`,
        type: 'player',
        content: '（跳过本轮）',
        timestamp: Date.now(),
      });

      const nextPlayersActed = Array.from(new Set([...multiplayer.playersActed, multiplayer.currentPlayerId]));
      const inGamePlayerIds = multiplayer.players
        .filter((player) => player.status === 'in_game')
        .map((player) => player.playerId);
      multiplayer.updateRoundStatus({
        currentRound: multiplayer.currentRound,
        playersActed: nextPlayersActed,
        pendingPlayers: inGamePlayerIds.filter((playerId) => !nextPlayersActed.includes(playerId)),
        actions: { ...multiplayer.currentActions, [multiplayer.currentPlayerId]: '跳过' },
        diceResults: multiplayer.currentDiceResults,
        roundStartTime: multiplayer.roundStartTime || new Date().toISOString(),
        timeoutAt: multiplayer.timeoutAt,
        latestRoundResult: multiplayer.latestRoundResult,
      });

      const result = await skipMultiplayerRound(multiplayer.roomId);
      if (result.roundResult) {
        multiplayer.handleRoundResult(result.roundResult);
        syncRoundResultMessages(multiplayer.roomId, result.roundResult, multiplayer.players);
      }
    } catch (err) {
      handlePMError(err, '多人跳过');
    }
  }, [clearError, handlePMError]);

  return { submitActionMulti, skipRound };
}
