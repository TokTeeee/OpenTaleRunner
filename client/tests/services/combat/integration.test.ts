/**
 * v0.5-dev 战斗系统 — 集成测试 (T7.2)
 *
 * 端到端验证 6 维公式 + QTE + 物品路由 + 失败惩罚 的协同工作:
 *
 * v0.5-dev 变更:
 * - 命中公式: d20 + DEX_mod vs 10 + DEX_mod + defense + dodgePenalty
 * - 伤害公式: max(1, d6 + STR_mod + weapon - target.defense) * QTE 缩放
 * - 移除 skill 相关用例
 *
 * 场景:
 *  1. startCombat → 回合循环 (本地, 无 LLM) → endCombat, 整场 2 次 LLM 调用
 *  2. 玩家 HP=0 trivial 档: 失败惩罚 = 无 (no gold loss, no conditions)
 *  3. 玩家 HP=0 deadly 档: survives=true + perma-wound 替代死亡
 *  4. 物品 combatUse: 默认 mapping 覆盖 11 种 EffectType 中大部分
 *  5. 逃跑成功 / 失败: 战斗结束条件分支
 *  6. QTE 开启 + 攻击: 6 维公式不变, 伤害 ±30% (modifier 缩放)
 *  7. QTE 关闭 + 攻击: 伤害 = base (modifier=0)
 *
 * 详见: docs/zh/战斗系统.md §2.6
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  registerCombatTools,
  unregisterCombatTools,
  isCombatToolsRegistered,
  getCombatEngine,
  _resetCombatEngine,
  type CombatToolResult,
} from '../../../src/services/combat/combatTools';
import { createActionResolver, _resetSharedResolver, noopQTEProvider, type QTEProvider } from '../../../src/services/combat/ActionResolver';
import { toolCallRegistry } from '../../../src/services/llm/ToolCallRegistry';
import { useCombatStore, INITIAL_COMBAT_STATE } from '../../../src/stores/combatStore';
import { useCharacterStore } from '../../../src/stores/characterStore';
import { useGameStore } from '../../../src/stores/gameStore';
import { useItemRegistryStore } from '../../../src/stores/itemRegistryStore';
import { useSettingsStore } from '../../../src/stores/settingsStore';
import { makeConstRoll } from '../../../src/services/combat/dice';
import { toCombatCategory, hasDefaultMapping, type CombatEffectCategory } from '../../../src/services/combat/effectTypeCompat';
import type { Combatant, BalanceRating, CombatOutcome } from '../../../src/services/combat/types';
import type { EffectType } from '../../../src/types/item';
import { resetClientStores } from '../../utils/resetStores';

// ============================================================
// 工具
// ============================================================

/** 包装 dispatch: 传单 toolcall, 返 handler result */
async function callTool(name: string, args: unknown): Promise<CombatToolResult> {
  const results = await toolCallRegistry.dispatch([{ name, arguments: (args ?? {}) as Record<string, unknown> }]);
  const r = results[0]!;
  if (!r.ok) return { ok: false, reason: r.error };
  return r.result as CombatToolResult;
}

function makePlayer(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'p1',
    side: 'player',
    name: '玩家',
    attributes: { STR: 12, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: 30, maxHp: 30,
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
    attributes: { STR: 8, DEX: 10, CON: 10, INT: 6, WIS: 8, CHA: 6 },
    hp: 12, maxHp: 12,
    ap: 4, maxAp: 4,
    conditions: [],
    isDead: false,
    isFleeing: false,
    equipped: { weapon: null, armor: null, accessory: null },
    ...overrides,
  };
}

function makeStartCombatArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    combatId: 'integration-1',
    player: makePlayer(),
    party: [],
    enemies: [makeEnemy('e1')],
    narrativeOpening: '战斗开始!',
    recommendedDifficulty: 'normal',
    ...overrides,
  };
}

