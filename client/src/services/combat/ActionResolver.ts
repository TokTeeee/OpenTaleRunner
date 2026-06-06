/**
 * v0.4 战斗系统 — ActionResolver 5 维公式核心
 *
 * v0.5-dev 变更:
 * - 移除 `skill` 动作 (无 SkillRegistry, 先隐藏)
 * - 命中公式改为文档版: d20 + DEX_mod vs 10 + DEX_mod + defense + dodgePenalty
 * - 伤害公式改为文档版: max(1, d6 + STR_mod + weapon - target.defense) * QTE 缩放
 * - 闪避衰减: defender 每次成功闪避, 自己的命中门槛 +DODGE_PENALTY_STEP;
 *   被命中则重置. 取代原 2d6 dodge 投模型.
 *
 * 实现 5 种 CombatAction 的本地判定:
 * - attack:  d20 + DEX_mod vs threshold; 命中后 d6 + STR_mod + weapon - defense
 * - item:    委托给 ItemCallbackRouter
 * - flee:    fleeChance = clamp(0.3 + (DEX_self - DEX_others) / 20, 0.1, 0.9)
 * - defend:  本回合 defending=true → 命中门槛 +2; 消耗 1 AP
 * - wait:    跳过本回合, 恢复 1 AP (受 maxAp clamp)
 *
 * 公式 (v0.5 §2.2 / §2.6):
 *   effectiveAttribute(c, attr) = c.attributes[attr] + sum(buff.modifiers[attr]) + equipmentBonus
 *   toHit      = d20 + floor((DEX_attacker - 10) / 2)
 *   threshold  = 10 + floor((DEX_defender - 10) / 2) + defense + dodgePenalty + (defending ? 2 : 0)
 *   hit        = toHit >= threshold (平局算命中)
 *   damage     = round( max(1, d6 + floor((STR_attacker - 10) / 2) + weapon - defense) * (1 + qte * scale) )
 *   fleeChance = clamp(0.3 + (playerDEX - avgEnemyDEX) / 20, 0.1, 0.9)
 *
 * 设计: RollFn 注入, QTE provider 注入, 状态变更通过 store
 *
 * 详见: docs/zh/战斗系统.md §2.6
 */

import { useCombatStore } from '../../stores/combatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useItemRegistryStore } from '../../stores/itemRegistryStore';
import { defaultRoll, rollD, type RollFn } from './dice';
import {
  type Combatant,
  type CombatAction,
  type TurnResult,
  type CombatLogEntry,
  type CombatActionResult,
  type BuffInstance,
  type ItemCombatUseContext,
  type Attributes,
  DEFEND_THRESHOLD_BONUS,
  DEFEND_AP_COST,
} from './types';
import { routeItem, NeedsGMFallbackError } from './ItemCallbackRouter';
import type { Item } from '../../types/item';

// ============================================================
// 错误
// ============================================================

export class InsufficientAPError extends Error {
  required: number;
  available: number;
  constructor(required: number, available: number) {
    super(`AP 不足: 需要 ${required}, 实际 ${available}`);
    this.name = 'InsufficientAPError';
    this.required = required;
    this.available = available;
  }
}

export class UnknownCombatantError extends Error {
  id: string;
  constructor(id: string) {
    super(`未知战斗者: ${id}`);
    this.name = 'UnknownCombatantError';
    this.id = id;
  }
}

export class UnknownItemError extends Error {
  itemId: string;
  constructor(itemId: string) {
    super(`未知 item: ${itemId}`);
    this.name = 'UnknownItemError';
    this.itemId = itemId;
  }
}

// ============================================================
// 装备 / 6 维修正
// ============================================================

/** 从 Item.effects 提取 damage_bonus 值 (e.g. 匕首 +4). 找不到返回 0. */
export function getWeaponDamage(item: { effects?: { type: string; value?: number | string | Record<string, unknown> }[] } | null | undefined): number {
  if (!item?.effects) return 0;
  for (const eff of item.effects) {
    if (eff.type === 'damage_bonus' && typeof eff.value === 'number') {
      return eff.value;
    }
  }
  return 0;
}

