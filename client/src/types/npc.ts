export type NPCRelationshipLevel = 'stranger' | 'acquaintance' | 'friend' | 'close' | 'ally';

export type NPCSource = 'storybook' | 'client_created' | 'encounter';

import type { Attributes, Skill } from './character';

export const RELATIONSHIP_LABELS: Record<NPCRelationshipLevel, string> = {
  stranger: '陌生人',
  acquaintance: '相识',
  friend: '朋友',
  close: '密友',
  ally: '盟友',
};

export interface NPCRelationship {
  attitude: number;
  level: NPCRelationshipLevel;
  firstMet: string;
  interactionCount: number;
  history: string[];
  playerKnowsAbout: string[];
}

export interface GameNPC {
  npcId: string;
  name: string;
  title: string;
  role: string;
  region: string;
  subRegion: string;
  appearance: string;
  background: string;
  personality: string;
  motivation: string;
  attributes: Attributes;
  skills: Skill[];
  relationship: NPCRelationship;
  isHostile: boolean;
  canNegotiate: boolean;
  canBeRecruited: boolean;
  canGrow: boolean;
  source: NPCSource;
  secrets: string[];
  faction: string;
  isMet: boolean;
}

export interface NPCInteractionResult {
  attitudeChange: number;
  newInfo: string[];
  levelChange: NPCRelationshipLevel | null;
  narrative: string;
  unlockedSkill: Skill | null;
  unlockedQuest: string | null;
}

export function createDefaultNPC(name: string, region: string): GameNPC {
  return {
    npcId: 'npc_' + Math.random().toString(36).slice(2, 9),
    name,
    title: '',
    role: '平民',
    region,
    subRegion: '',
    appearance: '',
    background: '',
    personality: '',
    motivation: '',
    attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    skills: [],
    relationship: {
      attitude: 0,
      level: 'stranger',
      firstMet: '',
      interactionCount: 0,
      history: [],
      playerKnowsAbout: [],
    },
    isHostile: false,
    canNegotiate: true,
    canBeRecruited: false,
    canGrow: false,
    source: 'encounter',
    secrets: [],
    faction: '',
    isMet: false,
  };
}

export function attitudeToLevel(attitude: number): NPCRelationshipLevel {
  if (attitude >= 80) return 'ally';
  if (attitude >= 50) return 'close';
  if (attitude >= 25) return 'friend';
  if (attitude >= 5) return 'acquaintance';
  return 'stranger';
}

export function levelToColor(level: NPCRelationshipLevel): string {
  switch (level) {
    case 'ally': return 'text-yellow-400';
    case 'close': return 'text-emerald-400';
    case 'friend': return 'text-blue-400';
    case 'acquaintance': return 'text-gray-400';
    case 'stranger': return 'text-gray-600';
  }
}
