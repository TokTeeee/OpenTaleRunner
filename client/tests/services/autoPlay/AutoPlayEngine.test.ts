import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoPlayEngine } from '../../../src/services/autoPlay/AutoPlayEngine';
import { useAutoPlayStore } from '../../../src/stores/autoPlayStore';
import { useCharacterStore } from '../../../src/stores/characterStore';
import { useGameStore } from '../../../src/stores/gameStore';
import { useSettingsStore } from '../../../src/stores/settingsStore';
import { resetClientStores } from '../../utils/resetStores';
import type { Character } from '../../../src/types/character';
import type { Choice } from '../../../src/types/game';

vi.mock('../../../src/services/llm/LLMClient', () => ({
  LLMClient: vi.fn().mockImplementation(() => ({
    chat: vi.fn(),
    streamChat: vi.fn(),
  })),
}));

import { LLMClient } from '../../../src/services/llm/LLMClient';

const LLMClientMock = vi.mocked(LLMClient);

function makeCharacter(): Character {
  return {
    characterId: 'c-1',
    playerId: 'p-1',
    name: '阿瑟',
    race: 'human',
    background: '来自北境的游侠',
    appearance: '黑发',
    attributes: { STR: 5, DEX: 6, CON: 5, INT: 5, WIS: 6, CHA: 5 },
    skills: [],
    inventory: { items: [] },
    hp: 20,
    maxHp: 20,
    vital: { hunger: 0, thirst: 0, fatigue: 0, hygiene: 0, bodyTemp: 37 },
    reputation: { lawful: 0, good: 0, fame: 0, infamy: 0 },
    conditions: [],
    joinedRegion: 'starting',
    joinedWorldDay: 1,
    currentLocalDay: 1,
    lastActionTime: new Date().toISOString(),
    recentHistory: [],
    unspentAttributePoints: 0,
    unspentSkillPoints: 0,
  };
}

function makeChoices(): Choice[] {
  return [
    { text: '环顾四周', tendency: 'safe' },
    { text: '上前交谈', tendency: 'bold' },
    { text: '悄悄离开', tendency: 'stealth' },
  ];
}

