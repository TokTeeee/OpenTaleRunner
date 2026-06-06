import { useRef, useState, useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useCharacterStore } from '../stores/characterStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useWorldStore } from '../stores/worldStore';
import { useMultiplayerStore } from '../stores/multiplayerStore';
import { eventBus } from '../services/event/EventBus';
import { EVENTS } from '../services/event/events';
import type { Character } from '../types/character';
import { _chronicleRecorder, getPmError, subscribePmError, setPmErrorShared } from './pmEngine/shared';
import { syncRoundResultMessages, applyMultiplayerConsequenceIfNew } from './pmEngine/useMultiplayerSync';
import { usePMInitialization } from './pmEngine/usePMInitialization';
import { useSceneFlow } from './pmEngine/useSceneFlow';
import { useActionSubmit } from './pmEngine/useActionSubmit';
import { useMultiplayerSync } from './pmEngine/useMultiplayerSync';
import { useDayTransition } from './pmEngine/useDayTransition';

export { applyConsequences } from '../services/consequence/applyConsequences';
export const chronicleRecorder = _chronicleRecorder;

export function usePMEngine() {
  const game = useGameStore();
  const settings = useSettingsStore();
  const multiplayerMode = useMultiplayerStore((s) => s.gameMode);
  const multiplayerRoomId = useMultiplayerStore((s) => s.roomId);
  const multiplayerCurrentPlayerId = useMultiplayerStore((s) => s.currentPlayerId);
  const multiplayerPlayers = useMultiplayerStore((s) => s.players);
  const multiplayerPlayersActed = useMultiplayerStore((s) => s.playersActed);
  const multiplayerLatestRoundResult = useMultiplayerStore((s) => s.latestRoundResult);

  const [pmError, setPmErrorLocal] = useState<string | null>(getPmError());
  const [isRetrying, setIsRetrying] = useState(false);

  const subscribeRef = useRef<(() => void) | null>(null);
  if (subscribeRef.current === null) {
    subscribeRef.current = subscribePmError(() => setPmErrorLocal(getPmError()));
  }
  void subscribeRef;

  useEffect(() => {
    const unsub = eventBus.on(EVENTS.GM_ACTIVITY, (data: unknown) => {
      const d = data as { activity: string } | undefined;
      if (!d?.activity) {
        useGameStore.getState().clearGmActivity();
      } else {
        useGameStore.getState().setGmActivity(d.activity);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (multiplayerMode !== 'multiplayer' || !multiplayerRoomId) {
      return;
    }

    const currentSession = multiplayerPlayers.find((player) => player.playerId === multiplayerCurrentPlayerId);
    const canAct = Boolean(
      currentSession
        && currentSession.status === 'in_game'
        && multiplayerCurrentPlayerId
        && !multiplayerPlayersActed.includes(multiplayerCurrentPlayerId),
    );

    game.setWaitingForPM(false);
    game.setWaitingForPlayer(canAct);
    if (!canAct) {
      game.setChoices([]);
    }
  }, [game, multiplayerMode, multiplayerRoomId, multiplayerCurrentPlayerId, multiplayerPlayers, multiplayerPlayersActed]);

  useEffect(() => {
    if (multiplayerMode !== 'multiplayer' || !multiplayerRoomId || !multiplayerLatestRoundResult) {
      return;
    }

    syncRoundResultMessages(multiplayerRoomId, multiplayerLatestRoundResult, multiplayerPlayers);
    applyMultiplayerConsequenceIfNew(multiplayerRoomId, multiplayerLatestRoundResult, multiplayerCurrentPlayerId);
  }, [multiplayerMode, multiplayerRoomId, multiplayerLatestRoundResult, multiplayerPlayers, multiplayerCurrentPlayerId]);

  const getLLMConfig = () => settings.getLLMContext();
  const getStoreStates = () => ({
    world: useWorldStore.getState(),
    character: useCharacterStore.getState().character as Character,
  });

  const init = usePMInitialization(getLLMConfig, getStoreStates);

  const setWaitingForPM = (v: boolean) => {
    useGameStore.getState().setWaitingForPM(v);
  };

  const mp = useMultiplayerSync(game);

  const scene = useSceneFlow({
    initPM: init.initPM,
    handlePMError: init.handlePMError,
    clearError: init.clearError,
    hydrateMultiplayerScene: mp.hydrateMultiplayerScene,
    setWaitingForPM,
  });

  const action = useActionSubmit({
    initPM: init.initPM,
    handlePMError: init.handlePMError,
    clearError: init.clearError,
    applySceneLocation: scene.applySceneLocation,
    buildCharacterRuntimeSnapshot: scene.buildCharacterRuntimeSnapshot,
    setWaitingForPM,
  });

  const day = useDayTransition({
    requestScene: scene.requestScene,
    setWaitingForPM,
  });

  const clearError = () => {
    setPmErrorShared(null);
    setIsRetrying(false);
  };

  return {
    requestScene: scene.requestScene,
    submitAction: action.submitAction,
    skipAction: action.skipAction,
    pickChoice: action.pickChoice,
    submitCustom: action.submitCustom,
    abort: action.abort,
    initPM: init.initPM,
    startNewDay: day.startNewDay,
    pmError,
    isRetrying,
    clearError,
    chronicleRecorder: _chronicleRecorder,
  };
}