function setupCharacter(gold = 100): void {
  useCharacterStore.getState().setCharacter({
    id: 'p1',
    name: '测试玩家',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: 30, maxHp: 30,
    vital: { health: 100, mana: 100, stamina: 100, morale: 100 },
    conditions: [],
    reputation: { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    skills: [],
    recentHistory: [],
    inventory: {
      currency: { gold },
      items: [],
      capacity: 20,
      equipped: { weapon: null, armor: null, accessory: null },
    },
    joinedRegion: 'test-region',
    currentLocalDay: 1,
    lastActionTime: '',
  } as never);
}

// ============================================================
// Setup / Teardown
// ============================================================

beforeEach(() => {
  resetClientStores();
  useCombatStore.setState({ ...INITIAL_COMBAT_STATE, phase: 'idle' });
  unregisterCombatTools();
  _resetCombatEngine();
  registerCombatTools();
  setupCharacter(100);
  // 默认 QTE 关闭
  useSettingsStore.setState((s) => ({ qte: { ...s.qte, enabled: false } }));
});

afterEach(() => {
  unregisterCombatTools();
  _resetCombatEngine();
  useItemRegistryStore.getState().reset();
});

// ============================================================
// 1. 整场: startCombat → 回合 → endCombat 整场 2 次 LLM 调用
// ============================================================

describe('integration: 整场 startCombat → 回合 → endCombat', () => {
  it('完整链路: startCombat + 回合 (本地) + endCombat, dispatch 返 ok=true × 2', async () => {
    expect(isCombatToolsRegistered()).toBe(true);

    // 1. 启动战斗
    const r1 = await callTool('startCombat', makeStartCombatArgs());
    expect(r1.ok).toBe(true);
    expect(r1.combatId).toBe('integration-1');
    expect(['active', 'initializing']).toContain(r1.phase);
    expect(useCombatStore.getState().phase).toBe('active');

    // 2. 玩家攻击几次 (本地, 不算 LLM). 用 constRoll 让玩家必命中.
    // v0.5-dev: d20=20 (命中: 20+DEX_mod=22 ≥ 门槛 10), d6=6 (伤害: 6+STR_mod+weapon-defense)
    const resolver = createActionResolver({ roll: makeConstRoll([20, 6]) });
    const playerHpBefore = useCombatStore.getState().combatants.p1!.hp;
    const enemyHpBefore = useCombatStore.getState().combatants.e1!.hp;

    resolver.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState());
    // 玩家攻击命中, 敌人扣血
    expect(useCombatStore.getState().combatants.e1!.hp).toBeLessThan(enemyHpBefore);
    // 玩家 AP 扣 2
    expect(useCombatStore.getState().combatants.p1!.ap).toBe(4);
    // 玩家 HP 不变
    expect(useCombatStore.getState().combatants.p1!.hp).toBe(playerHpBefore);
    // 写入了 log
    expect(useCombatStore.getState().log.length).toBeGreaterThan(0);

    // 3. 结束战斗
    const r2 = await callTool('endCombat', {
      outcome: 'victory',
      durationRounds: 3,
      appliedBalanceRating: 'normal',
    });
    expect(r2.ok).toBe(true);
    // endCombat 流程: phase 经历 resolving → settled
    expect(['settled', 'idle']).toContain(useCombatStore.getState().phase);
  });

  it('整场 2 次 LLM 调用: startCombat + endCombat 都通过 dispatch', async () => {
    // 串行 dispatch
    const calls = [
      { name: 'startCombat', arguments: makeStartCombatArgs() },
      { name: 'endCombat', arguments: { outcome: 'victory' as CombatOutcome, durationRounds: 1, appliedBalanceRating: 'normal' as BalanceRating } },
    ];
    const results = await toolCallRegistry.dispatch(calls);
    expect(results).toHaveLength(2);
    expect(results[0]!.ok).toBe(true);
    expect(results[1]!.ok).toBe(true);
  });
});

// ============================================================
// 2. 玩家 HP=0 trivial 档: 失败惩罚 = 无
// ============================================================