describe('AutoPlayEngine — 决策循环 smoke (B3.2)', () => {
  beforeEach(() => {
    resetClientStores();
    useSettingsStore.setState((state) => ({
      ...state,
      llm: { ...state.llm, apiKey: 'test-key', endpoint: 'https://llm.test', model: 'm' },
    }));
    useCharacterStore.setState({ character: makeCharacter() });
    useGameStore.setState((state) => ({
      ...state,
      messages: [{ id: '1', type: 'pm', content: '你站在小镇广场中央。', timestamp: Date.now() }],
      isWaitingForPM: false,
      isWaitingForPlayer: true,
      currentChoices: makeChoices(),
    }));
    useAutoPlayStore.setState({ status: 'idle', currentRound: 0, totalRounds: 5, intervalMs: 10 });
    LLMClientMock.mockClear();
  });

  afterEach(() => {
    resetClientStores();
    vi.clearAllMocks();
  });

  it('未配置 API Key 时 start() 设置错误状态并不启动', () => {
    useSettingsStore.setState((state) => ({
      ...state,
      llm: { ...state.llm, apiKey: '' },
    }));
    const engine = new AutoPlayEngine(vi.fn().mockResolvedValue(undefined));
    engine.start();
    const s = useAutoPlayStore.getState();
    expect(s.status).toBe('error');
    expect(s.errorMessage).toMatch(/API Key/i);
  });

  it('step() 调用 LLM 并通过 submitAction 提交选项 0', async () => {
    const submitAction = vi.fn().mockResolvedValue(undefined);
    const chatMock = vi.fn().mockResolvedValue(
      JSON.stringify({ choice_index: 0, custom_action: '', reasoning: '先观察', style: 'explore' }),
    );
    LLMClientMock.mockImplementation(() => ({ chat: chatMock, streamChat: vi.fn() } as unknown as InstanceType<typeof LLMClient>));

    const engine = new AutoPlayEngine(submitAction);
    engine.step();

    await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 50));

    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(submitAction).toHaveBeenCalledWith('环顾四周');
    expect(useAutoPlayStore.getState().lastReasoning).toBe('先观察');
    expect(useAutoPlayStore.getState().currentRound).toBeGreaterThanOrEqual(1);
  });

  it('choiceIndex=-1 且有 customAction 时提交自定义行动', async () => {
    const submitAction = vi.fn().mockResolvedValue(undefined);
    const chatMock = vi.fn().mockResolvedValue(
      JSON.stringify({ choice_index: -1, custom_action: '吟唱古老歌谣', reasoning: '尝试互动', style: 'social' }),
    );
    LLMClientMock.mockImplementation(() => ({ chat: chatMock, streamChat: vi.fn() } as unknown as InstanceType<typeof LLMClient>));

    const engine = new AutoPlayEngine(submitAction);
    engine.step();
    await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 50));

    expect(submitAction).toHaveBeenCalledWith('吟唱古老歌谣');
    expect(useAutoPlayStore.getState().lastReasoning).toBe('尝试互动');
  });

  it('LLM 返回代码块包裹的 JSON 也能正确解析', async () => {
    const submitAction = vi.fn().mockResolvedValue(undefined);
    const chatMock = vi.fn().mockResolvedValue(
      '```json\n{ "choice_index": 1, "custom_action": "", "reasoning": "冲上前", "style": "combat" }\n```',
    );
    LLMClientMock.mockImplementation(() => ({ chat: chatMock, streamChat: vi.fn() } as unknown as InstanceType<typeof LLMClient>));

    const engine = new AutoPlayEngine(submitAction);
    engine.step();
    await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 50));

    expect(submitAction).toHaveBeenCalledWith('上前交谈');
  });

  it('LLM 返回无法解析的字符串时回退到选项 0', async () => {
    const submitAction = vi.fn().mockResolvedValue(undefined);
    const chatMock = vi.fn().mockResolvedValue('我完全不知道该做什么');
    LLMClientMock.mockImplementation(() => ({ chat: chatMock, streamChat: vi.fn() } as unknown as InstanceType<typeof LLMClient>));

    const engine = new AutoPlayEngine(submitAction);
    engine.step();
    await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 50));

    expect(submitAction).toHaveBeenCalledWith('环顾四周');
    expect(useAutoPlayStore.getState().lastReasoning).toMatch(/默认/);
  });

  it('当 gameStore.isWaitingForPM=true 时不调用 LLM 也不提交行动', async () => {
    useGameStore.setState((state) => ({ ...state, isWaitingForPM: true }));
    const submitAction = vi.fn().mockResolvedValue(undefined);
    const chatMock = vi.fn();
    LLMClientMock.mockImplementation(() => ({ chat: chatMock, streamChat: vi.fn() } as unknown as InstanceType<typeof LLMClient>));

    const engine = new AutoPlayEngine(submitAction);
    engine.step();
    await new Promise((r) => setTimeout(r, 80));

    expect(chatMock).not.toHaveBeenCalled();
    expect(submitAction).not.toHaveBeenCalled();
  });

  it('角色为空时 stop() 并设置错误状态', async () => {
    useCharacterStore.setState({ character: null });
    const submitAction = vi.fn().mockResolvedValue(undefined);
    const engine = new AutoPlayEngine(submitAction);
    engine.step();
    await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 50));

    expect(submitAction).not.toHaveBeenCalled();
    const s = useAutoPlayStore.getState();
    expect(['error', 'idle']).toContain(s.status);
    expect(s.errorMessage).toMatch(/无角色|角色/);
  });
});

// ===== 审计 P1 修复: stop() / forceStop() 状态语义 =====
describe('AutoPlayEngine stop/forceStop (audit P1 fix)', () => {
  beforeEach(() => {
    resetClientStores();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stop() 在 error 状态下保留 error,以便 UI 显示错误信息', () => {
    const engine = new AutoPlayEngine(async () => {});

    // 模拟: 先置为 error (即 setErrorMessage 后的状态)
    useAutoPlayStore.getState().setErrorMessage('连续 3 次失败: LLM timeout');
    expect(useAutoPlayStore.getState().status).toBe('error');

    // 修复前: stop() 会把 status 重置为 'idle', 错误信息消失
    // 修复后: stop() 保留 error 状态
    engine.stop();
    expect(useAutoPlayStore.getState().status).toBe('error');
    expect(useAutoPlayStore.getState().errorMessage).toContain('LLM timeout');
  });

  it('stop() 在非 error 状态下回归 idle (正常停止)', () => {
    const engine = new AutoPlayEngine(async () => {});
    useAutoPlayStore.getState().setStatus('running');

    engine.stop();

    expect(useAutoPlayStore.getState().status).toBe('idle');
  });

  it('forceStop() 总是重置到 idle (用于正常完成轮次等场景)', () => {
    const engine = new AutoPlayEngine(async () => {});
    useAutoPlayStore.getState().setErrorMessage('some error');
    expect(useAutoPlayStore.getState().status).toBe('error');

    engine.forceStop();

    expect(useAutoPlayStore.getState().status).toBe('idle');
  });
});
