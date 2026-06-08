// client/src/data/abilities/abilities/lightningSpark.ts
// v0.6.2: 雷鸣闪光 — 雷系单体攻击魔法
import type { Ability } from '../../../types/ability';

export const lightningSpark: Ability = {
  id: 'spell_lightning_spark',
  name: '雷鸣闪光',
  school: 'magic',
  element: 'lightning',
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
    element: 'lightning',
  },
  description: {
    shortEffect: '1d6+INT_MOD 雷属性伤害, 单体敌人',
    narrative: '电弧从指节噼啪迸射, 蓝紫光芒刺目。雷光凝聚成一道闪光, 划破空气直击目标, 留下焦灼的痕迹。',
    visualTag: 'lightning_spark',
  },
};
