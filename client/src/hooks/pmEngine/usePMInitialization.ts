import { useCallback } from 'react';
import { PMEngine } from '../../services/engine/PMEngine';
import { useWorldStore } from '../../stores/worldStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useNPCStore } from '../../stores/npcStore';
import { getWorldEra, getWorldLore, hydrateStorybook } from '../../services/storybook/runtime';
import { logger } from '../../utils/logger';
import { getPmEngine, setPmEngine, _chronicleRecorder, setPmErrorShared } from './shared';
import { useErrorRecovery } from './useErrorRecovery';
import type { LLMProviderType } from '../../types/llm';
import type { Character } from '../../types/character';

type LLMConfig = {
  provider: LLMProviderType;
  apiKey: string;
  endpoint: string;
  model: string;
  temperature: number;
  maxTokens: number;
};

export function usePMInitialization(
  getLLMConfig: () => LLMConfig | null,
  getStoreStates: () => { world: ReturnType<typeof useWorldStore.getState>; character: Character | null },
) {
  const initPM = useCallback(async () => {
    if (getPmEngine()) return;
    const llmConfig = getLLMConfig();
    if (!llmConfig) {
      setPmErrorShared('请先在设置中配置 AI API Key');
      logger.error('PM', 'initPM failed — no LLM config');
      return;
    }
    setPmErrorShared(null);

    const { world } = getStoreStates();
    let worldLore = getWorldLore(world.storybook, world.worldLore);

    const hydratedStorybook = await hydrateStorybook({
      endpoint: useSettingsStore.getState().server.endpoint,
      apply: (data) => world.setStorybook(data),
    });
    if (!hydratedStorybook) {
      logger.warn('PM', 'Failed to fetch storybook from server, using cached');
    }

    const activeStorybook = hydratedStorybook ?? useWorldStore.getState().storybook;
    worldLore = getWorldLore(activeStorybook, worldLore);
    const currentEra = getWorldEra(activeStorybook);

    const regionMap = new Map<string, unknown>();
    for (const [key, val] of Object.entries(world.regions)) {
      regionMap.set(key, val);
    }
    setPmEngine(new PMEngine(
      {
        provider: llmConfig.provider,
        apiKey: llmConfig.apiKey,
        endpoint: llmConfig.endpoint,
        model: llmConfig.model,
        temperature: llmConfig.temperature,
        maxTokens: llmConfig.maxTokens,
      },
      {
        worldLore,
        currentEra,
        milestones: [],
        recentChronicle: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        regionStates: regionMap as any,
        ghostNPCs: world.ghostNPCs,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        knownNPCs: Object.values(useNPCStore.getState().npcs) as any,
        recentMessages: [],
        lastNarrative: '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        narrativeGuide: world.storybook?.narrativeGuide as any,
      },
    ));
    const { character } = getStoreStates();
    if (character) {
      _chronicleRecorder.rebind(character.playerId, character.name, false);
    }
  }, [getLLMConfig, getStoreStates]);

  // v0.5.11: 错误恢复抽到 useErrorRecovery
  const { handlePMError, clearError } = useErrorRecovery();

  return { initPM, handlePMError, clearError };
}
