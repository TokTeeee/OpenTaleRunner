// client/src/data/abilities/abilities/shadowBlast.ts
// v0.6.2: 暗影爆裂 — 暗影单体高伤害祷告 (2AP)
import type { Ability } from '../../../types/ability';

export const shadowBlast: Ability = {
  id: 'prayer_shadow_blast',
  name: '暗影爆裂',
  school: 'prayer',
  element: 'shadow',
  tier: 1,
  requirements: {
    classes: ['cleric', 'any'],
    minAttribute: { WIS: 12 },
    minLevel: 3,
  },
  cost: { ap: 2, mp: 6 },
  target: 'enemy',
  effect: {
    damageDice: '1d6',
    isHeal: false,
    attributeScale: 'WIS',
    element: 'shadow',
  },
  description: {
    shortEffect: '1d6+WIS_MOD 暗影伤害, 单体敌人 (2AP)',
    narrative: '凝聚的暗影能量在掌心炸开, 腐蚀一切。暗紫色波纹扩散, 敌人被黑暗吞噬, 留下空洞的回响。',
    visualTag: 'shadow_blast',
  },
};