/** 从 Item.effects 提取 defense_bonus 值. 找不到返回 0. */
export function getArmorDefense(item: { effects?: { type: string; value?: number | string | Record<string, unknown> }[] } | null | undefined): number {
  if (!item?.effects) return 0;
  for (const eff of item.effects) {
    if (eff.type === 'defense_bonus' && typeof eff.value === 'number') {
      return eff.value;
    }
  }
  return 0;
}

/** 从 Item.effects 提取 attribute_mod Record (e.g. { STR: 2, DEX: 1 }). */
export function getAttributeMods(item: { effects?: { type: string; value?: number | string | Record<string, unknown> }[] } | null | undefined): Attributes {
  const empty: Attributes = { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 };
  if (!item?.effects) return empty;
  for (const eff of item.effects) {
    if (eff.type === 'attribute_mod' && typeof eff.value === 'object' && eff.value !== null) {
      const v = eff.value as Record<string, unknown>;
      if (!v) return empty;
      return {
        STR: (typeof v.STR === 'number' ? v.STR : 0),
        DEX: (typeof v.DEX === 'number' ? v.DEX : 0),
        CON: (typeof v.CON === 'number' ? v.CON : 0),
        INT: (typeof v.INT === 'number' ? v.INT : 0),
        WIS: (typeof v.WIS === 'number' ? v.WIS : 0),
        CHA: (typeof v.CHA === 'number' ? v.CHA : 0),
      };
    }
  }
  return empty;
}

/** 汇总 3 个装备槽的 attribute_mod 修正 (用于 effectiveAttribute). */
export function getEquipmentAttributeMods(equipped: Combatant['equipped']): Attributes {
  const out: Attributes = { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 };
  const slots = [equipped.weapon, equipped.armor, equipped.accessory];
  for (const item of slots) {
    if (!item) continue;
    const mods = getAttributeMods(item);
    for (const k of Object.keys(out) as (keyof Attributes)[]) {
      out[k] += mods[k];
    }
  }
  return out;
}

/** 6 维属性修正: base + buff + equipment. spec §7.2.1. */
export function effectiveAttribute(c: Combatant, attr: keyof Attributes): number {
  const base = c.attributes[attr];
  const buffMod = c.conditions.reduce((s, b) => s + (b.modifiers[attr] ?? 0), 0);
  const equipMod = getEquipmentAttributeMods(c.equipped)[attr];
  return base + buffMod + equipMod;
}

// ============================================================
// 命中 / 闪避 / 伤害 (v0.5 文档版)
// ============================================================

/** 命中投: d20 + DEX 修正. */
export function rollToHit(attacker: Combatant, roll: RollFn): { d20: number; dexMod: number; total: number } {
  const d20 = rollD(20, roll);
  const dex = effectiveAttribute(attacker, 'DEX');
  const dexMod = Math.floor((dex - 10) / 2);
  return { d20, dexMod, total: d20 + dexMod };
}

/** 命中门槛: 10 + DEX_mod + 装备 defense + 闪避衰减 + (defending ? 2 : 0). */
export function hitThreshold(
  defender: Combatant,
  dodgePenalty = 0,
  defending = false,
): { dexMod: number; defense: number; dodgePenalty: number; defendingBonus: number; total: number } {
  const dex = effectiveAttribute(defender, 'DEX');
  const dexMod = Math.floor((dex - 10) / 2);
  const defense = getArmorDefense(defender.equipped.armor);
  const defendingBonus = defending ? DEFEND_THRESHOLD_BONUS : 0;
  return {
    dexMod,
    defense,
    dodgePenalty,
    defendingBonus,
    total: 10 + dexMod + defense + dodgePenalty + defendingBonus,
  };
}

/** 命中判定: attackRoll >= threshold. 平局算命中. */
export function checkHit(attackRoll: number, threshold: number): boolean {
  return attackRoll >= threshold;
}

/** 闪避衰减常量: 每次成功闪避后, 该 defender 后续的命中门槛 +DODGE_PENALTY_STEP. */
export const DODGE_PENALTY_STEP = 5;

/**
 * 伤害: round( max(1, d6 + STR_mod + weapon - target.defense) * (1 + qte * scale) )
 * QTE 不影响命中判定, 只缩放伤害.
 */
