/**
 * v0.4 战斗系统 — ItemCallbackRouter 物品 effect 路由
 *
 * 职责:
 * - 在战斗中路由 Item.effects (v0.3 11 种 EffectType) 到 5 个战斗域分类
 * - 应用各分类的默认行为 (heal/buff/damage)
 * - weapon-perm 类型 (damage_bonus / defense_bonus) 已装备 merge, 不触发
 * - gm-fallback 类型 (special / light_source) 抛 NeedsGMFallbackError
 * - 提供 customHandlerRegistry 让用户/扩展覆盖默认 mapping
 *
 * 设计:
 * - 接收 (item, ctx) 而非 (effect, ctx), 因为 v0.4 不破 v0.3 schema (不挂 combatUse 字段)
 * - 返回 CombatActionResult, 调用方负责 applyDamage / applyBuff 等副作用
 * - 纯函数: 副作用由调用方 (ActionResolver / combatStore) 处理
 *
 * 详见 spec: docs/superpowers/specs/2026-06-04-v04-combat-system-design.md §8
 * 详见 plan: docs/superpowers/plans/2026-06-04-v04-combat-system-implementation.md §5.2
 */

import type { Item, ItemEffect } from '../../types/item';
import type {
  Combatant,
  CombatActionResult,
  ItemCombatUseContext,
  BuffInstance,
} from './types';
import {
  toCombatCategory,
  type CombatEffectCategory,
} from './effectTypeCompat';

// ============================================================
// 错误
// ============================================================

/**
 * 强效果需 GM 裁定. 抛出此错让上层 toolcall handler 调 GM toolcall
 * (Phase 4 combatTools 处理).
 */
export class NeedsGMFallbackError extends Error {
  effectType: string;
  itemId: string;
  constructor(itemId: string, effectType: string, message?: string) {
    super(message ?? `物品效果需 GM 裁定: ${itemId} (${effectType})`);
    this.name = 'NeedsGMFallbackError';
    this.itemId = itemId;
    this.effectType = effectType;
  }
}

/** 物品没有 effect 时不抛错, 返回 success=false 即可. */
export class InvalidItemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidItemError';
  }
}

// ============================================================
// 自定义 handler 注册
// ============================================================

/**
 * 自定义 handler 签名: 接收 (effect, ctx), 返回 CombatActionResult.
 * 用户可注册到 customHandlerRegistry 覆盖默认 mapping.
 */
export type CustomEffectHandler = (
  effect: ItemEffect,
  ctx: ItemCombatUseContext,
) => CombatActionResult;

const customHandlerRegistry: Map<string, CustomEffectHandler> = new Map();

/** 注册一个 effectType 的自定义 handler. 后注册覆盖前注册. */
export function registerCustomHandler(effectType: string, handler: CustomEffectHandler): void {
  customHandlerRegistry.set(effectType, handler);
}

/** 注销. 测试 / 卸载时用. */
export function unregisterCustomHandler(effectType: string): boolean {
  return customHandlerRegistry.delete(effectType);
}

/** 清空所有自定义 handler. 测试 setup 用. */
export function clearCustomHandlers(): void {
  customHandlerRegistry.clear();
}

/** 查看是否注册 (调试用). */
export function hasCustomHandler(effectType: string): boolean {
  return customHandlerRegistry.has(effectType);
}

// ============================================================
// 路由主入口
// ============================================================

/**
 * 路由 item 的所有 effect 到对应 handler, 合并结果.
 * 调用方负责根据返回的 CombatActionResult 应用 HP / Buff 等副作用.
 *
 * 返回字段约定:
 * - damage: 净伤害 (正数=伤害, 负数=治疗, 0/undefined=无变化)
 * - appliedBuffs: 推入的 buff
 * - removedBuffs: 移除的 buff refs
 */
