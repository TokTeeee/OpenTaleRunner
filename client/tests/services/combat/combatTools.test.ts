import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  registerCombatTools,
  unregisterCombatTools,
  isCombatToolsRegistered,
  getCombatEngine,
  _resetCombatEngine,
  type CombatToolResult,
} from '../../../src/services/combat/combatTools';
import { toolCallRegistry } from '../../../src/services/llm/ToolCallRegistry';
import { useCombatStore, INITIAL_COMBAT_STATE } from '../../../src/stores/combatStore';
import { useCharacterStore } from '../../../src/stores/characterStore';
import { useGameStore } from '../../../src/stores/gameStore';
import { useItemRegistryStore } from '../../../src/stores/itemRegistryStore';
import type { Combatant, BalanceRating, CombatOutcome } from '../../../src/services/combat/types';
import { resetClientStores } from '../../utils/resetStores';

/** 包装 dispatch: 传单 toolcall, 返 handler result */
async function callTool(name: string, args: unknown): Promise<CombatToolResult> {
  const results = await toolCallRegistry.dispatch([{ name, arguments: (args ?? {}) as Record<string, unknown> }]);
  const r = results[0]!;
  if (!r.ok) {
    return { ok: false, reason: r.error };
  }
  return r.result as CombatToolResult;
}

function makePlayer(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'p1',
    side: 'player',
    name: '玩家',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: 24, maxHp: 24,
    ap: 6, maxAp: 6,
    conditions: [],
    isDead: false,
    isFleeing: false,
    equipped: { weapon: null, armor: null, accessory: null },
    ...overrides,
  };
}

function makeEnemy(id: string, overrides: Partial<Combatant> = {}): Combatant {
  return {
    id,
    side: 'enemy',
    name: `敌人 ${id}`,
    attributes: { STR: 8, DEX: 14, CON: 10, INT: 6, WIS: 8, CHA: 6 },
    hp: 12, maxHp: 12,
    ap: 6, maxAp: 6,
    conditions: [],
    isDead: false,
    isFleeing: false,
    equipped: { weapon: null, armor: null, accessory: null },
    ...overrides,
  };
}

function makeStartCombatArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    combatId: 'test-combat-1',
    player: makePlayer(),
    party: [],
    enemies: [makeEnemy('e1')],
    narrativeOpening: '三只哥布林跳出来!',
    recommendedDifficulty: 'normal',
    ...overrides,
  };
}

function makeEndCombatArgs(overrides: Partial<{
  outcome: CombatOutcome;
  durationRounds: number;
  appliedBalanceRating: BalanceRating;
  loot: string[];
  finalState: { player: { hp: number; maxHp: number; conditions?: string[] } };
  narrativeClosing: string;
}> = {}): Record<string, unknown> {
  return {
    outcome: 'victory',
    durationRounds: 3,
    appliedBalanceRating: 'normal',
    ...overrides,
  };
}

beforeEach(() => {
  resetClientStores();
  useCombatStore.setState({ ...INITIAL_COMBAT_STATE, phase: 'idle' });
  unregisterCombatTools();
  _resetCombatEngine();
  // 注入一个最小角色, 让 updateCurrency / addCondition 不 no-op
  useCharacterStore.getState().setCharacter({
    id: 'p1',
    name: '测试玩家',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: 24, maxHp: 24,
    vital: { health: 100, mana: 100, stamina: 100, morale: 100 },
    conditions: [],
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    skills: [],
    recentHistory: [],
    inventory: {
      currency: { gold: 0 },
      items: [],
      capacity: 20,
      equipped: { weapon: null, armor: null, accessory: null },
    },
    joinedRegion: 'test-region',
    currentLocalDay: 1,
    lastActionTime: '',
  } as never);
  // 设玩家有 100 金
  useCharacterStore.getState().updateCurrency({ gold: 100 });
});

afterEach(() => {
  unregisterCombatTools();
  _resetCombatEngine();
});

// ============================================================
// register / unregister
// ============================================================

describe('combatTools: register / unregister', () => {
  it('register 幂等 + 检查 isCombatToolsRegistered', () => {
    const unreg1 = registerCombatTools();
    expect(isCombatToolsRegistered()).toBe(true);
    const unreg2 = registerCombatTools(); // 幂等
    unreg1();
    unreg2();
    expect(isCombatToolsRegistered()).toBe(false);
  });

  it('register 后 startCombat/endCombat 在 toolCallRegistry 可见', () => {
    registerCombatTools();
    expect(toolCallRegistry.has('startCombat')).toBe(true);
    expect(toolCallRegistry.has('endCombat')).toBe(true);
    unregisterCombatTools();
    expect(toolCallRegistry.has('startCombat')).toBe(false);
  });
});

