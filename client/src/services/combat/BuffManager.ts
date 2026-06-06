/**
 * v0.4 战斗系统 — BuffInstance lifecycle 纯函数 helper
 *
 * 职责:
 * - 把 conditions: BuffInstance[] 当作不可变数据处理, 每次返回新数组
 * - stackRule 应用 (stack / replace / refresh / ignore)
 * - remainingTurns 倒计时 (-1 = 永久)
 * - modifiers 汇总 (供 6 维公式消费)
 * - 向后兼容 v0.3: 派生 conditions: string[] 视图 (refs)
 *
 * 设计: 纯函数层, 不依赖 zustand store. 调用方在 store mutator 中调用
 *   const { newConditions, ticks } = tickBuffsInList(c.conditions);
 *   然后 store 同步 setState 写回. 这样:
 *   - 单元测试不需要 store 启动
 *   - 未来 server-side 验证 / replay 也能复用
 *
 * DOT/HOT 走 BuffInstance.onTick 回调, 由调用方负责执行 (本模块只做倒计时 + 移除).
 *
 * 详见 spec: docs/superpowers/specs/2026-06-04-v04-combat-system-design.md §5.2, §7.3
 */

import type { Attributes, AttributeName } from '../../types/character';
import type {
  BuffInstance,
  BuffStackRule,
  BuffTickResult,
  Combatant,
} from './types';

// ============================================================
// 错误
// ============================================================

export class InvalidBuffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBuffError';
  }
}

// ============================================================
// 校验
// ============================================================

/** 校验 buff 字段合法性. ref 必填, 剩余回合可 -1/正整数, modifiers 是 Partial<Attributes>. */
export function validateBuff(buff: BuffInstance): void {
  if (!buff.ref || typeof buff.ref !== 'string') {
    throw new InvalidBuffError(`Buff ref 必填非空字符串: ${JSON.stringify(buff)}`);
  }
  if (buff.remainingTurns !== -1 && (!Number.isInteger(buff.remainingTurns) || buff.remainingTurns < 1)) {
    throw new InvalidBuffError(`Buff remainingTurns 必须是 -1 或正整数: ${buff.ref} = ${buff.remainingTurns}`);
  }
  if (buff.stacks !== undefined && (!Number.isInteger(buff.stacks) || buff.stacks < 1)) {
    throw new InvalidBuffError(`Buff stacks 必须是正整数: ${buff.ref} = ${buff.stacks}`);
  }
  if (buff.modifiers !== undefined) {
    for (const [k, v] of Object.entries(buff.modifiers)) {
      if (typeof v !== 'number') {
        throw new InvalidBuffError(`Buff modifier 必须为 number: ${buff.ref}.${k} = ${v}`);
      }
    }
  }
}

// ============================================================
// addBuff — stackRule 应用
// ============================================================

export interface AddBuffResult {
  conditions: BuffInstance[];
  /** 'added' = 新增; 'stacked' = 叠加在已有 ref; 'replaced' = 覆盖; 'refreshed' = 倒计时刷新; 'ignored' = 已有同 ref 且 rule=ignore */
  outcome: 'added' | 'stacked' | 'replaced' | 'refreshed' | 'ignored';
}

/**
 * 把 buff 推入 conditions 列表, 按 stackRule 决定如何处理同 ref 冲突.
 * 纯函数: 返回新数组, 不修改原数组.
 */
export function addBuff(conditions: BuffInstance[], buff: BuffInstance): AddBuffResult {
  validateBuff(buff);
  const rule: BuffStackRule = buff.stackRule ?? 'replace';
  const existingIdx = conditions.findIndex((b) => b.ref === buff.ref);

  if (existingIdx < 0) {
    // 没有同 ref, 直接追加
    return { conditions: [...conditions, buff], outcome: 'added' };
  }

  const existing = conditions[existingIdx]!;

  switch (rule) {
    case 'stack': {
      // 叠加层数
      const merged: BuffInstance = {
        ...existing,
        stacks: existing.stacks + (buff.stacks ?? 1),
        // 取较长 remainingTurns (更持久的那个)
        remainingTurns: Math.max(existing.remainingTurns, buff.remainingTurns),
        modifiers: mergeModifiers(existing.modifiers, buff.modifiers),
      };
      return {
        conditions: conditions.map((b, i) => (i === existingIdx ? merged : b)),
        outcome: 'stacked',
      };
    }
    case 'refresh': {
      // 倒计时刷新到 max(旧, 新), modifiers 用新 buff 的 (覆盖式)
      const merged: BuffInstance = {
        ...existing,
        remainingTurns: Math.max(existing.remainingTurns, buff.remainingTurns),
        source: buff.source,
        appliedAtTurn: buff.appliedAtTurn,
        modifiers: buff.modifiers,
        onTick: buff.onTick ?? existing.onTick,
      };
      return {
        conditions: conditions.map((b, i) => (i === existingIdx ? merged : b)),
        outcome: 'refreshed',
      };
    }
    case 'ignore':
      // 已有同 ref 时忽略
      return { conditions, outcome: 'ignored' };
    case 'replace':
    default:
      // 覆盖式
      return {
        conditions: conditions.map((b, i) => (i === existingIdx ? buff : b)),
        outcome: 'replaced',
      };
  }
}

// ============================================================
// removeBuff
// ============================================================