export function routeItem(item: Item, ctx: ItemCombatUseContext): CombatActionResult {
  if (!item.effects || item.effects.length === 0) {
    return {
      success: false,
      messages: [],
    };
  }

  const messages: string[] = [];
  const appliedBuffs: BuffInstance[] = [];
  const removedBuffs: string[] = [];
  let netDamage = 0; // 正=伤害, 负=治疗
  let hasGMFallback = false;

  for (const effect of item.effects) {
    // 1. 自定义 handler 优先
    if (customHandlerRegistry.has(effect.type)) {
      const handler = customHandlerRegistry.get(effect.type)!;
      const sub = handler(effect, ctx);
      mergeResults(sub, { messages, appliedBuffs, removedBuffs }, (d) => { netDamage += d; });
      if (sub.success) continue;
    }

    // 2. 默认 mapping
    const category = toCombatCategory(effect.type);
    switch (category) {
      case 'heal':
        handleHeal(effect, ctx, messages, (h) => { netDamage -= h; });
        break;
      case 'buff':
        handleBuff(effect, ctx, messages, appliedBuffs);
        break;
      case 'damage':
        handleDamage(effect, ctx, messages, (d) => { netDamage += d; });
        break;
      case 'weapon-perm':
        // 装备已 merge, 跳过, 不计入 messages
        break;
      case 'gm-fallback':
        hasGMFallback = true;
        messages.push(`[GM-fallback] ${effect.type}: ${effect.description}`);
        break;
    }
  }

  if (hasGMFallback) {
    // 任一 effect 是 gm-fallback, 整件物品抛错
    // 调用方应捕获并走 GM toolcall 路径
    const fallback = item.effects.find((e) => toCombatCategory(e.type) === 'gm-fallback');
    if (fallback) {
      throw new NeedsGMFallbackError(item.itemId ?? item.name, fallback.type);
    }
  }

  return {
    success: messages.length > 0,
    damage: netDamage !== 0 ? netDamage : undefined,
    messages,
    appliedBuffs: appliedBuffs.length > 0 ? appliedBuffs : undefined,
    removedBuffs: removedBuffs.length > 0 ? removedBuffs : undefined,
  };
}

// ============================================================
// 5 个内部 handler
// ============================================================

/** heal: target.hp += value (clamp 到 maxHp). 实际 apply 由调用方做. */
function handleHeal(
  effect: ItemEffect,
  ctx: ItemCombatUseContext,
  messages: string[],
  addHeal: (n: number) => void,
): void {
  const value = extractNumber(effect.value);
  if (value === null) {
    messages.push(`[heal] ${effect.type} value 不是数字: ${JSON.stringify(effect.value)}`);
    return;
  }
  const target = ctx.target ?? ctx.user;
  const realHeal = Math.min(value, target.maxHp - target.hp);
  addHeal(realHeal);
  messages.push(`${target.name} 恢复 ${realHeal} HP (${effect.description || effect.type})`);
}

/** buff: 推 BuffInstance. attribute_mod / hp_max_bonus / vital_restore / elemental_resist / skill_bonus 走不同 modifiers. */
function handleBuff(
  effect: ItemEffect,
  ctx: ItemCombatUseContext,
  messages: string[],
  appliedBuffs: BuffInstance[],
): void {
  const target = ctx.target ?? ctx.user;
  const buff = buffEffectToBuffInstance(effect, target, ctx.state.round);
  if (!buff) {
    messages.push(`[buff] 无法解析 ${effect.type}: ${JSON.stringify(effect.value)}`);
    return;
  }
  appliedBuffs.push(buff);
  messages.push(`${target.name} 获得 ${buff.ref} (${effect.description || effect.type})`);
}

/** damage: 走 hit 判定, 伤害 = value. v0.4 简化: 跳过 toHit 公式, 直接 value. */
function handleDamage(
  effect: ItemEffect,
  ctx: ItemCombatUseContext,
  messages: string[],
  addDamage: (n: number) => void,
): void {
  const value = extractNumber(effect.value);
  if (value === null) {
    messages.push(`[damage] ${effect.type} value 不是数字: ${JSON.stringify(effect.value)}`);
    return;
  }
  const target = ctx.target ?? ctx.user;
  addDamage(value);
  messages.push(`${target.name} 受到 ${value} 元素伤害 (${effect.description || effect.type})`);
}

// ============================================================
// buff 工厂: EffectType → BuffInstance
// ============================================================

