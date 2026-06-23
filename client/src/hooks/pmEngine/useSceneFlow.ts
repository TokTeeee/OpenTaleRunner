import { useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useCharacterStore } from '../../stores/characterStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useWorldStore } from '../../stores/worldStore';
import { useCharacterListStore } from '../../stores/characterListStore';
import { useMultiplayerStore } from '../../stores/multiplayerStore';
import { APIClient } from '../../services/sync/APIClient';
import { activityReporter } from '../../services/activity/ActivityReporter';
import { eventBus } from '../../services/event/EventBus';
import { EVENTS } from '../../services/event/events';
import { generateId } from '../../utils/text';
import { logger } from '../../utils/logger';
import type { Character } from '../../types/character';
import type { SceneContext, SceneResponse } from '../../types/game';
import { getPmEngine, resolveLocationParts, looksLikeInitializationAck } from './shared';
import { syncMapLocationFromGame } from '../../services/map/mapLocationSync';

interface SceneFlowDeps {
  initPM: () => Promise<void>;
  handlePMError: (err: unknown, context: string) => void;
  clearError: () => void;
  hydrateMultiplayerScene: () => Promise<void>;
  setWaitingForPM: (v: boolean) => void;
}

export function useSceneFlow(deps: SceneFlowDeps) {
  const { initPM, handlePMError, clearError, hydrateMultiplayerScene, setWaitingForPM } = deps;

  const applySceneLocation = useCallback((rawLocation: string, description: string) => {
    if (!rawLocation.trim()) return;

    const liveGame = useGameStore.getState();
    const liveWorld = useWorldStore.getState();
    const previousLocation = liveGame.currentStructuredLocation;
    const previousKey = [
      previousLocation?.region || liveGame.currentRegion,
      previousLocation?.subRegion || liveGame.currentSubRegion,
      previousLocation?.specificPlace || liveGame.currentLocation,
    ].filter(Boolean).join('·');
    const { fullPath, subRegion, specificPlace } = resolveLocationParts(rawLocation, liveGame.currentSubRegion);
    const knownMatch = liveGame.knownLocations.find((location) =>
      fullPath.includes(location.name) || location.name.includes(fullPath) || location.name.includes(specificPlace) || specificPlace.includes(location.name));
    const regionName = liveWorld.storybook?.regions?.find((region) => region.id === liveGame.currentRegion || region.name === liveGame.currentRegion)?.name
      || liveGame.currentRegion;

    if (subRegion) {
      liveGame.setSubRegion(subRegion);
    }
    liveGame.setLocation(specificPlace || fullPath);
    liveGame.addKnownLocation(fullPath, knownMatch?.coordinates ? { x: knownMatch.coordinates.x, z: knownMatch.coordinates.z } : undefined);
    if (knownMatch) {
      liveGame.setCoordinates({ x: knownMatch.coordinates.x, y: 0, z: knownMatch.coordinates.z });
    }
    liveGame.updateCurrentLocation({
      region: liveGame.currentRegion,
      regionName,
      subRegion: subRegion || liveGame.currentSubRegion,
      specificPlace: specificPlace || fullPath,
      description: description.slice(0, 120),
      coordinates: knownMatch
        ? { x: knownMatch.coordinates.x, y: 0, z: knownMatch.coordinates.z }
        : liveGame.coordinates,
    });

    syncMapLocationFromGame();

    const updatedGame = useGameStore.getState();
    const nextLocation = updatedGame.currentStructuredLocation;
    const nextKey = [
      nextLocation?.region || updatedGame.currentRegion,
      nextLocation?.subRegion || updatedGame.currentSubRegion,
      nextLocation?.specificPlace || updatedGame.currentLocation,
    ].filter(Boolean).join('·');
    if (nextKey && nextKey !== previousKey) {
      eventBus.emit(EVENTS.CRITICAL_SYNC_FLUSH, {
        reason: 'location_changed',
        location: nextKey,
      });
    }
  }, []);

  const buildCharacterRuntimeSnapshot = useCallback((baseChar: Character): Character => {
    const liveGame = useGameStore.getState();
    return {
      ...baseChar,
      currentLocalDay: liveGame.currentDay,
      currentRegion: liveGame.currentRegion || baseChar.currentRegion || baseChar.joinedRegion,
      currentSubRegion: liveGame.currentSubRegion || baseChar.currentSubRegion,
      currentLocation: liveGame.currentLocation || baseChar.currentLocation,
      currentCoordinates: { ...liveGame.coordinates },
      currentTerrain: liveGame.terrain || baseChar.currentTerrain,
      currentWeather: liveGame.weather || baseChar.currentWeather,
      currentStructuredLocation: liveGame.currentStructuredLocation,
      gameClock: liveGame.gameClock,
      timeOfDay: liveGame.timeOfDay,
      lastActionTime: new Date().toISOString(),
    };
  }, []);

  const requestScene = useCallback(async () => {
    if (useMultiplayerStore.getState().gameMode === 'multiplayer' && useMultiplayerStore.getState().roomId) {
      clearError();
      try {
        await hydrateMultiplayerScene();
      } catch (err) {
        handlePMError(err, '多人场景同步');
      }
      return;
    }

    if (!getPmEngine()) await initPM();
    const pm = getPmEngine()!;
    const charData = useCharacterStore.getState().character;
    if (!charData) return;

    setWaitingForPM(true);
    clearError();

    const game = useGameStore.getState();
    const allMsgs = game.messages;
    const recentMsgs = allMsgs.slice(-20).map(m => ({ role: m.type, content: m.content }));
    const lastPMNarrative = [...allMsgs].reverse().find(m => m.type === 'pm');
    pm.updateContext({
      recentMessages: recentMsgs,
      lastNarrative: lastPMNarrative?.content?.slice(0, 500) || '',
    });

    if (game.currentRegion) {
      try {
        const api = new APIClient(useSettingsStore.getState().server.endpoint);
        const [terrain, weather] = await Promise.all([
          api.getTerrain(game.currentRegion, game.coordinates.x, game.coordinates.y, game.coordinates.z),
          api.getWeather(game.currentRegion, game.currentDay),
        ]);
        if (terrain) game.setTerrain((terrain as { terrain_type?: string }).terrain_type || game.terrain);
        if (weather) game.setWeather(weather.weather || game.weather);
      } catch { /* offline */ }
    }

    const sceneContext: SceneContext = {
      worldDay: game.currentDay,
      region: game.currentRegion || charData.joinedRegion,
      subRegion: game.currentSubRegion || '',
      coordinates: game.coordinates,
      terrain: game.terrain,
      weather: game.weather,
      factions: [],
      recentEvents: [],
      remainingActionPoints: 0,
    };

    try {
      const useStreaming = useSettingsStore.getState().enableStreaming && pm.streamGenerateScene;
      const generateSceneResponse = async (allowStreaming: boolean, allowRetry: boolean): Promise<SceneResponse> => {
        if (allowStreaming) {
          game.setStreamingText('');
          let fullText = '';
          for await (const chunk of pm.streamGenerateScene(charData, sceneContext)) {
            fullText += chunk;
            game.appendStreamingText(chunk);
          }
          game.clearStreaming();
          const parsed = pm.parseSceneResponse(fullText);
          if (allowRetry && looksLikeInitializationAck(parsed)) {
            logger.warn('PM', 'Initial scene response looked like GM bootstrap ack, retrying once');
            return generateSceneResponse(false, false);
          }
          return parsed;
        }

        const parsed = await pm.generateScene(charData, sceneContext);
        if (allowRetry && looksLikeInitializationAck(parsed)) {
          logger.warn('PM', 'Initial scene response looked like GM bootstrap ack, retrying once');
          return generateSceneResponse(false, false);
        }
        return parsed;
      };

      const response = await generateSceneResponse(Boolean(useStreaming), true);
      logger.info('PM', `generateScene done — desc:${response.sceneDescription?.length || 0} choices:${response.choices?.length || 0}`);

      const liveGame = useGameStore.getState();
      liveGame.setSceneModifier(response.sceneModifier);
      liveGame.setAtmosphere(response.atmosphere);
      if (response.currentLocation) {
        applySceneLocation(response.currentLocation, response.sceneDescription || '');
      }
      if (response.sceneDescription.trim()) {
        liveGame.addMessage({ id: generateId(), type: 'pm', content: response.sceneDescription, timestamp: Date.now() });
      }
      liveGame.setChoices(response.choices);

      const latestChar = useCharacterStore.getState().character;
      if (latestChar) {
        const runtimeSnapshot = buildCharacterRuntimeSnapshot(latestChar);
        useCharacterStore.getState().setCharacter(runtimeSnapshot);
        useCharacterListStore.getState().addCharacter(runtimeSnapshot);
      }
      liveGame.setWaitingForPM(false);
      eventBus.emit(EVENTS.SCENE_LOADED, response);
      activityReporter.updateAction('查看场景中', 'explore');
    } catch (err) {
      handlePMError(err, '场景生成');
    }
  }, [applySceneLocation, buildCharacterRuntimeSnapshot, clearError, handlePMError, hydrateMultiplayerScene, initPM, setWaitingForPM]);

  return { requestScene, applySceneLocation, buildCharacterRuntimeSnapshot };
}
