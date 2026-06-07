import { useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useCharacterStore } from '../../stores/characterStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useNPCStore } from '../../stores/npcStore';
import { useCharacterListStore } from '../../stores/characterListStore';
import { eventBus } from '../../services/event/EventBus';
import { EVENTS } from '../../services/event/events';
import { generateId } from '../../utils/text';
import { absurdityToLC } from '../../utils/dice';
import { logger } from '../../utils/logger';
import { TTSClient } from '../../services/tts/TTSClient';
import { sanitizePromptInput } from '../../services/security/sanitize';
import { activityReporter } from '../../services/activity/ActivityReporter';
import { clientLogger } from '../../services/logging/ClientLogger';
import { LogCategory } from '../../services/logging/types';
import { npcGenerator } from '../../services/npc/NPCGenerator';
import { applyConsequences } from '../../services/consequence/applyConsequences';
import { extractTriggers } from '../../services/hooks/extractTriggers';
import { systemHooks } from '../../services/hooks/SystemHooks';
import { parseTimeElapsed, parseAbsoluteTime } from '../../services/hooks/timeUtils';
import { buildSnapshot } from '../../services/hooks/GameSnapshot';
import { toolCallRegistry } from '../../services/llm/ToolCallRegistry';
import { commitEpisode } from '../../services/memory/EpisodicSummarizer';
import type { Character, AttributeName } from '../../types/character';
import type { JudgeParams } from '../../types/game';
import {
  getPmEngine,
  _judgeSystem,
  _chronicleRecorder,
  estimateAbsurdity,
  findBestSkill,
  isCombatAction,
} from './shared';
import { syncNarrativePartyMembers } from './useMultiplayerSync';

export interface SingleSubmitDeps {
  initPM: () => Promise<void>;
  handlePMError: (err: unknown, context: string) => void;
  clearError: () => void;
  applySceneLocation: (rawLocation: string, description: string) => void;
  buildCharacterRuntimeSnapshot: (baseChar: Character) => Character;
  setWaitingForPM: (v: boolean) => void;
}

function detectNPCInteraction(actionText: string, repChanges: Record<string, number>) {
  const npcStore = useNPCStore.getState();
  const allNPCs = npcStore.npcs;
  for (const [npcId, npc] of Object.entries(allNPCs)) {
    if (actionText.includes(npc.name)) {
      npcStore.meetNPC(npcId);
      npcStore.addInteraction(npcId, actionText.slice(0, 100));
      if (repChanges && Object.keys(repChanges).length > 0) {
        for (const [faction, delta] of Object.entries(repChanges)) {
          if (npc.faction === faction) {
            npcStore.modifyAttitude(npcId, delta);
          }
        }
      }
    }
  }
}

function handleNPCIntroduced(npcs: Array<{ name: string; title: string; appearance: string; personality: string; region: string; relation_to_player: string }>) {
  if (npcs.length === 0) return;
  const npcStore = useNPCStore.getState();
  for (const intro of npcs) {
    const existing = Object.values(npcStore.npcs).find((n) => n.name === intro.name);
    if (existing) {
      npcStore.meetNPC(existing.npcId);
      continue;
    }
    const newNPC = npcGenerator.generateFromIntro(intro);
    npcStore.registerNPC(newNPC);
    eventBus.emit(EVENTS.GHOST_NPC_APPEARED, newNPC);
  }
}

/**
 * v0.5.11: 单人 mode submit 路径。从 useActionSubmit 抽出。
 * - initPM / dice / PM engine / consequences / chronicle / memory / save / TTS
 * - 不处理 multiplayer 路径, 也不处理 abort (入口 useActionSubmit 处理)
 */
