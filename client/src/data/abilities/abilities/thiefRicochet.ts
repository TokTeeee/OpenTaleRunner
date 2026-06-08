// client/src/data/abilities/abilities/thiefRicochet.ts
// v0.6.2: 剔骨 — 盗贼战技 (1d6+DEX_MOD, high_crit ×1.3)
import type { Ability } from '../../../types/ability';

export const thiefRicochet: Ability = {
  id: 'art_thief_ricochet',
  name: '剔骨',
  school: 'battle_art',
  element: null,
  tier: 1,
  requirements: {
    classes: ['thief', 'any'],
    minAttribute: { DEX: 13 },
    minLevel: 3,
  },
  cost: { ap: 1, mp: 0 },
  target: 'enemy',
  effect: {
    damageDice: '1d6',
    isHeal: false,
    attributeScale: 'DEX',
    element: null,
    special: 'high_crit',
  },
  description: {
    shortEffect: '1d6+DEX_MOD 物理伤害 (×1.3 暴击)',
    narrative: '盗贼的刀刃精准刺向敌人关节与要害, 干净利落。即使未被一击致命, 也让敌人血流不止。',
    visualTag: 'thief_ricochet',
  },
};
