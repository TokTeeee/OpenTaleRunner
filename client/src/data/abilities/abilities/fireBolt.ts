// client/src/data/abilities/abilities/fireBolt.ts
// v0.6.2: 火球术 — 火系单体攻击魔法
import type { Ability } from '../../../types/ability';

export const fireBolt: Ability = {
  id: 'spell_fire_bolt',
  name: '火球术',
  school: 'magic',
  element: 'fire',
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
    element: 'fire',
  },
  description: {
    shortEffect: '1d6+INT_MOD 火属性伤害, 单体敌人',
    narrative: '指尖聚起一颗炽热的光点, 空气因高温扭曲变形。光点迅速膨胀成拳头大小的火球, 带着灼人的热浪向敌人激射而去。',
    visualTag: 'fiery_burst',
  },
};
