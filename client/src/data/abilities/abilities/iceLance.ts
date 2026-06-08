// client/src/data/abilities/abilities/iceLance.ts
// v0.6.2: 寒冰箭 — 冰系单体攻击魔法
import type { Ability } from '../../../types/ability';

export const iceLance: Ability = {
  id: 'spell_ice_lance',
  name: '寒冰箭',
  school: 'magic',
  element: 'ice',
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
    element: 'ice',
  },
  description: {
    shortEffect: '1d6+INT_MOD 冰属性伤害, 单体敌人',
    narrative: '冰霜在掌中凝为锋利矢尖, 散发凛冽白雾。矢尖呼啸而出, 沿途凝出细微霜花, 直刺敌人要害。',
    visualTag: 'ice_lance',
  },
};