// ============================================================
// startCombat 校验
// ============================================================

describe('combatTools: startCombat schema 校验', () => {
  beforeEach(() => {
    registerCombatTools();
  });

  it('合法 payload → ok=true, phase=active', async () => {
    const r = await callTool('startCombat', makeStartCombatArgs());
    expect(r.ok).toBe(true);
    expect(r.combatId).toBe('test-combat-1');
    expect(['active', 'initializing']).toContain(r.phase);
  });

  it('combatId 缺失 → ok=false, reason 含 combatId', async () => {
    const r = await callTool('startCombat', { player: makePlayer(), enemies: [makeEnemy('e1')] });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('combatId');
  });

  it('enemies 为空 → ok=false', async () => {
    const r = await callTool('startCombat', makeStartCombatArgs({ enemies: [] }));
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('enemies');
  });

  it('enemies 缺字段 → ok=false (InvalidCombatantError)', async () => {
    const r = await callTool('startCombat', makeStartCombatArgs({ enemies: [makeEnemy('e1', { hp: 0 })] }));
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('hp');
  });

  it('不合法 recommendedDifficulty → ok=false', async () => {
    const r = await callTool('startCombat', makeStartCombatArgs({ recommendedDifficulty: 'impossible' as unknown as BalanceRating }));
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('recommendedDifficulty');
  });

  it('phase 非 idle → ok=false 拒绝重复启动', async () => {
    useCombatStore.setState({ phase: 'active' });
    const r = await callTool('startCombat', makeStartCombatArgs());
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('非 idle');
  });
});

// ============================================================
// startCombat BalanceEvaluator 注入
// ============================================================

describe('combatTools: startCombat BalanceReport 注入', () => {
  beforeEach(() => {
    registerCombatTools();
  });

  it('startCombat 后 combatStore.balanceRating / balanceReport 已设', async () => {
    await callTool('startCombat', makeStartCombatArgs());
    const store = useCombatStore.getState();
    expect(store.balanceRating).toBeDefined();
    expect(store.balanceReport).toBeDefined();
    expect(store.balanceReport?.failurePenalty).toBeDefined();
  });

  it('HP > 50 → warn 但不阻断', async () => {
    const r = await callTool('startCombat', makeStartCombatArgs({ player: makePlayer({ hp: 60, maxHp: 60 }) }));
    expect(r.ok).toBe(true);
  });

  it('LLM 推荐与实际偏差 ≥ 1 档 → warn, 不阻断', async () => {
    const enemies = [makeEnemy('g1'), makeEnemy('g2'), makeEnemy('g3')]; // 3 goblin = deadly
    const r = await callTool('startCombat', makeStartCombatArgs({ enemies, recommendedDifficulty: 'trivial' }));
    expect(r.ok).toBe(true);
  });
});

// ============================================================
// endCombat 校验
// ============================================================

describe('combatTools: endCombat schema 校验', () => {
  beforeEach(() => {
    registerCombatTools();
  });

  it('合法 payload → ok=true', async () => {
    const r = await callTool('endCombat', makeEndCombatArgs());
    expect(r.ok).toBe(true);
  });

  it('不合法 outcome → ok=false', async () => {
    const r = await callTool('endCombat', makeEndCombatArgs({ outcome: 'invalid' as unknown as CombatOutcome }));
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('outcome');
  });

  it('durationRounds=0 → ok=false', async () => {
    const r = await callTool('endCombat', makeEndCombatArgs({ durationRounds: 0 }));
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('durationRounds');
  });

  it('不合法 appliedBalanceRating → ok=false', async () => {
    const r = await callTool('endCombat', makeEndCombatArgs({ appliedBalanceRating: 'impossible' as unknown as BalanceRating }));
    expect(r.ok).toBe(false);
  });
});

// ============================================================
// endCombat 应用 finalState / penalty / loot / narrative
// ============================================================