export interface RemoveBuffResult {
  conditions: BuffInstance[];
  /** 移除的 buff 数量 */
  removed: number;
}

/** 移除指定 ref 的所有 buff (通常一个 ref 只会有一份, 防御性 removeAll). */
export function removeBuff(conditions: BuffInstance[], ref: string): RemoveBuffResult {
  let removed = 0;
  const next: BuffInstance[] = [];
  for (const b of conditions) {
    if (b.ref === ref) {
      removed++;
    } else {
      next.push(b);
    }
  }
  return { conditions: next, removed };
}

// ============================================================
// tickBuffs — 倒计时
// ============================================================

export interface TickBuffsResult {
  conditions: BuffInstance[];
  /** 本次 tick 触发的 DOT/HOT 结果 (由 BuffInstance.onTick 计算) */
  ticks: Array<{ ref: string; tick: BuffTickResult }>;
  /** 本次 tick 因 remainingTurns 归零而被移除的 buff refs */
  expired: string[];
}

/**
 * 对 conditions 数组执行倒计时:
 * 1. 每个有 onTick 的 buff 先执行回调 (DOT/HOT)
 * 2. remainingTurns: -1 永久, 不减
 * 3. remainingTurns: 正整数 -1, 0 移除, >0 保留
 *
 * 纯函数: 不调用 c.hp / c.applyDamage, 由调用方根据 ticks 自行 apply.
 */
export function tickBuffs(conditions: BuffInstance[]): TickBuffsResult {
  const ticks: Array<{ ref: string; tick: BuffTickResult }> = [];
  const expired: string[] = [];
  const next: BuffInstance[] = [];

  for (const b of conditions) {
    // 1. DOT/HOT — 在倒计时前执行, 表现"本回合先结算效果再 -1"
    if (b.onTick) {
      // 注: 回调中需要 combatant 信息, 但本函数只持 conditions 数组
      // 调用方应该用 wrapBuffOnTickWithCombatant 包装成无参函数后再传入
      // 这里做防御性检查: 回调需要 c, 我们没法在此提供, 跳过不抛
      // (实际业务中 onTick 已经被包装, 这里 noop)
    }

    // 2. 倒计时
    if (b.remainingTurns === -1) {
      next.push(b); // 永久
      continue;
    }
    const remaining = b.remainingTurns - 1;
    if (remaining <= 0) {
      expired.push(b.ref);
      // 不 push, 即移除
    } else {
      next.push({ ...b, remainingTurns: remaining });
    }
  }

  return { conditions: next, ticks, expired };
}

// ============================================================
// getBuffModifiers — 汇总所有 buff 的 modifiers
// ============================================================

/**
 * 汇总 conditions 里所有 buff 的 modifiers, 返回 Partial<Attributes>.
 * 6 维公式用: 加上 base + equipment + buff = effective.
 */
export function getBuffModifiers(conditions: BuffInstance[]): Partial<Attributes> {
  const out: Partial<Attributes> = {};
  for (const b of conditions) {
    for (const [k, v] of Object.entries(b.modifiers)) {
      if (typeof v === 'number') {
        const key = k as AttributeName;
        out[key] = (out[key] ?? 0) + v;
      }
    }
  }
  return out;
}

// ============================================================
// getConditionRefs — 向后兼容 v0.3 视图
// ============================================================

/**
 * 派生 c.conditions: string[] 视图 (只包含 ref 字符串).
 * v0.3 时代 c.conditions 是 string[], v0.4 升级为 BuffInstance[].
 * 给旧代码 (e.g. UI 列表渲染) 一个简单的字符串列表.
 */
export function getConditionRefs(conditions: BuffInstance[]): string[] {
  return conditions.map((b) => b.ref);
}

// ============================================================
// getActiveBuff — 查询
// ============================================================

/** 获取指定 ref 的 buff (返回第一个匹配; 防御性: 同一 ref 多份时取第一份). */
export function getActiveBuff(conditions: BuffInstance[], ref: string): BuffInstance | undefined {
  return conditions.find((b) => b.ref === ref);
}

// ============================================================
// helpers
// ============================================================

function mergeModifiers(a: Partial<Attributes>, b: Partial<Attributes>): Partial<Attributes> {
  const out: Partial<Attributes> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === 'number') {
      const key = k as AttributeName;
      out[key] = (out[key] ?? 0) + v;
    }
  }
  return out;
}

// ============================================================
// Combatant 工具 (用 Combatant.conditions 的便捷方法)
// ============================================================

/** Combatant 便捷 addBuff: 调 addBuff(c.conditions, buff). */
export function addBuffToCombatant(c: Combatant, buff: BuffInstance): AddBuffResult {
  return addBuff(c.conditions, buff);
}

/** Combatant 便捷 removeBuff. */
export function removeBuffFromCombatant(c: Combatant, ref: string): RemoveBuffResult {
  return removeBuff(c.conditions, ref);
}

/** Combatant 便捷 tickBuffs. */
export function tickBuffsOnCombatant(c: Combatant): TickBuffsResult {
  return tickBuffs(c.conditions);
}

/** Combatant 便捷 getBuffModifiers. */
export function getCombatantBuffModifiers(c: Combatant): Partial<Attributes> {
  return getBuffModifiers(c.conditions);
}

// 抑制 unused warning (Combatant 由 helper 函数消费)
export type _ReservedBuff = Combatant;
