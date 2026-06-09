/**
 * 物品词条池 — 数据层 (纯常量)
 *
 * 修改池子数据不需要改任何逻辑, 改代码即重平衡.
 * 详细见 spec: docs/superpowers/specs/2026-06-05-item-affix-pool-design.md
 */
import type { ItemEffect, ItemQuality } from '../types/item';

// ============================================================
// 词条模板: 池子的最小单位
// ============================================================
export interface Affix {
  /** 抽取权重, 数值越大越常见. 例如 锋利=8, 吸血=3, 神器=1 */
  readonly weight: number;
  /** 物品质量门槛: 物品质量 ≥ minQuality 才会被纳入候选 */
  readonly minQuality: ItemQuality;
  /** 实际词条, 复用现有 ItemEffect 结构 */
  readonly effect: ItemEffect;
  /** 可选: 仅当物品 subCategory 匹配时才纳入候选 */
  readonly minSubCategory?: string;
}

// ============================================================
// 池子: 4 个主品类 × 增益/减益 二分
// ============================================================
export type AffixPoolKey = 'weapon' | 'armor' | 'accessory' | 'consumable';

export interface AffixPools {
  readonly buffs: readonly Affix[];
  readonly debuffs: readonly Affix[];
}

// ============================================================
// 武器池 (5 buff + 3 debuff = 8)
// ============================================================
const WEAPON_BUFFS: readonly Affix[] = [
  { weight: 8, minQuality: '普通', effect: { id: 'wpn_dmg_1', type: 'damage_bonus', value: 5, description: '+5 攻击' } },
  { weight: 4, minQuality: '精良', effect: { id: 'wpn_crit_1', type: 'critical', value: 10, description: '暴击率 +10%' } },
  // 8 元素伤害
  { weight: 4, minQuality: '精良', effect: { id: 'wpn_elem_fire_1', type: 'elemental_damage', value: { fire: 3 }, description: '附加 3 点火属性' } },
  { weight: 4, minQuality: '精良', effect: { id: 'wpn_elem_ice_1', type: 'elemental_damage', value: { ice: 3 }, description: '附加 3 点冰属性' } },
  { weight: 3, minQuality: '精良', effect: { id: 'wpn_elem_lightning_1', type: 'elemental_damage', value: { lightning: 3 }, description: '附加 3 点雷属性' } },
  { weight: 3, minQuality: '精良', effect: { id: 'wpn_elem_wind_1', type: 'elemental_damage', value: { wind: 3 }, description: '附加 3 点风属性' } },
  { weight: 2, minQuality: '精良', effect: { id: 'wpn_elem_earth_1', type: 'elemental_damage', value: { earth: 3 }, description: '附加 3 点地属性' } },
  { weight: 2, minQuality: '稀有', effect: { id: 'wpn_elem_arcane_1', type: 'elemental_damage', value: { arcane: 3 }, description: '附加 3 点奥属性' } },
  { weight: 2, minQuality: '稀有', effect: { id: 'wpn_elem_holy_1', type: 'elemental_damage', value: { holy: 3 }, description: '附加 3 点圣属性' } },
  { weight: 2, minQuality: '稀有', effect: { id: 'wpn_elem_shadow_1', type: 'elemental_damage', value: { shadow: 3 }, description: '附加 3 点暗属性' } },
  { weight: 3, minQuality: '稀有', effect: { id: 'wpn_spd_1', type: 'attack_speed', value: 1, description: '攻速 +1' } },
  { weight: 2, minQuality: '史诗', effect: { id: 'wpn_steal_1', type: 'hp_steal', value: 2, description: '击杀回 2 HP' } },
  // v0.6.3: 法杖专属词条
  { weight: 5, minQuality: '精良', minSubCategory: 'staff', effect: { id: 'staff_int_1', type: 'attribute_mod', value: { INT: 2 }, description: 'INT +2' } },
  { weight: 4, minQuality: '精良', minSubCategory: 'staff', effect: { id: 'staff_mp_1', type: 'mp_bonus', value: 10, description: 'MP +10' } },
  { weight: 3, minQuality: '稀有', minSubCategory: 'staff', effect: { id: 'staff_elem_fire', type: 'elemental_damage', value: { fire: 5 }, description: '附加 5 点火属性' } },
  { weight: 3, minQuality: '稀有', minSubCategory: 'staff', effect: { id: 'staff_elem_ice', type: 'elemental_damage', value: { ice: 5 }, description: '附加 5 点冰属性' } },
  { weight: 2, minQuality: '稀有', minSubCategory: 'staff', effect: { id: 'staff_elem_arcane', type: 'elemental_damage', value: { arcane: 5 }, description: '附加 5 点奥术属性' } },
  // v0.6.3: 圣印记专属词条
  { weight: 5, minQuality: '精良', minSubCategory: 'holy_symbol', effect: { id: 'symbol_wis_1', type: 'attribute_mod', value: { WIS: 2 }, description: 'WIS +2' } },
  { weight: 4, minQuality: '精良', minSubCategory: 'holy_symbol', effect: { id: 'symbol_mp_1', type: 'mp_bonus', value: 10, description: 'MP +10' } },
  { weight: 3, minQuality: '稀有', minSubCategory: 'holy_symbol', effect: { id: 'symbol_elem_holy', type: 'elemental_damage', value: { holy: 5 }, description: '附加 5 点神圣属性' } },
  { weight: 2, minQuality: '稀有', minSubCategory: 'holy_symbol', effect: { id: 'symbol_elem_shadow', type: 'elemental_damage', value: { shadow: 5 }, description: '附加 5 点暗影属性' } },
];
const WEAPON_DEBUFFS: readonly Affix[] = [
  { weight: 5, minQuality: '普通', effect: { id: 'wpn_brit_1', type: 'brittle', value: 10, description: '受击伤害 +10%' } },
  { weight: 4, minQuality: '精良', effect: { id: 'wpn_heavy_1', type: 'heavy', value: 10, description: '移动速度 -10%' } },
  { weight: 1, minQuality: '传说', effect: { id: 'wpn_cursed_1', type: 'cursed', value: 1, description: '装备者每日掉 1 HP' } },
];

