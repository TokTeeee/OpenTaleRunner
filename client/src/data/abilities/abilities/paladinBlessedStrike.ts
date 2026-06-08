// client/src/data/abilities/abilities/paladinBlessedStrike.ts
// v0.6.2: 祝福之击 — 牧师战技 (1d6+WIS_MOD, armor_pierce 50% 防御穿透)
import type { Ability } from '../../../types/ability';

export const paladinBlessedStrike: Ability = {
  id: 'art_paladin_blessed_strike',
  name: '祝福之击',
  school: 'battle_art',
  element: null,
  tier: 1,
  requirements: {
    classes: ['cleric', 'any'],
    minAttribute: { WIS: 13 },
    minLevel: 3,
  },
  cost: { ap: 1, mp: 0 },
  target: 'enemy',
  effect: {
    damageDice: '1d6',
    isHeal: false,
    attributeScale: 'WIS',
    element: null,
    special: 'armor_pierce',
  },
  description: {
    shortEffect: '1d6+WIS_MOD 物理伤害 (50% 防御穿透)',
    narrative: '牧师的武器被神圣祝福浸染, 一击便能穿透最坚固的铠甲。光之锋芒刺入敌人躯体, 让护甲形同虚设。',
    visualTag: 'paladin_blessed_strike',
  },
};
