import type { ClassDefinition } from '../../types/class';

/** 牧师 — 神圣治疗, 辅助+施法 */
export const CLERIC: ClassDefinition = {
  id: 'cleric',
  name: '牧师',
  description: '信仰虔诚的神职者, 通过祷告治愈同伴并驱散邪恶。',
  primaryAttribute: 'WIS',
  themeColor: 'gold',
  icon: '✨',
  nodes: [
    // T1
    { id: 'cleric_t1_1', classId: 'cleric', tier: 1, slot: 1, name: '信仰',       description: '对神的虔诚信仰, 智慧+1。',                       effect: { type: 'attribute_mod', attribute: 'WIS', bonus: 1 } },
    { id: 'cleric_t1_2', classId: 'cleric', tier: 1, slot: 2, name: '神恩',       description: '神赐之礼, 法力上限+8。',                         effect: { type: 'mp_max_bonus', bonus: 8 } },
    { id: 'cleric_t1_3', classId: 'cleric', tier: 1, slot: 3, name: '祝福',       description: '为同伴祈福, 招架门槛+2。',                       effect: { type: 'dodge_threshold_bonus', bonus: 2 } },
    // T2
    { id: 'cleric_t2_1', classId: 'cleric', tier: 2, slot: 1, name: '虔诚',       description: '更深的信仰, 智慧+1。',                           effect: { type: 'attribute_mod', attribute: 'WIS', bonus: 1 } },
    { id: 'cleric_t2_2', classId: 'cleric', tier: 2, slot: 2, name: '护盾祷文',   description: '神圣护盾, 招架门槛+3。',                         effect: { type: 'dodge_threshold_bonus', bonus: 3 } },
    { id: 'cleric_t2_3', classId: 'cleric', tier: 2, slot: 3, name: '圣疗',       description: '战斗中释放的微弱治疗, 生命上限+5。',             effect: { type: 'hp_max_bonus', bonus: 5 } },
    // T3
    { id: 'cleric_t3_1', classId: 'cleric', tier: 3, slot: 1, name: '神启',       description: '神灵的低语, 感知+2。',                           effect: { type: 'attribute_mod', attribute: 'WIS', bonus: 2 } },
    { id: 'cleric_t3_2', classId: 'cleric', tier: 3, slot: 2, name: '法力洪流',   description: '法力通道扩展, 法力上限+15。',                    effect: { type: 'mp_max_bonus', bonus: 15 } },
    { id: 'cleric_t3_3', classId: 'cleric', tier: 3, slot: 3, name: '智慧引导',   description: '知识与灵性的结合, 经验+10%。',                   effect: { type: 'exp_bonus', bonus: 0.10 } },
    // T4
    { id: 'cleric_t4_1', classId: 'cleric', tier: 4, slot: 1, name: '神之化身',   description: '化身神在人间的容器, 智慧+3。',                   effect: { type: 'attribute_mod', attribute: 'WIS', bonus: 3 } },
    { id: 'cleric_t4_2', classId: 'cleric', tier: 4, slot: 2, name: '不朽之魂',   description: '灵魂得到净化, 生命上限+12。',                   effect: { type: 'hp_max_bonus', bonus: 12 } },
    { id: 'cleric_t4_3', classId: 'cleric', tier: 4, slot: 3, name: '神性怜悯',   description: '神圣能量, QTE 容差+30ms。',                      effect: { type: 'qte_tolerance', bonus: 30 } },
  ],
};