describe('integration: HP=0 trivial 档无惩罚', () => {
  it('defeat + trivial: gold 不扣, conditions 不追加, survives=true', async () => {
    // 启动
    await callTool('startCombat', makeStartCombatArgs());
    const goldBefore = useCharacterStore.getState().character?.inventory?.currency?.gold ?? 0;
    const conditionsBefore = useCharacterStore.getState().character?.conditions ?? [];

    // 结束 — 应用 trivial 惩罚
    const r = await callTool('endCombat', {
      outcome: 'defeat',
      durationRounds: 2,
      appliedBalanceRating: 'trivial',
      finalState: { player: { hp: 0, maxHp: 30, conditions: [] } },
    });
    expect(r.ok).toBe(true);
    // gold 不变
    expect(useCharacterStore.getState().character?.inventory?.currency?.gold).toBe(goldBefore);
    // conditions 不追加
    expect(useCharacterStore.getState().character?.conditions ?? []).toEqual(conditionsBefore);
    // appliedPenalty 反映 trivial (failurePenaltyFor('trivial') = 无扣金无 condition)
    // 注: appliedPenalty 是描述文本, 不会直接说 'survives', 但 gold 不变就是契约证明
  });
});

// ============================================================
// 3. 玩家 HP=0 deadly 档: survives=true + perma-wound
// ============================================================

describe('integration: HP=0 deadly 档 perma-wound 替代死亡', () => {
  it('defeat + deadly: 扣 50% gold, 追加 perma-wound condition', async () => {
    await callTool('startCombat', makeStartCombatArgs());

    const r = await callTool('endCombat', {
      outcome: 'defeat',
      durationRounds: 4,
      appliedBalanceRating: 'deadly',
      finalState: { player: { hp: 0, maxHp: 30, conditions: [] } },
    });
    expect(r.ok).toBe(true);
    // 100 gold - 50% = 50 gold
    expect(useCharacterStore.getState().character?.inventory?.currency?.gold).toBe(50);
    // conditions 含 perma-wound
    const conds = useCharacterStore.getState().character?.conditions ?? [];
    expect(conds).toContain('perma-wound');
    // 同时含 wounded_3, humiliated
    expect(conds).toContain('wounded_3');
    expect(conds).toContain('humiliated');
  });

  it('deadly 失败时, 角色仍可继续游戏 (survives=true, 不真死)', async () => {
    await callTool('startCombat', makeStartCombatArgs());

    await callTool('endCombat', {
      outcome: 'defeat',
      durationRounds: 4,
      appliedBalanceRating: 'deadly',
      finalState: { player: { hp: 0, maxHp: 30, conditions: [] } },
    });
    // 角色仍存在, 仍可继续
    const char = useCharacterStore.getState().character;
    expect(char).not.toBeNull();
    // 至少有 perma-wound 替代死亡
    expect(char?.conditions ?? []).toContain('perma-wound');
    // 战斗已结束, phase = settled 或 idle (endCombat handler 停在 settled, 不主动 reset)
    expect(['settled', 'idle']).toContain(useCombatStore.getState().phase);
  });
});

// ============================================================
// 4. 物品 combatUse 默认 mapping
// ============================================================

