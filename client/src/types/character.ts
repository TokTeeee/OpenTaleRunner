export type AttributeName = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
export const ATTRIBUTE_NAMES: AttributeName[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
export const ATTRIBUTE_LABELS: Record<AttributeName, string> = {
  STR: '力量', DEX: '敏捷', CON: '体质', INT: '智力', WIS: '感知', CHA: '魅力',
};

import type { Item } from './item';
import type { StructuredLocation } from './game';

export interface Attributes { STR: number; DEX: number; CON: number; INT: number; WIS: number; CHA: number; }

export interface VitalStats {
  hunger: number; thirst: number; fatigue: number; hygiene: number;
  morale: number; wound: number; temperature: number; encumbrance: number;
}

export const VITAL_LABELS: Record<keyof VitalStats, string> = {
  hunger: '饱食', thirst: '口渴', fatigue: '疲劳', hygiene: '卫生',
  morale: '士气', wound: '伤势', temperature: '体温', encumbrance: '负重',
};
export const VITAL_ICONS: Record<keyof VitalStats, string> = {
  hunger: '🍞', thirst: '💧', fatigue: '😴', hygiene: '🛁',
  morale: '🏴', wound: '🩹', temperature: '🌡', encumbrance: '🎒',
};
export const VITAL_MAX = 100;

export interface Currency { gold: number; silver: number; copper: number; }
export interface Inventory { equipped: { weapon: Item | null; armor: Item | null; accessory: Item | null }; backpack: Item[]; currency: Currency; }

export interface Reputation {
  goodness: number;    // -100~100
  violence: number;    // 0~100
  lawfulness: number;  // -100~100
  regional: Record<string, number>;
}

export type SkillType = 'background' | 'acquired';
export interface Skill {
  id: string; name: string; level: number; maxLevel: number; type: SkillType;
  relatedAttribute: AttributeName; description: string; acquiredAt: string;
  acquisitionStory?: string; experience: number; expToNext: number;
}

export interface Character {
  characterId: string; playerId: string; name: string; race: string;
  background: string; appearance: string;
  attributes: Attributes; skills: Skill[]; inventory: Inventory;
  hp: number; maxHp: number;
  // v0.6.2: 法力 (MP) — 释放 magic/prayer 消耗
  mp: number; maxMp: number;
  vital: VitalStats; reputation: Reputation;
  conditions: string[];
  joinedRegion: string; joinedWorldDay: number;
  currentLocalDay: number; lastActionTime: string;
  currentRegion?: string;
  currentSubRegion?: string;
  currentLocation?: string;
  currentCoordinates?: { x: number; y: number; z: number };
  currentTerrain?: string;
  currentWeather?: string;
  currentStructuredLocation?: StructuredLocation | null;
  gameClock?: number;
  timeOfDay?: string;
  recentHistory: HistoryEntry[];
  // v0.5.1 Level-EXP fields
  level: number;                       // [1, 20]
  exp: number;                         // current EXP towards next level
  expToNext: number;                   // server-emitted
  unspentAttributePoints: number;      // 0-20 free allocation pool
  // v0.5.2 Class fields (default null/[] in v0.5.1, used from v0.5.2)
  classId: string | null;
  classSkills: ClassSkillNode[];
  // v0.6.2 Ability system fields
  elementalResistances: ElementalResistances;
  learnedAbilities: LearnedAbility[];
  defaultLearnedAbilities: string[]; // debug 用, 启动时自动学习的能力 id 列表
}

export interface ClassSkillNode {
  classId: string;
  nodeId: string;
  unlockedAt: number;
}

// v0.6.2: 8 元素抗性 (-100~100, 0 = 无抗, >0 = 抗, <0 = 弱)
export interface ElementalResistances {
  fire: number; ice: number; lightning: number; wind: number;
  earth: number; arcane: number; holy: number; shadow: number;
}

export const ZERO_RESISTANCES: ElementalResistances = {
  fire: 0, ice: 0, lightning: 0, wind: 0,
  earth: 0, arcane: 0, holy: 0, shadow: 0,
};

// v0.6.2: 学习过的能力记录
export interface LearnedAbility {
  abilityId: string;
  school: 'magic' | 'prayer' | 'battle_art';
  learnedAt: number;
}

export interface HistoryEntry {
  worldDay: number;
  region: string;
  subRegion?: string;
  location?: string;
  coordinates?: { x: number; y: number; z: number };
  summary: string;
}
