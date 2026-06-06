/**
 * v0.4 战斗系统 — 战斗 UI 工具函数
 */

import { isEnemy, type Combatant } from '../../services/combat/types';

/** 敌我阵营分类器 — UI 排序辅助 */
export function partitionBySide(combatants: Record<string, Combatant>): {
  enemies: Combatant[];
  allies: Combatant[];
} {
  const enemies: Combatant[] = [];
  const allies: Combatant[] = [];
  for (const c of Object.values(combatants)) {
    if (isEnemy(c)) enemies.push(c);
    else allies.push(c);
  }
  return { enemies, allies };
}
