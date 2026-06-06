/**
 * v0.4 战斗系统 — BalanceEvaluator 纯函数
 *
 * 职责:
 * - 算 power (玩家+队伍 / 敌队) → powerRatio
 * - 4 档 rating: trivial (<0.6) / normal (0.6-1.2) / hard (1.2-2.0) / deadly (≥2.0)
 * - 给定 rating 生成 FailurePenalty (goldLost + conditions + survives)
 *
 * 设计:
 * - 纯函数: 接收 (player, party, enemies) → BalanceReport
 * - 不修改 store, 不读 useCombatStore.getState
 * - 武器 damage 从 Item.effects[type='damage_bonus'].value 取 (Phase 2 兼容)
 *
 * 详见 spec: docs/superpowers/specs/2026-06-04-v04-combat-system-design.md §7
 */

import type { Combatant } from './types';
import type {
  BalanceRating,
  BalanceReport,
  FailurePenalty,
  FailureSeverity,
} from './types';
import {
  getWeaponDamage,
  getArmorDefense,
  getEquipmentAttributeMods,
} from './ActionResolver';
import type { Item } from '../../types/item';

// ============================================================
// 错误
// ============================================================

export class InvalidCombatantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCombatantError';
  }
}

// ============================================================
// 校验
// ============================================================

/** 6 维范围校验: 1-20 (D&D 标准) */
const ATTR_MIN = 1;
const ATTR_MAX = 20;

/** 校验单个 combatant. 不合法抛 InvalidCombatantError. */
export function validateCombatant(c: Combatant, isEnemy = false): void {
  if (!c.id || typeof c.id !== 'string') {
    throw new InvalidCombatantError(`${c.name} 缺少 id`);
  }
  if (!c.name || typeof c.name !== 'string') {
    throw new InvalidCombatantError(`combatant ${c.id} 缺少 name`);
  }
  if (typeof c.hp !== 'number' || c.hp <= 0) {
    throw new InvalidCombatantError(`${c.name}.hp 必须 > 0: ${c.hp}`);
  }
  if (typeof c.maxHp !== 'number' || c.maxHp < c.hp) {
    throw new InvalidCombatantError(`${c.name}.maxHp 必须 >= hp: maxHp=${c.maxHp}, hp=${c.hp}`);
  }
  if (!c.attributes) {
    throw new InvalidCombatantError(`${c.name} 缺少 attributes`);
  }
  for (const [k, v] of Object.entries(c.attributes)) {
    if (typeof v !== 'number' || v < ATTR_MIN || v > ATTR_MAX) {
      throw new InvalidCombatantError(`${c.name}.attributes.${k} 必须在 [${ATTR_MIN}, ${ATTR_MAX}]: ${v}`);
    }
  }
  if (isEnemy && c.side !== 'enemy') {
    throw new InvalidCombatantError(`敌方 ${c.name} 声明 side='${c.side}' ≠ 'enemy'`);
  }
}

/** HP > 50 时 warn 但不阻断. */
export function hpSanityWarn(c: Combatant): string | null {
  if (c.hp > 50) {
    return `combatant ${c.name} HP 异常高 (${c.hp} > 50), 建议复核`;
  }
  return null;
}

// ============================================================
// Power 公式
// ============================================================

/**
 * combatPower(att) = HP + sum(attribute * 2) + weapon.damage + equipmentSum
 * equipmentSum = sum(getEquipmentAttributeMods(equipped) 各属性)
 */
export function combatPower(c: Combatant): number {
  const attrSum = (c.attributes.STR + c.attributes.DEX + c.attributes.CON
    + c.attributes.INT + c.attributes.WIS + c.attributes.CHA) * 2;
  const weapon = getWeaponDamage(c.equipped?.weapon ?? null);
  const armor = getArmorDefense(c.equipped?.armor ?? null);
  const equipMods = getEquipmentAttributeMods(c.equipped ?? { weapon: null, armor: null, accessory: null });
  const equipSum = (equipMods.STR + equipMods.DEX + equipMods.CON + equipMods.INT + equipMods.WIS + equipMods.CHA);
  return c.hp + attrSum + weapon + armor + equipSum;
}

/** 计算队伍总 power. */
function partyPower(combatants: Combatant[]): number {
  return combatants.reduce((sum, c) => sum + combatPower(c), 0);
}

// ============================================================
// 4 档 rating
// ============================================================

/** powerRatio = enemyPower / (playerPower + partyPower). */
function ratingFromRatio(ratio: number): BalanceRating {
  if (ratio < 0.6) return 'trivial';
  if (ratio < 1.2) return 'normal';
  if (ratio < 2.0) return 'hard';
  return 'deadly';
}

