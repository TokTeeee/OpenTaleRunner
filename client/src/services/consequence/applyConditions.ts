import { useCharacterStore } from '../../stores/characterStore';
import type { ConsequenceData } from '../../types/game';

/**
 * v0.5.13: 业务域 2 — conditions
 * 改"我身上挂的状态"
 */
export function applyConditions(
  cons: Pick<ConsequenceData, 'conditionsAdded' | 'conditionsRemoved'>,
): void {
  try {
    if (cons.conditionsAdded?.length) applyConditionsAdded(cons.conditionsAdded);
    if (cons.conditionsRemoved?.length) applyConditionsRemoved(cons.conditionsRemoved);
  } catch (err) {
    console.warn(`[applyConditions] failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function applyConditionsAdded(added: string[]): void {
  const char = useCharacterStore.getState();
  if (!char.character) return;
  for (const condition of added) {
    if (!char.character.conditions?.includes(condition)) {
      char.addCondition(condition);
    }
  }
}

function applyConditionsRemoved(removed: string[]): void {
  const char = useCharacterStore.getState();
  if (!char.character) return;
  for (const condition of removed) {
    char.removeCondition(condition);
  }
}