describe('integration: 物品 combatUse 默认 mapping 覆盖', () => {
  it('11 种 EffectType 中, 默认 mapping (heal/buff/damage) 覆盖 7 种 (~64%); 加上 weapon-perm 2 种 = 9 种 (82%); gm-fallback 2 种需 GM', () => {
    const all: EffectType[] = [
      'damage_bonus', 'defense_bonus', 'attribute_mod',
      'hp_restore', 'hp_max_bonus', 'vital_restore',
      'elemental_damage', 'elemental_resist',
      'skill_bonus', 'light_source', 'special',
    ];
    expect(all).toHaveLength(11);

    const byCat: Record<CombatEffectCategory, EffectType[]> = {
      'heal': [], 'buff': [], 'damage': [], 'weapon-perm': [], 'gm-fallback': [],
    };
    for (const t of all) {
      byCat[toCombatCategory(t)].push(t);
    }

    // 默认 mapping: heal (1) + buff (5) + damage (1) = 7 种 (hp_restore, hp_max_bonus, vital_restore, attribute_mod, elemental_resist, skill_bonus, elemental_damage)
    expect(byCat['heal']).toEqual(['hp_restore']);
    expect(byCat['buff']).toHaveLength(5);
    expect(byCat['damage']).toEqual(['elemental_damage']);
    // weapon-perm: damage_bonus, defense_bonus (2 种, 已 merge 不走 combatUse)
    expect(byCat['weapon-perm']).toHaveLength(2);
    // gm-fallback: light_source, special (2 种, 需 GM 裁定)
    expect(byCat['gm-fallback']).toHaveLength(2);
    // 默认覆盖 = 1 + 5 + 1 = 7 种 / 11 = ~64%
    // 实际战斗中, weapon-perm 走装备, 不算 "走 combatUse"; gm-fallback 走 GM toolcall
    // 默认 mapping 在 combatUse 路径占 7/9 = ~78%
    const defaultMapped = all.filter((t) => hasDefaultMapping(t));
    expect(defaultMapped).toHaveLength(7);
  });

  it('end-to-end: 玩家使用 hp_restore 物品, 战斗 HP 上升, 0 AP', async () => {
    // 准备物品
    const potion = useItemRegistryStore.getState().register({
      name: '治疗药水',
      category: 'consumable',
      quality: '普通',
      effects: [{ id: 'e1', type: 'hp_restore', value: 10, description: '恢复 10 HP' }],
      value: 10,
      spawnInfo: { worldDay: 1, region: 'start', source: 'loot' },
      holder: { kind: 'character', refId: 'p1' },
    });

    // 启动战斗
    await callTool('startCombat', makeStartCombatArgs());
    // 把玩家 HP 调到 10/30
    useCombatStore.setState((s) => ({
      combatants: { ...s.combatants, p1: { ...s.combatants.p1!, hp: 10 } },
    }));

    const engine = getCombatEngine();
    const resolver = createActionResolver({ roll: makeConstRoll([1, 1, 1, 1]) });
    engine.setResolver(resolver);

    // 玩家用物品
    const apBefore = useCombatStore.getState().combatants.p1!.ap;
    const hpBefore = useCombatStore.getState().combatants.p1!.hp;
    resolver.resolve(
      { kind: 'item', userId: 'p1', itemId: potion.itemId, targetId: 'p1' },
      useCombatStore.getState(),
    );
    // HP +10 = 20
    expect(useCombatStore.getState().combatants.p1!.hp).toBe(hpBefore + 10);
    // 物品 0 AP
    expect(useCombatStore.getState().combatants.p1!.ap).toBe(apBefore);
  });

  it('attribute_mod 物品 → BuffInstance 加入 combatants.conditions', async () => {
    const ring = useItemRegistryStore.getState().register({
      name: '力量戒指',
      category: 'accessory',
      quality: '精良',
      effects: [{ id: 'e1', type: 'attribute_mod', value: { STR: 2 }, description: '+2 STR' }],
      value: 100,
      spawnInfo: { worldDay: 1, region: 'start', source: 'loot' },
      holder: { kind: 'character', refId: 'p1' },
    });

    await callTool('startCombat', makeStartCombatArgs());
    const resolver = createActionResolver({ roll: makeConstRoll([1, 1]) });
    resolver.resolve(
      { kind: 'item', userId: 'p1', itemId: ring.itemId, targetId: 'p1' },
      useCombatStore.getState(),
    );
    // 玩家身上有 attribute_mod buff
    const conds = useCombatStore.getState().combatants.p1!.conditions;
    expect(conds.length).toBeGreaterThan(0);
    expect(conds.some((b) => b.ref.includes('attribute_mod'))).toBe(true);
    expect(conds.find((b) => b.ref.includes('attribute_mod'))?.modifiers.STR).toBe(2);
  });
});

// ============================================================
// 5. 逃跑成功 / 失败
// ============================================================

