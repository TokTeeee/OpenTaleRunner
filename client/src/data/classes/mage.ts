import type { ClassDefinition } from '../../types/class';

/** 法师 — 元素施法, 高伤DPS+控制 */
export const MAGE: ClassDefinition = {
  id: 'mage',
  name: '法师',
  description: '研习古老符文的学者, 操纵元素之力毁灭敌人。',
  primaryAttribute: 'INT',
  themeColor: 'indigo',
  icon: '🔮',
  nodes: [
    // T1
    { id: 'mage_t1_1', classId: 'mage', tier: 1, slot: 1, name: '奥术天才', description: '对魔法的天生亲和, 智力+1。',                     effect: { type: 'attribute_mod', attribute: 'INT', bonus: 1 } },
    { id: 'mage_t1_2', classId: 'mage', tier: 1, slot: 2, name: '法力池',   description: '扩大法力储备, 法力上限+10。',                    effect: { type: 'mp_max_bonus', bonus: 10 } },
    { id: 'mage_t1_3', classId: 'mage', tier: 1, slot: 3, name: '元素亲和', description: '对元素之力更深理解, 伤害+10%。',                 effect: { type: 'damage_modifier', bonus: 0.10 } },
    // T2
    { id: 'mage_t2_1', classId: 'mage', tier: 2, slot: 1, name: '学者',     description: '博学多识, 智力+1。',                             effect: { type: 'attribute_mod', attribute: 'INT', bonus: 1 } },
    { id: 'mage_t2_2', classId: 'mage', tier: 2, slot: 2, name: '咒文编织', description: '咒文吟唱更精准, QTE 容差+20ms。',               effect: { type: 'qte_tolerance', bonus: 20 } },
    { id: 'mage_t2_3', classId: 'mage', tier: 2, slot: 3, name: '寒冰之心', description: '冰冷理智, 体质+1。',                             effect: { type: 'attribute_mod', attribute: 'CON', bonus: 1 } },
    // T3
    { id: 'mage_t3_1', classId: 'mage', tier: 3, slot: 1, name: '大法师',   description: '法术权威, 智力+2。',                             effect: { type: 'attribute_mod', attribute: 'INT', bonus: 2 } },
    { id: 'mage_t3_2', classId: 'mage', tier: 3, slot: 2, name: '法力风暴', description: '释放法力风暴, 伤害+20%。',                       effect: { type: 'damage_modifier', bonus: 0.20 } },
    { id: 'mage_t3_3', classId: 'mage', tier: 3, slot: 3, name: '法力护盾', description: '法力凝聚为盾, 招架门槛+4。',                     effect: { type: 'dodge_threshold_bonus', bonus: 4 } },
    // T4
    { id: 'mage_t4_1', classId: 'mage', tier: 4, slot: 1, name: '大奥术师', description: '魔法的顶峰, 智力+3。',                           effect: { type: 'attribute_mod', attribute: 'INT', bonus: 3 } },
    { id: 'mage_t4_2', classId: 'mage', tier: 4, slot: 2, name: '禁咒',     description: '禁忌咒文, 伤害+25%。',                           effect: { type: 'damage_modifier', bonus: 0.25 } },
    { id: 'mage_t4_3', classId: 'mage', tier: 4, slot: 3, name: '法力之源', description: '法力的无尽源泉, 法力上限+25。',                  effect: { type: 'mp_max_bonus', bonus: 25 } },
  ],
};
