import { useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useMultiplayerStore } from '../../stores/multiplayerStore';
import { getPmEngine } from './shared';
import { useSingleSubmit } from './useSingleSubmit';
import { useMultiplayerSubmit } from './useMultiplayerSubmit';
import type { Character } from '../../types/character';
import type { Choice } from '../../types/game';

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

  // v0.5.11: 单人 mode 路径抽到 useSingleSubmit
  const { submitActionSingle } = useSingleSubmit(deps);

  // v0.5.11: 多人 mode 路径抽到 useMultiplayerSubmit
  const { submitActionMulti, skipRound } = useMultiplayerSubmit({
    clearError,
    handlePMError,
  });

  const submitAction = useCallback(async (action: string) => {
    // v0.5.11: 模式分发 (多人 vs 单人) 由入口处理
    if (useMultiplayerStore.getState().gameMode === 'multiplayer' && useMultiplayerStore.getState().roomId) {
      await submitActionMulti(action);
      return;
    }
    await submitActionSingle(action);
  }, [submitActionMulti, submitActionSingle]);

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

  return { submitAction, submitCustom, pickChoice, abort, skipAction: skipRound };
}
