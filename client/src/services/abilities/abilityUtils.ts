// client/src/services/abilities/abilityUtils.ts
// v0.6.2: 能力相关工具函数
// - parseDiceFormula: 骰公式解析 ('1d6' / '1d6+2' / '0')
// - resistanceMultiplier: 抗性 → 伤害乘数
// - applyResistance: 应用抗性到伤害
// - applySpecial: 战技 special (high_crit/armor_pierce/life_steal/self_dodge_penalty)
import type { Element, BattleArtSpecial } from '../../types/ability';
import type { ElementalResistances } from '../../types/character';
import type { Combatant } from '../combat/types';
import { useCombatStore } from '../../stores/combatStore';

// RollFn 与 combat/dice.ts 保持一致: (sides: number) => number, 单次骰
type RollFn = (sides: number) => number;

/** 解析骰公式 '1d6' / '1d6+2' / '-1d6-1' / '0', 返 { total, rolls } */
export function parseDiceFormula(formula: string, roll: RollFn): { total: number; rolls: number[] } {
  if (formula === '0') return { total: 0, rolls: [] };
  const match = formula.match(/^(-?)(\d+)d(\d+)([+-]\d+)?$/);
  if (!match) throw new Error(`Invalid dice formula: ${formula}`);
  const sign = match[1] === '-' ? -1 : 1;
  const count = parseInt(match[2], 10);
  const sides = parseInt(match[3], 10);
  const bonus = match[4] ? parseInt(match[4], 10) : 0;
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) rolls.push(roll(sides));
  const sum = rolls.reduce((a, b) => a + b, 0);
  // 治疗公式: 负数 floor 0
  return { total: Math.max(0, sign * (sum + bonus)), rolls };
}

/** 抗性 → 伤害乘数. 公式: 1 - resistance/100, clamp [-100, 100] */
export function resistanceMultiplier(resistance: number): number {
  const clamped = Math.max(-100, Math.min(100, resistance));
  return 1 - clamped / 100;
}

/** 应用抗性. element=null (物理) 不应用. damage 不可 < 0 */
export function applyResistance(
  baseDamage: number,
  element: Element | null,
  targetResistances: ElementalResistances,
): number {
  if (element === null) return baseDamage;
  const r = targetResistances[element];
  return Math.max(0, Math.round(baseDamage * resistanceMultiplier(r)));
}

/**
 * 战技 special: 在 baseDamage 基础上修改并追加 log 消息.
 * - high_crit: 伤害 × 1.3
 * - armor_pierce: 自身伤害不变 (caller 在 QTE/resistance 后再乘 1.25 简化穿透)
 * - life_steal: 30% 转治疗自身 (applyHeal)
 * - self_dodge_penalty: 自身加 1 回合 DEX-2 buff
 */
export function applySpecial(
  special: BattleArtSpecial | undefined,
  baseDamage: number,
  attacker: Combatant,
  _target: Combatant | null,
  currentTurn: number,
): { damage: number; extra: string[] } {
  if (!special) return { damage: baseDamage, extra: [] };
  switch (special) {
    case 'high_crit':
      return { damage: Math.round(baseDamage * 1.3), extra: [`${attacker.name} 命中要害!`] };
    case 'armor_pierce':
      return { damage: baseDamage, extra: ['穿甲效果生效'] };
    case 'life_steal': {
      const steal = Math.max(1, Math.round(baseDamage * 0.3));
      useCombatStore.getState().applyHeal(attacker.id, steal);
      return { damage: baseDamage, extra: [`${attacker.name} 吸取 ${steal} HP`] };
    }
    case 'self_dodge_penalty':
      useCombatStore.getState().addBuff(attacker.id, {
        ref: 'self_dodge_penalty',
        stacks: 1,
        remainingTurns: 1,
        source: attacker.id,
        appliedAtTurn: currentTurn,
        modifiers: { DEX: -2 },
      });
      return { damage: baseDamage, extra: [`${attacker.name} 体力消耗, 防御下降`] };
  }
}
