import type { Attributes } from '../types/character';

export function generateInitialAttributes(): Attributes {
  const roll3d6 = () =>
    Math.floor(Math.random() * 6) + 1 +
    Math.floor(Math.random() * 6) + 1 +
    Math.floor(Math.random() * 6) + 1;

  return {
    STR: roll3d6(),
    DEX: roll3d6(),
    CON: roll3d6(),
    INT: roll3d6(),
    WIS: roll3d6(),
    CHA: roll3d6(),
  };
}

export function validateAttributes(attrs: Attributes): string | null {
  const total = Object.values(attrs).reduce((s, v) => s + v, 0);
  if (total < 40) return '属性总和偏低，建议至少达到40';
  if (total > 90) return '属性总和异常偏高，请检查';
  for (const [key, value] of Object.entries(attrs)) {
    if (value < 3 || value > 18) {
      return `${key} 必须在3-18之间`;
    }
  }
  return null;
}
