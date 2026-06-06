import type { Character } from '../../types/character';
import { getClass } from '../../data/classes';

const TIER_UNLOCK: Record<2 | 3 | 4, number> = { 2: 5, 3: 10, 4: 15 };

/** 返回待选择的 tier 编号 (2/3/4), null 表示无待选. T1 选择职业时自动选, 不需要此函数管理. */
export function pendingTierChoice(character: Character): 2 | 3 | 4 | null {
  if (!character.classId) return null;
  const def = getClass(character.classId);
  if (!def) return null;
  for (const tier of [2, 3, 4] as const) {
    if (character.level >= TIER_UNLOCK[tier]) {
      const has = character.classSkills.some((n) =>
        def.nodes.find((d) => d.id === n.nodeId)?.tier === tier,
      );
      if (!has) return tier;
    }
  }
  return null;
}

export function isValidClassNodeId(classId: string, nodeId: string): boolean {
  const def = getClass(classId);
  if (!def) return false;
  return def.nodes.some((n) => n.id === nodeId);
}