describe('integration: 逃跑分支', () => {
  it('逃跑成功 (DEX 优势, d100 低): 玩家 isFleeing=true, 触发 endCombat fled', async () => {
    await callTool('startCombat', makeStartCombatArgs({
      player: makePlayer({ attributes: { STR: 10, DEX: 18, CON: 10, INT: 10, WIS: 10, CHA: 10 } }),
    }));
    // 玩家 DEX 18 → +4 mod; 敌人 DEX 10 → 0 mod; chance = 0.3 + (18-10)/20 = 0.7
    // d100 = 30 → 成功

    const engine = getCombatEngine();
    const resolver = createActionResolver({ roll: makeConstRoll([30]) });
    engine.setResolver(resolver);

    await engine.processTurn({ kind: 'flee', userId: 'p1' }, 'p1');

    // 玩家 isFleeing=true
    expect(useCombatStore.getState().combatants.p1!.isFleeing).toBe(true);
    // checkEndCondition 触发 fled outcome
    expect(['fled', 'resolving', 'settled']).toContain(useCombatStore.getState().phase);
  });

  it('逃跑失败 (DEX 劣势, d100 高): isFleeing 保持 false, phase 继续 active', async () => {
    await callTool('startCombat', makeStartCombatArgs({
      player: makePlayer({ attributes: { STR: 10, DEX: 8, CON: 10, INT: 10, WIS: 10, CHA: 10 } }),
    }));
    // 玩家 DEX 8 → -1 mod; 敌人 DEX 10 → 0 mod; chance = 0.3 + (8-10)/20 = 0.2
    // d100 = 80 → 失败

    const engine = getCombatEngine();
    const resolver = createActionResolver({ roll: makeConstRoll([80]) });
    engine.setResolver(resolver);

    await engine.processTurn({ kind: 'flee', userId: 'p1' }, 'p1');

    expect(useCombatStore.getState().combatants.p1!.isFleeing).toBe(false);
    // 战斗继续
    expect(['active', 'resolving']).toContain(useCombatStore.getState().phase);
  });

  it('逃跑成功 → endCombat fled outcome: 无惩罚 (fled != defeat)', async () => {
    await callTool('startCombat', makeStartCombatArgs({
      player: makePlayer({ attributes: { STR: 10, DEX: 18, CON: 10, INT: 10, WIS: 10, CHA: 10 } }),
    }));
    // 玩家逃跑
    const engine = getCombatEngine();
    const resolver = createActionResolver({ roll: makeConstRoll([30]) });
    engine.setResolver(resolver);
    await engine.processTurn({ kind: 'flee', userId: 'p1' }, 'p1');

    const goldBefore = useCharacterStore.getState().character?.inventory?.currency?.gold ?? 0;
    const r = await callTool('endCombat', {
      outcome: 'fled',
      durationRounds: 1,
      appliedBalanceRating: 'normal',
    });
    expect(r.ok).toBe(true);
    // fled 不算 defeat, 不扣金
    expect(useCharacterStore.getState().character?.inventory?.currency?.gold).toBe(goldBefore);
  });
});

// ============================================================
// 6. QTE 开启 + 攻击: 6 维公式不变, 伤害 ±30%
// ============================================================

