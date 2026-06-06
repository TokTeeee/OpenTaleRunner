import type { DiceResult, DiceOutcome } from '../types/game';
import type { AttributeName } from '../types/character';

export function attributeModifier(value: number): number {
  return Math.floor((value - 10) / 2);
}

export function rollDice(sides: number, count: number): number[] {
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    const value = Math.floor(Math.random() * sides) + 1;
    values.push(value);
  }
  return values;
}

export function rollDiceSecure(sides: number, count: number): number[] {
  const values: number[] = [];
  const array = new Uint32Array(count);
  crypto.getRandomValues(array);
  for (let i = 0; i < count; i++) {
    values.push((array[i] % sides) + 1);
  }
  return values;
}

export function determineOutcome(finalResult: number): DiceOutcome {
  if (finalResult >= 12) return 'critical_success';
  if (finalResult >= 8) return 'success';
  if (finalResult >= 5) return 'partial_success';
  if (finalResult >= 0) return 'failure';
  return 'critical_failure';
}

export function calculateDiceResult(
  diceValues: number[],
  attributeValue: number,
  skillLevel: number,
  equipmentBonus: number,
  sceneModifier: number,
  difficultyLC: number,
  conditionsPenalty: number = 0,
  nightPenalty: number = 0,
  partyMemberActions?: Array<{ memberId: string; memberName: string; abilityName: string; effect: string }>,
): DiceResult {
  const total = diceValues.reduce((sum, v) => sum + v, 0);
  const attrMod = attributeModifier(attributeValue);
  const partyBonus = partyMemberActions?.reduce((acc, _a) => acc + 1, 0) || 0;
  const finalResult = total + attrMod + skillLevel + equipmentBonus + sceneModifier - conditionsPenalty - nightPenalty;
  const outcome = determineOutcome(finalResult);

  return {
    diceType: `${diceValues.length}d6`,
    diceValues,
    total,
    attributeModifier: attrMod,
    skillBonus: skillLevel,
    equipmentBonus,
    sceneModifier,
    difficultyLC,
    finalResult: finalResult - difficultyLC,
    outcome,
    conditionsPenalty,
    nightPenalty,
    partyBonus,
    partyMemberActions,
  };
}

export function absurdityToLC(absurdityLevel: number): number {
  if (absurdityLevel <= 2) return 2;
  if (absurdityLevel <= 4) return 5;
  if (absurdityLevel <= 6) return 8;
  if (absurdityLevel <= 8) return 12;
  return 16;
}

export function getAttributeLabel(attr: AttributeName): string {
  const labels: Record<AttributeName, string> = {
    STR: '力量',
    DEX: '敏捷',
    CON: '体质',
    INT: '智力',
    WIS: '感知',
    CHA: '魅力',
  };
  return labels[attr];
}
