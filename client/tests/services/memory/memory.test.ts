import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InMemoryMemoryStore } from '../../../src/services/memory/InMemoryMemoryStore';
import { HashEmbeddingProvider, cosineSimilarity } from '../../../src/services/memory/HashEmbeddingProvider';
import { applyDecay, selectAggressiveEvictions } from '../../../src/services/memory/decay';
import { parseSummaries, fallbackSummary, buildSummarizerPromptSection } from '../../../src/services/memory/EpisodicSummarizer';
import { MemoryManager } from '../../../src/services/memory/MemoryManager';
import type { MemoryRecord, MemoryRecordInput } from '../../../src/types/memory';

const NOW = Date.now();
const ONE_DAY = 24 * 3600 * 1000;

function makeInput(overrides: Partial<MemoryRecordInput> = {}): MemoryRecordInput {
  return {
    scope: 'event',
    entityId: 'e1',
    content: '玩家走进了城镇',
    metadata: { worldDay: 1, timestamp: NOW, importance: 0.5, ...overrides.metadata },
    ...overrides,
  };
}

function makeRecord(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: 'mem_test',
    scope: 'event',
    entityId: 'e1',
    content: '玩家走进了城镇',
    metadata: { worldDay: 1, timestamp: NOW, importance: 0.5 },
    embedding: [0.1, 0.2, 0.3],
    createdAt: new Date(NOW).toISOString(),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  MemoryManager.resetForTest();
});

afterEach(() => {
  MemoryManager.resetForTest();
});

describe('HashEmbeddingProvider', () => {
  it('确定性: 相同输入产生相同向量', async () => {
    const ep = new HashEmbeddingProvider(64);
    const a = await ep.embed('玩家与酒馆老板王二对话');
    const b = await ep.embed('玩家与酒馆老板王二对话');
    expect(a).toEqual(b);
  });

  it('内容感知: 相近文本相似度 > 不相关文本', async () => {
    const ep = new HashEmbeddingProvider(128);
    const v1 = await ep.embed('玩家与酒馆老板王二对话');
    const v2 = await ep.embed('玩家和王二在酒馆说话');
    const v3 = await ep.embed('今天天气不错,适合远行');
    const sRelated = cosineSimilarity(v1, v2);
    const sUnrelated = cosineSimilarity(v1, v3);
    expect(sRelated).toBeGreaterThan(sUnrelated);
  });

  it('向量已归一化 (L2 norm ≈ 1)', async () => {
    const ep = new HashEmbeddingProvider(64);
    const v = await ep.embed('hello world');
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 3);
  });

  it('空字符串返回零向量', async () => {
    const ep = new HashEmbeddingProvider(64);
    const v = await ep.embed('');
    expect(v.every((x) => x === 0)).toBe(true);
  });
});

