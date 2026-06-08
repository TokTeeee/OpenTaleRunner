// client/src/data/abilities/abilities/blessing.ts
// v0.6.2: 祝福祷文 — 神圣友军 buff 祷告 (招架 +2, 3 回合)
import type { Ability } from '../../../types/ability';

export const blessing: Ability = {
  id: 'prayer_blessing',
  name: '祝福祷文',
  school: 'prayer',
  element: 'holy',
  tier: 1,
  requirements: {
    classes: ['cleric', 'any'],
    minAttribute: { WIS: 12 },
    minLevel: 3,
  },
  cost: { ap: 1, mp: 5 },
  target: 'ally',
  effect: {
    damageDice: '0',
    isHeal: false,
    attributeScale: 'WIS',
    element: 'holy',
    applyBuff: { ref: 'blessing', stacks: 1, turns: 3 },
  },
  description: {
    shortEffect: '友军招架 +2, 持续 3 回合',
    narrative: '古老祷文回荡, 金色符文环绕受祝者。符文化作无形护盾, 让攻击者难以命中要害。',
    visualTag: 'blessing',
  },
};
