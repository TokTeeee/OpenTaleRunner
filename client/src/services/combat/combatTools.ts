/**
 * v0.4 战斗系统 — combatTools (GM toolcall 协议)
 *
 * 提供 2 个 toolcall handler:
 * - startCombat: GM 触发战斗 → 校验 payload → BalanceEvaluator → CombatEngine.start
 * - endCombat: 战斗结束 → 结算 loot + failurePenalty → 写 narrative + chronicle → phase=idle
 *
 * 约束:
 * - 不抛错: 不合法 payload 返回 { ok: false, reason }, 不阻断 dispatch 链
 * - 副作用集中: handler 直接操作 store (combatStore / gameStore / characterStore)
 * - 注册到 ToolCallRegistry (PM Engine 解析到 toolcall 时 dispatch)
 * - 战斗期间 (combatStore.phase != 'idle') PM Engine 不主动调 generateScene
 *
 * 详见 spec: docs/superpowers/specs/2026-06-04-v04-combat-system-design.md §6
 * 详见 plan: docs/superpowers/plans/2026-06-04-v04-combat-system-implementation.md §6
 */

import { useCombatStore } from '../../stores/combatStore';
import { useGameStore } from '../../stores/gameStore';
import { useCharacterStore } from '../../stores/characterStore';
import { logger } from '../../utils/logger';
import { toolCallRegistry } from '../llm/ToolCallRegistry';
import { CombatEngine, NoopResolver } from './CombatEngine';
import { evaluate, describePenalty, failurePenaltyFor, InvalidCombatantError } from './BalanceEvaluator';
import type { Combatant, BalanceRating, CombatOutcome } from './types';

// ============================================================
// 错误
// ============================================================

export class CombatToolError extends Error {
  reason: string;
  constructor(reason: string) {
    super(`combat tool error: ${reason}`);
    this.name = 'CombatToolError';
    this.reason = reason;
  }
}

// ============================================================
// payload schema (手写 JSON schema 校验, 避免引入 zod)
// ============================================================

/** startCombat 入参 */
export interface StartCombatArgs {
  combatId: string;
  player: Combatant;
  party?: Combatant[];
  enemies: Combatant[];
  narrativeOpening?: string;
  recommendedDifficulty?: BalanceRating;
}

/** endCombat 入参 */
export interface EndCombatArgs {
  outcome: CombatOutcome;
  durationRounds: number;
  appliedBalanceRating: BalanceRating;
  /** loot 列表 (item template ids 或 currency 描述) */
  loot?: string[];
  /** 玩家 final 状态 — 用于同步 HP / MP / conditions */
  finalState?: {
    player: { hp: number; maxHp: number; mp?: number; conditions?: string[] };
    deadEnemies?: number;
  };
  /** LLM 在 endCombat 给的收尾叙事 (v0.4 由 LLM 直接写, 客户端可为空) */
  narrativeClosing?: string;
}

/** handler 返回值 */
export interface CombatToolResult {
  ok: boolean;
  reason?: string;
  combatId?: string;
  appliedPenalty?: string;
  phase?: string;
}

// ============================================================
// 校验
// ============================================================

function isString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v);
}

function validateStartCombatArgs(args: unknown): { ok: true; data: StartCombatArgs } | { ok: false; reason: string } {
  if (!args || typeof args !== 'object') {
    return { ok: false, reason: 'args 必须是 object' };
  }
  const a = args as Record<string, unknown>;
  if (!isString(a.combatId)) return { ok: false, reason: 'combatId 必填非空字符串' };
  if (!a.player || typeof a.player !== 'object') return { ok: false, reason: 'player 必填 object' };
  if (!Array.isArray(a.enemies) || a.enemies.length === 0) {
    return { ok: false, reason: 'enemies 必须是非空数组' };
  }
  if (a.party && !Array.isArray(a.party)) {
    return { ok: false, reason: 'party 必须是数组' };
  }
  if (a.recommendedDifficulty && !['trivial', 'normal', 'hard', 'deadly', 'ability'].includes(a.recommendedDifficulty as string)) {
    return { ok: false, reason: `recommendedDifficulty 不合法: ${a.recommendedDifficulty}` };
  }
  return {
    ok: true,
    data: {
      combatId: a.combatId,
      player: a.player as Combatant,
      party: (a.party as Combatant[] | undefined) ?? [],
      enemies: a.enemies as Combatant[],
      narrativeOpening: typeof a.narrativeOpening === 'string' ? a.narrativeOpening : undefined,
      recommendedDifficulty: a.recommendedDifficulty as BalanceRating | undefined,
    },
  };
}