describe('InMemoryMemoryStore', () => {
  describe('add / search', () => {
    it('add 后 size 增加, search 命中', async () => {
      const store = new InMemoryMemoryStore({ persist: false });
      await store.add([makeInput({ content: '玩家在废矿获得黑铁剑' })]);
      expect(store.size()).toBe(1);
      const hits = await store.search({ query: '废矿 获得 武器', topK: 5 });
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].score).toBeGreaterThan(0);
    });

    it('scopes 过滤生效', async () => {
      const store = new InMemoryMemoryStore({ persist: false });
      await store.add([
        makeInput({ scope: 'npc', content: '与王二对话' }),
        makeInput({ scope: 'item', content: '获得黑铁剑' }),
      ]);
      const npcHits = await store.search({ query: '王二', scopes: ['npc'], topK: 5 });
      expect(npcHits.every((h) => h.scope === 'npc')).toBe(true);
    });

    it('topK 限制返回数', async () => {
      const store = new InMemoryMemoryStore({ persist: false });
      await store.add([
        makeInput({ entityId: 'a', content: '事件a' }),
        makeInput({ entityId: 'b', content: '事件b' }),
        makeInput({ entityId: 'c', content: '事件c' }),
        makeInput({ entityId: 'd', content: '事件d' }),
      ]);
      const hits = await store.search({ query: '事件', topK: 2 });
      expect(hits.length).toBeLessThanOrEqual(2);
    });

    it('minScore 阈值过滤低相似度', async () => {
      const store = new InMemoryMemoryStore({ persist: false });
      await store.add([makeInput({ content: '魔法与剑' })]);
      const hits = await store.search({ query: '完全不相关的查询 about economics', minScore: 0.99 });
      expect(hits.length).toBe(0);
    });
  });

  describe('getByEntity', () => {
    it('返回指定实体的所有记忆 (按时间排序)', async () => {
      const store = new InMemoryMemoryStore({ persist: false });
      await store.add([
        makeInput({ scope: 'npc', entityId: 'npc_x', content: 'first', metadata: { worldDay: 1, timestamp: NOW - 2000, importance: 0.5 } }),
        makeInput({ scope: 'npc', entityId: 'npc_x', content: 'second', metadata: { worldDay: 1, timestamp: NOW - 1000, importance: 0.5 } }),
        makeInput({ scope: 'npc', entityId: 'npc_y', content: 'other entity', metadata: { worldDay: 1, timestamp: NOW, importance: 0.5 } }),
      ]);
      const records = await store.getByEntity('npc', 'npc_x');
      expect(records.length).toBe(2);
      expect(records[0].content).toBe('first');
      expect(records[1].content).toBe('second');
    });
  });

  describe('forget / restore / archive', () => {
    it('forget 软删除, search 不再命中', async () => {
      const store = new InMemoryMemoryStore({ persist: false });
      const [r] = await store.add([makeInput({ content: '要遗忘的' })]);
      await store.forget(r.id, '测试');
      const hits = await store.search({ query: '遗忘' });
      expect(hits.length).toBe(0);
    });

    it('listArchived 列出软删除项', async () => {
      const store = new InMemoryMemoryStore({ persist: false });
      const [r] = await store.add([makeInput()]);
      await store.forget(r.id, '测试');
      const archived = store.listArchived();
      expect(archived.length).toBe(1);
    });

    it('restore 恢复被软删除的项', async () => {
      const store = new InMemoryMemoryStore({ persist: false });
      const [r] = await store.add([makeInput()]);
      await store.forget(r.id, '测试');
      expect(store.restore(r.id)).toBe(true);
      const hits = await store.search({ query: '玩家' });
      expect(hits.length).toBeGreaterThan(0);
    });
  });
});

describe('decay — 4 种衰减策略', () => {
  describe("'none'", () => {
    it('永不删除', () => {
      const r = makeRecord({ metadata: { ...r_defaultMeta(), timestamp: NOW - 365 * ONE_DAY, importance: 0.01 } });
      expect(applyDecay(r, { strategy: 'none' }, NOW)).toBe(false);
    });
  });

  describe("'gentle'", () => {
    it('新记录 + 高 importance 不删除', () => {
      const r = makeRecord({ metadata: { worldDay: 1, timestamp: NOW - 10 * ONE_DAY, importance: 0.5 } });
      expect(applyDecay(r, { strategy: 'gentle', retentionDays: 90, importanceFloor: 0.2 }, NOW)).toBe(false);
    });
  });

  describe("'forgetting_curve'", () => {
    it('老记录有非零概率被删除', () => {
      let deleted = 0;
      for (let i = 0; i < 100; i++) {
        const r = makeRecord({ metadata: { worldDay: 1, timestamp: NOW - 100 * ONE_DAY, importance: 0.5 } });
        if (applyDecay(r, { strategy: 'forgetting_curve', tauDays: 30 }, NOW)) deleted++;
      }
      expect(deleted).toBeGreaterThan(80);
    });

    it('新记录大概率保留', () => {
      let deleted = 0;
      for (let i = 0; i < 100; i++) {
        const r = makeRecord({ metadata: { worldDay: 1, timestamp: NOW - 1 * ONE_DAY, importance: 0.5 } });
        if (applyDecay(r, { strategy: 'forgetting_curve', tauDays: 30 }, NOW)) deleted++;
      }
      expect(deleted).toBeLessThan(10);
    });
  });

  describe("'aggressive'", () => {
    it('applyDecay 不删除 (调用方负责按容量淘汰)', () => {
      const r = makeRecord();
      expect(applyDecay(r, { strategy: 'aggressive' }, NOW)).toBe(false);
    });

    it('selectAggressiveEvictions 按 importance 升序淘汰超出容量部分', () => {
      const records = [
        makeRecord({ id: 'a', metadata: { worldDay: 1, timestamp: NOW, importance: 0.9 } }),
        makeRecord({ id: 'b', metadata: { worldDay: 1, timestamp: NOW, importance: 0.3 } }),
        makeRecord({ id: 'c', metadata: { worldDay: 1, timestamp: NOW, importance: 0.5 } }),
      ];
      const evictions = selectAggressiveEvictions(records, 1);
      expect(evictions.map((e) => e.id)).toEqual(['b', 'c']);
    });

    it('记录数 ≤ maxRecords 时不淘汰', () => {
      const records = [
        makeRecord({ id: 'a' }),
        makeRecord({ id: 'b' }),
      ];
      expect(selectAggressiveEvictions(records, 5).length).toBe(0);
    });
  });
});

