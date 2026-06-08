// client/src/data/abilities/abilities/holyLight.ts
// v0.6.2: 圣光冲击 — 神圣单体攻击祷告
import type { Ability } from '../../../types/ability';

export const holyLight: Ability = {
  id: 'prayer_holy_light',
  name: '圣光冲击',
  school: 'prayer',
  element: 'holy',
  tier: 1,
  requirements: {
    classes: ['cleric', 'any'],
    minAttribute: { WIS: 12 },
    minLevel: 3,
  },
  cost: { ap: 1, mp: 3 },
  target: 'enemy',
  effect: {
    damageDice: '1d4',
    isHeal: false,
    attributeScale: 'WIS',
    element: 'holy',
  },
  description: {
    shortEffect: '1d4+WIS_MOD 神圣伤害, 单体敌人',
    narrative: '凝聚的神圣能量化作光束, 灼烧邪恶之躯。光束如利箭, 直刺敌人的灵魂, 留下灼热的伤痕。',
    visualTag: 'holy_light',
  },
};