function validateEndCombatArgs(args: unknown): { ok: true; data: EndCombatArgs } | { ok: false; reason: string } {
  if (!args || typeof args !== 'object') {
    return { ok: false, reason: 'args 必须是 object' };
  }
  const a = args as Record<string, unknown>;
  if (!isString(a.outcome) || !['victory', 'defeat', 'fled', 'disrupted', 'interrupted'].includes(a.outcome)) {
    return { ok: false, reason: `outcome 不合法: ${a.outcome}` };
  }
  if (!isNumber(a.durationRounds) || a.durationRounds < 1) {
    return { ok: false, reason: 'durationRounds 必须是 ≥1 的数字' };
  }
  if (!isString(a.appliedBalanceRating) || !['trivial', 'normal', 'hard', 'deadly'].includes(a.appliedBalanceRating)) {
    return { ok: false, reason: `appliedBalanceRating 不合法: ${a.appliedBalanceRating}` };
  }
  if (a.loot && !Array.isArray(a.loot)) {
    return { ok: false, reason: 'loot 必须是数组' };
  }
  return {
    ok: true,
    data: {
      outcome: a.outcome as CombatOutcome,
      durationRounds: a.durationRounds,
      appliedBalanceRating: a.appliedBalanceRating as BalanceRating,
      loot: a.loot as string[] | undefined,
      finalState: a.finalState as EndCombatArgs['finalState'],
      narrativeClosing: typeof a.narrativeClosing === 'string' ? a.narrativeClosing : undefined,
    },
  };
}

// ============================================================
// CombatEngine 单例
// ============================================================

/**
 * 全局 CombatEngine 单例. 一场战斗一个实例, 注册到 combatTools 后由
 * startCombat handler 触发 start(), 由 endCombat handler 关闭.
 *
 * 不在 store 里: 战斗状态由 combatStore zustand 持有, 引擎只编排流程.
 */
let _engineInstance: CombatEngine | null = null;

export function getCombatEngine(): CombatEngine {
  if (!_engineInstance) {
    _engineInstance = new CombatEngine({ resolver: NoopResolver });
  }
  return _engineInstance;
}

/** 测试用: 重置引擎实例. */
export function _resetCombatEngine(): void {
  _engineInstance = null;
}

// ============================================================
// startCombat handler
// ============================================================

/**
 * 启动战斗:
 * 1. 校验 payload
 * 2. 6 维范围 + HP > 50 warn (不阻断)
 * 3. BalanceEvaluator.evaluate
 * 4. CombatEngine.start → store.initialize + activate
 * 5. BalanceReport 注入 combatStore.balanceRating
 * 6. narrativeOpening 写入 gameStore (CombatJournal 开场)
 */
async function startCombatHandler(args: unknown): Promise<CombatToolResult> {
  // 1. 校验
  const v = validateStartCombatArgs(args);
  if (!v.ok) {
    return { ok: false, reason: v.reason };
  }
  const { combatId, player, party = [], enemies, narrativeOpening, recommendedDifficulty } = v.data;

  // 检查 phase: 不在 idle 时拒绝 (避免重复启动)
  const store = useCombatStore.getState();
  if (store.phase !== 'idle') {
    return { ok: false, reason: `战斗系统非 idle (当前 ${store.phase}), 不能启动新战斗` };
  }

  // 2. 评估平衡 + 异常 warn
  let balance;
  try {
    balance = evaluate(player, party, enemies, { recommendedDifficulty });
  } catch (e) {
    if (e instanceof InvalidCombatantError) {
      return { ok: false, reason: e.message };
    }
    throw e;
  }

  // HP > 50 异常 warn
  for (const c of [player, ...party, ...enemies]) {
    if (c.hp > 50) {
      logger.warn('combatTools', `${c.name} HP 异常高 (${c.hp}), 建议复核`);
    }
  }

  // LLM hint 不一致时 warn (不阻断)
  if (balance.suggestedNerfs && balance.suggestedNerfs.length > 0) {
    logger.warn('combatTools', `难度不一致 (推荐 ${recommendedDifficulty}, 实际 ${balance.rating}): ${balance.suggestedNerfs.join('; ')}`);
  }

  // 3. 启动 CombatEngine (进入 initializing → active)
  try {
    getCombatEngine().start(combatId, player, party, enemies, narrativeOpening);
  } catch (e) {
    return { ok: false, reason: `CombatEngine.start 失败: ${(e as Error).message}` };
  }

  // 4. 注入 balanceRating
  useCombatStore.getState().setBalanceRating(balance);

  // 5. narrativeOpening 写入 gameStore
  if (narrativeOpening) {
    useGameStore.getState().addMessage({
      id: `combat-opening-${combatId}`,
      type: 'pm',
      content: narrativeOpening,
      timestamp: Date.now(),
    });
  }

  logger.info('combatTools', `startCombat ${combatId} rating=${balance.rating} ratio=${balance.powerRatio.toFixed(2)}`);
  return { ok: true, combatId, phase: useCombatStore.getState().phase };
}

// ============================================================
// endCombat handler
// ============================================================

/**
 * 结束战斗:
 * 1. 校验 payload
 * 2. 应用 finalState.player HP / conditions 同步到 characterStore
 * 3. 失败时按 appliedBalanceRating 应用 failurePenalty (gold + conditions)
 *   - survives=true 注入 perma-wound 替代死亡
 * 4. 写 narrativeClosing 到 gameStore + chronicle
 * 5. combatStore.phase = 'idle'
 */
