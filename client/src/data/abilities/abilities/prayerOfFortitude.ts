// client/src/data/abilities/abilities/prayerOfFortitude.ts
// v0.6.2: 坚毅祷文 — 神圣友军 buff 祷告 (招架 +1, 3 回合)
import type { Ability } from '../../../types/ability';

export const prayerOfFortitude: Ability = {
  id: 'prayer_fortitude',
  name: '坚毅祷文',
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
    applyBuff: { ref: 'fortitude', stacks: 1, turns: 3 },
  },
  description: {
    shortEffect: '友军招架 +1, 持续 3 回合',
    narrative: '祷文如盾牌般环绕受祝者, 坚不可摧。受祝者脚步更稳, 反应更敏捷, 难被击倒。',
    visualTag: 'fortitude',
  },
};
