// client/src/services/abilities/abilityUtils.ts
// v0.6.2: 能力相关工具函数
// - parseDiceFormula: 骰公式解析 ('1d6' / '1d6+2' / '0')
// - resistanceMultiplier: 抗性 → 伤害乘数
// - applyResistance: 应用抗性到伤害
import type { Element } from '../../types/ability';
import type { ElementalResistances } from '../../types/character';

type RollFn = (sides: number, count: number) => number[];

/** 解析骰公式 '1d6' / '1d6+2' / '-1d6-1' / '0', 返 { total, rolls } */
export function parseDiceFormula(formula: string, roll: RollFn): { total: number; rolls: number[] } {
  if (formula === '0') return { total: 0, rolls: [] };
  // 提取符号 + 骰子 + 加成
  const match = formula.match(/^(-?)(\d+)d(\d+)([+-]\d+)?$/);
  if (!match) throw new Error(`Invalid dice formula: ${formula}`);
  const sign = match[1] === '-' ? -1 : 1;
  const count = parseInt(match[2], 10);
  const sides = parseInt(match[3], 10);
  const bonus = match[4] ? parseInt(match[4], 10) : 0;
  const rolls = roll(sides, count);
  const sum = rolls.reduce((a, b) => a + b, 0);
  // 治疗公式: |-1d6-1| = 5 表示吸 5 HP (floor 0)
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
