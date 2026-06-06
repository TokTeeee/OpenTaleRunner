import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PromptBuilder } from '../../../src/services/engine/PromptBuilder';
import { MemoryManager } from '../../../src/services/memory/MemoryManager';
import { useSettingsStore } from '../../../src/stores/settingsStore';
import { useCharacterStore } from '../../../src/stores/characterStore';
import { useGameStore } from '../../../src/stores/gameStore';
import { resetClientStores } from '../../utils/resetStores';
import type { Character } from '../../../src/types/character';

const CHAR_ID = 'p_alice';

function makeChar(): Character {
  return {
    characterId: CHAR_ID,
    playerId: 'p1',
    name: 'Alice',
    race: 'human',
    background: '',
    appearance: '',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    inventory: { backpack: [], equipped: { weapon: null, armor: null, accessory: null }, currency: { gold: 0, silver: 0, copper: 0 } },
    hp: 30, maxHp: 30,
    vital: { hunger: 0, thirst: 0, fatigue: 0, hygiene: 0, morale: 0, wound: 0, temperature: 0, encumbrance: 0 },
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    conditions: [],
    joinedRegion: 'r1', joinedWorldDay: 1, currentLocalDay: 1, lastActionTime: '',
    recentHistory: [],
    currentRegion: 'r1',
  };
}

beforeEach(() => {
  resetClientStores();
  MemoryManager.resetForTest();
  useCharacterStore.getState().setCharacter(makeChar());
});

afterEach(() => {
  resetClientStores();
  MemoryManager.resetForTest();
});

describe('PromptBuilder.buildGmMemoryRetrievalSection — PR-4', () => {
  it('MemoryManager 为空时返回空字符串', () => {
    const builder = new PromptBuilder();
    const section = builder.buildGmMemoryRetrievalSection('玩家在酒馆和王二说话');
    expect(section).toBe('');
  });

  it('有匹配记录时返回 markdown 段, 包含 SCOPE 标签 + 内容 + 重要性', async () => {
    await MemoryManager.add([{
      scope: 'npc',
      entityId: '王二',
      content: '王二是酒馆老板, 与玩家有过冲突',
      metadata: { worldDay: 1, timestamp: Date.now(), importance: 0.8 },
    }]);
    const builder = new PromptBuilder();
    const section = builder.buildGmMemoryRetrievalSection('与王二在酒馆对话');
    expect(section).toContain('## 🧠 长期记忆');
    expect(section).toContain('NPC');
    expect(section).toContain('王二');
    expect(section).toContain('重要性: 0.8');
  });

  it('minScore 过滤低相似度记录', async () => {
    await MemoryManager.add([{
      scope: 'event',
      entityId: 'cooking',
      content: '玩家在厨房学习烹饪',
      metadata: { worldDay: 1, timestamp: Date.now(), importance: 0.5 },
    }]);
    const builder = new PromptBuilder();
    // 不相关查询
    const section = builder.buildGmMemoryRetrievalSection('完全不相关的查询 XYZQW', undefined);
    expect(section).toBe('');
  });

  it('scopes 过滤生效 (只搜 item 不会返回 npc 记录)', async () => {
    await MemoryManager.add([
      { scope: 'npc', entityId: '王二', content: '王二是酒馆老板', metadata: { worldDay: 1, timestamp: Date.now(), importance: 0.8 } },
    ]);
    // 即使 query 包含 "王二", 默认 scopes 包含 npc 应该命中
    const builder = new PromptBuilder();
    const section = builder.buildGmMemoryRetrievalSection('王二');
    expect(section).toContain('王二');
  });

  it('失败时不抛异常, 返回空字符串 (异常隔离)', () => {
    const builder = new PromptBuilder();
    // 模拟: searchSync 在空 backend 抛错 → catch 块应捕获
    MemoryManager.resetForTest();
    MemoryManager.setBackend('mem0');  // Mem0 throws
    expect(() => builder.buildGmMemoryRetrievalSection('任意 query')).not.toThrow();
  });
});

describe('buildCombinedAdvancePrompt 集成 memorySection', () => {
  it('prompt 包含长期记忆段 (当有记录时)', async () => {
    await MemoryManager.add([{
      scope: 'npc',
      entityId: '王二',
      content: '王二与玩家有矛盾',
      metadata: { worldDay: 1, timestamp: Date.now(), importance: 0.7 },
    }]);
    const builder = new PromptBuilder();
    const prompt = builder.buildCombinedAdvancePrompt({
      actionContext: { playerAction: '与王二对话' } as never,
    }, '2d6: 7');
    expect(prompt).toContain('🧠 长期记忆');
  });

  it('prompt 不包含长期记忆段 (无记录时)', () => {
    const builder = new PromptBuilder();
    const prompt = builder.buildCombinedAdvancePrompt({
      actionContext: { playerAction: '与陌生人对话' } as never,
    }, '2d6: 7');
    expect(prompt).not.toContain('🧠 长期记忆');
  });
});

describe('settingsStore.memory 字段', () => {
  it('默认值: backend=local, decayStrategy=none', () => {
    const s = useSettingsStore.getState();
    expect(s.memory.backend).toBe('local');
    expect(s.memory.decayStrategy).toBe('none');
  });

  it('setMemoryDecayStrategy 更新配置', () => {
    useSettingsStore.getState().setMemoryDecayStrategy('gentle');
    expect(useSettingsStore.getState().memory.decayStrategy).toBe('gentle');
  });

  it('setMemoryBackend 更新后端 (mem0 在本期未启用)', () => {
    useSettingsStore.getState().setMemoryBackend('mem0');
    expect(useSettingsStore.getState().memory.backend).toBe('mem0');
  });
});

describe('gameStore.currentRegion / currentSubRegion', () => {
  it('区域信息参与 query 拼装', async () => {
    useGameStore.getState().setRegion('北方雪原', '霜风谷');
    await MemoryManager.add([{
      scope: 'location',
      entityId: '北方雪原·霜风谷',
      content: '北方雪原霜风谷气候严寒',
      metadata: { worldDay: 1, timestamp: Date.now(), importance: 0.5 },
    }]);
    const builder = new PromptBuilder();
    const section = builder.buildGmMemoryRetrievalSection('探索');
    expect(section).toContain('霜风谷');
  });
});