export function rollDamage(
  attacker: Combatant,
  target: Combatant,
  qteModifier: number,
  damageScale: number,
  roll: RollFn,
): { d6: number; strMod: number; weapon: number; defense: number; base: number; total: number } {
  const d6 = rollD(6, roll);
  const str = effectiveAttribute(attacker, 'STR');
  const strMod = Math.floor((str - 10) / 2);
  const weapon = getWeaponDamage(attacker.equipped.weapon);
  const defense = getArmorDefense(target.equipped.armor);
  const base = Math.max(1, d6 + strMod + weapon - defense);
  const total = Math.max(0, Math.round(base * (1 + qteModifier * damageScale)));
  return { d6, strMod, weapon, defense, base, total };
}

// ============================================================
// 逃跑
// ============================================================

/** 逃跑成功率: clamp(0.3 + (playerDEX - avgEnemyDEX) / 20, 0.1, 0.9). */
export function fleeChance(player: Combatant, enemies: Combatant[]): number {
  if (enemies.length === 0) return 0.9;
  const playerDEX = effectiveAttribute(player, 'DEX');
  const avgEnemyDEX = enemies.reduce((s, e) => s + effectiveAttribute(e, 'DEX'), 0) / enemies.length;
  return Math.max(0.1, Math.min(0.9, 0.3 + (playerDEX - avgEnemyDEX) / 20));
}

/** 1d100 投, <= chance 算逃跑成功. */
export function rollFlee(player: Combatant, enemies: Combatant[], roll: RollFn): { d100: number; chance: number; success: boolean } {
  const chance = fleeChance(player, enemies);
  const d100 = roll(100);
  return { d100, chance, success: d100 <= chance * 100 };
}

// ============================================================
// QTE 注入接口 (Phase 6 接入)
// ============================================================

export interface QTEResult {
  accuracy: number;     // [0, 1]
  modifier: number;     // [-1, 1]
  type: 'attack' | 'magic' | 'none';
}

export type QTEProvider = (params: {
  action: CombatAction;
  attacker: Combatant;
  target: Combatant | null;
  state: ReturnType<typeof useCombatStore.getState>;
}) => QTEResult;

/** 默认 QTE provider: QTE 关闭时返回 zero modifier. spec §9.7. */
export const noopQTEProvider: QTEProvider = () => ({ accuracy: 1, modifier: 0, type: 'none' });

/**
 * 默认 QTE provider: QTE 关闭时返回 zero modifier. 仅 attack 动作有 QTE 缩放,
 * 其他动作返回 noop. v0.5 仍走 noop (QTE 接入留给 v0.5+).
 */
export function defaultQTEProvider(): QTEProvider {
  return (params) => {
    try {
      const qte = useSettingsStore.getState().qte;
      if (!qte.enabled) return noopQTEProvider(params);
      // v0.5 接入: 调 runAttackQTE (skill 已隐藏, 不再有 runMagicQTE 路径)
      return noopQTEProvider(params);
    } catch {
      return noopQTEProvider(params);
    }
  };
}

// ============================================================
// 6 种 CombatAction 解析
// ============================================================

export interface ResolverContext {
  roll: RollFn;
  qte: QTEProvider;
  /** 当前回合是否处于防御状态 (从 store 读, 由 resolveDefend 设) */
  getDefending: (id: string) => boolean;
  setDefending: (id: string, defending: boolean) => void;
  /** 战斗第几回合 (从 store 读) */
  getRound: () => number;
}

export const ACTION_COSTS = {
  attack: { ap: 2 },
  item: { ap: 0 },
  flee: { ap: 0 },
  defend: { ap: DEFEND_AP_COST },
  wait: { ap: 0 },
} as const;

export class ActionResolver {
  private roll: RollFn;
  private qte: QTEProvider;
  private damageScale: number;
  /** 防御标记: id -> true 表示本回合已防御. turnEnd 时清. */
  private defending = new Set<string>();
  /** 闪避衰减: 每个 combatant 累积的闪避惩罚值. 成功闪避 +5, 被命中归零. */
  private dodgePenalty = new Map<string, number>();

  constructor(opts: { roll?: RollFn; qte?: QTEProvider; damageScale?: number } = {}) {
    this.roll = opts.roll ?? defaultRoll;
    this.qte = opts.qte ?? defaultQTEProvider();
    this.damageScale = opts.damageScale ?? 0.3;
  }

  /** 主入口: 解析任意 CombatAction. */
  resolve(action: CombatAction, state: ReturnType<typeof useCombatStore.getState>): TurnResult {
    return this.resolveInternal(action, state, undefined);
  }

