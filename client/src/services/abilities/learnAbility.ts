// client/src/services/abilities/learnAbility.ts
// v0.6.2: 3 维硬要求检查 (职业 / 属性 / 等级) — 替代 v0.6.1 缺失实现
import type { Character, AttributeName, Attributes } from '../../types/character';
import type { Ability, AbilityClassRequirement } from '../../types/ability';

export interface LearnCheckInput {
  character: Pick<Character, 'classId' | 'level' | 'attributes'>;
  ability: Ability;
}

export type LearnCheckResult =
  | { canLearn: true }
  | { canLearn: false; reason: 'class' | 'attribute' | 'level'; required: string };

export function checkCanLearn(input: LearnCheckInput): LearnCheckResult {
  const { character, ability } = input;
  const r = ability.requirements;

  // 1. 职业
  const classOk = checkClass(character.classId, r.classes);
  if (!classOk) {
    return {
      canLearn: false,
      reason: 'class',
      required: r.classes.join(' 或 '),
    };
  }

  // 2. 属性 (Partial<Attributes> — 任一项 ≥ 门槛)
  for (const [attr, threshold] of Object.entries(r.minAttribute) as [AttributeName, number][]) {
    const v = character.attributes[attr];
    if (typeof v !== 'number' || v < threshold) {
      return {
        canLearn: false,
        reason: 'attribute',
        required: `${attr} ≥ ${threshold}`,
      };
    }
  }

  // 3. 等级
  if (character.level < r.minLevel) {
    return {
      canLearn: false,
      reason: 'level',
      required: `等级 ≥ ${r.minLevel}`,
    };
  }

  return { canLearn: true };
}

function checkClass(
  classId: Character['classId'],
  allowed: AbilityClassRequirement[]
): boolean {
  if (allowed.includes('any')) return true;
  if (classId === null || classId === undefined) return false;
  return allowed.includes(classId as AbilityClassRequirement);
}

// 避免 lint 报未使用类型 (用于 type-only check)
export type _Attributes = Attributes;
