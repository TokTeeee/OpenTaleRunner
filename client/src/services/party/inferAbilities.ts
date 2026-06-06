import type { PartyMember, CombatAbility, UtilityAbility } from '../../types/party';
import { RELATIONSHIP_LABELS, type GameNPC } from '../../types/npc';

function splitPersonalityTraits(personality: string): string[] {
  return personality
    .split(/[，、,。；;\s]+/)
    .map((trait) => trait.trim())
    .filter(Boolean)
    .slice(0, 6);
}

const SKILL_TO_COMBAT: Record<string, CombatAbility> = {
  '剑术': { name: '剑术', type: 'attack', description: '精湛的剑技', bonus: { type: 'damage_bonus', value: 2 }, cooldown: 1 },
  '弓术': { name: '弓术', type: 'attack', description: '精准的箭术', bonus: { type: 'damage_bonus', value: 2 }, cooldown: 1 },
  '格斗': { name: '格斗', type: 'attack', description: '徒手格斗', bonus: { type: 'damage_bonus', value: 1 }, cooldown: 1 },
  '盾防': { name: '盾防', type: 'defend', description: '盾牌格挡', bonus: { type: 'defense_bonus', value: 2 }, cooldown: 0 },
  '重击': { name: '重击', type: 'attack', description: '厚重的一击', bonus: { type: 'damage_bonus', value: 3 }, cooldown: 2 },
  '治疗': { name: '治疗', type: 'heal', description: '恢复生命力', bonus: { type: 'skill_bonus', value: 2 }, cooldown: 1 },
  '战吼': { name: '战吼', type: 'buff', description: '鼓舞士气', bonus: { type: 'skill_bonus', value: 1 }, cooldown: 2 },
  '威吓': { name: '威吓', type: 'debuff', description: '震慑敌人', bonus: { type: 'skill_bonus', value: 1 }, cooldown: 2 },
  '嘲讽': { name: '嘲讽', type: 'taunt', description: '吸引注意', bonus: { type: 'defense_bonus', value: 1 }, cooldown: 1 },
  '魔法': { name: '魔法', type: 'attack', description: '施放魔法', bonus: { type: 'elemental_damage', value: 2 }, cooldown: 1 },
};

const SKILL_TO_UTILITY: Record<string, UtilityAbility> = {
  '开锁': { name: '开锁', type: 'lockpick', description: '撬开锁具', level: 4, bonus: 4 },
  '追踪': { name: '追踪', type: 'track', description: '追踪痕迹', level: 5, bonus: 5 },
  '交涉': { name: '交涉', type: 'negotiate', description: '外交谈判', level: 4, bonus: 4 },
  '锻造': { name: '锻造', type: 'craft', description: '制作装备', level: 3, bonus: 3 },
  '医术': { name: '医术', type: 'heal_outside', description: '医疗救治', level: 4, bonus: 4 },
  '草药': { name: '草药', type: 'heal_outside', description: '识别草药', level: 3, bonus: 3 },
  '潜行': { name: '潜行', type: 'sneak', description: '隐蔽行动', level: 5, bonus: 5 },
  '侦察': { name: '侦察', type: 'scout', description: '侦查前方', level: 4, bonus: 4 },
  '鉴定': { name: '鉴定', type: 'identify', description: '鉴定物品', level: 3, bonus: 3 },
  '威吓': { name: '威吓', type: 'intimidate', description: '恐吓NPC', level: 4, bonus: 4 },
};

export function inferAbilitiesFromNPC(npc: GameNPC): {
  combat: CombatAbility[];
  utility: UtilityAbility[];
} {
  const combat: CombatAbility[] = [];
  const utility: UtilityAbility[] = [];
  const personalityTraits = splitPersonalityTraits(npc.personality || '');
  const allText = [npc.name, npc.personality || '', npc.appearance || '',
    npc.background || '', npc.role || '',
    ...(npc.skills?.map((s) => `${s.name} ${s.description || ''}`) || []),
    ...personalityTraits,
  ].join(' ');

  for (const [keyword, ability] of Object.entries(SKILL_TO_COMBAT)) {
    if (allText.includes(keyword)) {
      combat.push({ ...ability });
    }
  }
  for (const [keyword, ability] of Object.entries(SKILL_TO_UTILITY)) {
    if (allText.includes(keyword)) {
      utility.push({ ...ability });
    }
  }

  if (combat.length === 0) {
    combat.push({
      name: '普通攻击',
      type: 'attack',
      description: '基础攻击',
      bonus: { type: 'damage_bonus', value: 1 },
      cooldown: 1,
    });
  }

  return { combat, utility };
}

export function buildPartyMemberFromNPC(
  npc: GameNPC,
  relationshipLevel: string,
  joinReason: string,
): PartyMember {
  const { combat, utility } = inferAbilitiesFromNPC(npc);
  const personalityTraits = splitPersonalityTraits(npc.personality || '');
  const loyaltyMap: Record<string, number> = {
    stranger: 10, acquaintance: 30, friend: 60, close: 80, ally: 95,
  };

  return {
    memberId: `npc_${npc.npcId}`,
    memberType: 'npc',
    sourceId: npc.npcId,
    name: npc.name,
    label: npc.role || npc.background || '冒险者',
    appearance: npc.appearance || '',
    personality: npc.personality || '',
    role: combat.length > 1 ? 'combat' : 'utility',
    attributes: { STR: 5, DEX: 5, CON: 5, INT: 5, WIS: 5, CHA: 5 },
    skills: (npc.skills || []).map((s) => ({
      name: s.name,
      level: s.level || 1,
      description: s.description || '',
      relatedAttribute: 'STR',
    })),
    status: { hp: 15, maxHp: 15, isConscious: true, conditions: [] },
    combatAbilities: combat,
    utilityAbilities: utility,
    joinedAt: new Date().toISOString(),
    joinReason,
    relationshipDescription: RELATIONSHIP_LABELS[npc.relationship.level],
    loyalty: loyaltyMap[relationshipLevel] || 30,
    leaveConditions: [
      { type: 'loyalty_below', threshold: 10, description: '忠诚低于10离队' },
    ],
    personalityTraits,
    canLevelUp: true,
    experience: 0,
  };
}

export function buildPartyMemberFromGhost(
  ghostName: string,
  ghostIntent: string,
  joinReason: string,
): PartyMember {
  return {
    memberId: `ghost_${Date.now()}`,
    memberType: 'ghost_npc',
    sourceId: '',
    name: ghostName,
    label: '冒险者',
    appearance: '',
    personality: '',
    role: 'utility',
    attributes: { STR: 4, DEX: 4, CON: 4, INT: 5, WIS: 5, CHA: 5 },
    skills: [{ name: ghostIntent || '探索', level: 3, description: ghostIntent || '', relatedAttribute: 'WIS' }],
    status: { hp: 12, maxHp: 12, isConscious: true, conditions: [] },
    combatAbilities: [
      { name: '基础战斗', type: 'attack', description: '协助战斗', bonus: { type: 'damage_bonus', value: 1 }, cooldown: 1 },
    ],
    utilityAbilities: [
      { name: ghostIntent || '协助', type: 'scout', description: ghostIntent || '助你一臂之力', level: 3, bonus: 3 },
    ],
    joinedAt: new Date().toISOString(),
    joinReason,
    relationshipDescription: '一起冒险的伙伴',
    loyalty: 50,
    leaveConditions: [
      { type: 'loyalty_below', threshold: 15, description: '忠诚低于15离队' },
    ],
    personalityTraits: [],
    canLevelUp: true,
    experience: 0,
  };
}
