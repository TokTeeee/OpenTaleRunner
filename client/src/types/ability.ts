// client/src/types/ability.ts
// v0.6.2: 统一 Ability 数据模型 (替代 v0.6.1 Spell/Prayer 双类型)
// 3 个 school: magic (魔法) | prayer (祷告) | battle_art (战技)
// 8 个元素: 火/冰/雷/风/土/奥术 (魔法) + 神圣/暗影 (祷告)
import type { AttributeName, Attributes } from './character';

export type MagicElement = 'fire' | 'ice' | 'lightning' | 'wind' | 'earth' | 'arcane';
export type PrayerElement = 'holy' | 'shadow';
export type Element = MagicElement | PrayerElement;
export type AbilitySchool = 'magic' | 'prayer' | 'battle_art';
export type AbilityTarget =
  | 'enemy' | 'ally' | 'self' | 'all_enemies' | 'all_allies';
export type AbilityTier = 1 | 2 | 3;
export type CharacterClass = 'warrior' | 'mage' | 'cleric' | 'thief';
export type AbilityClassRequirement = CharacterClass | 'any';

export const ELEMENT_LABELS: Record<Element, string> = {
  fire: '火', ice: '冰', lightning: '雷', wind: '风',
  earth: '土', arcane: '奥术', holy: '神圣', shadow: '暗影',
};

export const ELEMENT_ICONS: Record<Element, string> = {
  fire: '🔥', ice: '❄️', lightning: '⚡', wind: '🌪️',
  earth: '⛰️', arcane: '🔮', holy: '✨', shadow: '🌑',
};

export const SCHOOL_LABELS: Record<AbilitySchool, string> = {
  magic: '魔法', prayer: '祷告', battle_art: '战技',
};

export const SCHOOL_ICONS: Record<AbilitySchool, string> = {
  magic: '✨', prayer: '🌟', battle_art: '⚔️',
};

export interface AbilityDescription {
  shortEffect: string;   // 一行简介, 用于 UI 列表
  narrative: string;     // 详细叙事, 用于战斗日志 + 教学
  visualTag: string;     // 视觉/动效标签 (QTE 用)
}

export type BattleArtSpecial =
  | 'high_crit'           // × 1.3 暴击伤害
  | 'armor_pierce'        // 50% 防御穿透 (v0.6.2 简化为 +25% 伤害)
  | 'life_steal'          // 30% 治疗自身
  | 'self_dodge_penalty'; // 自身招架 -2 持续 1 回合

export interface AbilityBuffRef {
  ref: string;            // buff 标识 (如 'blessing', 'wounded_1')
  stacks: number;         // 初始层数
  turns: number;          // 持续回合
}

export interface AbilityEffect {
  damageDice: string;     // 骰公式 '1d6' / '1d6+1' / '0'
  isHeal: boolean;        // true = 治疗, false = 伤害
  attributeScale: AttributeName; // 伤害/治疗加成用的属性
  element: Element | null;       // null = 物理 (不接抗性)
  applyBuff?: AbilityBuffRef;    // 附加 buff
  special?: BattleArtSpecial;     // 仅战技有
}

export interface AbilityRequirement {
  classes: AbilityClassRequirement[];     // 允许学习的职业 (含 'any' 兜底)
  minAttribute: Partial<Attributes>;      // 属性门槛 (任一项 ≥ 阈值即可)
  minLevel: number;                       // 最低等级
}

export interface AbilityCost {
  ap: number;     // 行动点
  mp: number;     // 法力 (战技可 = 0)
}

export interface Ability {
  id: string;
  name: string;
  school: AbilitySchool;
  element: Element | null;
  tier: AbilityTier;
  requirements: AbilityRequirement;
  cost: AbilityCost;
  target: AbilityTarget;
  effect: AbilityEffect;
  description: AbilityDescription;
}

// 重新导出便于 import 集中
export type { AttributeName } from './character';
