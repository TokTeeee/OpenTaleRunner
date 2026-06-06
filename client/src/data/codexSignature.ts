import type { WorldItem } from '../types/item';

/**
 * 计算物品的"唯一身份"用于 codex 去重。
 *
 * 包含: name + quality + effects (type + value)
 * 不包含: description, durability, value, itemId (这些会变/是实例唯一)
 *
 * effects 数组顺序无关 (用 sort)。
 */
export function computeSignature(
  item: Pick<WorldItem, 'name' | 'quality' | 'effects'>
): string {
  const effectsKey = item.effects
    .map((e) => `${e.type}:${JSON.stringify(e.value)}`)
    .sort()
    .join('|');
  return `${item.name}|${item.quality}|${effectsKey}`;
}
