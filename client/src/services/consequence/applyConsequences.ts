import type { ConsequenceData } from '../../types/game';
import { useCharacterStore } from '../../stores/characterStore';
import { applyAttributes } from './applyAttributes';
import { applyConditions } from './applyConditions';
import { applySkills } from './applySkills';
import { applyReputation } from './applyReputation';
import { applyItems, type ItemDiscovery } from './applyItems';
import type { RNG } from '../../data/affixPool';

/**
 * v0.5.13: 主入口 — 按业务域顺序应用 consequence.
 *
 * 业务域顺序 (约束):
 *   1. attributes - 基础值先变
 *   2. conditions - 状态效果在属性之上
 *   3. skills     - 能力依赖属性
 *   4. reputation - 含 CHA 重定向 (依赖 attributes)
 *   5. items      - 依赖其他域的 final state, 最后
 *
 * 错误隔离: 每个业务域内部独立 try/catch, 错误不阻断后续域.
 */

export type ApplyConsequencesResult = {
  newDiscoveries: ItemDiscovery[];
};

/**
 * @param cons ConsequenceData
 * @param opts.rng 可选 RNG, 传给 applyItems 用于 loot affix 生成
 */
export function applyConsequences(
  cons: ConsequenceData,
  opts?: { rng?: RNG },
): ApplyConsequencesResult | undefined {
  if (!cons) return undefined;
  const char = useCharacterStore.getState().character;
  if (!char) return undefined;

  applyAttributes(cons);
  applyConditions(cons);
  applySkills(cons);
  applyReputation(cons);
  const newDiscoveries = applyItems(cons, { rng: opts?.rng });

  return { newDiscoveries };
}