  /**
   * v0.4 Phase 6: 预解析 QTE 后执行.
   * CombatView 用 QTEStore 跑 QTE 拿到 result, 然后调这个方法, 跳过 QTEProvider 调用.
   * (resolver 内的 QTEProvider 仍然存在, 兼容旧调用方; QTE 关闭 / 走默认 noop 时仍走 resolve())
   */
  resolveWithQTE(
    action: CombatAction,
    state: ReturnType<typeof useCombatStore.getState>,
    qteResult: QTEResult,
  ): TurnResult {
    return this.resolveInternal(action, state, qteResult);
  }

  private resolveInternal(
    action: CombatAction,
    state: ReturnType<typeof useCombatStore.getState>,
    overrideQte: QTEResult | undefined,
  ): TurnResult {
    const ctx: ResolverContext = {
      roll: this.roll,
      qte: overrideQte ? () => overrideQte : this.qte,
      getDefending: (id) => this.defending.has(id),
      setDefending: (id, v) => (v ? this.defending.add(id) : this.defending.delete(id)),
      getRound: () => state.round,
    };
    switch (action.kind) {
      case 'attack': return this.resolveAttack(action, ctx, state);
      case 'item': return this.resolveItem(action, ctx, state);
      case 'flee': return this.resolveFlee(action, ctx, state);
      case 'defend': return this.resolveDefend(action, ctx, state);
      case 'wait': return this.resolveWait(action, ctx, state);
    }
  }

  // ---- attack ----
  private resolveAttack(
    action: Extract<CombatAction, { kind: 'attack' }>,
    ctx: ResolverContext,
    state: ReturnType<typeof useCombatStore.getState>,
  ): TurnResult {
    const attacker = state.combatants[action.attackerId];
    const target = state.combatants[action.targetId];
    const log: CombatLogEntry[] = [];
    if (!attacker) {
      log.push({ kind: 'action', round: state.round, turn: state.turn, message: `[错误] 未知攻击者 ${action.attackerId}`, timestamp: Date.now() });
      return { log, buffTicks: [], ended: false };
    }
    if (!target) {
      log.push({ kind: 'action', round: state.round, turn: state.turn, message: `[错误] 未知目标 ${action.targetId}`, timestamp: Date.now() });
      return { log, buffTicks: [], ended: false };
    }
    if (attacker.isDead || target.isDead) {
      log.push({ kind: 'action', round: state.round, turn: state.turn, message: `无效攻击 (一方已死亡)`, timestamp: Date.now() });
      return { log, buffTicks: [], ended: false };
    }

    this.checkAP(attacker, ACTION_COSTS.attack.ap);

    // QTE: 注入 modifier, 不影响命中判定, 只缩放伤害
    const qteRes = ctx.qte({ action, attacker, target, state });

    // 命中投 + 命中门槛
    const toHit = rollToHit(attacker, ctx.roll);
    const targetDefending = ctx.getDefending(target.id);
    const currentPenalty = this.dodgePenalty.get(target.id) ?? 0;
    const threshold = hitThreshold(target, currentPenalty, targetDefending);
    const hit = checkHit(toHit.total, threshold.total);

    log.push({
      kind: 'action',
      round: state.round,
      turn: state.turn,
      message: `${attacker.name} 攻击 ${target.name}: d20=${toHit.d20}+${toHit.dexMod} = ${toHit.total} vs 门槛 ${threshold.total} (10+${threshold.dexMod}+def${threshold.defense}+门槛${threshold.dodgePenalty}${threshold.defendingBonus ? `+defend${threshold.defendingBonus}` : ''})`,
      data: { toHit, threshold, qte: qteRes },
      timestamp: Date.now(),
    });

    if (!hit) {
      // 闪避成功 → defender 后续门槛 +DODGE_PENALTY_STEP
      const newPenalty = currentPenalty + DODGE_PENALTY_STEP;
      this.dodgePenalty.set(target.id, newPenalty);
      log.push({
        kind: 'action',
        round: state.round,
        turn: state.turn,
        message: `${target.name} 闪避成功! (门槛 ${currentPenalty} → ${newPenalty})`,
        data: { hit: false, dodgePenalty: newPenalty },
        timestamp: Date.now(),
      });
      useCombatStore.getState().applyAP(attacker.id, -ACTION_COSTS.attack.ap);
      return { log, buffTicks: [], ended: false };
    }

    // 命中 → defender 累积门槛归零
    if (currentPenalty > 0) {
      this.dodgePenalty.set(target.id, 0);
      log.push({
        kind: 'action',
        round: state.round,
        turn: state.turn,
        message: `${target.name} 被命中, 闪避衰减 ${currentPenalty} 归零`,
        data: { hit: true, dodgePenalty: 0 },
        timestamp: Date.now(),
      });
    }

    // 命中 → 算伤害 (含 QTE 缩放, 含 target.defense 减成)
    const damage = rollDamage(attacker, target, qteRes.modifier, this.damageScale, ctx.roll);
    useCombatStore.getState().applyDamage(target.id, damage.total);
    log.push({
      kind: 'action',
      round: state.round,
      turn: state.turn,
      message: `命中! 投 d6=${damage.d6}+STR${damage.strMod}+武器${damage.weapon}-防${damage.defense} = base${damage.base} → ${damage.total} 伤害${qteRes.modifier !== 0 ? ` (QTE ×${(1 + qteRes.modifier * this.damageScale).toFixed(2)})` : ''}`,
      data: { damage, qte: qteRes },
      timestamp: Date.now(),
    });

    useCombatStore.getState().applyAP(attacker.id, -ACTION_COSTS.attack.ap);
    return { log, buffTicks: [], ended: false };
  }

