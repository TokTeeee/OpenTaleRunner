import type { AttributeName } from './character';

export type ClassId = 'warrior' | 'cleric' | 'mage' | 'thief';

export type ClassNodeEffect =
  | { type: 'attribute_mod'; attribute: AttributeName; bonus: number }
  | { type: 'hp_max_bonus'; bonus: number }
  | { type: 'mp_max_bonus'; bonus: number }
  | { type: 'dodge_threshold_bonus'; bonus: number }
  | { type: 'damage_modifier'; bonus: number }
  | { type: 'exp_bonus'; bonus: number }
  | { type: 'qte_tolerance'; bonus: number };

export interface ClassNode {
  id: string;             // pattern: {classId}_t{tier}_{slot}
  classId: ClassId;
  tier: 1 | 2 | 3 | 4;
  slot: 1 | 2 | 3;
  name: string;
  description: string;
  effect: ClassNodeEffect;
}

export interface ClassDefinition {
  id: ClassId;
  name: string;
  description: string;
  primaryAttribute: AttributeName;
  nodes: ClassNode[];
  themeColor: 'amber' | 'gold' | 'indigo' | 'emerald';
  icon: string;
}
