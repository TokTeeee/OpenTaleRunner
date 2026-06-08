// client/src/data/abilities/abilities/earthStone.ts
// v0.6.2: 大地之拳 — 土系单体攻击魔法
import type { Ability } from '../../../types/ability';

export const earthStone: Ability = {
  id: 'spell_earth_stone',
  name: '大地之拳',
  school: 'magic',
  element: 'earth',
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
    element: 'earth',
  },
  description: {
    shortEffect: '1d6+INT_MOD 土属性伤害, 单体敌人',
    narrative: '地面隆起岩石, 如同大地伸出的拳头。岩拳沉重地砸向敌人, 撞击声回荡在战场上。',
    visualTag: 'earth_stone',
  },
};
