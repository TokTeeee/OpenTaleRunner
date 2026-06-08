// client/src/data/abilities/abilities/mageArcaneWard.ts
// v0.6.2: 奥术护盾 — 法师战技 (0AP/0MP, 自身 +20% 抗性 3 回合)
import type { Ability } from '../../../types/ability';

export const mageArcaneWard: Ability = {
  id: 'art_mage_arcane_ward',
  name: '奥术护盾',
  school: 'battle_art',
  element: null,
  tier: 1,
  requirements: {
    classes: ['mage', 'any'],
    minAttribute: { INT: 13 },
    minLevel: 3,
  },
  cost: { ap: 0, mp: 0 },
  target: 'self',
  effect: {
    damageDice: '0',
    isHeal: false,
    attributeScale: 'INT',
    element: null,
    applyBuff: { ref: 'arcane_ward', stacks: 1, turns: 3 },
  },
  description: {
    shortEffect: '自身抗性 +20% 持续 3 回合',
    narrative: '法师低声吟唱, 一层淡紫色的奥术屏障笼罩全身。屏障将伤害分流, 削弱来袭的魔力和物理冲击。',
    visualTag: 'arcane_ward',
  },
};
