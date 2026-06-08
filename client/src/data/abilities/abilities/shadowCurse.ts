// client/src/data/abilities/abilities/shadowCurse.ts
// v0.6.2: 暗影诅咒 — 暗影单体攻击 + debuff 祷告
import type { Ability } from '../../../types/ability';

export const shadowCurse: Ability = {
  id: 'prayer_shadow_curse',
  name: '暗影诅咒',
  school: 'prayer',
  element: 'shadow',
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
    element: 'shadow',
    applyBuff: { ref: 'wounded_1', stacks: 1, turns: 3 },
  },
  description: {
    shortEffect: '1d4+WIS_MOD 暗影伤害 + wounded_1, 单体敌人',
    narrative: '漆黑如墨的影子自地面蠕动, 沿着敌人的脚踝向上攀爬。每一步都伴随虚弱的抽痛, 仿佛生命力正被悄然抽离。',
    visualTag: 'shadow_curse',
  },
};
