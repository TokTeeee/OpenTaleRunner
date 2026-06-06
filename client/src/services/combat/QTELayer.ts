/**
 * v0.4 战斗系统 — QTE Layer
 *
 * Quick-Time Event 核心逻辑层 (无 UI 依赖, 纯函数 + 公式).
 * 详见: docs/superpowers/specs/2026-06-04-v04-combat-system-design.md §9.5-§9.7
 *
 * 设计:
 * - 关闭路径: 返回 QTE_NOOP (modifier=0, 战斗公式不受影响)
 * - 开启路径: 调用方 await 外部 QTE UI (QTETimingBar / QTETypingBox) 后回调
 *   -> 这里只暴露公式 + 状态机
 *
 * 不依赖 React / framer-motion, 可独立 unit-test
 */

import type { Combatant } from './types';

// ============================================================
// 类型
// ============================================================

export interface QTEResult {
  /** 命中率 / 准确率 [0, 1] */
  accuracy: number;
  /** 伤害/Mana modifier [-1, 1] */
  modifier: number;
  /** QTE 类型 */
  type: 'attack' | 'magic' | 'none';
}

/** QTE 关闭时返回的 noop 结果 (modifier=0, 战斗系统无感知) */
export const QTE_NOOP: QTEResult = { accuracy: 1, modifier: 0, type: 'none' };

/** QTE 未完成 (超时 / 取消) 时返回的 miss 结果 */
export const QTE_MISS: QTEResult = { accuracy: 0, modifier: -1, type: 'attack' };

/** 关闭守卫 (spec §9.7) */
export function isQTEEnabled(enabled: boolean): boolean {
  return enabled === true;
}

// ============================================================
// 公式 (纯函数)
// ============================================================

/**
 * 攻击 QTE 轮数:
 *   agilityDelta <= 0  -> 1 轮 (低敏捷)
 *   agilityDelta > 0   -> clamp(1, floor(agilityDelta / 4), 5)
 *
 * spec §9.6: rounds = clamp(1, max(1, floor(agilityDelta / 4)), 5)
 */
export function computeAttackRounds(agilityDelta: number): number {
  if (agilityDelta <= 0) return 1;
  return Math.min(5, Math.max(1, Math.floor(agilityDelta / 4)));
}

/**
 * 魔法 QTE 基础时长 (ms):
 *   baseMs = max(3000, 5000 - INT * 200)
 *
 * spec §9.4
 */
export function computeMagicBaseMs(intStat: number): number {
  return Math.max(3000, 5000 - intStat * 200);
}

/**
 * 攻击 QTE accuracy -> modifier:
 *   准确率 1.0 = 满命中 (modifier = +1)
 *   准确率 0.5 = 中 (modifier = 0)
 *   准确率 0.0 = miss (modifier = -1)
 *
 * 公式: modifier = clamp(accuracy * 2 - 1, -1, 1)
 */
export function attackAccuracyToModifier(accuracy: number): number {
  return Math.max(-1, Math.min(1, accuracy * 2 - 1));
}

/**
 * 魔法 QTE -> modifier:
 *   typingAccuracy * 0.6 + timeBonus * 0.4 - 0.5) * 2
 *
 * spec §9.4
 *
 * @param typingAccuracy 0-1, 正确字符数 / 咒语长度
 * @param timeBonus 0-1, clamp(1 - elapsedMs / baseMs, 0, 1)
 */
export function magicInputsToModifier(typingAccuracy: number, timeBonus: number): number {
  const a = Math.max(0, Math.min(1, typingAccuracy));
  const b = Math.max(0, Math.min(1, timeBonus));
  const score = a * 0.6 + b * 0.4;
  return Math.max(-1, Math.min(1, (score - 0.5) * 2));
}

/**
 * 时间奖励 (typing 框):
 *   timeBonus = clamp(1 - elapsedMs / baseMs, 0, 1)
 */
export function computeTimeBonus(elapsedMs: number, baseMs: number): number {
  if (baseMs <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - elapsedMs / baseMs));
}

// ============================================================
// 状态机
// ============================================================

export type QTEPhase = 'idle' | 'pending' | 'resolving' | 'done' | 'cancelled';

export interface QTERunState {
  phase: QTEPhase;
  type: 'attack' | 'magic' | null;
  /** 攻击: rounds | 魔法: 咒语字符串 */
  payload: number | string | null;
  /** 累积 hits / chars (UI 同步用) */
  hits: number;
  total: number;
  /** 起始时间戳 */
  startedAt: number;
  /** baseMs (魔法用) */
  baseMs: number;
}

