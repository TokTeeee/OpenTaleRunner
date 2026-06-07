import { useCharacterStore } from '../../stores/characterStore';
import type { ConsequenceData } from '../../types/game';

/**
 * v0.5.13: 业务域 4 — reputation
 * 改"我与社会的关系" — reputation + currency
 *
 * 审计 P5 修复保留: cons.reputationChange.charisma 重定向到 attributeChanges.CHA
 *   (attractions: 属性域, 但 redirect 跨域, 留本域)
 */
export function applyReputation(
  cons: Pick<ConsequenceData, 'reputationChange' | 'currencyChange'>,
): void {
  try {
    if (cons.reputationChange && Object.keys(cons.reputationChange).length > 0) {
      applyReputationChange(cons.reputationChange);
    }
    if (cons.currencyChange) applyCurrencyChange(cons.currencyChange);
  } catch (err) {
    console.warn(`[applyReputation] failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function applyReputationChange(changes: Record<string, number>): void {
  const charStore = useCharacterStore.getState();
  const char = charStore.character;
  if (!char) return;

  // 审计 P5 修复: charisma 重定向到 CHA 属性
  const globalKeys = ['goodness', 'violence', 'lawfulness'];
  const regional: Record<string, number> = {};
  const global: Record<string, number> = {};
  const attrDelta: Record<string, number> = {};
  for (const [k, v] of Object.entries(changes)) {
    if (k === 'charisma') attrDelta.CHA = (attrDelta.CHA || 0) + v;
    else if (globalKeys.includes(k)) global[k] = v;
    else regional[k] = v;
  }

  if (Object.keys(attrDelta).length > 0) {
    const cur = char.attributes;
    charStore.updateAttributes({
      CHA: Math.max(3, Math.min(18, (cur.CHA || 0) + (attrDelta.CHA || 0))),
    });
  }
  if (Object.keys(global).length > 0) charStore.updateReputation(global);
  if (Object.keys(regional).length > 0) charStore.updateReputation({ regional });
}

function applyCurrencyChange(change: { gold?: number; silver?: number; copper?: number }): void {
  const char = useCharacterStore.getState().character;
  if (!char) return;
  const c = { ...char.inventory.currency };
  c.gold += change.gold || 0;
  c.silver += change.silver || 0;
  c.copper += change.copper || 0;
  useCharacterStore.getState().updateInventory({ ...char.inventory, currency: c });
}