/** 4 档 → FailurePenalty (按 spec §7.3) */
export function failurePenaltyFor(rating: BalanceRating): FailurePenalty {
  switch (rating) {
    case 'trivial':
      return {
        damageTaken: 'none',
        goldLostPercent: 0,
        conditions: [],
        survives: true, // trivial 失败也没事
      };
    case 'normal':
      return {
        damageTaken: 'minor',
        goldLostPercent: 0.1,
        conditions: ['wounded_1'],
        survives: true,
      };
    case 'hard':
      return {
        damageTaken: 'major',
        goldLostPercent: 0.3,
        conditions: ['wounded_2', 'humiliated'],
        survives: true,
      };
    case 'deadly':
      return {
        damageTaken: 'death-narrative',
        goldLostPercent: 0.5,
        conditions: ['wounded_3', 'humiliated', 'perma-wound'],
        survives: true, // 必活, 进入濒死剧情
      };
  }
}

// ============================================================
// 4 档 rating 描述 (UI 用)
// ============================================================

const RATING_DESCRIPTIONS: Record<BalanceRating, string> = {
  trivial: '简单',
  normal: '普通',
  hard: '困难',
  deadly: '致命',
};

const SEVERITY_DESCRIPTIONS: Record<FailureSeverity, string> = {
  none: '无伤',
  minor: '轻伤',
  major: '重伤',
  'death-narrative': '濒死',
};

// ============================================================
// 主入口
// ============================================================

export interface EvaluateOptions {
  /** LLM 建议的难度 (optional hint) */
  recommendedDifficulty?: BalanceRating;
  /** 自定义 power 公式权重 (测试用) */
  powerOverride?: (c: Combatant) => number;
}

export function evaluate(
  player: Combatant,
  party: Combatant[],
  enemies: Combatant[],
  opts: EvaluateOptions = {},
): BalanceReport {
  // 校验
  validateCombatant(player, false);
  for (const p of party) validateCombatant(p, false);
  if (enemies.length === 0) {
    throw new InvalidCombatantError('enemies 列表为空, 无战斗对象');
  }
  for (const e of enemies) validateCombatant(e, true);

  // 算 power
  const powerFn = opts.powerOverride ?? combatPower;
  const playerPower = powerFn(player);
  const allPartyPower = partyPower(party);
  const enemyPower = partyPower(enemies);
  const playerTotal = playerPower + allPartyPower;
  const ratio = enemyPower / playerTotal;

  const rating = ratingFromRatio(ratio);
  const penalty = failurePenaltyFor(rating);

  // suggestedNerfs: 当 LLM 建议 rating 与实际 rating 偏差 ≥ 1 档时给出调整建议
  // RECOMMENDED_RANK = { trivial: 0, normal: 1, hard: 2, deadly: 3 } (越大越难)
  // diff > 0: LLM 期望比实际更难 → 升敌队 power
  // diff < 0: LLM 期望比实际更简单 → 降敌队 power
  const suggestedNerfs: string[] = [];
  if (opts.recommendedDifficulty) {
    const RECOMMENDED_RANK: Record<BalanceRating, number> = { trivial: 0, normal: 1, hard: 2, deadly: 3 };
    const diff = RECOMMENDED_RANK[opts.recommendedDifficulty] - RECOMMENDED_RANK[rating];
    if (Math.abs(diff) >= 1) {
      const adjPct = Math.min(50, 10 * Math.abs(diff));
      if (diff > 0) {
        // LLM 期望更难点 (推荐难度大), 实际更简单 → 升敌队
        suggestedNerfs.push(`敌队 power 升 ${adjPct}%`);
      } else {
        // LLM 期望更简单点, 实际更难 → 降敌队
        suggestedNerfs.push(`敌队 power 降 ${adjPct}%`);
      }
    }
  }

  return {
    rating,
    powerRatio: ratio,
    playerPower,
    enemyPower,
    suggestedNerfs: suggestedNerfs.length > 0 ? suggestedNerfs : undefined,
    failurePenalty: penalty,
  };
}

// ============================================================
// 工具 (UI 渲染 / log 用)
// ============================================================

/** rating 描述 (中文化). */
export function describeRating(rating: BalanceRating): string {
  return RATING_DESCRIPTIONS[rating];
}

/** failure severity 描述 (中文化). */
export function describeSeverity(s: FailureSeverity): string {
  return SEVERITY_DESCRIPTIONS[s];
}

/** 把 failurePenalty 翻译为可读字符串 (log 用). */
export function describePenalty(p: FailurePenalty): string {
  const goldPart = p.goldLostPercent > 0 ? ` -${Math.round(p.goldLostPercent * 100)}% 金币` : '';
  const condPart = p.conditions.length > 0 ? ` ${p.conditions.join(', ')}` : '';
  const survivePart = p.survives ? '' : ' (死亡)';
  return `${describeSeverity(p.damageTaken)}${goldPart}${condPart}${survivePart}`;
}

// 抑制 unused warning (Item 由 power 公式消费)
export type _ReservedBalance = Item;