// ============================================================
// 防具池 (4 buff + 2 debuff = 6)
// ============================================================
const ARMOR_BUFFS: readonly Affix[] = [
  { weight: 8, minQuality: '普通', effect: { id: 'arm_def_1', type: 'defense_bonus', value: 3, description: '+3 防御' } },
  { weight: 5, minQuality: '精良', effect: { id: 'arm_hp_1', type: 'hp_max_bonus', value: 10, description: '最大 HP +10' } },
  // 8 元素单抗 (精良)
  { weight: 4, minQuality: '精良', effect: { id: 'arm_resist_fire_1', type: 'elemental_resist', value: { fire: 20 }, description: '火抗 +20%' } },
  { weight: 4, minQuality: '精良', effect: { id: 'arm_resist_ice_1', type: 'elemental_resist', value: { ice: 20 }, description: '冰抗 +20%' } },
  { weight: 4, minQuality: '精良', effect: { id: 'arm_resist_lightning_1', type: 'elemental_resist', value: { lightning: 20 }, description: '雷抗 +20%' } },
  { weight: 3, minQuality: '精良', effect: { id: 'arm_resist_wind_1', type: 'elemental_resist', value: { wind: 20 }, description: '风抗 +20%' } },
  { weight: 3, minQuality: '精良', effect: { id: 'arm_resist_earth_1', type: 'elemental_resist', value: { earth: 20 }, description: '地抗 +20%' } },
  { weight: 2, minQuality: '精良', effect: { id: 'arm_resist_arcane_1', type: 'elemental_resist', value: { arcane: 20 }, description: '奥抗 +20%' } },
  { weight: 2, minQuality: '精良', effect: { id: 'arm_resist_holy_1', type: 'elemental_resist', value: { holy: 20 }, description: '圣抗 +20%' } },
  { weight: 2, minQuality: '精良', effect: { id: 'arm_resist_shadow_1', type: 'elemental_resist', value: { shadow: 20 }, description: '暗抗 +20%' } },
  // 稀有双抗
  { weight: 2, minQuality: '稀有', effect: { id: 'arm_resist_fire_2', type: 'elemental_resist', value: { fire: 40 }, description: '火抗 +40%' } },
  { weight: 2, minQuality: '稀有', effect: { id: 'arm_resist_ice_2', type: 'elemental_resist', value: { ice: 40 }, description: '冰抗 +40%' } },
  { weight: 2, minQuality: '稀有', effect: { id: 'arm_resist_lightning_2', type: 'elemental_resist', value: { lightning: 40 }, description: '雷抗 +40%' } },
  // 全抗 (史诗)
  { weight: 1, minQuality: '史诗', effect: { id: 'arm_resist_all_1', type: 'elemental_resist', value: { fire: 10, ice: 10, lightning: 10, wind: 10, earth: 10, arcane: 10, holy: 10, shadow: 10 }, description: '全抗 +10%' } },
  { weight: 2, minQuality: '稀有', effect: { id: 'arm_reflect_1', type: 'damage_reflect', value: 10, description: '反伤 10%' } },
];
const ARMOR_DEBUFFS: readonly Affix[] = [
  { weight: 5, minQuality: '普通', effect: { id: 'arm_heavy_1', type: 'heavy', value: 5, description: '移动 -5%' } },
  { weight: 3, minQuality: '精良', effect: { id: 'arm_brit_1', type: 'brittle', value: 15, description: '被暴击伤害 +15%' } },
];

