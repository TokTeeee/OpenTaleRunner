import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PMEngine } from '../../../src/services/engine/PMEngine';

vi.mock('../../../src/stores/gameStore', () => ({
  useGameStore: { getState: () => ({ currentStructuredLocation: null, currentDay: 1, timeOfDay: 'noon', gameClock: 12 }) },
}));
vi.mock('../../../src/stores/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ experimental: { enableTokenBudget: false } }) },
}));

function makePM(): PMEngine {
  return new PMEngine(
    { provider: 'deepseek', apiKey: 'k', endpoint: 'https://x', model: 'm', temperature: 0.5, maxTokens: 1024 },
    {
      worldLore: '', currentEra: '', milestones: [], recentChronicle: [],
      regionStates: new Map(), ghostNPCs: [], knownNPCs: [], recentMessages: [], lastNarrative: '',
    },
  );
}

describe('PMEngine.parseNarrativeWithToolCalls: v0.4 战斗系统补齐', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('纯 narrative 不附加 toolCalls', () => {
    const pm = makePM();
    const result = pm.parseNarrativeWithToolCalls('只是一段叙事文本。');
    expect(result.toolCalls).toBeUndefined();
  });

  it('narrative + 1 个 toolcall 拆分正确', () => {
    const pm = makePM();
    const raw = `三只哥布林出现。
<tool_call>{"name":"startCombat","arguments":{"trigger":"ambush","enemies":[]}}</tool_call>
战斗开始。`;
    const result = pm.parseNarrativeWithToolCalls(raw);
    expect(result.toolCalls).toBeDefined();
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].name).toBe('startCombat');
    expect(result.toolCalls![0].arguments).toEqual({ trigger: 'ambush', enemies: [] });
    // narrative 字段不应再含 <tool_call> 块
    expect(result.narrative).not.toContain('<tool_call>');
  });

  it('多个 toolcall 按出现顺序', () => {
    const pm = makePM();
    const raw = `<tool_call>{"name":"startCombat","arguments":{}}</tool_call>
中段
<tool_call>{"name":"endCombat","arguments":{"outcome":"victory"}}</tool_call>`;
    const result = pm.parseNarrativeWithToolCalls(raw);
    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls![0].name).toBe('startCombat');
    expect(result.toolCalls![1].name).toBe('endCombat');
  });

  it('损坏 toolcall 不抛错, 走 warn 跳过', () => {
    const pm = makePM();
    const raw = `前面<tool_call>这不是 JSON</tool_call>后面`;
    const result = pm.parseNarrativeWithToolCalls(raw);
    expect(result.toolCalls).toBeUndefined();
    // narrative 仍保留原文 (toolcallParser 把损坏块留在 narrative 中)
    expect(result.narrative).toContain('前面');
    expect(result.narrative).toContain('后面');
  });

  it('toolcall 块在 narrative JSON 之外时, narrative 仍能正常解析', () => {
    const pm = makePM();
    // narrative 部分不带 JSON 结构, toolcallParser 把它作为纯文本
    // 然后 v0.3 parseNarrativeResponse 走 default fallback
    const raw = `<tool_call>{"name":"startCombat","arguments":{}}</tool_call>
{"narrative": "哥布林出现。", "choices": [], "atmosphere": {"mood": "危险", "dangerLevel": "high"}, "consequences": {}, "time_elapsed": "1m", "current_location": "forest"}`;
    const result = pm.parseNarrativeWithToolCalls(raw);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.narrative).toBe('哥布林出现。');
    expect(result.atmosphere.dangerLevel).toBe('high');
  });
});