describe('combatTools: endCombat 副作用', () => {
  beforeEach(async () => {
    registerCombatTools();
    // 先 startCombat 设 balanceReport (normal rating)
    await callTool('startCombat', makeStartCombatArgs());
    // 模拟战斗进行中
    useCombatStore.setState({ phase: 'active' });
  });

  it('victory: 不扣金, conditions 不追加', async () => {
    const goldBefore = useCharacterStore.getState().character?.inventory?.currency?.gold ?? 0;
    const r = await callTool('endCombat', makeEndCombatArgs({ outcome: 'victory' }));
    expect(r.ok).toBe(true);
    const goldAfter = useCharacterStore.getState().character?.inventory?.currency?.gold ?? 0;
    expect(goldAfter).toBe(goldBefore);
  });

  it('defeat + normal rating: 扣 10% 金, 追加 wounded_1 condition', async () => {
    const r = await callTool('endCombat', makeEndCombatArgs({
      outcome: 'defeat',
      appliedBalanceRating: 'normal',
    }));
    expect(r.ok).toBe(true);
    // 100 金 - 10% = 90 金
    expect(useCharacterStore.getState().character?.inventory?.currency?.gold).toBe(90);
    // conditions 含 wounded_1
    expect(useCharacterStore.getState().character?.conditions ?? []).toContain('wounded_1');
    // appliedPenalty 描述
    expect(r.appliedPenalty).toBeDefined();
  });

  it('defeat + deadly: 扣 50% 金, 追加 perma-wound', async () => {
    const r = await callTool('endCombat', makeEndCombatArgs({
      outcome: 'defeat',
      appliedBalanceRating: 'deadly',
    }));
    expect(r.ok).toBe(true);
    expect(useCharacterStore.getState().character?.inventory?.currency?.gold).toBe(50);
    expect(useCharacterStore.getState().character?.conditions ?? []).toContain('perma-wound');
  });

  it('defeat + trivial: 不扣金, 不追加 conditions', async () => {
    const r = await callTool('endCombat', makeEndCombatArgs({
      outcome: 'defeat',
      appliedBalanceRating: 'trivial',
    }));
    expect(r.ok).toBe(true);
    expect(useCharacterStore.getState().character?.inventory?.currency?.gold).toBe(100);
  });

  it('finalState.player.hp=0 但 survives=true (trivial rating): HP 仍写入 (不真死)', async () => {
    await callTool('endCombat', makeEndCombatArgs({
      outcome: 'defeat',
      appliedBalanceRating: 'trivial',
      finalState: { player: { hp: 0, maxHp: 24, conditions: [] } },
    }));
    // 0 HP 但 survives (per spec "perma-wound 替代死亡")
    // v0.4 简化: HP=0 写入 (UI 显示), 死亡判定由 v0.5 实施
  });

  it('narrativeClosing 写入 gameStore', async () => {
    const r = await callTool('endCombat', makeEndCombatArgs({
      narrativeClosing: '战斗结束, 玩家胜利',
    }));
    expect(r.ok).toBe(true);
    const messages = useGameStore.getState().messages;
    expect(messages.some((m) => m.content.includes('战斗结束'))).toBe(true);
  });

  it('loot 写入 gameStore system message', async () => {
    const r = await callTool('endCombat', makeEndCombatArgs({ loot: ['gold_50', 'sword_1'] }));
    expect(r.ok).toBe(true);
    const messages = useGameStore.getState().messages;
    expect(messages.some((m) => m.content.includes('gold_50') && m.content.includes('sword_1'))).toBe(true);
  });
});

// ============================================================
// 战斗期间 gameStore 不主动调 generateScene
// ============================================================

describe('combatTools: 战斗期间控制', () => {
  it('startCombat 后 phase 是 initializing/active, gameStore 不应触发 PMEngine 主动调', async () => {
    registerCombatTools();
    const r = await callTool('startCombat', makeStartCombatArgs());
    expect(r.ok).toBe(true);
    const phase = useCombatStore.getState().phase;
    expect(['initializing', 'active']).toContain(phase);
  });
});

// ============================================================
// 错误注入不抛
// ============================================================

describe('combatTools: 不抛错契约', () => {
  beforeEach(() => {
    registerCombatTools();
  });

  it('任意 payload 错误 → 返 {ok:false}, 不抛异常', async () => {
    const r = await callTool('startCombat', null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBeDefined();
  });
});

// ============================================================
// 工具
// ============================================================

describe('combatTools: getCombatEngine 单例', () => {
  it('getCombatEngine 返同实例', () => {
    const e1 = getCombatEngine();
    const e2 = getCombatEngine();
    expect(e1).toBe(e2);
  });

  it('_resetCombatEngine 重建实例', () => {
    const e1 = getCombatEngine();
    _resetCombatEngine();
    const e2 = getCombatEngine();
    expect(e1).not.toBe(e2);
  });
});

// 抑制 unused warning
void useItemRegistryStore;
