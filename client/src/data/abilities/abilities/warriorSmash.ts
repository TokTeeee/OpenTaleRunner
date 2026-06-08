// client/src/data/abilities/abilities/warriorSmash.ts
// v0.6.2: 重击 — 战士战技 (1d8+STR_MOD, self_dodge_penalty)
import type { Ability } from '../../../types/ability';

export const warriorSmash: Ability = {
  id: 'art_warrior_smash',
  name: '重击',
  school: 'battle_art',
  element: null,
  tier: 1,
  requirements: {
    classes: ['warrior', 'any'],
    minAttribute: { STR: 13 },
    minLevel: 3,
  },
  cost: { ap: 2, mp: 0 },
  target: 'enemy',
  effect: {
    damageDice: '1d8',
    isHeal: false,
    attributeScale: 'STR',
    element: null,
    special: 'self_dodge_penalty',
  },
  description: {
    shortEffect: '1d8+STR_MOD 物理伤害, 自身 -1 招架门槛 1 回合',
    narrative: '战士将全身力量汇聚于武器, 奋力一击。沉重的打击让敌人踉跄, 但自己也因用力过猛而短暂失衡。',
    visualTag: 'warrior_smash',
  },
};
