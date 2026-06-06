import type { ClassDefinition } from '../../types/class';

/** 盗贼 — 暗影潜行, 高敏+暴击+闪避 */
export const THIEF: ClassDefinition = {
  id: 'thief',
  name: '盗贼',
  description: '潜行于阴影中的狡黠者, 善于偷袭、机关与逃脱。',
  primaryAttribute: 'DEX',
  themeColor: 'emerald',
  icon: '🗡️',
  nodes: [
    // T1
    { id: 'thief_t1_1', classId: 'thief', tier: 1, slot: 1, name: '迅捷',     description: '迅捷如风, 敏捷+1。',                             effect: { type: 'attribute_mod', attribute: 'DEX', bonus: 1 } },
    { id: 'thief_t1_2', classId: 'thief', tier: 1, slot: 2, name: '影遁',     description: '融入阴影, 招架门槛+3。',                         effect: { type: 'dodge_threshold_bonus', bonus: 3 } },
    { id: 'thief_t1_3', classId: 'thief', tier: 1, slot: 3, name: '刺击',     description: '精准的刺击, 伤害+10%。',                         effect: { type: 'damage_modifier', bonus: 0.10 } },
    // T2
    { id: 'thief_t2_1', classId: 'thief', tier: 2, slot: 1, name: '灵巧',     description: '灵活身手, 敏捷+1。',                             effect: { type: 'attribute_mod', attribute: 'DEX', bonus: 1 } },
    { id: 'thief_t2_2', classId: 'thief', tier: 2, slot: 2, name: '闪避',     description: '本能闪避, 招架门槛+3。',                         effect: { type: 'dodge_threshold_bonus', bonus: 3 } },
    { id: 'thief_t2_3', classId: 'thief', tier: 2, slot: 3, name: '速攻',     description: '连绵不断的攻击, 伤害+15%。',                     effect: { type: 'damage_modifier', bonus: 0.15 } },
    // T3
    { id: 'thief_t3_1', classId: 'thief', tier: 3, slot: 1, name: '暗影步',   description: '如影随形, 敏捷+2。',                             effect: { type: 'attribute_mod', attribute: 'DEX', bonus: 2 } },
    { id: 'thief_t3_2', classId: 'thief', tier: 3, slot: 2, name: '速效反应', description: '神经反应极快, QTE 容差+25ms。',                   effect: { type: 'qte_tolerance', bonus: 25 } },
    { id: 'thief_t3_3', classId: 'thief', tier: 3, slot: 3, name: '盗王',     description: '盗门之王的本能, 经验+10%。',                     effect: { type: 'exp_bonus', bonus: 0.10 } },
    // T4
    { id: 'thief_t4_1', classId: 'thief', tier: 4, slot: 1, name: '暗影化身', description: '化为暗影本身, 敏捷+3。',                         effect: { type: 'attribute_mod', attribute: 'DEX', bonus: 3 } },
    { id: 'thief_t4_2', classId: 'thief', tier: 4, slot: 2, name: '致命一击', description: '一击必杀, 伤害+25%。',                           effect: { type: 'damage_modifier', bonus: 0.25 } },
    { id: 'thief_t4_3', classId: 'thief', tier: 4, slot: 3, name: '幻影',     description: '难以捉摸的存在, 招架门槛+5。',                   effect: { type: 'dodge_threshold_bonus', bonus: 5 } },
  ],
};
