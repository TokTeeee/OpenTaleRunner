/**
 * v0.4 战斗系统 — 5 阶段 FSM 引擎
 *
 * 核心: CombatEngine 编排整个战斗生命周期. 它:
 * - 维护 ACT 队列 (initiative = d20 + effectiveDEX)
 * - 推进回合 / turn
 * - 把 CombatAction 委托给 ActionResolver (Phase 2 接入)
 * - 检测 5 种结束条件, 触发 resolving
 * - 不直接调 LLM; CombatEngine 完全本地
 *
 * 设计原则:
 * - 单例: 一场战斗一个 CombatEngine 实例, 持有 combatId + 状态
 * - 注入: RollFn 注入, 便于测试
 * - ActionResolver 注入 (Phase 2): 引擎不实现伤害公式, 只编排流程
 * - 不持久化: 战斗状态由 zustand combatStore 持有, 引擎不存
 *
 * 详见: docs/superpowers/specs/2026-06-04-v04-combat-system-design.md §4-5
 */

import { useCombatStore } from '../../stores/combatStore';
import { logger } from '../../utils/logger';
import { defaultRoll, rollInitiative, type RollFn } from './dice';
import { ActionResolver as ActionResolverClass, createActionResolver, type QTEProvider } from './ActionResolver';
import type {
  Combatant,
  InitiativeEntry,
  CombatAction,
  CombatOutcome,
  TurnResult,
  CombatLogEntry,
} from './types';

// ============================================================
// ActionResolver 接口 — Phase 2 实现, T1.2 用 NoopResolver 占位
// ============================================================

/** CombatEngine 期望 ActionResolver 满足的契约. Phase 2 用真实 ActionResolver class. */
export interface IActionResolver {
  /**
   * 解析一个 CombatAction, 返回 TurnResult.
   * 实现负责: 命中判定、闪避、伤害、buff/debuff 应用、AP/MP 扣费.
   * 引擎负责: 把它写进 store 状态 + 推进回合.
   */
  resolve(action: CombatAction, state: Readonly<ReturnType<typeof useCombatStore.getState>>): TurnResult;
  /** turnEnd 时清防御标记 (Phase 2 ActionResolver 提供) */
  clearDefendingFlags?(): void;
  setRoll?(roll: RollFn): void;
  setQTE?(qte: QTEProvider): void;
}

/** Phase 1 占位: 攻击直接造成固定 1 伤害, 防御/物品/逃跑忽略 */
export const NoopResolver: IActionResolver = {
  resolve(action) {
    const log: CombatLogEntry[] = [];
    if (action.kind === 'attack') {
      log.push({ kind: 'action', round: 0, turn: 0, message: `${action.attackerId} 攻击 ${action.targetId}`, timestamp: Date.now() });
    }
    return { log, buffTicks: [], ended: false };
  },
};

// ============================================================
// 5 种结束条件 (spec §4.3)
// ============================================================

export type EndCondition =
  | 'continue'
  | 'all_enemies_dead'
  | 'player_dead'
  | 'fled'
  | 'disrupted'
  | 'gm_interrupted';

export interface EndCheckResult {
  condition: EndCondition;
  outcome?: CombatOutcome;
}

export function checkEndCondition(
  combatants: Record<string, Combatant>,
  playerId: string,
): EndCheckResult {
  const allCombatants = Object.values(combatants);
  const enemies = allCombatants.filter((c) => c.side === 'enemy');
  const aliveEnemies = enemies.filter((c) => !c.isDead && c.hp > 0);
  const player = combatants[playerId];
  const playerDead = !player || player.isDead || player.hp <= 0;
  const playerFleeing = player?.isFleeing ?? false;

  if (aliveEnemies.length === 0) {
    return { condition: 'all_enemies_dead', outcome: 'victory' };
  }
  if (playerDead) {
    return { condition: 'player_dead', outcome: 'defeat' };
  }
  if (playerFleeing) {
    return { condition: 'fled', outcome: 'fled' };
  }
  return { condition: 'continue' };
}

// ============================================================
// CombatEngine 主类
// ============================================================

export interface CombatEngineOptions {
  roll?: RollFn;
  resolver?: ActionResolverClass | IActionResolver;
  /** QTE provider 转发给 ActionResolver (默认 noop) */
  qte?: QTEProvider;
  /** 大成功/大失败时的日志回调 — Phase 2 GM 介入钩子位 */
  onCritical?: (event: 'crit_success' | 'crit_fail', data: unknown) => void;
}

export class CombatEngine {
  private roll: RollFn;
  private resolver: ActionResolverClass | IActionResolver;
  private _onCritical?: (event: 'crit_success' | 'crit_fail', data: unknown) => void;

  constructor(opts: CombatEngineOptions = {}) {
    this.roll = opts.roll ?? defaultRoll;
    // Phase 2: 默认使用真实 ActionResolver (替代 NoopResolver)
    this.resolver = opts.resolver ?? createActionResolver({ roll: this.roll, qte: opts.qte });
    this._onCritical = opts.onCritical;
  }

  // ---- 入口: start ----