function r_defaultMeta() {
  return { worldDay: 1, importance: 0.5 } as { worldDay: number; importance: number; timestamp?: number };
}

describe('EpisodicSummarizer', () => {
  it('parseSummaries 提取 LLM 输出的 JSON 数组', () => {
    const llm = `[SUMMARIES]
[
  {"scope": "npc", "entityId": "王二", "content": "王二是酒馆老板", "importance": 0.7},
  {"scope": "item", "entityId": "黑铁剑", "content": "获得黑铁剑", "importance": 0.6}
]
[/SUMMARIES]`;
    const result = parseSummaries(llm);
    expect(result.length).toBe(2);
    expect(result[0].scope).toBe('npc');
    expect(result[0].content).toBe('王二是酒馆老板');
    expect(result[1].scope).toBe('item');
  });

  it('parseSummaries 忽略无效 scope', () => {
    const llm = `[SUMMARIES]
[{"scope": "invalid_scope", "entityId": "x", "content": "test", "importance": 0.5}]
[/SUMMARIES]`;
    const result = parseSummaries(llm);
    expect(result[0].scope).toBe('event');  // 兜底
  });

  it('parseSummaries 空块返回空数组 (不抛异常)', () => {
    expect(parseSummaries('narrative without summaries')).toEqual([]);
    expect(parseSummaries('[SUMMARIES] invalid json [/SUMMARIES]')).toEqual([]);
  });

  it('fallbackSummary 从 npc 抽取 1 条事实', () => {
    const facts = fallbackSummary({
      worldDay: 1,
      region: '酒馆',
      playerAction: '和王二说话',
      narrative: '玩家走进酒馆',
      npcsInvolved: ['王二'],
    });
    expect(facts.length).toBe(1);
    expect(facts[0].scope).toBe('npc');
  });

  it('buildSummarizerPromptSection 包含 prompt 块', () => {
    const section = buildSummarizerPromptSection({
      worldDay: 1,
      region: 'r',
      playerAction: 'attack',
      narrative: 'attack narrative',
    });
    expect(section).toContain('[SUMMARIES]');
    expect(section).toContain('[/SUMMARIES]');
  });
});

describe('MemoryManager — 单例门面', () => {
  it('setBackend(mem0) 时 Mem0 适配器 throw', async () => {
    MemoryManager.setBackend('mem0');
    await expect(MemoryManager.add([makeInput()])).rejects.toThrow('Mem0MemoryStore 未启用');
  });

  it('commitEpisode via MemoryManager.add 写入并可检索', async () => {
    await MemoryManager.add([makeInput({ content: '测试记忆' })]);
    const hits = await MemoryManager.search({ query: '测试', topK: 1 });
    expect(hits.length).toBeGreaterThan(0);
  });

  it('prune 在 none 策略下不删除', async () => {
    await MemoryManager.add([makeInput({ content: 'A' })]);
    await MemoryManager.add([makeInput({ content: 'B' })]);
    const pruned = await MemoryManager.prune();
    expect(pruned).toBe(0);
    expect(MemoryManager.size()).toBe(2);
  });
});