  // ---- item ----
  private resolveItem(
    action: Extract<CombatAction, { kind: 'item' }>,
    ctx: ResolverContext,
    state: ReturnType<typeof useCombatStore.getState>,
  ): TurnResult {
    const user = state.combatants[action.userId];
    if (!user) throw new UnknownCombatantError(action.userId);
    this.checkAP(user, ACTION_COSTS.item.ap);

    // 从 itemRegistry 查物品真相
    const worldItem = useItemRegistryStore.getState().get(action.itemId);
    if (!worldItem) {
      throw new UnknownItemError(action.itemId);
    }

    // target 解析: targetId 缺省或指向自己 → self
    let target = action.targetId ? state.combatants[action.targetId] : null;
    if (!target || target.id === user.id) target = user;

    const itemCtx: ItemCombatUseContext = {
      user,
      target,
      action,
      state,
      extra: { round: state.round },
    };

    let result: CombatActionResult;
    try {
      result = routeItem(worldItem as unknown as Item, itemCtx);
    } catch (e) {
      // gm-fallback 抛 NeedsGMFallbackError → 记录 log, 不扣 AP, 让上层 toolcall 调度
      if (e instanceof NeedsGMFallbackError) {
        const log: CombatLogEntry[] = [{
          kind: 'action',
          round: state.round,
          turn: state.turn,
          message: `${user.name} 使用 ${worldItem.name}: ${e.message} (需 GM 裁定)`,
          data: { itemId: action.itemId, effectType: e.effectType, gmFallback: true },
          timestamp: Date.now(),
        }];
        return { log, buffTicks: [], ended: false };
      }
      throw e;
    }

    const log: CombatLogEntry[] = [];

    // 1. apply netDamage (正=伤害, 负=治疗)
    if (result.damage !== undefined && result.damage !== 0) {
      if (result.damage > 0) {
        useCombatStore.getState().applyDamage(target.id, result.damage);
      } else {
        useCombatStore.getState().applyHeal(target.id, -result.damage);
      }
    }

    // 2. apply buffs
    if (result.appliedBuffs) {
      for (const buff of result.appliedBuffs) {
        useCombatStore.getState().addBuff(target.id, buff);
      }
    }

    // 3. apply removed buffs
    if (result.removedBuffs) {
      for (const ref of result.removedBuffs) {
        useCombatStore.getState().removeBuff(target.id, ref);
      }
    }

    // 4. 记 messages
    for (const msg of result.messages) {
      log.push({
        kind: 'action',
        round: state.round,
        turn: state.turn,
        message: msg,
        data: { itemId: action.itemId },
        timestamp: Date.now(),
      });
    }

    // 5. 扣 AP
    useCombatStore.getState().applyAP(user.id, -ACTION_COSTS.item.ap);
    return { log, buffTicks: [], ended: false };
  }