// ============================================================
// 饰品池 (4 buff + 2 debuff = 6)
// ============================================================
const ACCESSORY_BUFFS: readonly Affix[] = [
  { weight: 7, minQuality: '普通', effect: { id: 'acc_attr_1', type: 'attribute_mod', value: { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 }, description: '全属性 +1' } },
  { weight: 5, minQuality: '精良', effect: { id: 'acc_skill_1', type: 'skill_bonus', value: 2, description: '某技能 +2' } },
  { weight: 4, minQuality: '精良', effect: { id: 'acc_hp_1', type: 'hp_restore', value: 1, description: '每回合回 1 HP' } },
  { weight: 3, minQuality: '普通', effect: { id: 'acc_light_1', type: 'light_source', value: 5, description: '照亮周围 5 米' } },
  // 抗性词条
  { weight: 3, minQuality: '精良', effect: { id: 'acc_resist_fire_1', type: 'elemental_resist', value: { fire: 15 }, description: '火抗 +15%' } },
  { weight: 3, minQuality: '精良', effect: { id: 'acc_resist_ice_1', type: 'elemental_resist', value: { ice: 15 }, description: '冰抗 +15%' } },
  { weight: 3, minQuality: '精良', effect: { id: 'acc_resist_lightning_1', type: 'elemental_resist', value: { lightning: 15 }, description: '雷抗 +15%' } },
  { weight: 2, minQuality: '稀有', effect: { id: 'acc_resist_holy_1', type: 'elemental_resist', value: { holy: 15 }, description: '圣抗 +15%' } },
  { weight: 2, minQuality: '稀有', effect: { id: 'acc_resist_shadow_1', type: 'elemental_resist', value: { shadow: 15 }, description: '暗抗 +15%' } },
  { weight: 1, minQuality: '传说', effect: { id: 'acc_resist_all_1', type: 'elemental_resist', value: { fire: 10, ice: 10, lightning: 10, wind: 10, earth: 10, arcane: 10, holy: 10, shadow: 10 }, description: '全抗 +10%' } },
];
const ACCESSORY_DEBUFFS: readonly Affix[] = [
  { weight: 4, minQuality: '精良', effect: { id: 'acc_fragile_1', type: 'fragile', value: 5, description: 'HP 上限 -5' } },
  { weight: 2, minQuality: '稀有', effect: { id: 'acc_greedy_1', type: 'greedy', value: 10, description: '金币掉落 -10%' } },
];

// ============================================================
// 消耗品池 (4 buff + 2 debuff = 6)
// ============================================================
const CONSUMABLE_BUFFS: readonly Affix[] = [
  { weight: 8, minQuality: '普通', effect: { id: 'con_hp_1', type: 'hp_restore', value: 10, description: '恢复 10 HP' } },
  { weight: 6, minQuality: '普通', effect: { id: 'con_vit_1', type: 'vital_restore', value: { hunger: 20 }, description: '恢复饱食度 +20' } },
  { weight: 4, minQuality: '精良', effect: { id: 'con_temp_1', type: 'temp_attack', value: 3, description: '临时 +3 攻击 (3 回合)' } },
  { weight: 3, minQuality: '精良', effect: { id: 'con_cleanse_1', type: 'cleanse', value: 1, description: '清除负面状态' } },
];
const CONSUMABLE_DEBUFFS: readonly Affix[] = [
  { weight: 5, minQuality: '普通', effect: { id: 'con_poison_1', type: 'poison', value: 2, description: '使用后中毒 (2 回合)' } },
  { weight: 3, minQuality: '精良', effect: { id: 'con_drowsy_1', type: 'drowsy', value: 1, description: '使用后昏睡 1 回合' } },
];

// ============================================================
// AFFIX_POOLS 总表
// ============================================================
export const AFFIX_POOLS: Record<AffixPoolKey, AffixPools> = {
  weapon:     { buffs: WEAPON_BUFFS,     debuffs: WEAPON_DEBUFFS },
  armor:      { buffs: ARMOR_BUFFS,      debuffs: ARMOR_DEBUFFS },
  accessory:  { buffs: ACCESSORY_BUFFS,  debuffs: ACCESSORY_DEBUFFS },
  consumable: { buffs: CONSUMABLE_BUFFS, debuffs: CONSUMABLE_DEBUFFS },
};

// ============================================================
// 质量 → 抽取数量区间
// ============================================================
export interface AffixCountRange {
  readonly min: number;
  readonly max: number;
}

export const QUALITY_AFFIX_RANGE: Record<ItemQuality, AffixCountRange> = {
  '粗糙': { min: 0, max: 1 },
  '普通': { min: 0, max: 1 },
  '精良': { min: 1, max: 2 },
  '稀有': { min: 2, max: 3 },
  '史诗': { min: 3, max: 4 },
  '传说': { min: 4, max: 5 },
};

// ============================================================
// 减益掺入概率 (按质量递增: 低质量几乎纯净, 高质量偶尔诅咒)
// ============================================================
export const DEBUFF_PROBABILITY: Record<ItemQuality, number> = {
  '粗糙': 0.00,
  '普通': 0.00,
  '精良': 0.05,
  '稀有': 0.10,
  '史诗': 0.12,
  '传说': 0.15,
};
