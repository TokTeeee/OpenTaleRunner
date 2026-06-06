export interface Faction {
  name: string;
  attitude: number;
  description: string;
}

export interface SubRegion {
  name: string;
  type: string;
  description: string;
  canBeBirthplace?: boolean;
  can_be_birthplace?: boolean;
  coordinates?: { x: number; z: number };
}

export interface LocationSubtype {
  id: string;
  label: string;
  icon?: string;
  canBeBirthplace?: boolean;
  can_be_birthplace?: boolean;
}

export interface LocationType {
  label: string;
  subtypes: LocationSubtype[];
}

export interface StartingContext {
  regionId?: string;
  region_id?: string;
  subRegion?: string;
  sub_region?: string;
  description?: string;
  birthLocations: SubRegion[];
  birth_locations?: SubRegion[];
}

export interface NarrativeGuide {
  pointOfView?: string;
  point_of_view?: string;
  tone: string;
  sceneLength?: string;
  scene_length?: string;
  choiceRules?: string[];
  choice_rules?: string[];
  forbidden?: string[];
  consistencyChecks?: string[];
  consistency_checks?: string[];
}

export interface StoryKeyNPC {
  name: string;
  role: string;
  personality: string;
  appearance?: string;
  templateKey?: string;
  template_key?: string;
}

export interface NPCRoleTemplate {
  key: string;
  name: string;
  attributes: Record<string, number>;
  skills: Array<{ name: string; level: number; description: string; attribute: string }>;
  services?: string[];
}

export type PromptSlot =
  | 'identity'
  | 'worldLore'
  | 'narrativeGuide'
  | 'sceneGenerateTask'
  | 'combineAdvanceTask'
  | 'queryProtocol'
  | 'jsonSchemaAdvance'
  | 'jsonSchemaScene'
  | 'ghostNPCIntro'
  | 'knownNPCIntro'
  | 'preActionHint'
  | 'customInjection';

export interface PromptOverride {
  slot: PromptSlot;
  scope: 'global' | 'regional' | 'beat';
  targetIds?: string[];
  mode: 'replace' | 'prepend' | 'append';
  content: string;
  comment?: string;
}

export interface TerrainSeed {
  region: string;
  x_min: number;
  x_max: number;
  y_min: number;
  y_max: number;
  z_min: number;
  z_max: number;
  terrain_type: string;
  description: string;
}

export interface ArtStyle {
  prompt_prefix: string;
  portrait_ratio: string;
  landscape_ratio: string;
}

export interface BeatData {
  id: string;
  name: string;
  status: 'locked' | 'pending' | 'active' | 'unlocked' | 'completed';
  dependsOn?: string | null;
  depends_on?: string | null;
  unlockCondition?: string;
  unlock_condition?: string;
  narrativeUnlock?: string;
  narrative_when_unlocked?: string;
}

export interface ChapterData {
  id: string;
  name: string;
  summary?: string;
  worldDayRange?: [number, number];
  world_day_range?: [number, number];
  beats?: BeatData[];
}

export interface MainQuestData {
  premise?: string;
  currentChapter?: { id: string; name: string; summary?: string; worldDayRange?: [number, number] };
  current_chapter?: { id: string; name: string; summary?: string; world_day_range?: [number, number] };
  beats?: BeatData[];
  chapters?: ChapterData[];
  milestonesForNextChapter?: string;
  milestones_for_next_chapter?: string;
}

export interface MilestoneStatus {
  id: string;
  name: string;
  status: 'locked' | 'pending' | 'active' | 'completed' | 'unlocked';
  description?: string;
  triggerCondition?: string;
  trigger_condition?: string;
}

export interface RegionData {
  id: string;
  name: string;
  full_name?: string;
  description: string;
  terrain: string;
  weather?: string;
  weather_patterns?: string[];
  factions: Faction[];
  subRegions?: string[];
  sub_regions?: SubRegion[];
  keyNPCs?: StoryKeyNPC[];
  key_npcs?: StoryKeyNPC[];
  coordinates?: { x: number; y: number; z: number };
  currentEvents: string[];
  current_events?: string[];
  [key: string]: unknown;
}

export interface WorldLore {
  geography?: string;
  history_summary?: string;
  races?: string;
  magic_system?: { description?: string; rules?: string[] };
  deities_and_religion?: { description?: string; note?: string };
  worldspine_tower?: string;
}

export interface StoryBook {
  version: number;
  worldName?: string;
  world_name?: string;
  currentEra?: string;
  current_era?: string;
  worldLore?: WorldLore;
  world_lore?: WorldLore;
  regions: RegionData[];
  mainQuest?: MainQuestData;
  main_quest?: MainQuestData;
  milestones?: MilestoneStatus[];
  locationTypes?: Record<string, LocationType>;
  location_types?: Record<string, LocationType>;
  startingContext?: StartingContext;
  starting_context?: StartingContext;
  narrativeGuide?: NarrativeGuide;
  narrative_guide?: NarrativeGuide;
  npcRoleTemplates?: NPCRoleTemplate[];
  npc_role_templates?: NPCRoleTemplate[];
  terrainSeeds?: TerrainSeed[];
  terrain_seeds?: TerrainSeed[];
  promptOverrides?: PromptOverride[];
  art_style?: ArtStyle;
  [key: string]: unknown;
}

export interface GhostNPC {
  npcId: string;
  playerId: string;
  characterName: string;
  appearance: string;
  personalityTags: string[];
  recentActions: string;
  currentIntent: string;
  attitudeToStrangers: string;
  knownInfo: string[];
  region: string;
  expiresAt: number;
}

export interface Encounter {
  encounterId: string;
  type: 'meeting' | 'rivalry' | 'fate' | 'indirect';
  involvedPlayers: string[];
  region: string;
  description: string;
  timestamp: number;
  resolved: boolean;
}

export interface WorldChronicleEntry {
  id: string;
  worldDay: number;
  region: string;
  title: string;
  narrative: string;
  timestamp: number;
}
