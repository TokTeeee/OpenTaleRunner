/**
 * v0.4 战斗系统 — v0.3 EffectType → 战斗域分类的兼容映射
 *
 * 背景: v0.3 `ItemEffect.type` 是物品 schema 的物理分类 (11 种),
 * spec 第 8 章用了一组面向战斗域的简化命名 (heal/buff/damage 等).
 * 两者不冲突 — 本表做物理 → 战斗域的映射, 让战斗系统按 v0.3 schema 直接消费既有物品.
 *
 * 战斗域 5 个分类:
 * - 'heal'         → target.hp += value (含 hp_max_bonus 时再加 maxHp)
 * - 'buff'         → 推 BuffInstance, 由 modifiers/value 决定加什么
 * - 'damage'       → 走命中判定 + value 伤害
 * - 'weapon-perm'  → 武器/防具的永久词条, 装备时已 merge 进 combatant, 不走 combatUse
 * - 'gm-fallback'  → 强效果, 战斗中抛 NeedsGMFallbackError 让 handler 调 GM toolcall
 */

import type { EffectType } from '../../types/item';

/** 战斗域逻辑分类 */
export type CombatEffectCategory =
  | 'heal'
  | 'buff'
  | 'damage'
  | 'weapon-perm'
  | 'gm-fallback';

const COMBAT_CATEGORY_MAP: Record<EffectType, CombatEffectCategory> = {
  // 治疗 / 加血 → 战斗域 'heal' (target.hp += value)
  'hp_restore': 'heal',

  // 加 maxHp / vital / 6 维属性 / 元素抗性 / 技能 → 战斗域 'buff' (推 BuffInstance)
  'hp_max_bonus': 'buff',
  'vital_restore': 'buff',
  'attribute_mod': 'buff',
  'elemental_resist': 'buff',
  'skill_bonus': 'buff',

  // 元素伤害 → 战斗域 'damage' (走 hit 判定, 伤害 = value)
  'elemental_damage': 'damage',

  // 武器 / 护甲 / 饰品永久词条 → 已 merge 进 combatant, 不走 combatUse
  'damage_bonus': 'weapon-perm',
  'defense_bonus': 'weapon-perm',

  // 光源 / 特殊效果 → 战斗域不直接处理, fallback GM toolcall
  'light_source': 'gm-fallback',
  'special': 'gm-fallback',

  // v0.4-item 词条池扩展 — 战斗域归类
  // 数值型增减益 (属性/速度/反伤/临时 buff/清除) → 'buff' (推 BuffInstance)
  'critical': 'buff',
  'attack_speed': 'buff',
  'hp_steal': 'buff',
  'damage_reflect': 'buff',
  'temp_attack': 'buff',
  'cleanse': 'buff',
  'brittle': 'buff',
  'heavy': 'buff',
  'fragile': 'buff',
  'greedy': 'buff',
  // 状态类 (中毒/昏睡/诅咒) → 强效果, fallback GM 裁定
  'poison': 'gm-fallback',
  'drowsy': 'gm-fallback',
  'cursed': 'gm-fallback',
};

/** 把 v0.3 EffectType 映射到战斗域分类. 未知 type 走 gm-fallback 兜底. */
export function toCombatCategory(effectType: string | null | undefined): CombatEffectCategory {
  if (!effectType) return 'gm-fallback';
  return COMBAT_CATEGORY_MAP[effectType as EffectType] ?? 'gm-fallback';
}

/** 是否需要 fallback GM toolcall */
export function isGMFallback(effectType: string | null | undefined): boolean {
  return toCombatCategory(effectType) === 'gm-fallback';
}

/** 是否是装备永久词条 (已 merge, 不走 combatUse) */
export function isWeaponPermanent(effectType: string | null | undefined): boolean {
  return toCombatCategory(effectType) === 'weapon-perm';
}

/** 是否走默认 combat mapping (heal / buff / damage) */
export function hasDefaultMapping(effectType: string | null | undefined): boolean {
  const cat = toCombatCategory(effectType);
  return cat === 'heal' || cat === 'buff' || cat === 'damage';
}

/** CombatEffectCategory 人类可读 label (UI 提示用) */
export const COMBAT_CATEGORY_LABELS: Record<CombatEffectCategory, string> = {
  'heal': '治疗',
  'buff': '增益/减益',
  'damage': '伤害',
  'weapon-perm': '武器永久词条',
  'gm-fallback': '需 GM 裁定',
};
