import type { PartyMember } from '../../types/party';

function mid(): string {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const ANIMAL_TEMPLATES: Record<string, Omit<PartyMember, 'memberId'>> = {
  wolf: {
    memberType: 'animal',
    sourceId: '',
    name: '灰爪',
    label: '猎狼',
    appearance: '灰色毛皮，锐利的琥珀色眼睛',
    personality: '忠诚、警觉、护主',
    role: 'combat',
    attributes: { STR: 6, DEX: 8, CON: 7, INT: 2, WIS: 5, CHA: 2 },
    skills: [{ name: '追踪', level: 5, description: '追踪气味和足迹', relatedAttribute: 'WIS' }],
    status: { hp: 12, maxHp: 12, isConscious: true, conditions: [] },
    combatAbilities: [
      { name: '撕咬', type: 'attack', description: '用锋利的牙齿攻击', bonus: { type: 'damage_bonus', value: 2 }, cooldown: 1 },
    ],
    utilityAbilities: [
      { name: '追踪气味', type: 'track', description: '追踪地面气味', level: 5, bonus: 5 },
    ],
    joinedAt: new Date().toISOString(),
    joinReason: '驯服',
    relationshipDescription: '忠诚的伙伴',
    loyalty: 80,
    leaveConditions: [{ type: 'loyalty_below', threshold: 20, description: '忠诚低于20离队' }],
    personalityTraits: ['警觉', '忠诚'],
    canLevelUp: true,
    experience: 0,
  },
  bear: {
    memberType: 'animal',
    sourceId: '',
    name: '棕毛',
    label: '灰熊',
    appearance: '棕色厚重毛皮，体型硕大',
    personality: '沉稳、保护性强',
    role: 'combat',
    attributes: { STR: 9, DEX: 3, CON: 9, INT: 2, WIS: 4, CHA: 2 },
    skills: [{ name: '力量', level: 6, description: '天生怪力', relatedAttribute: 'STR' }],
    status: { hp: 25, maxHp: 25, isConscious: true, conditions: [] },
    combatAbilities: [
      { name: '熊掌猛击', type: 'attack', description: '力大无穷的拍击', bonus: { type: 'damage_bonus', value: 4 }, cooldown: 2 },
      { name: '厚皮', type: 'defend', description: '天然厚皮防御', bonus: { type: 'defense_bonus', value: 2 }, cooldown: 0 },
    ],
    utilityAbilities: [
      { name: '负重', type: 'carry', description: '能背负大量物品', level: 5, bonus: 50 },
    ],
    joinedAt: new Date().toISOString(),
    joinReason: '驯服',
    relationshipDescription: '笨重但忠诚的伙伴',
    loyalty: 75,
    leaveConditions: [{ type: 'injury', threshold: 0, description: '重伤后离队' }],
    personalityTraits: ['沉稳', '护主'],
    canLevelUp: true,
    experience: 0,
  },
  eagle: {
    memberType: 'animal',
    sourceId: '',
    name: '锐眼',
    label: '猎鹰',
    appearance: '棕色羽毛，翼展超过两米',
    personality: '高傲、敏锐',
    role: 'scout',
    attributes: { STR: 3, DEX: 9, CON: 5, INT: 3, WIS: 6, CHA: 3 },
    skills: [{ name: '飞行侦察', level: 7, description: '高空侦察', relatedAttribute: 'DEX' }],
    status: { hp: 8, maxHp: 8, isConscious: true, conditions: [] },
    combatAbilities: [
      { name: '俯冲攻击', type: 'attack', description: '从高空俯冲而下', bonus: { type: 'damage_bonus', value: 1 }, cooldown: 1 },
    ],
    utilityAbilities: [
      { name: '高空侦察', type: 'scout', description: '从空中侦察地形和敌人', level: 7, bonus: 7 },
    ],
    joinedAt: new Date().toISOString(),
    joinReason: '驯服',
    relationshipDescription: '高傲的捕猎伙伴',
    loyalty: 60,
    leaveConditions: [
      { type: 'loyalty_below', threshold: 30, description: '忠诚低于30离队' },
      { type: 'region_leave', threshold: '森林', description: '离开森林区域离队' },
    ],
    personalityTraits: ['高傲', '敏锐'],
    canLevelUp: true,
    experience: 0,
  },
};

export const MONSTER_TEMPLATES: Record<string, Omit<PartyMember, 'memberId'>> = {
  goblin_scout: {
    memberType: 'monster',
    sourceId: '',
    name: '独耳',
    label: '哥布林斥候',
    appearance: '身材矮小，绿色皮肤，缺了一只耳朵',
    personality: '狡猾、胆小',
    role: 'scout',
    attributes: { STR: 3, DEX: 7, CON: 4, INT: 4, WIS: 3, CHA: 2 },
    skills: [{ name: '潜行', level: 5, description: '偷偷摸摸的行动', relatedAttribute: 'DEX' }],
    status: { hp: 8, maxHp: 8, isConscious: true, conditions: [] },
    combatAbilities: [
      { name: '匕首偷袭', type: 'attack', description: '从暗处偷袭', bonus: { type: 'damage_bonus', value: 1, condition: '潜行后' }, cooldown: 2 },
    ],
    utilityAbilities: [
      { name: '潜行', type: 'sneak', description: '悄然穿过危险区域', level: 5, bonus: 5 },
      { name: '侦察', type: 'scout', description: '侦查前方', level: 4, bonus: 4 },
    ],
    joinedAt: new Date().toISOString(),
    joinReason: '战败后说服',
    relationshipDescription: '被击败后被迫服从',
    loyalty: 25,
    leaveConditions: [
      { type: 'loyalty_below', threshold: 10, description: '忠诚低于10逃逸' },
    ],
    personalityTraits: ['狡猾', '胆小'],
    canLevelUp: false,
    experience: 0,
  },
  slime_companion: {
    memberType: 'monster',
    sourceId: '',
    name: '果冻',
    label: '史莱姆',
    appearance: '半透明的蓝色果冻状生物',
    personality: '天真、黏人',
    role: 'utility',
    attributes: { STR: 1, DEX: 2, CON: 6, INT: 1, WIS: 1, CHA: 3 },
    skills: [{ name: '吞噬', level: 3, description: '吞噬小物品', relatedAttribute: 'CON' }],
    status: { hp: 15, maxHp: 15, isConscious: true, conditions: [] },
    combatAbilities: [
      { name: '酸液喷射', type: 'attack', description: '喷射腐蚀性酸液', bonus: { type: 'elemental_damage', value: 1 }, cooldown: 3 },
    ],
    utilityAbilities: [
      { name: '吸收物品', type: 'carry', description: '能储存一些小物品', level: 2, bonus: 10 },
    ],
    joinedAt: new Date().toISOString(),
    joinReason: '驯服',
    relationshipDescription: '天真可爱的黏性伙伴',
    loyalty: 90,
    leaveConditions: [{ type: 'loyalty_below', threshold: 40, description: '受到惊吓离队' }],
    personalityTraits: ['天真', '黏人'],
    canLevelUp: false,
    experience: 0,
  },
};

export function buildMemberFromTemplate(
  template: Omit<PartyMember, 'memberId'>,
  overrides: Partial<PartyMember> = {},
): PartyMember {
  return {
    ...template,
    memberId: mid(),
    name: overrides.name || template.name,
    sourceId: overrides.sourceId || template.sourceId,
    joinedAt: new Date().toISOString(),
    ...overrides,
  } as PartyMember;
}
