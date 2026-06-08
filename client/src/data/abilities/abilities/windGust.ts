// client/src/data/abilities/abilities/windGust.ts
// v0.6.2: 疾风之息 — 风系单体攻击魔法
import type { Ability } from '../../../types/ability';

export const windGust: Ability = {
  id: 'spell_wind_gust',
  name: '疾风之息',
  school: 'magic',
  element: 'wind',
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
    element: 'wind',
  },
  description: {
    shortEffect: '1d6+INT_MOD 风属性伤害, 单体敌人',
    narrative: '无形的漩涡卷起落叶与尘土, 呼啸着撞向敌人。风刃切割皮肤, 留下一道道细小的伤口。',
    visualTag: 'wind_gust',
  },
};
