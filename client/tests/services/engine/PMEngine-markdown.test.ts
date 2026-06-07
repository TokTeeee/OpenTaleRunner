/**
 * PMEngine v0.5.15 — markdown 风格 fallback 解析
 *
 * LLM 经常不按 JSON schema 输出, 而是用 markdown 风格的结构化段.
 * PMEngine 现在能在 JSON 解析失败时检测并提取这些段, 防止整段 raw 文本被塞进 narrative.
 */
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

const SAMPLE_MARKDOWN = `1. **时间流逝**: 5分钟
**当前位置**: 光辉城 · 冒险者公会大厅 · 吧台前
**饥饿**: 3 | **口渴**: 2 | **疲劳**: 5 | **卫生**: 1 | **士气**: 0 | **负重**: 0
2. **你的选择**:
-
对白
「我去看看磨坊那边，几只野狗而已，应该不难对付。」
(倾向: 战斗)
-
对白
「米莎太太的失窃案听起来有点蹊跷，我去她那儿走一趟。」
(倾向: 探索/社交)
-
对白
「那个被袭击的村子…我想知道更多情况。」
(倾向: 探索)
-
对白
「先不急着接活，老巴托克，城里最近有什么新鲜事吗？」
(倾向: 社交)

好的，艾琳，你推开了那扇厚重的橡木门。
门轴发出"吱呀"一声轻响，公会大厅里温暖的空气裹着麦酒、旧木头和壁炉柴火的气味扑面而来。`;

describe('PMEngine.parseNarrativeWithToolCalls: v0.5.15 markdown fallback', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('markdown 风格: 全字段正确提取 (时间/位置/状态/4 选)', () => {
    const pm = makePM();
    const result = pm.parseNarrativeWithToolCalls(SAMPLE_MARKDOWN);

    // 1. time_elapsed 提取
    expect(result.timeElapsed).toBe('5分钟');

    // 2. current_location 提取
    expect(result.currentLocation).toBe('光辉城 · 冒险者公会大厅 · 吧台前');

    // 3. state_changes 6 字段
    expect(result.consequences.stateChanges).toEqual({
      hunger: 3,
      thirst: 2,
      fatigue: 5,
      hygiene: 1,
      morale: 0,
      encumbrance: 0,
    });

    // 4. choices 4 选
    expect(result.choices.length).toBe(4);
    expect(result.choices[0].text).toContain('磨坊');
    expect(result.choices[0].tendency).toBe('combat');
    expect(result.choices[1].text).toContain('米莎太太');
    expect(result.choices[1].tendency).toBe('explore');  // 探索/社交 → 探索 (主倾向)
    expect(result.choices[2].text).toContain('被袭击的村子');
    expect(result.choices[2].tendency).toBe('explore');
    expect(result.choices[3].text).toContain('老巴托克');
    expect(result.choices[3].tendency).toBe('social');
  });

  it('markdown 风格: narrative 不含结构化标签, 保留纯叙事', () => {
    const pm = makePM();
    const result = pm.parseNarrativeWithToolCalls(SAMPLE_MARKDOWN);

    // narrative 中不应含 **XXX**: 标签
    expect(result.narrative).not.toContain('**时间流逝**');
    expect(result.narrative).not.toContain('**当前位置**');
    expect(result.narrative).not.toContain('**饥饿**');
    expect(result.narrative).not.toContain('**你的选择**');
    expect(result.narrative).not.toContain('对白');
    expect(result.narrative).not.toContain('(倾向:');

    // 纯叙事开头应保留
    expect(result.narrative).toContain('艾琳');
    expect(result.narrative).toContain('公会大厅');
  });

  it('纯叙事 (无 markdown 标签): 走原 fallback 路径, narrative = raw, 3 个默认 choices', () => {
    const pm = makePM();
    const pure = '只是一段叙事文本，没有任何结构化标签。';
    const result = pm.parseNarrativeWithToolCalls(pure);
    expect(result.narrative).toBe(pure);
    expect(result.timeElapsed).toBe('');
    expect(result.currentLocation).toBe('');
    // 无 choices 时, 引擎兜底给 3 个默认占位
    expect(result.choices.length).toBe(3);
    // 且不含 - 对白 等 markdown 残留
    expect(result.narrative).not.toContain('- 对白');
    expect(result.narrative).not.toContain('**');
  });

  it('部分 markdown (只有时间 + 位置, 无选择): 仍提取能识别的字段, 缺失字段为默认', () => {
    const pm = makePM();
    const partial = `**时间流逝**: 30分钟
**当前位置**: 森林深处

你沿着林间小径走了很久，阳光从枝叶间洒下。
突然，前方树丛传来沙沙的响声。`;
    const result = pm.parseNarrativeWithToolCalls(partial);

    expect(result.timeElapsed).toBe('30分钟');
    expect(result.currentLocation).toBe('森林深处');
    expect(result.narrative).toContain('林间小径');
    expect(result.narrative).toContain('沙沙的响声');
    expect(result.narrative).not.toContain('**时间流逝**');
    // choices 缺失 → default choices (3 个)
    expect(result.choices.length).toBe(3);
  });

  it('JSON 输入: 不破坏现有 JSON.parse 路径, 字段一致', () => {
    const pm = makePM();
    const json = JSON.stringify({
      narrative: 'JSON 风格的叙事。',
      time_elapsed: '10分钟',
      current_location: '城镇广场',
      choices: [{ text: '选项A', hint: '提示', tendency: 'combat' }],
      consequences: {
        state_changes: { hunger: 5, thirst: 5 },
        items_gained: [],
        items_lost: [],
        items_modified: [],
        skills_modified: [],
        currency_change: { gold: 0, silver: 0, copper: 0 },
        reputation_change: {},
        world_effects: [],
        skills_learned: [],
        hp_change: 0,
        attribute_changes: {},
        identity_changes: {},
        conditions_added: [],
        conditions_removed: [],
      },
      npcs_introduced: [],
      scene_modifier: 0,
      atmosphere: { mood: '轻松', dangerLevel: 'low' },
    });
    const result = pm.parseNarrativeWithToolCalls(json);

    expect(result.narrative).toBe('JSON 风格的叙事。');
    expect(result.timeElapsed).toBe('10分钟');
    expect(result.currentLocation).toBe('城镇广场');
    expect(result.choices[0].text).toBe('选项A');
    expect(result.choices[0].tendency).toBe('combat');
    expect(result.consequences.stateChanges).toEqual({ hunger: 5, thirst: 5 });
    expect(result.atmosphere.mood).toBe('轻松');
  });

  it('markdown + 全角冒号: regex 同时支持 : 和 ：', () => {
    const pm = makePM();
    const fullWidth = `**时间流逝**：2小时
**当前位置**：北境雪山

雪越下越大，你裹紧了斗篷。`;
    const result = pm.parseNarrativeWithToolCalls(fullWidth);

    expect(result.timeElapsed).toBe('2小时');
    expect(result.currentLocation).toBe('北境雪山');
    expect(result.narrative).toContain('雪越下越大');
  });
});