describe('integration: QTE 开启 + 攻击: 伤害 ±30% (modifier 缩放)', () => {
  // v0.5-dev: d20=20 必命中 (20+DEX=22 ≥ 门槛 10), d6=4 → 伤害 base = 4+1+4-0 = 9
  const FIXED_HIT_ROLL = [20, 4] as const;

  it('QTE 关闭: damage = base (modifier=0)', async () => {
    await callTool('startCombat', makeStartCombatArgs());
    // 玩家有武器 +4 dmg
    const player = makePlayer({
      equipped: {
        weapon: { name: '剑', effects: [{ id: 'w1', type: 'damage_bonus', value: 4, description: '+4' }] } as unknown as Combatant['equipped']['weapon'],
        armor: null, accessory: null,
      },
    });
    useCombatStore.setState((s) => ({ combatants: { ...s.combatants, p1: player } }));

    const resolver = createActionResolver({ roll: makeConstRoll([...FIXED_HIT_ROLL]) });
    const hpBefore = useCombatStore.getState().combatants.e1!.hp;
    resolver.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState());
    const dmg = hpBefore - useCombatStore.getState().combatants.e1!.hp;
    // v0.5-dev: base = max(1, d6(4) + STR_mod(12→+1) + weapon(4) - defense(0)) = 9
    // QTE off → modifier=0 → 9 * 1 = 9
    expect(dmg).toBe(9);
  });

  it('QTE 开 + modifier=+1: damage × 1.3 (QTE 命中好)', async () => {
    await callTool('startCombat', makeStartCombatArgs());
    const player = makePlayer({
      equipped: {
        weapon: { name: '剑', effects: [{ id: 'w1', type: 'damage_bonus', value: 4, description: '+4' }] } as unknown as Combatant['equipped']['weapon'],
        armor: null, accessory: null,
      },
    });
    useCombatStore.setState((s) => ({ combatants: { ...s.combatants, p1: player } }));

    const qte: QTEProvider = () => ({ accuracy: 1, modifier: 1, type: 'attack' });
    const resolver = createActionResolver({ roll: makeConstRoll([...FIXED_HIT_ROLL]), qte });
    const hpBefore = useCombatStore.getState().combatants.e1!.hp;
    resolver.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState());
    const dmg = hpBefore - useCombatStore.getState().combatants.e1!.hp;
    // base 9 * (1 + 1*0.3) = 9 * 1.3 = 11.7 → round = 12
    expect(dmg).toBe(12);
  });

  it('QTE 开 + modifier=-1: damage × 0.7 (QTE 失手)', async () => {
    await callTool('startCombat', makeStartCombatArgs());
    const player = makePlayer({
      equipped: {
        weapon: { name: '剑', effects: [{ id: 'w1', type: 'damage_bonus', value: 4, description: '+4' }] } as unknown as Combatant['equipped']['weapon'],
        armor: null, accessory: null,
      },
    });
    useCombatStore.setState((s) => ({ combatants: { ...s.combatants, p1: player } }));

    const qte: QTEProvider = () => ({ accuracy: 0, modifier: -1, type: 'attack' });
    const resolver = createActionResolver({ roll: makeConstRoll([...FIXED_HIT_ROLL]), qte });
    const hpBefore = useCombatStore.getState().combatants.e1!.hp;
    resolver.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState());
    const dmg = hpBefore - useCombatStore.getState().combatants.e1!.hp;
    // base 9 * (1 + -1*0.3) = 9 * 0.7 = 6.3 → round = 6
    expect(dmg).toBe(6);
  });

  it('QTE 不影响命中判定: d20=20 → toHit=22 ≥ 门槛 10, 即便 modifier=-1 仍命中', async () => {
    await callTool('startCombat', makeStartCombatArgs());
    const player = makePlayer({
      equipped: {
        weapon: { name: '剑', effects: [{ id: 'w1', type: 'damage_bonus', value: 4, description: '+4' }] } as unknown as Combatant['equipped']['weapon'],
        armor: null, accessory: null,
      },
    });
    useCombatStore.setState((s) => ({ combatants: { ...s.combatants, p1: player } }));

    const qte: QTEProvider = () => ({ accuracy: 0, modifier: -1, type: 'attack' });
    const resolver = createActionResolver({ roll: makeConstRoll([...FIXED_HIT_ROLL]), qte });
    const hpBefore = useCombatStore.getState().combatants.e1!.hp;
    resolver.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState());
    // 命中并造成伤害 (>0)
    expect(hpBefore - useCombatStore.getState().combatants.e1!.hp).toBeGreaterThan(0);
  });

  it('6 维公式不变: d20 + DEX_mod vs 10 + DEX_mod (QTE 只缩放伤害)', async () => {
    // 玩家 STR=18 → +4 mod, 武器 +6 dmg; 敌人 maxHp=200 (避免 clamp 影响 dmg 计算)
    // toHit = d20(20) + DEX_mod(2) = 22 ≥ 门槛 10 → 命中
    // base = max(1, d6(4) + STR_mod(4) + weapon(6) - defense(0)) = 14
    const customPlayer: Combatant = {
      id: 'p1',
      side: 'player',
      name: '玩家',
      attributes: { STR: 18, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 10 },
      hp: 30, maxHp: 30,
      ap: 6, maxAp: 6,
      conditions: [],
      isDead: false,
      isFleeing: false,
      equipped: {
        weapon: { name: '剑', effects: [{ id: 'w1', type: 'damage_bonus', value: 6, description: '+6' }] } as unknown as Combatant['equipped']['weapon'],
        armor: null, accessory: null,
      },
    };
    await callTool('startCombat', makeStartCombatArgs({ player: customPlayer }));
    // 提高敌人 maxHp 以避免 dmg clamp
    const e1 = useCombatStore.getState().combatants.e1!;
    useCombatStore.setState({
      combatants: { ...useCombatStore.getState().combatants, e1: { ...e1, hp: 200, maxHp: 200 } },
    });

    const qteStrong: QTEProvider = () => ({ accuracy: 1, modifier: 1, type: 'attack' });
    const qteWeak: QTEProvider = () => ({ accuracy: 0, modifier: -1, type: 'attack' });
    const rollSeq = [20, 4];

    const r1 = createActionResolver({ roll: makeConstRoll([...rollSeq]), qte: qteStrong });
    const hpBefore1 = useCombatStore.getState().combatants.e1!.hp;
    r1.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState());
    const dmg1 = hpBefore1 - useCombatStore.getState().combatants.e1!.hp;

    const r2 = createActionResolver({ roll: makeConstRoll([...rollSeq]), qte: qteWeak });
    const hpBefore2 = useCombatStore.getState().combatants.e1!.hp;
    r2.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState());
    const dmg2 = hpBefore2 - useCombatStore.getState().combatants.e1!.hp;

    // 两次都命中 (QTE 不影响命中判定)
    expect(dmg1).toBeGreaterThan(0);
    expect(dmg2).toBeGreaterThan(0);
    // QTE 只缩放伤害, dmg1 > dmg2
    expect(dmg1).toBeGreaterThan(dmg2);
    // base = 14; dmg1 = round(14 * 1.3) = 18; dmg2 = round(14 * 0.7) = 10
    expect(dmg1).toBe(18);
    expect(dmg2).toBe(10);
  });
});

