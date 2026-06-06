export type GamePhase = 'title' | 'creation' | 'playing' | 'resting' | 'paused';
export type DiceOutcome = 'critical_success' | 'success' | 'partial_success' | 'failure' | 'critical_failure';

export const OUTCOME_LABELS: Record<DiceOutcome, string> = {
  critical_success: '大成功', success: '成功', partial_success: '部分成功',
  failure: '失败', critical_failure: '大失败',
};

export interface Choice {
  text: string; hint: string;
  tendency: 'combat' | 'social' | 'explore' | 'opportunistic' | 'avoid';
}

export interface KnownLocation {
  name: string;
  region: string;
  coordinates: { x: number; z: number };
  discoveredAt: string;
  visitedCount: number;
}

export interface StructuredLocation {
  region: string;
  regionName: string;
  subRegion: string;
  specificPlace: string;
  description: string;
  coordinates: { x: number; y: number; z: number };
  firstVisitedAt: string;
  lastVisitedAt: string;
  visitCount: number;
  isKnown: boolean;
}

export interface LocationSnapshot {
  history: StructuredLocation[];
  current: StructuredLocation | null;
}

export interface RoundSummaryDetail {
  playerId: string;
  playerName: string;
  action: string;
  dice: string;
}

export interface Message {
  id: string;
  type: 'pm' | 'player' | 'system' | 'divider' | 'round_summary';
  content: string;
  timestamp: number;
  round?: number;
  details?: RoundSummaryDetail[];
}

export interface DiceResult {
  diceType: string; diceValues: number[]; total: number;
  attributeModifier: number; skillBonus: number; equipmentBonus: number;
  sceneModifier: number; difficultyLC: number;
  finalResult: number; outcome: DiceOutcome;
  conditionsPenalty?: number;
  nightPenalty?: number;
  elementalDamage?: Record<string, number>;
  elementalResist?: Record<string, number>;
  partyBonus?: number;
  partyMemberActions?: Array<{
    memberId: string;
    memberName: string;
    abilityName: string;
    effect: string;
  }>;
}

export interface SceneContext {
  worldDay: number; region: string; subRegion: string;
  location?: string; coordinates: { x: number; y: number; z: number };
  terrain: string; weather: string;
  factions: Array<{ name: string; attitude: number }>;
  recentEvents: string[];
  remainingActionPoints?: number;
}

export interface ActionContext {
  worldDay: number; region: string; subRegion: string; location: string;
  coordinates: { x: number; y: number; z: number };
  terrain: string; weather: string;
  factions: Array<{ name: string; attitude: number }>;
  recentEvents: string[];
  playerAction: string; characterSummary: string;
}

export interface SceneResponse {
  sceneDescription: string; choices: Choice[];
  sceneModifier: number; atmosphere: { mood: string; dangerLevel: string };
  currentLocation?: string;
}

export interface JudgeParams {
  absurdityLevel: number; difficultyLC: number; reason: string;
  relevantSkill: string | null; relevantAttribute: string | null;
}

export interface NPCIntroduced {
  name: string; title: string; appearance: string; personality: string;
  region: string; relation_to_player: string;
}

export interface StateChanges {
  hunger?: number; thirst?: number; fatigue?: number;
  hygiene?: number; morale?: number; wound?: number;
  temperature?: number; encumbrance?: number;
}

export interface ItemGainedData {
  name: string;
  category?: string;
  subCategory?: string;
  quality?: string;
  quantity?: number;
  description?: string;
  effects?: Array<{ type?: string; value?: number | string | Record<string, unknown>; description?: string }>;
  replacesItemId?: string;
}

export interface ItemLostData {
  itemId?: string;
  name?: string;
  quantity?: number;
}

export interface ItemModifiedData {
  itemId: string;
  newName?: string;
  newQuality?: string;
  description?: string;
  addedEffects?: Array<{ type?: string; value?: number | string | Record<string, unknown>; description?: string }>;
  durabilityChange?: number;
}

export interface SkillModifiedData {
  skillId: string;
  newName?: string;
  newDescription?: string;
  levelChange?: number;
}

export interface ConsequenceData {
  itemsGained: ItemGainedData[];
  itemsLost: ItemLostData[];
  itemsModified: ItemModifiedData[];
  skillsModified: SkillModifiedData[];
  currencyChange: { gold?: number; silver?: number; copper?: number };
  reputationChange: Record<string, number>;
  worldEffects: string[];
  skillsLearned: Array<{ name: string; description: string }>;
  hpChange: number;
  stateChanges: StateChanges;
  attributeChanges?: Partial<Record<string, number>>;
  identityChanges?: { name?: string; appearance?: string; background?: string };
  conditionsAdded?: string[];
  conditionsRemoved?: string[];
}

export interface NarrativeResponse {
  narrative: string; npcsIntroduced: NPCIntroduced[];
  sceneDescription?: string; choices: Choice[];
  sceneModifier: number; atmosphere: { mood: string; dangerLevel: string };
  consequences: ConsequenceData;
  timeElapsed: string;
  /** GM 直接设置绝对时间, 形如 "20:00" / "第3天 20:30", 优先级高于 time_elapsed */
  setTime?: string;
  currentLocation: string;
  // v0.4 战斗系统补齐: LLM 输出中提取的结构化 toolcall 列表 (e.g. startCombat)
  // 由 PMEngine 解析后附加; 调用方可调 ToolCallRegistry.dispatch() 串行执行
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
}