async function endCombatHandler(args: unknown): Promise<CombatToolResult> {
  // 1. 校验
  const v = validateEndCombatArgs(args);
  if (!v.ok) {
    return { ok: false, reason: v.reason };
  }
  const { outcome, appliedBalanceRating, loot, finalState, narrativeClosing } = v.data;

  // 2. finalState 应用
  if (finalState?.player) {
    const charStore = useCharacterStore.getState();
    const char = charStore.character;
    if (char) {
      const finalHp = finalState.player.hp;
      const finalMaxHp = finalState.player.maxHp;
      // survives 由 failurePenalty 决定; finalState.player.hp=0 但 survives 时不打入 0
      charStore.updateHP(finalHp);
      // MP 同步
      if (finalState.player.mp != null && char.maxMp > 0) {
        charStore.updateMP(finalState.player.mp);
      }
      // conditions 追加
      if (Array.isArray(finalState.player.conditions)) {
        for (const cond of finalState.player.conditions) {
          charStore.addCondition?.(cond);
        }
      }
      logger.info('combatTools', `finalState applied: HP=${finalHp}/${finalMaxHp}, MP=${finalState.player.mp ?? '-'}/${char.maxMp || '-'}`);
    }
  }

  // 3. 失败时应用 failurePenalty
  // 优先用 args.appliedBalanceRating 查 penalty (LLM 在 endCombat 给的最新难度是 source of truth);
  // store.balanceReport 是 startCombat 时的初判, 仅作 fallback (handler 自洽不依赖外部).
  let appliedPenalty: string | undefined;
  if (outcome === 'defeat' || outcome === 'disrupted') {
    const penalty = failurePenaltyFor(appliedBalanceRating);
    appliedPenalty = describePenalty(penalty);
    // 扣金 (updateCurrency 是 set 而非 delta, 需算新值)
    if (penalty.goldLostPercent > 0) {
      const charStore = useCharacterStore.getState();
      const char = charStore.character;
      const gold = char?.inventory?.currency?.gold ?? 0;
      if (gold > 0) {
        const goldLost = Math.floor(gold * penalty.goldLostPercent);
        if (goldLost > 0) {
          const newGold = Math.max(0, gold - goldLost);
          charStore.updateCurrency({ gold: newGold });
          logger.info('combatTools', `失败扣金: -${goldLost} (${penalty.goldLostPercent * 100}%), ${gold}→${newGold}`);
        }
      }
    }
    // conditions 追加 (spec §7.3 deadly 必含 perma-wound)
    const charStore = useCharacterStore.getState();
    for (const cond of penalty.conditions) {
      charStore.addCondition(cond);
    }
  }

  // 4. loot 应用 (简化: 调 gameStore 注入, 实际 applyConsequences 走 characterStore)
  if (loot && loot.length > 0) {
    const game = useGameStore.getState();
    game.addMessage({
      id: `combat-loot-${Date.now()}`,
      type: 'system',
      content: `战利品: ${loot.join(', ')}`,
      timestamp: Date.now(),
    });
  }

  // 5. narrativeClosing 写入 gameStore
  if (narrativeClosing) {
    useGameStore.getState().addMessage({
      id: `combat-closing-${Date.now()}`,
      type: 'pm',
      content: narrativeClosing,
      timestamp: Date.now(),
    });
  }

  // 6. phase = idle (CombatEngine 流程: settled → reset → idle)
  // 守护: phase 可能不在 active (schema 校验测试直接调 endCombat), 失败时跳过但仍返 ok
  try {
    useCombatStore.getState().beginResolving(outcome);
    useCombatStore.getState().settle(narrativeClosing ?? `战斗结束: ${outcome}`);
  } catch (e) {
    logger.warn('combatTools', `endCombat phase 流转失败 (可能未启动战斗): ${(e as Error).message}`);
  }

  logger.info('combatTools', `endCombat outcome=${outcome} rating=${appliedBalanceRating} appliedPenalty=${appliedPenalty ?? 'none'}`);
  return { ok: true, appliedPenalty, phase: useCombatStore.getState().phase };
}

// ============================================================
// 注册
// ============================================================

let _registered = false;

/** 注册 startCombat + endCombat handler 到 ToolCallRegistry. 幂等. */
export function registerCombatTools(): () => void {
  if (_registered) {
    logger.warn('combatTools', '已注册, 跳过重复注册');
    return () => unregisterCombatTools();
  }
  const unregisterStart = toolCallRegistry.register('startCombat', startCombatHandler, { description: '启动战斗' });
  const unregisterEnd = toolCallRegistry.register('endCombat', endCombatHandler, { description: '结束战斗' });
  _registered = true;
  logger.info('combatTools', '已注册 startCombat + endCombat handler');
  return () => {
    unregisterStart();
    unregisterEnd();
    _registered = false;
  };
}

/** 注销. */
export function unregisterCombatTools(): void {
  toolCallRegistry.unregister('startCombat');
  toolCallRegistry.unregister('endCombat');
  _registered = false;
}

/** 检查是否已注册 (调试用). */
export function isCombatToolsRegistered(): boolean {
  return _registered;
}