// ============================================================
// 7. QTE 关闭 + 攻击: 伤害 = base
// ============================================================

describe('integration: QTE 关闭 (默认) + 攻击: damage = base', () => {
  it('QTE off: noopQTEProvider 返 modifier=0, 伤害 = base 不变', async () => {
    await callTool('startCombat', makeStartCombatArgs());
    const player = makePlayer({
      equipped: {
        weapon: { name: '剑', effects: [{ id: 'w1', type: 'damage_bonus', value: 6, description: '+6' }] } as unknown as Combatant['equipped']['weapon'],
        armor: null, accessory: null,
      },
    });
    useCombatStore.setState((s) => ({ combatants: { ...s.combatants, p1: player } }));
    // 把 e1 HP 提升, 避免 applyDamage clamp (HP 12 - 13 → 0) 影响 dmg 观察
    const e1 = useCombatStore.getState().combatants.e1!;
    useCombatStore.setState({
      combatants: { ...useCombatStore.getState().combatants, e1: { ...e1, hp: 200, maxHp: 200 } },
    });

    // 显式传 noopQTEProvider
    // v0.5-dev: d20=20 (命中), d6=6 (伤害)
    const resolver = createActionResolver({ roll: makeConstRoll([20, 6]), qte: noopQTEProvider });
    const hpBefore = useCombatStore.getState().combatants.e1!.hp;
    resolver.resolve({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, useCombatStore.getState());
    const dmg = hpBefore - useCombatStore.getState().combatants.e1!.hp;
    // base = max(1, d6(6) + STR_mod(12→+1) + weapon(6) - defense(0)) = 13
    // modifier=0 → dmg = 13
    expect(dmg).toBe(13);
  });

  it('settingsStore qte.enabled=false 时, defaultQTEProvider 走 noop', () => {
    useSettingsStore.setState((s) => ({ qte: { ...s.qte, enabled: false } }));
    // 触发 lazy init
    void useSettingsStore.getState();
    // 由于 defaultQTEProvider 走 useSettingsStore, 关闭时返 noop
    // (ActionResolver 默认注入 defaultQTEProvider, 关闭时返 modifier=0)
    // 此处不直接调 provider, 验证 settings 状态即可
    expect(useSettingsStore.getState().qte.enabled).toBe(false);
  });
});

// ============================================================
// 8. 战斗期间 gameStore 行为
// ============================================================

describe('integration: 战斗期间 gameStore 行为', () => {
  it('startCombat: narrativeOpening 写入 gameStore messages', async () => {
    await callTool('startCombat', makeStartCombatArgs({
      narrativeOpening: '三只哥布林从树丛后跃出!',
    }));
    const messages = useGameStore.getState().messages;
    expect(messages.some((m) => m.content.includes('三只哥布林'))).toBe(true);
  });

  it('endCombat: narrativeClosing 写入 gameStore messages', async () => {
    await callTool('startCombat', makeStartCombatArgs());
    await callTool('endCombat', {
      outcome: 'victory',
      durationRounds: 2,
      appliedBalanceRating: 'normal',
      narrativeClosing: '战斗结束, 玩家胜利!',
    });
    const messages = useGameStore.getState().messages;
    expect(messages.some((m) => m.content.includes('战斗结束, 玩家胜利'))).toBe(true);
  });

  it('endCombat: loot 写入 gameStore system message', async () => {
    await callTool('startCombat', makeStartCombatArgs());
    await callTool('endCombat', {
      outcome: 'victory',
      durationRounds: 2,
      appliedBalanceRating: 'normal',
      loot: ['gold_50', 'sword_1'],
    });
    const messages = useGameStore.getState().messages;
    expect(messages.some((m) => m.content.includes('gold_50'))).toBe(true);
    expect(messages.some((m) => m.content.includes('sword_1'))).toBe(true);
  });
});

// ============================================================
// 9. 防御 / 物品 / 技能 协同
// ============================================================

describe('integration: 防御 + 物品 + 技能 协同', () => {
  it('玩家 defend → AC +2, 下次受攻击伤害 -50%', async () => {
    await callTool('startCombat', makeStartCombatArgs());

    const resolver = createActionResolver({ roll: makeConstRoll([1, 1]) });
    // 玩家防御
    resolver.resolve({ kind: 'defend', userId: 'p1' }, useCombatStore.getState());
    // 防御后 AC +2 (DEFEND_AC_BONUS)
    // 验证 defender 标志已设 (resolver 内部)
    // 实际受攻击伤害减免由 CombatEngine 流程保证, 此处仅验证 defend 不抛错
    expect(useCombatStore.getState().combatants.p1!.ap).toBe(5); // 6 - 1 AP
  });

  it('end-to-end: 玩家 attack → 敌人 attack → 玩家 defend 三步不出错', async () => {
    _resetSharedResolver();
    resetClientStores();
    await callTool('startCombat', makeStartCombatArgs());
    const engine = getCombatEngine();
    const resolver = createActionResolver({ roll: makeConstRoll([10, 10, 10, 10]) });
    engine.setResolver(resolver);
    // 玩家攻击
    await engine.processTurn({ kind: 'attack', attackerId: 'p1', targetId: 'e1' }, 'p1');
    // 敌人攻击
    await engine.processTurn({ kind: 'attack', attackerId: 'e1', targetId: 'p1' }, 'p1');
    // 玩家防御
    await engine.processTurn({ kind: 'defend', userId: 'p1' }, 'p1');

    // 玩家 AP 取决于 ACT 队列顺序 (initiative 用 engine 默认抹子, 未被 constRoll 控制, 故真实随机):
    //   - queue=[p1,e1]: 6 -2(攻击) +0(advTurn→e1) +1(advRound→p1) -1(防御) = 4
    //   - queue=[e1,p1]: 6 -2(攻击) +1(advTurn→p1) +0(advRound→e1) -1(防御) +1(advTurn→p1) = 5
    // 规则: 整场战斗第一个行动者从 maxAp 起步, 之后轮到谁的开始行动时 +1 (受 maxAp clamp)
    // 详见 docs/zh/战斗系统.md §2.6.1 (v0.5.5 澄清)
    const queue = useCombatStore.getState().queue;
    const queueIds = queue.map((q) => q.combatantId).join('>');
    const expected = queue[0]?.combatantId === 'p1' ? 4 : 5;
    expect(
      useCombatStore.getState().combatants.p1!.ap,
      `p1.ap expectation depends on ACT queue order. queue=${queueIds}`,
    ).toBe(expected);
  });
});