  /**
   * 启动战斗: idle → initializing → active.
   * 调用 store.initialize 后立即投 ACT 队列 + activate.
   */
  start(
    combatId: string,
    player: Combatant,
    party: Combatant[],
    enemies: Combatant[],
    opening?: string,
  ): void {
    const store = useCombatStore.getState();
    const allEnemies: Combatant[] = [...party.filter((c) => c.side === 'enemy'), ...enemies];
    store.initialize(combatId, player, allEnemies, opening);
    // 投 ACT 队列
    const queue = this.rollInitiative([player, ...party, ...enemies]);
    store.activate(queue, 1);
    logger.info('CombatEngine', `started combat ${combatId} with ${queue.length} combatants`);
  }

  // ---- ACT 队列 ----

  /**
   * 投 ACT 队列. effectiveDEX = DEX + sum(BuffInstance.modifiers.DEX) + equipmentDEX.
   * (equipmentDEX 由 Phase 2 applyEquipmentEffects 计算, 本期只算 buff 修正)
   * spec §5.4 / §7.2.1
   */
  rollInitiative(combatants: Combatant[]): InitiativeEntry[] {
    const entries: InitiativeEntry[] = combatants.map((c) => {
      const effectiveDex = this.effectiveDEX(c);
      const { total } = rollInitiative(effectiveDex, this.roll);
      return { combatantId: c.id, initiative: total, rolledAt: 'start' };
    });
    // 降序; tie 时按 id 字典序
    entries.sort((a, b) => b.initiative - a.initiative || a.combatantId.localeCompare(b.combatantId));
    return entries;
  }

  /**
   * effectiveDEX(c) = c.attributes.DEX + sum(BuffInstance.modifiers.DEX) + equipmentDEX.
   * equipmentDEX 暂未在 v0.3 暴露, 本期按 0 处理 (Phase 2 接入 applyEquipmentEffects).
   */
  effectiveDEX(c: Combatant): number {
    const base = c.attributes.DEX;
    const buffMod = c.conditions.reduce((sum, b) => sum + (b.modifiers.DEX ?? 0), 0);
    // 装备 DEX 修正 (Phase 2 接入 applyEquipmentEffects)
    const equipmentDEX = 0;
    return base + buffMod + equipmentDEX;
  }

  // ---- 回合循环 ----

  /**
   * 执行一个 CombatAction. 内部: 调 resolver.resolve, 把结果写 store, 推进 turn.
   * 若结束条件触发, 自动 beginResolving.
   */
  async processTurn(action: CombatAction, playerId: string): Promise<TurnResult> {
    const store = useCombatStore.getState();
    if (store.phase !== 'active') {
      throw new Error(`processTurn 要求 active, 当前 ${store.phase}`);
    }
    const result = this.resolver.resolve(action, store);
    // 写 log
    for (const entry of result.log) {
      store.appendLog(entry);
    }
    // buff 倒计时 + onTick
    const tickResults = useCombatStore.getState().tickBuffs();
    for (const t of tickResults) {
      if (t.log) {
        useCombatStore.getState().appendLog({
          kind: 'turnEnd',
          round: useCombatStore.getState().round,
          turn: useCombatStore.getState().turn,
          message: t.log,
        });
      }
    }
    // 推进 turn
    const after = useCombatStore.getState();
    if (after.turn < after.queue.length) {
      after.advanceTurn();
    } else {
      // 本回合结束, 进入新回合; 同时清防御标记
      after.advanceRound();
      if ('clearDefendingFlags' in this.resolver && typeof (this.resolver as { clearDefendingFlags?: () => void }).clearDefendingFlags === 'function') {
        (this.resolver as { clearDefendingFlags: () => void }).clearDefendingFlags();
      }
    }
    // 检查结束条件
    const end = checkEndCondition(after.combatants, playerId);
    if (end.condition !== 'continue' && end.outcome) {
      after.beginResolving(end.outcome);
      useCombatStore.getState().appendLog({
        kind: 'end',
        round: after.round,
        turn: after.turn,
        message: `战斗结束: ${end.outcome}`,
      });
    }
    return { ...result, ended: end.condition !== 'continue', outcome: end.outcome };
  }

  // ---- 结束流程 ----

  /**
   * resolving → settled. 由 endCombat toolcall handler 调.
   * 写 narrativeClosing.
   */
  settle(narrativeClosing?: string): void {
    useCombatStore.getState().settle(narrativeClosing);
  }

  /** settled → idle. UI 关闭, 准备下一场 */
  reset(): void {
    useCombatStore.getState().reset();
  }

  // ---- 调试 ----

  /** 替换 resolver (测试用) */
  setResolver(resolver: ActionResolverClass | IActionResolver): void {
    this.resolver = resolver;
  }

  /** 替换 roll (测试用). 同步给 resolver 以保持 ACT 队列与判定抹子一致. */
  setRoll(roll: RollFn): void {
    this.roll = roll;
    if ('setRoll' in this.resolver && typeof this.resolver.setRoll === 'function') {
      this.resolver.setRoll(roll);
    }
  }

  /** 替换 QTE provider */
  setQTE(qte: QTEProvider): void {
    if ('setQTE' in this.resolver && typeof this.resolver.setQTE === 'function') {
      this.resolver.setQTE(qte);
    }
  }
}

/** 引擎工厂: 默认使用 NoopResolver + defaultRoll */
export function createCombatEngine(opts: CombatEngineOptions = {}): CombatEngine {
  return new CombatEngine(opts);
}
