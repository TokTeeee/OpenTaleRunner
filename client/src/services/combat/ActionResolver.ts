/**
 * v0.4 战斗系统 — ActionResolver 6 维公式核心
 *
 * 实现 6 种 CombatAction 的本地判定:
 * - attack:  2d6 + STR_mod + weapon.toHit + buffs.STR + qteModifier; 命中后伤害
 * - skill:   同 attack 但叠加技能修正 (skill level * 0.5 + 相关 attribute mod)
 * - item:    委托给 ItemCallbackRouter (Phase 3 接入)
 * - flee:    fleeChance = clamp(0.3 + (DEX_self - DEX_others) / 20, 0.1, 0.9)
 * - defend:  +AC (2), 下回合受伤害 -50%, 消耗 2 AP
 * - wait:    跳过本回合
 *
 * 6 维公式 (spec §7.2 / §9.5):
 *   effectiveAttribute(c, attr) = c.attributes[attr] + sum(buff.modifiers[attr]) + equipmentBonus
 *   toHit = 2d6 + (attacker.STR-10) + weapon.toHit + buffs.STR
 *   dodgeThreshold = 2d6 + (defender.DEX-10) + buffs.DEX + AC
 *   damage = base * (1 + qteModifier * damageScale)
 *   fleeChance = clamp(0.3 + (playerDEX - avgEnemyDEX) / 20, 0.1, 0.9)
 *
 * 设计: RollFn 注入, QTE provider 注入 (Phase 6 接入), 状态变更通过 store
 *
 * 详见: docs/superpowers/specs/2026-06-04-v04-combat-system-design.md §5.3, §7.2, §9.5
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
  DEFEND_AC_BONUS,
  DEFEND_DAMAGE_REDUCTION,
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

export class InsufficientMPError extends Error {
  required: number;
  available: number;
  constructor(required: number, available: number) {
    super(`MP 不足: 需要 ${required}, 实际 ${available}`);
    this.name = 'InsufficientMPError';
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
// AC / 命中 / 闪避 / 伤害
// ============================================================

/** AC = 10 + DEX mod + armor defense + buffs.DEX + defend bonus (本回合内). */
export function computeAC(c: Combatant, defending: boolean): number {
  const dex = effectiveAttribute(c, 'DEX');
  const dexMod = Math.floor((dex - 10) / 2);
  const armor = getArmorDefense(c.equipped.armor);
  const base = 10 + dexMod + armor;
  return defending ? base + DEFEND_AC_BONUS : base;
}

/** 命中投: 2d6 + STR_mod + weapon damage_bonus + 0.5×weapon damage. */
export function rollToHit(attacker: Combatant, roll: RollFn): { d6: [number, number]; strMod: number; weapon: number; total: number } {
  const d6 = [rollD(6, roll), rollD(6, roll)] as [number, number];
  const str = effectiveAttribute(attacker, 'STR');
  const strMod = Math.floor((str - 10) / 2);
  const weapon = Math.floor(getWeaponDamage(attacker.equipped.weapon) / 2);
  return { d6, strMod, weapon, total: d6[0] + d6[1] + strMod + weapon };
}

/** 闪避投: 2d6 + AC (AC 内部已含 DEX_mod, 故 total 不再加). */
export function rollDodge(defender: Combatant, defending: boolean, roll: RollFn): { d6: [number, number]; dexMod: number; ac: number; total: number } {
  const d6 = [rollD(6, roll), rollD(6, roll)] as [number, number];
  const dex = effectiveAttribute(defender, 'DEX');
  const dexMod = Math.floor((dex - 10) / 2);
  const ac = computeAC(defender, defending);
  return { d6, dexMod, ac, total: d6[0] + d6[1] + ac };
}

/** 闪避衰减常量: 每次成功闪避后, 后续闪避判定的门槛提高 5 点. */
export const DODGE_PENALTY_STEP = 5;

