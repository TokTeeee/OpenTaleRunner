/**
 * v0.4-memory 集成测试:
 *  1. commitEpisode 走 fallbackSummary, 写入 MemoryManager
 *  2. PromptBuilder.buildGmMemoryRetrievalSection 在有 records 时输出 🧠 段
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  commitEpisode,
  fallbackSummary,
  parseSummaries,
  buildSummarizerPromptSection,
} from '../../../src/services/memory/EpisodicSummarizer';
import { MemoryManager } from '../../../src/services/memory/MemoryManager';
import { PromptBuilder } from '../../../src/services/engine/PromptBuilder';
import { useSettingsStore } from '../../../src/stores/settingsStore';
import { useGameStore } from '../../../src/stores/gameStore';
import type { MemoryRecordInput } from '../../../src/types/memory';

describe('v0.4-memory integration', () => {
  beforeEach(() => {
    MemoryManager.resetForTest();
    // 强制开启 memory 段 (PromptBuilder 会 early-return if falsy)
    useSettingsStore.setState((s) => ({
      ...s,
      memory: { ...s.memory, backend: 'local', decayStrategy: 'none' },
    }));
    useGameStore.setState((s) => ({ ...s, currentRegion: 'starter_village', currentSubRegion: '酒馆' }));
  });

  afterEach(() => {
    MemoryManager.resetForTest();
  });

  it('commitEpisode (fallbackSummary) 增加 MemoryManager.size()', async () => {
    const before = MemoryManager.size();
    const written = await commitEpisode({
      worldDay: 5,
      region: 'starter_village',
      playerAction: '与王二对话',
      narrative: '王二在酒馆里和玩家攀谈, 邀请他加入商会',
      npcsInvolved: ['王二'],
      itemsChanged: ['治疗药水'],
      locationChanged: false,
    });
    expect(written).toBeGreaterThan(0);
    expect(MemoryManager.size()).toBe(before + written);

    const all = MemoryManager.listAll();
    // 至少包含 王二 的 npc 记忆 + 治疗药水 的 item 记忆
    expect(all.some((r) => r.scope === 'npc' && r.content.includes('王二'))).toBe(true);
    expect(all.some((r) => r.scope === 'item' && r.content.includes('治疗药水'))).toBe(true);
  });

  it('commitEpisode 走 parseSummaries 路径 (LLM 提供 SUMMARIES 时)', async () => {
    const llmOutput = `
narrative 正文...
[SUMMARIES]
[
  {"scope": "npc", "entityId": "npc_smith", "content": "铁匠答应为玩家打造武器", "importance": 0.7},
  {"scope": "event", "entityId": "starter_village", "content": "玩家进入村庄", "importance": 0.4}
]
[/SUMMARIES]`;
    const written = await commitEpisode(
      {
        worldDay: 1,
        region: 'starter_village',
        playerAction: '进入村庄',
        narrative: 'narrative 正文...',
      },
      llmOutput,
    );
    expect(written).toBe(2);
    const all = MemoryManager.listAll();
    expect(all.some((r) => r.scope === 'npc' && r.content.includes('铁匠'))).toBe(true);
    expect(all.some((r) => r.scope === 'event')).toBe(true);
  });

  it('PromptBuilder.buildGmMemoryRetrievalSection 注入 🧠 段 (有 records 时)', async () => {
    const input: MemoryRecordInput[] = [
      {
        scope: 'npc',
        entityId: 'npc_king',
        content: '国王承诺给玩家赏金',
        metadata: { worldDay: 3, region: 'castle', timestamp: Date.now(), importance: 0.8 },
      },
      {
        scope: 'item',
        entityId: 'item_potion',
        content: '玩家获得了治疗药水',
        metadata: { worldDay: 3, region: 'castle', timestamp: Date.now(), importance: 0.6 },
      },
    ];
    await MemoryManager.add(input);

    const builder = new PromptBuilder();
    const section = builder.buildGmMemoryRetrievalSection('向国王报告任务');

    // 段头: ## 🧠 长期记忆 (GM 检索 - N 条)
    expect(section).toContain('## 🧠 长期记忆');
    expect(section).toMatch(/GM 检索 - \d+ 条/);
    // 至少召回一条包含 国王 的 npc 记忆
    expect(section).toContain('NPC');
    expect(section).toContain('国王承诺给玩家赏金');
    // 重要性标签
    expect(section).toMatch(/重要性: 0\.[68]/);
  });

  it('PromptBuilder.buildGmMemoryRetrievalSection 在无 records 时返回空字符串', async () => {
    // 没 seed 任何 memory
    const builder = new PromptBuilder();
    const section = builder.buildGmMemoryRetrievalSection('无意义的查询');
    expect(section).toBe('');
  });

  it('fallbackSummary 兜底: 没 npcs/items 时写 1 条 event 记忆', () => {
    const facts = fallbackSummary({
      worldDay: 7,
      region: 'forest',
      playerAction: '继续探索',
      narrative: '玩家在森林里迷路了, 走了很久',
    });
    expect(facts.length).toBe(1);
    expect(facts[0].scope).toBe('event');
    expect(facts[0].content).toContain('玩家在森林里');
  });

  it('parseSummaries 容错: 无 SUMMARIES 块 → 空数组', () => {
    expect(parseSummaries('narrative 正文, 无块')).toEqual([]);
    expect(parseSummaries('')).toEqual([]);
  });

  it('buildSummarizerPromptSection 含 SUMMARIES 块和本轮信息', () => {
    const section = buildSummarizerPromptSection({
      worldDay: 3,
      region: 'castle',
      playerAction: '搜索王座',
      narrative: '玩家在王座前搜索...'.repeat(50),
      npcsInvolved: ['国王'],
      itemsChanged: ['金钥匙'],
    });
    expect(section).toContain('[SUMMARIES]');
    expect(section).toContain('[/SUMMARIES]');
    expect(section).toContain('玩家行动: 搜索王座');
    expect(section).toContain('涉及 NPC: 国王');
    expect(section).toContain('物品变化: 金钥匙');
  });
});