  // ---- flee ----
  private resolveFlee(
    action: Extract<CombatAction, { kind: 'flee' }>,
    ctx: ResolverContext,
    state: ReturnType<typeof useCombatStore.getState>,
  ): TurnResult {
    const user = state.combatants[action.userId];
    if (!user) throw new UnknownCombatantError(action.userId);
    this.checkAP(user, ACTION_COSTS.flee.ap);

    const enemies = Object.values(state.combatants).filter((c) => c.side === 'enemy' && !c.isDead);
    const result = rollFlee(user, enemies, ctx.roll);
    const log: CombatLogEntry[] = [];
    log.push({
      kind: 'action',
      round: state.round,
      turn: state.turn,
      message: `${user.name} 尝试逃跑: 投 ${result.d100} / 阈值 ${Math.round(result.chance * 100)} → ${result.success ? '成功' : '失败'}`,
      data: result,
      timestamp: Date.now(),
    });

    if (result.success) {
      // 标记 isFleeing, 由 CombatEngine.checkEndCondition 触发 'fled' outcome
      const c = state.combatants[user.id];
      useCombatStore.setState((s) => ({
        combatants: { ...s.combatants, [user.id]: { ...c, isFleeing: true } },
      }));
    }

    useCombatStore.getState().applyAP(user.id, -ACTION_COSTS.flee.ap);
    return { log, buffTicks: [], ended: false };
  }

  // ---- defend ----
  private resolveDefend(
    action: Extract<CombatAction, { kind: 'defend' }>,
    _ctx: ResolverContext,
    state: ReturnType<typeof useCombatStore.getState>,
  ): TurnResult {
    const user = state.combatants[action.userId];
    if (!user) throw new UnknownCombatantError(action.userId);
    this.checkAP(user, ACTION_COSTS.defend.ap);

    _ctx.setDefending(user.id, true);
    useCombatStore.getState().applyAP(user.id, -ACTION_COSTS.defend.ap);

    const log: CombatLogEntry[] = [{
      kind: 'action',
      round: state.round,
      turn: state.turn,
      message: `${user.name} 防御 (+${DEFEND_THRESHOLD_BONUS} 命中门槛, 直到被命中或下一回合)`,
      timestamp: Date.now(),
    }];
    return { log, buffTicks: [], ended: false };
  }

  // ---- wait ----
  private resolveWait(
    action: Extract<CombatAction, { kind: 'wait' }>,
    _ctx: ResolverContext,
    state: ReturnType<typeof useCombatStore.getState>,
  ): TurnResult {
    const user = state.combatants[action.userId];
    if (!user) throw new UnknownCombatantError(action.userId);
    // wait 0 AP, 跳过本回合并恢复1点AP
    useCombatStore.getState().applyAP(user.id, 1);
    return {
      log: [{
        kind: 'action',
        round: state.round,
        turn: state.turn,
        message: `${user.name} 休息并恢复1点AP`,
        timestamp: Date.now(),
      }],
      buffTicks: [],
      ended: false,
    };
  }

  // ---- 资源检查 ----
  private checkAP(c: Combatant, required: number): void {
    if (c.ap < required) throw new InsufficientAPError(required, c.ap);
  }

  // ---- 防御标记 turnEnd 时清 (CombatEngine 在 advanceRound 之前调) ----
  clearDefendingFlags(): void {
    this.defending.clear();
  }

  // ---- 调试 ----
  setRoll(roll: RollFn): void { this.roll = roll; }
  setQTE(qte: QTEProvider): void { this.qte = qte; }
}

/** 工厂: 默认配置. */
export function createActionResolver(opts: { roll?: RollFn; qte?: QTEProvider; damageScale?: number } = {}): ActionResolver {
  return new ActionResolver(opts);
}

/** 模块级单例 resolver，跨组件共享 dodgePenalty 状态 */
let _sharedInstance: ActionResolver | null = null;
export function getSharedResolver(): ActionResolver {
  if (!_sharedInstance) _sharedInstance = createActionResolver();
  return _sharedInstance;
}
/** 测试用：重置单例 */
export function _resetSharedResolver(): void {
  _sharedInstance = null;
}

// 抑制 unused 警告 (CombatActionResult / BuffInstance 是 Phase 3 消费)
export type _ReservedResolver = CombatActionResult | BuffInstance;
