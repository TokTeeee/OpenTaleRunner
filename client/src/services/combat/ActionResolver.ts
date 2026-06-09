/**
 * v0.6.x 战斗系统 — ActionResolver 5 维公式 + ability 解析核心
 *
 * 历史变更:
 * - v0.5-dev: 移除 `skill` 动作 (无 SkillRegistry, 先隐藏); 命中/伤害公式采用文档版
 *   (d20 + DEX_mod vs 10 + DEX_mod + defense + dodgePenalty;
 *    max(1, d6 + STR_mod + weapon - target.defense) * QTE 缩放);
 *   闪避衰减: defender 每次成功闪避 +DODGE_PENALTY_STEP, 被命中则重置.
 * - v0.6.2: 新增 `ability` 动作 (魔法/祷告/战技, 3 学派 16 能力);
 *   伤害公式补 8 元素抗性 (fire/ice/lightning/wind/earth/arcane/holy/shadow):
 *   `final = base * (1 - resistance/100)`, clamp 到 [0, base];
 *   MP 消耗走 ability.mpCost, MP 不足抛 InsufficientMPError;
 *   resolveAbility 走 AbilityResolver 拿 damage/heal/effect 副作用,
 *   再走 applyResistance + applyDamage 链路, 事件 ABILITY_USED.
 *   闪避衰减修正: dodgePenalty 从门槛中扣除 (连续闪避使门槛降低, 后续更易被命中),
 *   门槛下限 5 (保底命中).
 *
 * 实现 6 种 CombatAction 的本地判定:
 * - attack:  d20 + DEX_mod vs threshold; 命中后 d6 + STR_mod + weapon - defense
 * - item:    委托给 ItemCallbackRouter
 * - flee:    fleeChance = clamp(0.3 + (DEX_self - DEX_others) / 20, 0.1, 0.9)
 * - defend:  本回合 defending=true → 命中门槛 +2; 消耗 1 AP
 * - wait:    跳过本回合, 恢复 1 AP (受 maxAp clamp)
 * - ability: 解析 ability → applyResistance → applyDamage/applyHeal/applyEffect
 *            → 扣 MP → emit ABILITY_USED
 *
 * 公式 (v0.6.x 沿用 v0.5 文档版):
 *   effectiveAttribute(c, attr) = c.attributes[attr] + sum(buff.modifiers[attr]) + equipmentBonus
 *   toHit      = d20 + floor((DEX_attacker - 10) / 2)
 *   threshold  = max(5, 10 + floor((DEX_defender - 10) / 2) + defense - dodgePenalty + (defending ? 2 : 0))
 *   hit        = toHit >= threshold (平局算命中)
 *   damage     = round( max(1, d6 + floor((STR_attacker - 10) / 2) + weapon - defense) * (1 + qte * scale) )
 *   fleeChance = clamp(0.3 + (playerDEX - avgEnemyDEX) / 20, 0.1, 0.9)
 *   abilityDmg = round( abilityBase * (1 - target.elementalResistances[element] / 200) )
 *   abilityCost = ability.apCost (AP) + ability.mpCost (MP)
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
import { eventBus } from '../event/EventBus';
import { EVENTS } from '../event/events';
import type { Ability } from '../../types/ability';
import { getAbility } from '../../data/abilities';
import { applySpecial, applyResistance, parseDiceFormula } from '../abilities/abilityUtils';
import { ELEMENT_LABELS } from '../../types/ability';
import type { ElementalResistances } from '../../types/character';

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

/** 从装备效果汇总元素抗性 (elemental_resist 词条). */
export function getEquipmentResistances(
  equipped: Combatant['equipped'],
): Partial<ElementalResistances> {
  const result: Partial<ElementalResistances> = {};
  const slots = [equipped.weapon, equipped.armor, equipped.accessory];
  for (const item of slots) {
    if (!item?.effects) continue;
    for (const eff of item.effects) {
      if (eff.type === 'elemental_resist' && typeof eff.value === 'object' && eff.value !== null) {
        const v = eff.value as Record<string, unknown>;
        for (const [element, val] of Object.entries(v)) {
          if (typeof val === 'number') {
            result[element as keyof ElementalResistances] =
              (result[element as keyof ElementalResistances] ?? 0) + val;
          }
        }
      }
    }
  }
  return result;
}