/** 伤害: weapon damage + STR mod + qte modifier. */
export function rollDamage(attacker: Combatant, qteModifier: number, damageScale: number, _roll: RollFn): number {
  const str = effectiveAttribute(attacker, 'STR');
  const strMod = Math.floor((str - 10) / 2);
  const weapon = getWeaponDamage(attacker.equipped.weapon);
  const base = Math.max(1, weapon + strMod);
  return Math.max(0, Math.round(base * (1 + qteModifier * damageScale)));
}

/** 闪避成功判定: dodge.total > toHit.total + dodgePenalty. 门槛越高越难闪避. */
export function checkDodge(toHitTotal: number, dodgeTotal: number, dodgePenalty = 0): boolean {
  return dodgeTotal > toHitTotal + dodgePenalty;
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

/** 实际从 settingsStore 读 QTE.enabled, 决定是否调 QTE. v0.4 始终返回 noop (Phase 6 接入). */
export function defaultQTEProvider(): QTEProvider {
  return (params) => {
    try {
      const qte = useSettingsStore.getState().qte;
      if (!qte.enabled) return noopQTEProvider(params);
      // Phase 6 接入: 调 runAttackQTE / runMagicQTE
      // 暂用 noop, Phase 6 替换
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
  skill: { ap: 1, mp: 0 },
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
      case 'skill': return this.resolveSkill(action, ctx, state);
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

    // QTE
    const qteRes = ctx.qte({ action, attacker, target, state });

    // 命中投
    const toHit = rollToHit(attacker, ctx.roll);
    // 闪避投
    const targetDefending = ctx.getDefending(target.id);
    const currentPenalty = this.dodgePenalty.get(target.id) ?? 0;
    const dodge = rollDodge(target, targetDefending, ctx.roll);
    const dodged = checkDodge(toHit.total, dodge.total, currentPenalty);

    log.push({
      kind: 'action',
      round: state.round,
      turn: state.turn,
      message: `${attacker.name} 攻击 ${target.name}: 投 ${toHit.d6[0]}+${toHit.d6[1]}+${toHit.strMod}+${toHit.weapon} = ${toHit.total}`,
      data: { toHit, qte: qteRes },
      timestamp: Date.now(),
    });

    if (dodged) {
      // 闪避成功 → 门槛提高 +5
      const newPenalty = currentPenalty + DODGE_PENALTY_STEP;
      this.dodgePenalty.set(target.id, newPenalty);
      log.push({
        kind: 'action',
        round: state.round,
        turn: state.turn,
        message: `${target.name} 闪避: 投 ${dodge.d6[0]}+${dodge.d6[1]}+${dodge.ac} = ${dodge.total} > ${toHit.total}${currentPenalty > 0 ? `+${currentPenalty}（门槛）` : ''}（门槛 → ${newPenalty}）`,
        data: { dodge, hit: false, dodgePenalty: newPenalty },
        timestamp: Date.now(),
      });
      // 扣 AP
      useCombatStore.getState().applyAP(attacker.id, -ACTION_COSTS.attack.ap);
      return { log, buffTicks: [], ended: false };
    }

    // 命中 → 门槛归零
    if (currentPenalty > 0) {
      this.dodgePenalty.set(target.id, 0);
      log.push({
        kind: 'action',
        round: state.round,
        turn: state.turn,
        message: `${target.name} 闪避失败: 投 ${dodge.d6[0]}+${dodge.d6[1]}+${dodge.ac} = ${dodge.total} ≤ ${toHit.total}+${currentPenalty}（门槛），门槛归零`,
        data: { dodge, hit: true },
        timestamp: Date.now(),
      });
    } else {
      log.push({
        kind: 'action',
        round: state.round,
        turn: state.turn,
        message: `${target.name} 闪避失败: 投 ${dodge.d6[0]}+${dodge.d6[1]}+${dodge.ac} = ${dodge.total} ≤ ${toHit.total}`,
        data: { dodge, hit: true },
        timestamp: Date.now(),
      });
    }

    // 命中 → 算伤害
    const damage = rollDamage(attacker, qteRes.modifier, this.damageScale, ctx.roll);
    useCombatStore.getState().applyDamage(target.id, damage);
    log.push({
      kind: 'action',
      round: state.round,
      turn: state.turn,
      message: `命中! 造成 ${damage} 伤害${qteRes.modifier !== 0 ? ` (QTE ×${(1 + qteRes.modifier * this.damageScale).toFixed(2)})` : ''}`,
      data: { damage, qte: qteRes },
      timestamp: Date.now(),
    });

    // 扣 AP
    useCombatStore.getState().applyAP(attacker.id, -ACTION_COSTS.attack.ap);
    return { log, buffTicks: [], ended: false };
  }

  // ---- skill ----
  private resolveSkill(
    action: Extract<CombatAction, { kind: 'skill' }>,
    ctx: ResolverContext,
    state: ReturnType<typeof useCombatStore.getState>,
  ): TurnResult {
    const user = state.combatants[action.userId];
    if (!user) throw new UnknownCombatantError(action.userId);
    this.checkAP(user, action.cost.ap);
    if (action.cost.mp && user.mp !== undefined) this.checkMP(user, action.cost.mp);

    // v0.4 占位: skill 走 attack 公式 + skill id 标签 (未来 SkillRegistry 接入)
    const target = action.targetId ? state.combatants[action.targetId] : null;
    const qteRes = ctx.qte({ action, attacker: user, target, state });
    const toHit = rollToHit(user, ctx.roll);
    const currentPenalty = target ? (this.dodgePenalty.get(target.id) ?? 0) : 0;
    const dodge = target ? rollDodge(target, ctx.getDefending(target.id), ctx.roll) : null;
    const dodged = dodge ? checkDodge(toHit.total, dodge.total, currentPenalty) : false;

    const log: CombatLogEntry[] = [];
    log.push({
      kind: 'action',
      round: state.round,
      turn: state.turn,
      message: `${user.name} 施放技能 ${action.skillId} → ${target?.name ?? '自己'}`,
      data: { skillId: action.skillId, toHit },
      timestamp: Date.now(),
    });

    if (target && dodged) {
      // 闪避成功 → 累积惩罚 +5
      const newPenalty = currentPenalty + DODGE_PENALTY_STEP;
      this.dodgePenalty.set(target.id, newPenalty);
      log.push({
        kind: 'action',
        round: state.round,
        turn: state.turn,
        message: `${target.name} 闪避了 ${action.skillId}（闪避衰减 → ${newPenalty}）`,
        data: { dodge, dodgePenalty: newPenalty },
        timestamp: Date.now(),
      });
    } else if (target) {
      // 命中 → 闪避惩罚归零
      if (currentPenalty > 0) {
        this.dodgePenalty.set(target.id, 0);
      }
      const damage = rollDamage(user, qteRes.modifier, this.damageScale, ctx.roll);
      useCombatStore.getState().applyDamage(target.id, damage);
      log.push({
        kind: 'action',
        round: state.round,
        turn: state.turn,
        message: `技能命中! 造成 ${damage} 伤害${currentPenalty > 0 ? '，闪避衰减归零' : ''}`,
        data: { damage },
        timestamp: Date.now(),
      });
    }

    useCombatStore.getState().applyAP(user.id, -action.cost.ap);
    if (action.cost.mp && user.mp !== undefined) {
      useCombatStore.getState().applyMP(user.id, -action.cost.mp);
    }
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
      message: `${user.name} 防御 (+${DEFEND_AC_BONUS} AC, 下回合受伤害 -${Math.round(DEFEND_DAMAGE_REDUCTION * 100)}%)`,
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
  private checkMP(c: Combatant, required: number): void {
    if ((c.mp ?? 0) < required) throw new InsufficientMPError(required, c.mp ?? 0);
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
