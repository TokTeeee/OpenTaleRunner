export type MemberType = 'npc' | 'ghost_npc' | 'animal' | 'monster';
export type MemberRole = 'combat' | 'support' | 'scout' | 'utility';

export interface PartyMember {
  memberId: string;
  memberType: MemberType;
  sourceId: string;
  name: string;
  label: string;
  appearance: string;
  personality: string;
  role: MemberRole;
  attributes: Record<string, number>;
  skills: Array<{
    name: string;
    level: number;
    description: string;
    relatedAttribute: string;
  }>;
  status: {
    hp: number;
    maxHp: number;
    isConscious: boolean;
    conditions: string[];
  };
  combatAbilities: CombatAbility[];
  utilityAbilities: UtilityAbility[];
  joinedAt: string;
  joinReason: string;
  relationshipDescription: string;
  loyalty: number;
  leaveConditions: LeaveCondition[];
  personalityTraits: string[];
  canLevelUp: boolean;
  experience: number;
}

export interface CombatAbility {
  name: string;
  type: 'attack' | 'defend' | 'heal' | 'buff' | 'debuff' | 'taunt';
  description: string;
  bonus: {
    type: 'damage_bonus' | 'defense_bonus' | 'skill_bonus' | 'elemental_damage';
    value: number;
    condition?: string;
  };
  cooldown: number;
}

export interface UtilityAbility {
  name: string;
  type: 'lockpick' | 'track' | 'negotiate' | 'craft' | 'heal_outside' | 'carry' | 'scout' | 'intimidate' | 'identify' | 'sneak';
  description: string;
  level: number;
  bonus: number;
}

export interface LeaveCondition {
  type: 'loyalty_below' | 'goal_conflict' | 'player_reputation' | 'region_leave' | 'time_limit' | 'injury';
  threshold: number | string;
  description: string;
}

export interface PartyCombatBonus {
  totalDamageBonus: number;
  totalDefenseBonus: number;
  totalSkillBonus: number;
  memberActions: PartyCombatAction[];
}

export interface PartyCombatAction {
  memberId: string;
  memberName: string;
  abilityName: string;
  effect: string;
}

export interface PartyUtilityAssist {
  memberId: string;
  memberName: string;
  abilityLevel: number;
  bonus: number;
  narrative: string;
}

export interface RecruitCondition {
  type: 'relationship_level' | 'attitude' | 'reputation' | 'goal_match' | 'past_experience' | 'combat_victory' | 'skill_check';
  value: number | string;
  met: boolean;
  description: string;
}

export interface RecruitCheck {
  targetId: string;
  targetType: MemberType;
  conditions: RecruitCondition[];
  onSuccess: PartyMember;
  partialNarrative: string;
}

export const MEMBER_TYPE_LABELS: Record<MemberType, string> = {
  npc: 'NPC',
  ghost_npc: '冒险者',
  animal: '动物',
  monster: '怪物',
};

export const UTILITY_ABILITY_LABELS: Record<UtilityAbility['type'], string> = {
  lockpick: '开锁',
  track: '追踪',
  negotiate: '交涉',
  craft: '制作',
  heal_outside: '治疗',
  carry: '负重',
  scout: '侦察',
  intimidate: '威吓',
  identify: '鉴定',
  sneak: '潜行',
};
