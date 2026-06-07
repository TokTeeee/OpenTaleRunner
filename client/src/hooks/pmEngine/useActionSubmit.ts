import { useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useCharacterStore } from '../../stores/characterStore';
import { useMultiplayerStore } from '../../stores/multiplayerStore';
import { eventBus } from '../../services/event/EventBus';
import { EVENTS } from '../../services/event/events';
import { sanitizePromptInput } from '../../services/security/sanitize';
import type { Character } from '../../types/character';
import type { Choice } from '../../types/game';
import {
  submitAction as submitMultiplayerRoundAction,
  skipRound as skipMultiplayerRound,
} from '../../services/multiplayer/MultiplayerAPI';
import { getPmEngine, isCombatAction } from './shared';
import { syncRoundResultMessages } from './useMultiplayerSync';
import { useDiceJudge } from './useDiceJudge';
import { useSingleSubmit } from './useSingleSubmit';

interface ActionSubmitDeps {
  initPM: () => Promise<void>;
  handlePMError: (err: unknown, context: string) => void;
  clearError: () => void;
  applySceneLocation: (rawLocation: string, description: string) => void;
  buildCharacterRuntimeSnapshot: (baseChar: Character) => Character;
  setWaitingForPM: (v: boolean) => void;
}

export function useActionSubmit(deps: ActionSubmitDeps) {
  const { clearError, handlePMError, setWaitingForPM } = deps;

  // v0.5.11: 骰子/检定抽象已抽到 useDiceJudge sub-hook
  const { judgeAction } = useDiceJudge();

  // v0.5.11: 单人 mode 路径抽到 useSingleSubmit
  const { submitActionSingle } = useSingleSubmit(deps);

  const submitAction = useCallback(async (action: string) => {
    if (useMultiplayerStore.getState().gameMode === 'multiplayer' && useMultiplayerStore.getState().roomId) {
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
      return;
    }

    // v0.5.11: 单人 mode 路径已抽到 useSingleSubmit
    await submitActionSingle(action);
  }, [clearError, handlePMError, judgeAction, submitActionSingle]);

  const skipAction = useCallback(async () => {
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

  const pickChoice = useCallback(async (choice: Choice) => {
    await submitAction(choice.text);
  }, [submitAction]);

  const submitCustom = useCallback(async (text: string) => {
    if (!text.trim()) return;
    await submitAction(text.trim());
  }, [submitAction]);

  const abort = useCallback(() => {
    getPmEngine()?.abort();
    const game = useGameStore.getState();
    game.setWaitingForPM(false);
    setWaitingForPM(false);
  }, [setWaitingForPM]);

  return { submitAction, submitCustom, pickChoice, abort, skipAction };
}