/** 从装备效果汇总 MP 加成 (mp_bonus 词条). */
export function getEquipmentMPBonus(equipped: Combatant['equipped']): number {
  let bonus = 0;
  const slots = [equipped.weapon, equipped.armor, equipped.accessory];
  for (const item of slots) {
    if (!item?.effects) continue;
    for (const eff of item.effects) {
      if (eff.type === 'mp_bonus' && typeof eff.value === 'number') {
        bonus += eff.value;
      }
    }
  }
  return bonus;
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

/** 命中门槛: 10 + DEX_mod + 装备 defense - 闪避衰减 + (defending ? 2 : 0).
 *  闪避衰减 (dodgePenalty) 从门槛中扣除: 连续闪避成功后门槛降低, 后续更易被命中.
 */
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
    total: Math.max(5, 10 + dexMod + defense - dodgePenalty + defendingBonus),
  };
}

/** 命中判定: attackRoll >= threshold. 平局算命中. */
export function checkHit(attackRoll: number, threshold: number): boolean {
  return attackRoll >= threshold;
}

/** 闪避衰减常量: 每次成功闪避后, 该 defender 后续的命中门槛 -DODGE_PENALTY_STEP (使连续闪避更难). */
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
      // v0.6.2: 释放 ability (魔法/祷告/战技), Task 13 完整实现
      case 'ability': return this.resolveAbility(action, ctx, state);
    }
  }

  // ---- ability (v0.6.2 完整实现) ----
  private resolveAbility(
    action: Extract<CombatAction, { kind: 'ability' }>,
    ctx: ResolverContext,
    state: ReturnType<typeof useCombatStore.getState>,
  ): TurnResult {
    const log: CombatLogEntry[] = [];
    const ts = Date.now();
    let emitted = false;

    const emit = (extra: { success: boolean; damage?: number; heal?: number; targetId?: string | null }) => {
      if (emitted) return;
      emitted = true;
      const ability = getAbility(action.abilityId);
      eventBus.emit(EVENTS.ABILITY_USED, {
        abilityId: action.abilityId,
        userId: action.userId,
        targetId: action.targetId ?? null,
        school: ability?.school ?? null,
        element: ability?.element ?? null,
        ...extra,
      });
    };

    const attacker = state.combatants[action.userId];
    if (!attacker) {
      log.push({ kind: 'action', round: state.round, turn: state.turn, message: `[错误] 未知施法者 ${action.userId}`, timestamp: ts });
      return { log, buffTicks: [], ended: false };
    }
    if (attacker.isDead) {
      log.push({ kind: 'action', round: state.round, turn: state.turn, message: `无效施法 (${attacker.name} 已死亡)`, timestamp: ts });
      return { log, buffTicks: [], ended: false };
    }

    const ability = getAbility(action.abilityId);
    if (!ability) {
      log.push({ kind: 'action', round: state.round, turn: state.turn, message: `[错误] 未知 ability ${action.abilityId}`, timestamp: ts });
      return { log, buffTicks: [], ended: false };
    }

    // 资源检查: AP, MP
    this.checkAP(attacker, ability.cost.ap);
    this.checkMP(attacker, ability.cost.mp);

    // 目标解析
    const target = this.resolveAbilityTarget(attacker, action.targetId, ability, state);
    if (target === 'invalid') {
      log.push({ kind: 'action', round: state.round, turn: state.turn, message: `[错误] 目标选择无效 (${ability.name})`, timestamp: ts });
      return { log, buffTicks: [], ended: false };
    }

    // 释放日志
    log.push({
      kind: 'action',
      round: state.round, turn: state.turn,
      message: `${attacker.name} 释放 ${ability.name} (${ability.school})`,
      data: { abilityId: ability.id, school: ability.school, element: ability.element },
      timestamp: ts,
    });
    // 叙事 hook: 把 ability.description.narrative 注入日志 (供战斗描述系统用)
    if (ability.description?.narrative) {
      log.push({
        kind: 'action',
        round: state.round, turn: state.turn,
        message: ability.description.narrative,
        data: { abilityId: ability.id, narrative: true },
        timestamp: ts,
      });
    }

    // 自目标 buff (无需命中)
    if (ability.target === 'self' && ability.effect.applyBuff) {
      this.applyAbilityBuff(attacker, ability, ts, log, state);
      emit({ success: true, targetId: attacker.id });
    }
    // 治疗 (无需命中)
    if (ability.effect.isHeal && target && typeof target === 'object') {
      const healAmount = this.computeAbilityMagnitude(attacker, ability, ctx.roll, state.round);
      log.push({
        kind: 'action', round: state.round, turn: state.turn,
        message: `  治疗计算: ${healAmount}`,
        timestamp: ts,
      });
      const targetHpBefore = target.hp;
      useCombatStore.getState().applyHeal(target.id, healAmount);
      log.push({
        kind: 'action', round: state.round, turn: state.turn,
        message: `  ${target.name} 恢复 ${healAmount} HP (${targetHpBefore}→${Math.min(target.maxHp, targetHpBefore + healAmount)})`,
        data: { heal: healAmount }, timestamp: ts,
      });
      emit({ success: true, heal: healAmount, targetId: target.id });
    }
    // 友军 buff
    if (ability.target === 'ally' && ability.effect.applyBuff && target && typeof target === 'object') {
      this.applyAbilityBuff(target, ability, ts, log, state);
      emit({ success: true, targetId: target.id });
    }
    // 伤害 (需命中) — resolveAbilityDamage 内部 emit COMBAT_HIT/KILL; 此处也 emit ABILITY_USED
    if (!ability.effect.isHeal && ability.effect.damageDice !== '0' && target && typeof target === 'object') {
      const result = this.resolveAbilityDamage(attacker, target, ability, ctx, state, log, ts);
      emit({ success: result.hit, damage: result.damage, targetId: target.id });
    }

    // 扣资源
    useCombatStore.getState().applyAP(attacker.id, -ability.cost.ap);
    if (ability.cost.mp > 0) {
      useCombatStore.getState().applyMP(attacker.id, -ability.cost.mp);
    }
    return { log, buffTicks: [], ended: false };
  }

  private resolveAbilityTarget(
    attacker: Combatant,
    targetId: string | undefined,
    ability: Ability,
    state: ReturnType<typeof useCombatStore.getState>,
  ): Combatant | 'invalid' {
    if (ability.target === 'self') return attacker;
    if (!targetId) return 'invalid';
    const t = state.combatants[targetId];
    if (!t) return 'invalid';
    if (ability.target === 'enemy' && t.side === 'enemy') return t;
    if (ability.target === 'ally' && (t.side === 'player' || t.side === 'ally')) return t;
    if (ability.target === 'all_enemies' || ability.target === 'all_allies') {
      // v0.6.2 简化为单体 (用户原意 "AOE 推迟")
      return t;
    }
    return 'invalid';
  }

  private computeAbilityMagnitude(
    attacker: Combatant,
    ability: Ability,
    roll: RollFn,
    _round: number,
  ): number {
    const { total } = parseDiceFormula(ability.effect.damageDice, roll);
    const attrValue = effectiveAttribute(attacker, ability.effect.attributeScale);
    const attrMod = Math.floor((attrValue - 10) / 2);
    return Math.max(0, total + attrMod);
  }

  private applyAbilityBuff(
    target: Combatant,
    ability: Ability,
    ts: number,
    log: CombatLogEntry[],
    state: ReturnType<typeof useCombatStore.getState>,
  ): void {
    const ref = ability.effect.applyBuff;
    if (!ref) return;
    const modifiers: Partial<Attributes> =
      ref.ref === 'blessing' ? { DEX: 2 } :
      ref.ref === 'fortitude' ? { DEX: 1 } :
      ref.ref === 'arcane_ward' ? { DEX: 0, CON: 2 } :
      {};
    useCombatStore.getState().addBuff(target.id, {
      ref: ref.ref,
      stacks: ref.stacks,
      remainingTurns: ref.turns,
      source: target.id,
      appliedAtTurn: state.turn,
      modifiers,
    });
    log.push({
      kind: 'action', round: state.round, turn: state.turn,
      message: `${target.name} 获得 buff: ${ref.ref} (${ref.turns} 回合)`,
      data: { buffRef: ref.ref, turns: ref.turns },
      timestamp: ts,
    });
  }

  private resolveAbilityDamage(
    attacker: Combatant,
    target: Combatant,
    ability: Ability,
    ctx: ResolverContext,
    state: ReturnType<typeof useCombatStore.getState>,
    log: CombatLogEntry[],
    ts: number,
  ): { hit: boolean; damage: number } {
    // 步骤1: 命中判定
    const toHit = rollToHit(attacker, ctx.roll);
    const dodgePenalty = this.dodgePenalty.get(target.id) ?? 0;
    const defending = ctx.getDefending(target.id);
    const threshold = hitThreshold(target, dodgePenalty, defending);
    const hit = checkHit(toHit.total, threshold.total);
    log.push({
      kind: 'action', round: state.round, turn: state.turn,
      message: `${ability.name}: 命中判定 d20=${toHit.d20}+${toHit.dexMod}=${toHit.total} vs 门槛${threshold.total}`,
      data: { toHit, threshold, abilityId: ability.id },
      timestamp: ts,
    });
    log.push({
      kind: 'action', round: state.round, turn: state.turn,
      message: `  门槛构成: 10+DEX${threshold.dexMod >= 0 ? '+' : ''}${threshold.dexMod}+防${threshold.defense}${threshold.dodgePenalty > 0 ? `-衰减${threshold.dodgePenalty}` : ''}${threshold.defendingBonus ? `+防御${threshold.defendingBonus}` : ''}=${threshold.total}`,
      timestamp: ts,
    });
    if (!hit) {
      const newPenalty = dodgePenalty + DODGE_PENALTY_STEP;
      this.dodgePenalty.set(target.id, newPenalty);
      log.push({
        kind: 'action', round: state.round, turn: state.turn,
        message: `${target.name} 闪避了 ${ability.name}! (闪避衰减 ${dodgePenalty}→${newPenalty}, 后续门槛降低)`,
        timestamp: ts,
      });
      return { hit: false, damage: 0 };
    }
    if (dodgePenalty > 0) {
      this.dodgePenalty.set(target.id, 0);
      log.push({
        kind: 'action', round: state.round, turn: state.turn,
        message: `${target.name} 被命中, 闪避衰减 ${dodgePenalty} 归零`,
        timestamp: ts,
      });
    }

    // 步骤2: 基础伤害计算
    const qteRes = ctx.qte({ action: { kind: 'ability', userId: attacker.id, abilityId: ability.id, targetId: target.id }, attacker, target, state });
    const baseAmount = this.computeAbilityMagnitude(attacker, ability, ctx.roll, state.round);
    log.push({
      kind: 'action', round: state.round, turn: state.turn,
      message: `  基础伤害: ${baseAmount}`,
      timestamp: ts,
    });

    // 步骤3: 穿甲计算
    const targetDefense = getArmorDefense(target.equipped.armor);
    const effectiveDefense = ability.effect.special === 'armor_pierce' ? Math.floor(targetDefense / 2) : targetDefense;
    const preResistance = Math.max(1, baseAmount - effectiveDefense);
    if (effectiveDefense > 0) {
      log.push({
        kind: 'action', round: state.round, turn: state.turn,
        message: `  穿甲: ${baseAmount}-防${effectiveDefense}${ability.effect.special === 'armor_pierce' ? '(半减)' : ''}=${preResistance}`,
        timestamp: ts,
      });
    }

    // 步骤4: 元素抗性计算
    const element = ability.effect.element;
    const resistanceValue = element ? (target.elementalResistances[element] ?? 0) : 0;
    const postResistance = applyResistance(preResistance, element, target.elementalResistances);
    if (resistanceValue !== 0 && element) {
      const reduction = preResistance - postResistance;
      log.push({
        kind: 'action', round: state.round, turn: state.turn,
        message: `  抗性: ${preResistance}×(1-${resistanceValue}/100) ${resistanceValue > 0 ? `-${reduction}` : `+${Math.abs(reduction)}`}${resistanceValue > 0 ? '(抗性减免)' : '(弱点增伤)'}=${postResistance}`,
        timestamp: ts,
      });
    }

    // 步骤5: 战技特效 + QTE
    const specialResult = applySpecial(ability.effect.special, postResistance, attacker, target, state.turn);
    const finalDamage = Math.max(0, Math.round(specialResult.damage * (1 + qteRes.modifier * this.damageScale)));
    log.push({
      kind: 'action', round: state.round, turn: state.turn,
      message: `  最终伤害: ${postResistance}${qteRes.modifier !== 0 ? ` ×QTE${(1 + qteRes.modifier * this.damageScale).toFixed(2)}` : ''}=${finalDamage}`,
      data: { baseAmount, preResistance, postResistance, finalDamage, qte: qteRes },
      timestamp: ts,
    });

    // 步骤6: 实际生效
    const targetHpBefore = target.hp;
    useCombatStore.getState().applyDamage(target.id, finalDamage);
    log.push({
      kind: 'action', round: state.round, turn: state.turn,
      message: `  ${target.name} 受到 ${finalDamage} ${element ? `${ELEMENT_LABELS[element]}` : ''}伤害 (HP ${targetHpBefore}→${targetHpBefore - finalDamage})`,
      timestamp: ts,
    });
    // 附加 special log
    for (const extra of specialResult.extra) {
      log.push({ kind: 'action', round: state.round, turn: state.turn, message: `  ${extra}`, timestamp: ts });
    }
    // 广播
    eventBus.emit(EVENTS.COMBAT_HIT, { attackerId: attacker.id, targetId: target.id, damage: finalDamage, isCrit: qteRes.modifier > 0 });
    if (target.hp - finalDamage <= 0) {
      eventBus.emit(EVENTS.COMBAT_KILL, { killerId: attacker.id, targetId: target.id, targetName: target.name });
    }
    return { hit: true, damage: finalDamage };
  }

  private checkMP(c: Combatant, required: number): void {
    if (required === 0) return;
    const available = c.mp ?? 0;
    if (available < required) {
      throw new Error(`MP 不足: 需要 ${required}, 实际 ${available}`);
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

    // 步骤1: 命中判定
    log.push({
      kind: 'action',
      round: state.round,
      turn: state.turn,
      message: `${attacker.name} 攻击 ${target.name}: 命中判定 d20=${toHit.d20}+${toHit.dexMod}=${toHit.total} vs 门槛${threshold.total}`,
      data: { toHit, threshold, qte: qteRes },
      timestamp: Date.now(),
    });
    // 门槛构成明细
    log.push({
      kind: 'action',
      round: state.round,
      turn: state.turn,
      message: `  门槛构成: 10+DEX${threshold.dexMod >= 0 ? '+' : ''}${threshold.dexMod}+防${threshold.defense}${threshold.dodgePenalty > 0 ? `-衰减${threshold.dodgePenalty}` : ''}${threshold.defendingBonus ? `+防御${threshold.defendingBonus}` : ''}=${threshold.total}`,
      timestamp: Date.now(),
    });

    if (!hit) {
      // 闪避成功 → defender 后续门槛 -DODGE_PENALTY_STEP (使连续闪避更难)
      const newPenalty = currentPenalty + DODGE_PENALTY_STEP;
      this.dodgePenalty.set(target.id, newPenalty);
      log.push({
        kind: 'action',
        round: state.round,
        turn: state.turn,
        message: `${target.name} 闪避成功! (闪避衰减 ${currentPenalty}→${newPenalty}, 后续门槛降低)`,
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

    // 步骤2: 伤害计算
    const damage = rollDamage(attacker, target, qteRes.modifier, this.damageScale, ctx.roll);
    log.push({
      kind: 'action',
      round: state.round,
      turn: state.turn,
      message: `  伤害计算: d6=${damage.d6}+STR${damage.strMod >= 0 ? '+' : ''}${damage.strMod}+武器${damage.weapon}-防${damage.defense}=${damage.base}${qteRes.modifier !== 0 ? ` ×QTE${(1 + qteRes.modifier * this.damageScale).toFixed(2)}` : ''}=${damage.total}`,
      data: { damage, qte: qteRes },
      timestamp: Date.now(),
    });

    // 步骤3: 实际生效
    const targetHpBefore = target.hp;
    useCombatStore.getState().applyDamage(target.id, damage.total);
    log.push({
      kind: 'action',
      round: state.round,
      turn: state.turn,
      message: `  ${target.name} 受到 ${damage.total} 伤害 (HP ${targetHpBefore}→${targetHpBefore - damage.total})`,
      timestamp: Date.now(),
    });
    // v0.5.1: 广播 combat.hit 给 EXP 授权 hook
    eventBus.emit(EVENTS.COMBAT_HIT, { attackerId: attacker.id, targetId: target.id, damage: damage.total, isCrit: qteRes.modifier > 0 });
    if (targetHpBefore - damage.total <= 0) {
      // v0.5.1: 击杀广播
      eventBus.emit(EVENTS.COMBAT_KILL, { killerId: attacker.id, targetId: target.id, targetName: target.name });
    }

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
