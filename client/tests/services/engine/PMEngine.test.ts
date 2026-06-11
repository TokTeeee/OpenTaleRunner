import { describe, expect, it, vi } from 'vitest';

// 简化策略: 不走 vi.mock, 直接用 vi.spyOn 监视 LLMClient 原型方法.
// 这样不需要破坏 module graph, 也不依赖 LLMClient 构造细节.

// 必须先于 PMEngine import
import { LLMClient } from '../../../src/services/llm/LLMClient';
import { PMEngine } from '../../../src/services/engine/PMEngine';
import type { Character } from '../../../src/types/character';

// Mock stores with all fields PromptBuilder reads
vi.mock('../../../src/stores/gameStore', () => ({
  useGameStore: {
    getState: () => ({
      currentStructuredLocation: null,
      currentDay: 1,
      timeOfDay: 'noon',
      gameClock: 12,
    }),
  },
}));

vi.mock('../../../src/stores/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      experimental: { enableTokenBudget: false },
      enableStreaming: true,
    }),
  },
}));

function makeCharacter(): Character {
  return {
    playerId: 'test-player',
    characterId: 'char-1',
    name: '测试冒险者',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [{
      id: 'skill-1', name: '剑术', level: 2, maxLevel: 10, type: 'acquired',
      relatedAttribute: 'STR' as any, description: '', acquiredAt: 'd1',
      experience: 0, expToNext: 3,
    }],
    hp: 20, maxHp: 20,
    vital: { hunger: 50, thirst: 50, fatigue: 0, hygiene: 100, morale: 50, wound: 0, temperature: 37, encumbrance: 0 },
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    inventory: {
      backpack: [],
      equipped: { weapon: null, armor: null, accessory: null },
      currency: { gold: 10, silver: 0, copper: 0 },
    },
    conditions: [],
    recentHistory: [] as any,
    currentLocalDay: 1,
    currentRegion: 'test-region',
    currentSubRegion: '',
    currentLocation: 'test-town',
    currentCoordinates: { x: 0, y: 0, z: 0 },
    currentTerrain: 'plain',
    currentWeather: 'clear',
    joinedRegion: 'test-region',
    joinedWorldDay: 1,
    lastActionTime: '',
    background: '一位流浪者',
    appearance: '',
    race: 'human',
    unspentAttributePoints: 0,
    unspentSkillPoints: 0,
  } as Character;
}

function makeActionContext() {
  return {
    worldDay: 1,
    region: 'r',
    subRegion: 's',
    coordinates: { x: 0, y: 0, z: 0 },
    terrain: 'plain',
    weather: 'sunny',
    factions: [],
    recentEvents: [],
    playerAction: 'go',
  } as any;
}

function makeEngine(): PMEngine {
  return new PMEngine(
    { provider: 'deepseek', apiKey: 'k', endpoint: 'e', model: 'm', temperature: 0.8, maxTokens: 4096 },
    {
      worldLore: 'lore', currentEra: 'era1', milestones: [], recentChronicle: [],
      regionStates: new Map(), ghostNPCs: [], knownNPCs: [], recentMessages: [],
      lastNarrative: '', narrativeGuide: undefined,
    },
  );
}

async function drain<T>(gen: AsyncGenerator<T, any, void>): Promise<{ chunks: T[]; returnValue: any }> {
  const chunks: T[] = [];
  let iterResult = await gen.next();
  while (!iterResult.done) {
    chunks.push(iterResult.value);
    iterResult = await gen.next();
  }
  return { chunks, returnValue: iterResult.value };
}

describe('PMEngine.streamCombinedAdvance (audit P2 fix)', () => {
  it('PMEngine 实例有 streamCombinedAdvance 方法且是 async generator', () => {
    const engine = makeEngine();
    expect(typeof engine.streamCombinedAdvance).toBe('function');
    // 验证返回 async generator
    const result = engine.streamCombinedAdvance(makeCharacter(), makeActionContext(), '2d6=7');
    expect(result).toBeDefined();
    expect(typeof result[Symbol.asyncIterator]).toBe('function');
  });

  it('streamCombinedAdvance 走 llmClient.streamChat (而非 chat), 通过 spyOn 验证', async () => {
    const engine = makeEngine();
    const llm = (engine as any).llmClient as LLMClient;

    // spyOn 原型方法, 用一个简单的 async generator 替换
    async function* fakeStream() {
      yield '{"narrative":"你走进';
      yield '了森林。","choices":[]}';
    }
    async function fakeChat() { return '{}'; }

    const streamSpy = vi.spyOn(llm, 'streamChat').mockImplementation(fakeStream as any);
    const chatSpy = vi.spyOn(llm, 'chat').mockImplementation(fakeChat as any);

    try {
      const { chunks, returnValue } = await drain(
        engine.streamCombinedAdvance(makeCharacter(), makeActionContext(), '2d6=7'),
      );

      // 关键断言: 走的是 streamChat, 不是 chat
      expect(streamSpy).toHaveBeenCalled();
      expect(chatSpy).not.toHaveBeenCalled();

      // 流式: 应 yield 多个 chunk
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.join('')).toContain('你走进');

      // 返回值是解析后的 NarrativeResponse
      expect(returnValue).toBeDefined();
      expect(returnValue.narrative).toContain('森林');
    } finally {
      streamSpy.mockRestore();
      chatSpy.mockRestore();
    }
  });

  it('streamCombinedAdvance 与 combinedAdvance 装配的 prompt 完全一致 (回归)', async () => {
    const engine = makeEngine();
    const llm = (engine as any).llmClient as LLMClient;

    const capturedPrompts: { name: string; value: string }[] = [];
    async function* fakeStream(sys: string) {
      capturedPrompts.push({ name: 'stream', value: sys });
      yield '{"narrative":"n","choices":[]}';
    }
    async function fakeChat(sys: string) {
      capturedPrompts.push({ name: 'chat', value: sys });
      return '{"narrative":"n","choices":[]}';
    }

    const streamSpy = vi.spyOn(llm, 'streamChat').mockImplementation(fakeStream as any);
    const chatSpy = vi.spyOn(llm, 'chat').mockImplementation(fakeChat as any);

    try {
      const ch = makeCharacter();
      const ac = makeActionContext();
      await engine.combinedAdvance(ch, ac, '2d6=7');
      await drain(engine.streamCombinedAdvance(ch, ac, '2d6=7'));

      const chatPrompt = capturedPrompts.find(p => p.name === 'chat')?.value;
      const streamPrompt = capturedPrompts.find(p => p.name === 'stream')?.value;
      expect(chatPrompt).toBeDefined();
      expect(streamPrompt).toBeDefined();
      expect(chatPrompt).toBe(streamPrompt);
    } finally {
      streamSpy.mockRestore();
      chatSpy.mockRestore();
    }
  });
});
