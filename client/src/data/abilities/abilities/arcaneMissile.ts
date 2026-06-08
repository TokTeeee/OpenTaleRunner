// client/src/data/abilities/abilities/arcaneMissile.ts
// v0.6.2: 奥术飞弹 — 奥术系单体攻击魔法
import type { Ability } from '../../../types/ability';

export const arcaneMissile: Ability = {
  id: 'spell_arcane_missile',
  name: '奥术飞弹',
  school: 'magic',
  element: 'arcane',
  tier: 1,
  requirements: {
    classes: ['mage', 'any'],
    minAttribute: { INT: 12 },
    minLevel: 3,
  },
  cost: { ap: 1, mp: 3 },
  target: 'enemy',
  effect: {
    damageDice: '1d6',
    isHeal: false,
    attributeScale: 'INT',
    element: 'arcane',
  },
  description: {
    shortEffect: '1d6+INT_MOD 奥术伤害, 单体敌人',
    narrative: '纯粹法力凝聚的紫光飞弹, 划出诡异弧线。飞弹似乎能自动追踪目标, 让敌人无处可逃。',
    visualTag: 'arcane_missile',
  },
};
