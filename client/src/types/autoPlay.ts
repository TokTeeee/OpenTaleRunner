import type { Choice } from './game';

export type AutoPlayStatus = 'idle' | 'running' | 'paused' | 'error';

export interface AutoPlayState {
  status: AutoPlayStatus;
  currentRound: number;
  totalRounds: number;
  lastAction: string;
  lastReasoning: string;
  errorMessage: string;
  intervalMs: number;
}

export interface PlayerDecision {
  choiceIndex: number;
  customAction: string;
  reasoning: string;
  style: 'combat' | 'social' | 'explore';
}

export interface PlayerDecisionContext {
  characterName: string;
  characterBackground: string;
  attributes: Record<string, number>;
  hp: number;
  maxHp: number;
  vital: Record<string, number>;
  recentActions: string[];
  sceneDescription: string;
  choices: Choice[];
}