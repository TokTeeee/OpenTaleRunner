/**
 * v0.4 战斗系统 — zustand 状态中心
 *
 * 职责:
 * - 持有单一 CombatState (FSM 5 阶段) 作为唯一真相
 * - 提供 mutator, 每个 mutator 内置 FSM 守卫, 阻止非法状态跃迁
 * - 与 gameStore 互斥: combatStore.active=true 时, 上层 hook 应让 narrative 区域进入战斗模式
 *
 * FSM 跃迁规则 (spec §4.3):
 *   idle → initializing → active → resolving → settled → idle
 *   active → active (回合循环, 内部 turn 推进)
 *   active → resolving (任意结束条件触发)
 *
 * 不允许的跃迁:
 *   idle → active (必须经过 initializing)
 *   active → idle (必须经过 resolving → settled)
 *   settled → initializing (一次战斗结束, 必须 idle 重新初始化)
 *   任何 → back-to-previous
 *
 * 详见: docs/superpowers/specs/2026-06-04-v04-combat-system-design.md §4
 */

import { create } from 'zustand';
import type {
  CombatState,
  Combatant,
  CombatPhase,
  CombatAction,
  CombatLogEntry,
  BuffInstance,
  CombatOutcome,
  BalanceRating,
  BalanceReport,
  TurnResult,
} from '../services/combat/types';

export const INITIAL_COMBAT_STATE: CombatState = {
  id: '',
  phase: 'idle',
  round: 0,
  turn: 0,
  queue: [],
  combatants: {},
  log: [],
  startedAt: 0,
};

/** 允许的状态跃迁表. 任何不在表中的跃迁都会被守卫拒绝. */
const ALLOWED_TRANSITIONS: Record<CombatPhase, CombatPhase[]> = {
  idle: ['initializing'],
  initializing: ['active', 'idle'], // 校验失败可回 idle
  active: ['active', 'resolving'],
  resolving: ['settled'],
  settled: ['idle'],
};

/** mutator 抛错类型, 调用方应捕获并提示玩家. */
export class CombatStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CombatStoreError';
  }
}

interface CombatStoreState extends CombatState {
  // ---- 派生标志 ----
  /** combat 期间 PM Engine narrative 区域应让位给 CombatView */
  active: boolean;
  /** 战斗中是否轮到玩家操作 (ACT 队列当前是玩家) */
  isPlayerTurn: boolean;

  // ---- FSM 跃迁 ----
  setPhase: (next: CombatPhase) => void;
  canTransition: (next: CombatPhase) => boolean;

  // ---- 初始化 ----
  /** startCombat handler 调用: 进入 initializing 阶段, 设 combatId + 敌队 + 玩家 */
  initialize: (combatId: string, player: Combatant, enemies: Combatant[], opening?: string) => void;
  /** initializing → active: ACT 队列 + 起始 round/turn 1, 写开场日志 */
  activate: (queue: CombatState['queue'], round?: number) => void;
  /** 注入 BalanceReport + rating (startCombat handler 调用) */
  setBalanceRating: (report: BalanceReport) => void;

  // ---- 战斗循环 ----
  /** round 推进: round += 1, queue 重置 (CombatEngine 负责投) */
  advanceRound: () => void;
  /** turn 推进: turn += 1; 若 turn > queue.length, 不做 (由 advanceRound 接管) */
  advanceTurn: () => void;
  /** 当前行动者 ID (ACT 队列第 turn-1 个) */
  getCurrentActorId: () => string | null;
  /** 玩家在 ACT 队列中是否即将行动 */
  isPlayerActor: (playerId: string) => boolean;

