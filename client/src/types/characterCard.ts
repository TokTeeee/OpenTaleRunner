import type { ItemCategory, ItemQuality } from './item';

export interface CharacterCard {
  formatVersion: number;
  metadata: {
    exportedAt: string;
    exportedFrom: string;
    clientVersion: string;
    storybookName: string;
    storybookVersion: number;
    storybookHash: string;
  };
  character: CharacterSnapshot;
  avatar?: {
    mimeType: string;
    data: string;
  };
  playerNotes?: string;
}

export interface CharacterSnapshot {
  characterId: string;
  name: string;
  race: string;
  background: string;
  appearance: string;
  attributes: Record<string, number>;
  skills: SkillSnapshot[];
  inventory: InventorySnapshot;
  hp: number;
  maxHp: number;
  vital: Record<string, number>;
  reputation: {
    goodness: number;
    violence: number;
    lawfulness: number;
    regional: Record<string, number>;
  };
  conditions: string[];
  joinedRegion: string;
  joinedWorldDay: number;
  currentLocalDay: number;
  recentHistory: Array<{ worldDay: number; region: string; summary: string }>;
  npcRelationships: NPCRelationshipSnapshot[];
}

export interface SkillSnapshot {
  name: string;
  level: number;
  maxLevel: number;
  type: string;
  relatedAttribute: string;
  description: string;
  experience: number;
  expToNext: number;
}

export interface InventorySnapshot {
  equipped: {
    weapon: ItemSnapshot | null;
    armor: ItemSnapshot | null;
    accessory: ItemSnapshot | null;
  };
  backpack: ItemSnapshot[];
  currency: { gold: number; silver: number; copper: number };
}

export interface ItemSnapshot {
  itemId: string;
  name: string;
  category: ItemCategory;
  quality: ItemQuality;
  quantity: number;
  description: string;
  effects: Array<{ type: string; value: unknown; description: string }>;
  durability?: number;
  maxDurability?: number;
  history: Array<{ timestamp: string; event: string; description: string }>;
  source: string;
}

export interface NPCRelationshipSnapshot {
  npcId: string;
  name: string;
  region: string;
  attitude: number;
  level: string;
  playerKnowsAbout: string[];
  isMet: boolean;
  firstMet: string;
  lastInteraction: string;
}

export interface ImportResult {
  success: boolean;
  error?: string;
  warnings?: string[];
}
