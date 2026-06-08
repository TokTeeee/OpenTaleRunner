// client/src/data/abilities/abilities/holyHeal.ts
// v0.6.2: 圣光治疗 — 神圣单体治疗祷告
import type { Ability } from '../../../types/ability';

export const holyHeal: Ability = {
  id: 'prayer_holy_heal',
  name: '圣光治疗',
  school: 'prayer',
  element: 'holy',
  tier: 1,
  requirements: {
    classes: ['cleric', 'any'],
    minAttribute: { WIS: 12 },
    minLevel: 3,
  },
  cost: { ap: 1, mp: 4 },
  target: 'ally',
  effect: {
    damageDice: '1d6+1',
    isHeal: true,
    attributeScale: 'WIS',
    element: 'holy',
  },
  description: {
    shortEffect: '1d6+1+WIS_MOD 治疗, 单体友军',
    narrative: '温暖的金色光芒自掌心缓缓流出, 像清晨的第一缕阳光洒在伤口上。血肉以肉眼可见的速度愈合, 痛苦如退潮般消散。',
    visualTag: 'holy_heal',
  },
};