  // ---- 资源变更 ----
  /** 扣血/加血 (clamp 到 [0, maxHp]) */
  applyDamage: (combatantId: string, amount: number) => void;
  /** 加血/治疗 (clamp 到 [0, maxHp]) */
  applyHeal: (combatantId: string, amount: number) => void;
  /** 扣/加 AP (clamp 到 [0, maxAp]) */
  applyAP: (combatantId: string, amount: number) => void;
  /** 扣/加 MP (clamp 到 [0, maxMp], 无 MP 字段则忽略) */
  applyMP: (combatantId: string, amount: number) => void;
  /** 推 buff 到 combatant, 处理 stackRule */
  addBuff: (combatantId: string, buff: BuffInstance) => void;
  /** 移除指定 ref 的 buff */
  removeBuff: (combatantId: string, ref: string) => void;
  /** turnEnd 调用: 所有 buff 倒计时 -1, 0 的移除, DOT/HOT 触发 onTick */
  tickBuffs: () => Array<{ combatantId: string; ref: string; hpDelta: number; log: string }>;
  /** 标记 combatant 死亡 (HP=0 时) */
  markDead: (combatantId: string) => void;

  // ---- 日志 ----
  appendLog: (entry: Omit<CombatLogEntry, 'timestamp'>) => void;

  // ---- 结束流程 ----
  /** 进入 resolving: 算 outcome + 写日志 */
  beginResolving: (outcome: CombatOutcome) => void;
  /** endCombat handler 调用: resolving → settled, 写 narrativeClosing */
  settle: (narrativeClosing?: string) => void;
  /** settled → idle, 清空 (UI 关闭) */
  reset: () => void;

  // ---- 调试 ----
  /** 用一个完全自定义的 CombatState 替换 (测试用) */
  _replaceState: (state: Partial<CombatState>) => void;
}

/**
 * 检查跃迁是否合法. 仅当 next 在 ALLOWED_TRANSITIONS[from] 中才返回 true.
 * 同阶段赋值 (e.g. active → active) 也允许 (e.g. 内部回合循环).
 */
function canTransitionFrom(from: CombatPhase, next: CombatPhase): boolean {
  if (from === next) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(next) ?? false;
}

