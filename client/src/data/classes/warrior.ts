import type { ClassDefinition } from '../../types/class';

/** 战士 — 冲锋陷阵, 坦克+物理DPS */
export const WARRIOR: ClassDefinition = {
  id: 'warrior',
  name: '战士',
  description: '以钢铁意志和蛮力著称的前线战士, 擅长近战搏斗与盾牌防御。',
  primaryAttribute: 'STR',
  themeColor: 'amber',
  icon: '⚔️',
  nodes: [
    // T1 — 选择职业时立即获得
    { id: 'warrior_t1_1', classId: 'warrior', tier: 1, slot: 1, name: '蛮力',     description: '经过严酷的体能训练, 力量+1。',                     effect: { type: 'attribute_mod', attribute: 'STR', bonus: 1 } },
    { id: 'warrior_t1_2', classId: 'warrior', tier: 1, slot: 2, name: '体魄',     description: '常年征战铸就钢铁体魄, 生命上限+5。',               effect: { type: 'hp_max_bonus', bonus: 5 } },
    { id: 'warrior_t1_3', classId: 'warrior', tier: 1, slot: 3, name: '战嚎',     description: '冲锋时发出震慑敌人的怒吼, 伤害+10%。',           effect: { type: 'damage_modifier', bonus: 0.10 } },
    // T2 — 5 级解锁
    { id: 'warrior_t2_1', classId: 'warrior', tier: 2, slot: 1, name: '不屈',     description: '对疼痛的耐受力, 生命上限+8。',                     effect: { type: 'hp_max_bonus', bonus: 8 } },
    { id: 'warrior_t2_2', classId: 'warrior', tier: 2, slot: 2, name: '盾墙',     description: '盾牌格挡几率+2 (降低被招架的阈值)。',              effect: { type: 'dodge_threshold_bonus', bonus: 2 } },
    { id: 'warrior_t2_3', classId: 'warrior', tier: 2, slot: 3, name: '横扫',     description: '挥砍波及周围, 伤害+15%。',                         effect: { type: 'damage_modifier', bonus: 0.15 } },
    // T3 — 10 级解锁
    { id: 'warrior_t3_1', classId: 'warrior', tier: 3, slot: 1, name: '钢铁意志', description: '精神与肉体同样强壮, 体质+2。',                     effect: { type: 'attribute_mod', attribute: 'CON', bonus: 2 } },
    { id: 'warrior_t3_2', classId: 'warrior', tier: 3, slot: 2, name: '重击',     description: '蓄力一击, 伤害+20%。',                             effect: { type: 'damage_modifier', bonus: 0.20 } },
    { id: 'warrior_t3_3', classId: 'warrior', tier: 3, slot: 3, name: '战术家',   description: '从战斗中学习, 经验获取+10%。',                    effect: { type: 'exp_bonus', bonus: 0.10 } },
    // T4 — 15 级解锁
    { id: 'warrior_t4_1', classId: 'warrior', tier: 4, slot: 1, name: '战神附体', description: '受到战神的祝福, 力量+3。',                         effect: { type: 'attribute_mod', attribute: 'STR', bonus: 3 } },
    { id: 'warrior_t4_2', classId: 'warrior', tier: 4, slot: 2, name: '血怒',     description: '战斗越久伤害越高, 伤害+25%。',                     effect: { type: 'damage_modifier', bonus: 0.25 } },
    { id: 'warrior_t4_3', classId: 'warrior', tier: 4, slot: 3, name: '不灭之心', description: '生命不息, 战斗不止, 生命上限+15。',               effect: { type: 'hp_max_bonus', bonus: 15 } },
  ],
};