/** 默认 buff 持续回合数 (用于 hp_max_bonus / attribute_mod 等). */
const DEFAULT_BUFF_DURATION = 5;

/** 把 buff 类 effect 翻译为 BuffInstance. */
function buffEffectToBuffInstance(
  effect: ItemEffect,
  target: Combatant,
  appliedAtTurn: number,
): BuffInstance | null {
  const ref = `${effect.type}_${target.id}`;

  switch (effect.type) {
    case 'hp_max_bonus': {
      const value = extractNumber(effect.value);
      if (value === null) return null;
      // maxHp bonus 不通过 buff 改 attributes, 而是通过 maxHpDelta 逻辑
      // 简化: 把 maxHp 增量写进 modifiers.CON (CON 提升 maxHp), 实际由战斗 store 处理
      return {
        ref,
        stacks: 1,
        remainingTurns: DEFAULT_BUFF_DURATION,
        source: 'item',
        appliedAtTurn,
        modifiers: { CON: value },
      };
    }
    case 'vital_restore': {
      // 恢复 MP / stamina, 走 applyMP 路径. buff 表示"持续回复"
      return {
        ref,
        stacks: 1,
        remainingTurns: DEFAULT_BUFF_DURATION,
        source: 'item',
        appliedAtTurn,
        modifiers: {},
        // 注: 实际 MP 恢复由 onTick 处理, 这里只做标记
      };
    }
    case 'attribute_mod': {
      // value 是 Record<attr, number>
      if (typeof effect.value !== 'object' || effect.value === null) return null;
      const modifiers: Record<string, number> = {};
      for (const [k, v] of Object.entries(effect.value)) {
        if (typeof v === 'number') modifiers[k] = v;
      }
      return {
        ref,
        stacks: 1,
        remainingTurns: DEFAULT_BUFF_DURATION,
        source: 'item',
        appliedAtTurn,
        modifiers: modifiers as BuffInstance['modifiers'],
      };
    }
    case 'elemental_resist': {
      // 元素抗性, v0.4 简化: 不引入新 dimension, 用 CON 代偿
      const value = extractNumber(effect.value) ?? 0;
      return {
        ref,
        stacks: 1,
        remainingTurns: DEFAULT_BUFF_DURATION,
        source: 'item',
        appliedAtTurn,
        modifiers: { CON: value },
      };
    }
    case 'skill_bonus': {
      // 技能加成, v0.4 简化: 用 INT 代偿
      const value = extractNumber(effect.value) ?? 0;
      return {
        ref,
        stacks: 1,
        remainingTurns: DEFAULT_BUFF_DURATION,
        source: 'item',
        appliedAtTurn,
        modifiers: { INT: value },
      };
    }
    default:
      return null;
  }
}

// ============================================================
// helpers
// ============================================================

function extractNumber(v: ItemEffect['value']): number | null {
  if (typeof v === 'number') return v;
  return null;
}

function mergeResults(
  sub: CombatActionResult,
  acc: { messages: string[]; appliedBuffs: BuffInstance[]; removedBuffs: string[] },
  addNetDamage: (n: number) => void,
): void {
  if (sub.messages) acc.messages.push(...sub.messages);
  if (sub.appliedBuffs) acc.appliedBuffs.push(...sub.appliedBuffs);
  if (sub.removedBuffs) acc.removedBuffs.push(...sub.removedBuffs);
  if (sub.damage !== undefined && sub.damage !== 0) addNetDamage(sub.damage);
}

// ============================================================
// 工具
// ============================================================

/** 判定 item 是否含 gm-fallback effect (用于上层预判, 不抛错). */
export function hasGMFallbackEffect(item: Item): boolean {
  if (!item.effects) return false;
  return item.effects.some((e) => toCombatCategory(e.type) === 'gm-fallback');
}

/** 列出 item 的所有 effect 分类 (调试 / UI 提示). */
export function listEffectCategories(item: Item): CombatEffectCategory[] {
  if (!item.effects) return [];
  return item.effects.map((e) => toCombatCategory(e.type));
}

// 抑制 unused warning (Combatant / target 由 ctx 消费)
export type _ReservedRouter = Combatant;