export function createIdleQTEState(): QTERunState {
  return {
    phase: 'idle',
    type: null,
    payload: null,
    hits: 0,
    total: 0,
    startedAt: 0,
    baseMs: 0,
  };
}

/** 开始一次攻击 QTE */
export function startAttackQTE(agilityDelta: number): QTERunState {
  const rounds = computeAttackRounds(agilityDelta);
  return {
    phase: 'pending',
    type: 'attack',
    payload: rounds,
    hits: 0,
    total: rounds,
    startedAt: Date.now(),
    baseMs: 0,
  };
}

/** 开始一次魔法 QTE */
export function startMagicQTE(spell: string, caster: Combatant): QTERunState {
  const baseMs = computeMagicBaseMs(caster.attributes.INT);
  return {
    phase: 'pending',
    type: 'magic',
    payload: spell,
    hits: 0,
    total: spell.replace(/\s/g, '').length,
    startedAt: Date.now(),
    baseMs,
  };
}

/** 命中一次 (attack) / 正确输入一字 (magic) */
export function recordHit(state: QTERunState): QTERunState {
  if (state.phase !== 'pending') return state;
  return { ...state, hits: state.hits + 1 };
}

/** 状态推进: pending -> resolving (UI 报告完成) */
export function finishQTE(state: QTERunState): QTERunState {
  if (state.phase !== 'pending') return state;
  return { ...state, phase: 'resolving' };
}

/** 取消 (ESC / 关闭) -> cancelled, miss */
export function cancelQTE(state: QTERunState): QTERunState {
  if (state.phase === 'idle' || state.phase === 'done' || state.phase === 'cancelled') return state;
  return { ...state, phase: 'cancelled' };
}

/** 完成 (返回 result) */
export function finalizeQTE(state: QTERunState): QTEResult {
  if (state.phase === 'cancelled') return { ...QTE_MISS, type: state.type ?? 'attack' };
  if (state.type === 'attack') {
    const accuracy = state.total > 0 ? state.hits / state.total : 0;
    return { accuracy, modifier: attackAccuracyToModifier(accuracy), type: 'attack' };
  }
  if (state.type === 'magic') {
    const typingAccuracy = state.total > 0 ? state.hits / state.total : 0;
    const elapsedMs = Date.now() - state.startedAt;
    const timeBonus = computeTimeBonus(elapsedMs, state.baseMs);
    return {
      accuracy: typingAccuracy,
      modifier: magicInputsToModifier(typingAccuracy, timeBonus),
      type: 'magic',
    };
  }
  return QTE_NOOP;
}

// ============================================================
// 高层主入口 (UI 侧 await)
// ============================================================

export interface AttackQTEParams {
  /** 攻/防敏捷差, 用于算 rounds */
  agilityDelta: number;
  /** 玩家 ID (UI 标识) */
  playerId: string;
  /** 目标 ID (UI 标识) */
  targetId: string;
  /** 真实物理时间 (ms), UI 模拟可用 makeConstRoll 风格注入 */
  now?: () => number;
}

export interface MagicQTEParams {
  /** 咒语 (无空格) */
  spell: string;
  /** 施法者 (读 INT 算 baseMs) */
  caster: Combatant;
  playerId: string;
  targetId: string | null;
  now?: () => number;
}

/**
 * 攻击 QTE 主入口: 关闭时立即返回 QTE_NOOP, 开启时返回 Promise 等待 UI 完成
 * 调用方在 await 期间启动 QTETimingBar 组件, 组件通过 recordHit/finalizeQTE 回写.
 */
export function runAttackQTE(enabled: boolean, _params: AttackQTEParams): QTEResult | Promise<QTEResult> {
  if (!enabled) return QTE_NOOP;
  // 开启时返 Promise; UI 层 await resolve. 这里不实现 Promise (UI 层实现).
  // 真实实现见 useQTERunner hook (Phase 6 wire).
  // 抛错提示: 调用方应接 QTEProvider 接口
  throw new Error('runAttackQTE: QTE enabled but no UI runner registered. Use useQTERunner() instead.');
}

/** 同上, 魔法版本 */
export function runMagicQTE(enabled: boolean, _params: MagicQTEParams): QTEResult | Promise<QTEResult> {
  if (!enabled) return QTE_NOOP;
  throw new Error('runMagicQTE: QTE enabled but no UI runner registered. Use useQTERunner() instead.');
}

// ============================================================
// 工具: 校验 modifier 范围 (供 ActionResolver / debug)
// ============================================================

export function clampQTEModifier(modifier: number): number {
  return Math.max(-1, Math.min(1, modifier));
}
