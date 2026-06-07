import { useCharacterStore } from '../../stores/characterStore';
import type { ConsequenceData } from '../../types/game';

/**
 * v0.5.13: 业务域 1 — attributes
 * 改"我是谁"的基础数值 + 身份
 *
 * 二级字段函数 (模块内私有):
 *   - applyAttributeChanges(cons.attributeChanges)
 *   - applyIdentityChanges(cons.identityChanges)
 */
export function applyAttributes(
  cons: Pick<ConsequenceData, 'attributeChanges' | 'identityChanges'>,
): void {
  try {
    if (cons.attributeChanges) applyAttributeChanges(cons.attributeChanges);
    if (cons.identityChanges) applyIdentityChanges(cons.identityChanges);
  } catch (err) {
    console.warn(`[applyAttributes] failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function applyAttributeChanges(changes: Record<string, number>): void {
  const char = useCharacterStore.getState().character;
  if (!char) return;
  const attrs = { ...char.attributes };
  for (const [key, value] of Object.entries(changes)) {
    if (key in attrs && typeof value === 'number') {
      (attrs as Record<string, number>)[key] = Math.max(3, Math.min(18, (attrs as Record<string, number>)[key] + value));
    }
  }
  useCharacterStore.getState().updateAttributes(attrs);
}

function applyIdentityChanges(identity: { name?: string; appearance?: string; background?: string }): void {
  useCharacterStore.getState().updateIdentity(identity);
}