export const useCombatStore = create<CombatStoreState>()((set, get) => ({
  ...INITIAL_COMBAT_STATE,
  active: false,
  isPlayerTurn: false,

  canTransition: (next) => {
    const cur = get().phase;
    return canTransitionFrom(cur, next);
  },

  setPhase: (next) => {
    const cur = get().phase;
    if (!canTransitionFrom(cur, next)) {
      throw new CombatStoreError(`非法跃迁: ${cur} → ${next}`);
    }
    set({ phase: next });
  },

  initialize: (combatId, player, enemies, opening) => {
    // idle → initializing 守卫
    if (get().phase !== 'idle') {
      throw new CombatStoreError(`initialize 要求 idle, 当前 ${get().phase}`);
    }
    const combatants: Record<string, Combatant> = { [player.id]: player };
    for (const e of enemies) combatants[e.id] = e;
    set({
      id: combatId,
      phase: 'initializing',
      round: 0,
      turn: 0,
      queue: [],
      combatants,
      log: [{
        kind: 'start',
        round: 0,
        turn: 0,
        message: opening ?? '战斗开始',
        timestamp: Date.now(),
      }],
      startedAt: Date.now(),
      active: true,
      isPlayerTurn: false,
    });
  },

  activate: (queue, round = 1) => {
    // initializing → active 守卫
    if (get().phase !== 'initializing') {
      throw new CombatStoreError(`activate 要求 initializing, 当前 ${get().phase}`);
    }
    set({
      phase: 'active',
      round,
      turn: 1,
      queue,
    });
  },

  setBalanceRating: (report) => {
    set({ balanceRating: report.rating, balanceReport: report });
  },

  advanceRound: () => {
    set((s) => {
      const firstActorId = s.queue[0]?.combatantId ?? null;
      const newCombatants = { ...s.combatants };
      if (firstActorId && newCombatants[firstActorId]) {
        const actor = newCombatants[firstActorId];
        newCombatants[firstActorId] = { ...actor, ap: Math.min(actor.maxAp, actor.ap + 1) };
      }
      return { round: s.round + 1, turn: 1, combatants: newCombatants };
    });
  },

  advanceTurn: () => {
    set((s) => {
      const newTurn = s.turn + 1;
      const nextActorId = s.queue[newTurn - 1]?.combatantId ?? null;
      const newCombatants = { ...s.combatants };
      if (nextActorId && newCombatants[nextActorId]) {
        const actor = newCombatants[nextActorId];
        newCombatants[nextActorId] = { ...actor, ap: Math.min(actor.maxAp, actor.ap + 1) };
      }
      return { turn: newTurn, combatants: newCombatants };
    });
  },

  getCurrentActorId: () => {
    const { queue, turn } = get();
    if (turn < 1 || turn > queue.length) return null;
    return queue[turn - 1]?.combatantId ?? null;
  },

  isPlayerActor: (playerId) => {
    const actor = get().getCurrentActorId();
    return actor === playerId;
  },

  applyDamage: (combatantId, amount) => {
    set((s) => {
      const c = s.combatants[combatantId];
      if (!c) return {};
      const next = Math.max(0, Math.min(c.maxHp, c.hp - amount));
      return { combatants: { ...s.combatants, [combatantId]: { ...c, hp: next } } };
    });
  },

  applyHeal: (combatantId, amount) => {
    set((s) => {
      const c = s.combatants[combatantId];
      if (!c) return {};
      const next = Math.max(0, Math.min(c.maxHp, c.hp + amount));
      return { combatants: { ...s.combatants, [combatantId]: { ...c, hp: next } } };
    });
  },

  applyAP: (combatantId, amount) => {
    set((s) => {
      const c = s.combatants[combatantId];
      if (!c) return {};
      const next = Math.max(0, Math.min(c.maxAp, c.ap + amount));
      return { combatants: { ...s.combatants, [combatantId]: { ...c, ap: next } } };
    });
  },

  applyMP: (combatantId, amount) => {
    set((s) => {
      const c = s.combatants[combatantId];
      if (!c || c.mp === undefined) return {};
      const max = c.maxMp ?? 0;
      const next = Math.max(0, Math.min(max, c.mp + amount));
      return { combatants: { ...s.combatants, [combatantId]: { ...c, mp: next } } };
    });
  },

  addBuff: (combatantId, buff) => {
    set((s) => {
      const c = s.combatants[combatantId];
      if (!c) return {};
      const existingIdx = c.conditions.findIndex((b) => b.ref === buff.ref);
      const rule = buff.stackRule ?? 'replace';
      let newConditions: BuffInstance[];
      if (existingIdx < 0) {
        newConditions = [...c.conditions, buff];
      } else if (rule === 'stack') {
        newConditions = c.conditions.map((b, i) =>
          i === existingIdx ? { ...b, stacks: b.stacks + (buff.stacks || 1) } : b,
        );
      } else if (rule === 'refresh') {
        newConditions = c.conditions.map((b, i) =>
          i === existingIdx ? { ...b, remainingTurns: Math.max(b.remainingTurns, buff.remainingTurns), source: buff.source, modifiers: buff.modifiers } : b,
        );
      } else if (rule === 'ignore') {
        return {}; // 已有同 ref 时忽略
      } else {
        // 'replace' (default)
        newConditions = c.conditions.map((b, i) => (i === existingIdx ? buff : b));
      }
      return { combatants: { ...s.combatants, [combatantId]: { ...c, conditions: newConditions } } };
    });
  },

  removeBuff: (combatantId, ref) => {
    set((s) => {
      const c = s.combatants[combatantId];
      if (!c) return {};
      return { combatants: { ...s.combatants, [combatantId]: { ...c, conditions: c.conditions.filter((b) => b.ref !== ref) } } };
    });
  },

  tickBuffs: () => {
    const tickResults: Array<{ combatantId: string; ref: string; hpDelta: number; log: string }> = [];
    set((s) => {
      const newCombatants: Record<string, Combatant> = { ...s.combatants };
      for (const [cid, c] of Object.entries(s.combatants)) {
        if (c.isDead) continue;
        let hpDeltaTotal = 0;
        const tickLogs: string[] = [];
        const newConditions = c.conditions.flatMap((b) => {
          // onTick 先执行
          if (b.onTick && b.remainingTurns !== 0) {
            const result = b.onTick(c);
            if (result.hpDelta) {
              hpDeltaTotal += result.hpDelta;
              tickLogs.push(result.log ?? `${b.ref} 触发: ${result.hpDelta} HP`);
            }
          }
          // 倒计时
          if (b.remainingTurns === -1) return [b]; // 永久
          const next = b.remainingTurns - 1;
          if (next <= 0) {
            tickLogs.push(`${b.ref} 已结束`);
            return []; // 移除
          }
          return [{ ...b, remainingTurns: next }];
        });
        // 应用 hpDelta
        const finalHp = Math.max(0, Math.min(c.maxHp, c.hp + hpDeltaTotal));
        const wasDead = c.isDead;
        const nowDead = finalHp === 0;
        newCombatants[cid] = { ...c, conditions: newConditions, hp: finalHp, isDead: nowDead || wasDead };
        // 收集 tick 结果
        for (const log of tickLogs) {
          tickResults.push({ combatantId: cid, ref: '', hpDelta: 0, log });
        }
        if (hpDeltaTotal !== 0) {
          tickResults.push({ combatantId: cid, ref: '', hpDelta: hpDeltaTotal, log: `${c.name} 收到 ${hpDeltaTotal > 0 ? '+' : ''}${hpDeltaTotal} HP` });
        }
      }
      return { combatants: newCombatants };
    });
    return tickResults;
  },

  markDead: (combatantId) => {
    set((s) => {
      const c = s.combatants[combatantId];
      if (!c) return {};
      return { combatants: { ...s.combatants, [combatantId]: { ...c, isDead: true, hp: 0 } } };
    });
  },

  appendLog: (entry) => {
    set((s) => ({
      log: [...s.log, { ...entry, timestamp: Date.now() }],
    }));
  },

  beginResolving: (outcome) => {
    // active → resolving 守卫
    if (get().phase !== 'active') {
      throw new CombatStoreError(`beginResolving 要求 active, 当前 ${get().phase}`);
    }
    set({
      phase: 'resolving',
      outcome,
      resolvedAt: Date.now(),
    });
  },

  settle: (narrativeClosing) => {
    // resolving → settled 守卫
    if (get().phase !== 'resolving') {
      throw new CombatStoreError(`settle 要求 resolving, 当前 ${get().phase}`);
    }
    set({
      phase: 'settled',
      narrativeClosing,
    });
  },

  reset: () => {
    // settled → idle 守卫
    if (get().phase !== 'settled' && get().phase !== 'idle') {
      throw new CombatStoreError(`reset 要求 settled 或 idle, 当前 ${get().phase}`);
    }
    set({ ...INITIAL_COMBAT_STATE, active: false, isPlayerTurn: false });
  },

  _replaceState: (state) => {
    set(state as Partial<CombatState>);
  },
}));

/** 战斗是否完全结束 (UI 可关闭) */
export function isCombatOver(state: { phase: CombatPhase }): boolean {
  return state.phase === 'settled' || state.phase === 'idle';
}

/** 战斗是否进行中 (UI 接管) */
export function isCombatActive(state: { phase: CombatPhase }): boolean {
  return state.phase === 'active' || state.phase === 'resolving';
}

/** 战斗日志条数上限 (防止内存膨胀) */
export const COMBAT_LOG_MAX = 100;

// 抑制 unused warning (CombatAction / TurnResult / BalanceRating 是 Phase 2/4 消费)
export type _Reserved = CombatAction | TurnResult | BalanceRating;