export function useSingleSubmit(deps: SingleSubmitDeps) {
  const {
    initPM, handlePMError, clearError,
    applySceneLocation, buildCharacterRuntimeSnapshot,
    setWaitingForPM,
  } = deps;

  const submitActionSingle = useCallback(async (action: string) => {
    if (!getPmEngine()) { await initPM(); if (!getPmEngine()) return; }
    const pm = getPmEngine()!;
    const charData = useCharacterStore.getState().character;
    if (!charData) return;

    const game = useGameStore.getState();
    const character = useCharacterStore.getState();
    setWaitingForPM(true);
    game.setChoices([]);
    clearError();

    game.addMessage({
      id: generateId(),
      type: 'player',
      content: action,
      timestamp: Date.now(),
    });
    game.addRecentAction(action);
    if (isCombatAction(action)) {
      eventBus.emit(EVENTS.CRITICAL_SYNC_FLUSH, {
        reason: 'combat_started',
        action,
      });
    }

    try {
      const actionCtx = {
        worldDay: game.currentDay,
        region: game.currentRegion,
        subRegion: game.currentSubRegion,
        location: game.currentLocation || game.currentSubRegion || game.currentRegion,
        coordinates: game.coordinates,
        terrain: game.terrain,
        weather: game.weather,
        factions: [],
        recentEvents: [],
        playerAction: sanitizePromptInput(action),
        characterSummary: `${charData.name}: ${charData.background}`,
      };

      const absurdity = estimateAbsurdity(action, charData);
      const needsDice = absurdity > 2;
      const lc = absurdityToLC(absurdity);

      let diceStr = '无需检定（自动成功）';
      let diceOutcome = 'success';
      let diceValues: number[] = [0, 0];
      let diceModifier = 0;
      let diceFinal = 0;

      if (needsDice) {
        const bestSkill = findBestSkill(action, charData);
        const judgeParams: JudgeParams = {
          absurdityLevel: absurdity, difficultyLC: lc, reason: '本地评估',
          relevantSkill: bestSkill?.name || null, relevantAttribute: (bestSkill?.relatedAttribute as AttributeName) || 'WIS',
        };
        eventBus.emit(EVENTS.DICE_PENDING, judgeParams);
        const diceResult = _judgeSystem.evaluate(judgeParams, charData, {
          worldDay: game.currentDay, region: game.currentRegion, subRegion: game.currentSubRegion,
          coordinates: game.coordinates, terrain: game.terrain, weather: game.weather,
          factions: [], recentEvents: [], remainingActionPoints: 0,
        });
        eventBus.emit(EVENTS.DICE_ROLLED, diceResult);
        game.setDiceResult(diceResult);
        const outcomeLabels: Record<string, string> = {
          critical_success: '大成功', success: '成功', partial_success: '部分成功', failure: '失败', critical_failure: '大失败',
        };
        let penaltyText = '';
        if (diceResult.conditionsPenalty && diceResult.conditionsPenalty > 0) penaltyText += ` -${diceResult.conditionsPenalty}(异常)`;
        if (diceResult.nightPenalty && diceResult.nightPenalty > 0) penaltyText += ` -${diceResult.nightPenalty}(夜间)`;
        const totalBase = diceResult.diceValues.reduce((a: number, b: number) => a + b, 0)
          + diceResult.attributeModifier + diceResult.skillBonus + diceResult.equipmentBonus;
        diceStr = `2d6: [${diceResult.diceValues.join(', ')}] +${diceResult.attributeModifier}(属性) +${diceResult.skillBonus}(技能) +${diceResult.equipmentBonus}(装备)${penaltyText} = ${totalBase - (diceResult.conditionsPenalty || 0) - (diceResult.nightPenalty || 0)} vs DC${diceResult.difficultyLC} → ${outcomeLabels[diceResult.outcome]}`;
        diceOutcome = diceResult.outcome;
        diceValues = diceResult.diceValues;
        diceModifier = diceResult.attributeModifier + diceResult.skillBonus;
        diceFinal = diceResult.finalResult + diceResult.difficultyLC;
      }

      const recentMsgs = game.messages.slice(-25).map(m => ({ role: m.type, content: m.content }));
      const pmNarratives = [...game.messages].reverse().filter(m => m.type === 'pm').slice(0, 3);
      const lastNarrative = pmNarratives.map(m => m.content).join('\n---\n').slice(0, 800);
      pm.updateContext({ recentMessages: recentMsgs, lastNarrative });

      logger.info('PM', `combinedAdvance start — action: "${action.slice(0, 50)}" absurdity:${absurdity} dice:${needsDice}`);
      clientLogger.debug(LogCategory.GM, 'REQ', `turn=${game.currentDay} action="${action.slice(0, 80)}" absurdity=${absurdity} needsDice=${needsDice}`, { charName: charData.name, diceStr });
      const narrative = await pm.combinedAdvanceWithQueries(charData, actionCtx, diceStr);
      clientLogger.debug(LogCategory.GM, 'RES', `narrativeLen=${narrative.narrative?.length || 0} choices=${narrative.choices?.length || 0}`, { npcsIntroduced: narrative.npcsIntroduced?.length, hasConsequences: !!narrative.consequences?.hpChange || !!narrative.consequences?.itemsGained?.length });
      logger.info('PM', `combinedAdvance done — narrative len:${narrative.narrative?.length || 0} choices:${narrative.choices?.length || 0} toolCalls:${narrative.toolCalls?.length || 0}`);
      eventBus.emit(EVENTS.NARRATIVE_RECEIVED, narrative);
      // v0.5.1: 广播 narrative.submit (PM 处理完后) 给 EXP 授权 hook
      eventBus.emit(EVENTS.NARRATIVE_SUBMIT, { characterId: charData.characterId, action });

      // v0.4 战斗系统: dispatch LLM 给的 toolcalls (e.g. startCombat / endCombat)
      // 串行执行; 不阻断 PM 流程 (handler 自身保证不抛错)
      if (narrative.toolCalls && narrative.toolCalls.length > 0) {
        try {
          const results = await toolCallRegistry.dispatch(narrative.toolCalls);
          logger.info('PM', `dispatched ${narrative.toolCalls.length} toolcalls, ${results.filter((r) => r.ok).length} ok`);
        } catch (e) {
          logger.error('PM', `toolcall dispatch 失败: ${(e as Error).message}`);
        }
      }

      if (needsDice && diceStr) {
        game.addMessage({ id: generateId(), type: 'system', content: `【检定】${diceStr}`, timestamp: Date.now() });
      }

      let pmContent = narrative.narrative || '';
      if (narrative.sceneDescription && !pmContent.includes(narrative.sceneDescription.slice(0, 30))) {
        pmContent = pmContent + '\n\n' + narrative.sceneDescription;
      }
      const finalPmContent = pmContent.trim();
      game.addMessage({ id: generateId(), type: 'pm', content: finalPmContent, timestamp: Date.now() });

      const ttsSettings = useSettingsStore.getState();
      const canUseTTS = ttsSettings.tts.provider === 'edge' || Boolean(ttsSettings.tts.apiKey || ttsSettings.llm.apiKey);
      if (ttsSettings.ttsEnabled && canUseTTS) {
        try {
          const tts = new TTSClient();
          tts.speakStream(finalPmContent).catch(() => {});
        } catch { /* TTS not available */ }
      }

      game.setChoices(narrative.choices.length > 0 ? narrative.choices : [{ text: '继续探索', hint: '', tendency: 'explore' }]);
      setWaitingForPM(false);
      activityReporter.updateAction(action.slice(0, 100), narrative.choices[0]?.tendency || 'explore');
      if (narrative.sceneModifier) game.setSceneModifier(narrative.sceneModifier);
      if (narrative.atmosphere) game.setAtmosphere(narrative.atmosphere);

      handleNPCIntroduced(narrative.npcsIntroduced || []);
      syncNarrativePartyMembers(action, finalPmContent);

      _chronicleRecorder.recordEntry({
        worldDay: game.currentDay,
        localDay: charData.currentLocalDay,
        location: {
          region: game.currentRegion,
          subRegion: game.currentSubRegion,
          coordinates: game.coordinates,
        },
        action: {
          summary: action.slice(0, 80),
          playerChoice: action,
          wasCustomInput: true,
          absurdityLevel: absurdity,
          difficulty: lc,
          rollResult: diceOutcome,
          rollDetail: {
            dice: diceValues,
            modifier: diceModifier,
            total: diceFinal,
            dc: lc,
          },
        },
        narrativeOutput: narrative.narrative,
        consequences: narrative.consequences as unknown as Record<string, unknown>,
        timestamp: new Date().toISOString(),
      });

      if (narrative.consequences.hpChange) {
        character.updateHP(charData.hp + narrative.consequences.hpChange);
      }
      if (narrative.consequences.stateChanges) {
        character.updateVital(narrative.consequences.stateChanges);
      }
      if (narrative.consequences.skillsLearned.length > 0) {
        for (const s of narrative.consequences.skillsLearned) {
          character.addSkill({
            id: generateId(), name: s.name, level: 1, maxLevel: 10, type: 'acquired',
            relatedAttribute: 'INT', description: s.description,
            acquiredAt: `世界日${game.currentDay}`, experience: 0, expToNext: 3,
          });
        }
      }
      if (narrative.currentLocation) {
        applySceneLocation(narrative.currentLocation, narrative.narrative || narrative.sceneDescription || '');
      }

      if (narrative.setTime) {
        // 绝对时间优先级最高: 直接 set 到目标时刻
        const target = parseAbsoluteTime(narrative.setTime, game.currentDay, game.gameClock);
        if (target) {
          if (target.day != null) game.setDay(target.day);
          game.setClock(target.clock);
        }
      } else if (narrative.timeElapsed) {
        const hours = parseTimeElapsed(narrative.timeElapsed);
        if (hours > 0) {
          game.advanceClock(hours);
          game.updateTravel(hours);
        }
      }

      const hookEnabled = useSettingsStore.getState().experimental.enableSystemHooks;
      if (hookEnabled) {
        const triggers = extractTriggers(narrative, action);
        const snap = buildSnapshot();

        for (const trigger of triggers) {
          const result = systemHooks.apply(trigger.namespace, trigger.data, {
            namespace: trigger.namespace,
            source: trigger.source,
            snapshot: snap,
            abort: () => {},
          });

          if (result && typeof result === 'object' && (result as Record<string, unknown>).derivedChanges) {
            const dc = (result as Record<string, unknown>).derivedChanges as Record<string, number>;
            const sc = narrative.consequences.stateChanges || {};
            for (const [key, val] of Object.entries(dc)) {
              if (typeof val === 'number' && val !== 0) {
                (sc as Record<string, number>)[key] = ((sc as Record<string, number>)[key] || 0) + val;
              }
            }
            narrative.consequences.stateChanges = sc;
          }
        }

        if (narrative.consequences.conditionsAdded?.length) {
          for (const cond of narrative.consequences.conditionsAdded) {
            systemHooks.apply('condition.onAdded', { condition: cond }, {
              namespace: 'condition.onAdded', source: 'gm', snapshot: snap, abort: () => {},
            });
          }
        }
        if (narrative.consequences.conditionsRemoved?.length) {
          for (const cond of narrative.consequences.conditionsRemoved) {
            systemHooks.apply('condition.onRemoved', { condition: cond }, {
              namespace: 'condition.onRemoved', source: 'gm', snapshot: snap, abort: () => {},
            });
          }
        }
      }

      character.addHistory({
        worldDay: game.currentDay,
        region: game.currentRegion,
        subRegion: game.currentSubRegion,
        location: narrative.currentLocation || game.currentLocation || game.currentSubRegion,
        coordinates: { ...useGameStore.getState().coordinates },
        summary: (narrative.sceneDescription || narrative.narrative || action).slice(0, 120),
      });
      character.setLastActionTime(new Date().toISOString());

      applyConsequences(narrative.consequences);

      // v0.4-memory: 异步写本轮要点到 MemoryManager (fallbackSummary 兜底, 不阻塞主流程)
      const cons = narrative.consequences;
      const npcsInvolved = cons.reputationChange ? Object.keys(cons.reputationChange) : [];
      const itemsChanged = [
        ...(cons.itemsGained || []).map((i) => i.name).filter((n): n is string => Boolean(n)),
        ...(cons.itemsLost || []).map((i) => i.name).filter((n): n is string => Boolean(n)),
      ];
      const prevLocation = game.currentLocation;
      const locationChanged: boolean = Boolean(narrative.currentLocation && narrative.currentLocation !== prevLocation);
      void commitEpisode({
        worldDay: game.currentDay,
        region: game.currentRegion,
        playerAction: action,
        narrative: narrative.narrative || narrative.sceneDescription || '',
        consequences: cons,
        npcsInvolved: Array.from(new Set(npcsInvolved)),
        itemsChanged: Array.from(new Set(itemsChanged)),
        locationChanged,
      });

      const latestChar = useCharacterStore.getState().character;
      if (latestChar) {
        try {
          const runtimeSnapshot = buildCharacterRuntimeSnapshot(latestChar);
          useCharacterStore.getState().setCharacter(runtimeSnapshot);
          useCharacterListStore.getState().addCharacter(runtimeSnapshot);
        } catch (e) { logger.error('save', `Auto-save failed: ${e}`); }
      }

      eventBus.emit(EVENTS.ACTION_POINTS_CHANGED, 0);
      detectNPCInteraction(action, narrative.consequences.reputationChange);
    } catch (err) {
      handlePMError(err, '动作处理');
    }
  }, [applySceneLocation, buildCharacterRuntimeSnapshot, clearError, handlePMError, initPM, setWaitingForPM]);

  return { submitActionSingle };
}
