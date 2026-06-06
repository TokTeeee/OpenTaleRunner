import { WARRIOR } from './warrior';
import { CLERIC } from './cleric';
import { MAGE } from './mage';
import { THIEF } from './thief';
import type { ClassDefinition, ClassId } from '../../types/class';

export const CLASS_REGISTRY: Record<ClassId, ClassDefinition> = {
  warrior: WARRIOR, cleric: CLERIC, mage: MAGE, thief: THIEF,
};
export const CLASS_LIST: ClassDefinition[] = Object.values(CLASS_REGISTRY);

export function getClass(classId: string): ClassDefinition | null {
  return (CLASS_REGISTRY as Record<string, ClassDefinition | undefined>)[classId] ?? null;
}
