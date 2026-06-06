import type { Character, Skill } from '../../types/character';
import type { SceneResponse } from '../../types/game';
import { PMEngine } from '../../services/engine/PMEngine';
import { JudgmentSystem } from '../../services/judgment/JudgmentSystem';
import { ChronicleRecorder } from '../../services/chronicle/ChronicleRecorder';

let __pmEngine: PMEngine | null = null;

export function getPmEngine(): PMEngine | null {
  return __pmEngine;
}

export function setPmEngine(engine: PMEngine | null): void {
  __pmEngine = engine;
}

export const _judgeSystem = new JudgmentSystem();
export const _chronicleRecorder = new ChronicleRecorder('player_local', '冒险者');

export const syncedMultiplayerRounds = new Set<string>();
export const appliedMultiplayerConsequences = new Set<string>();

let sharedPmError: string | null = null;
const pmErrorSubscribers = new Set<() => void>();

export function getPmError(): string | null {
  return sharedPmError;
}

export function setPmErrorShared(next: string | null): void {
  sharedPmError = next;
  for (const notify of pmErrorSubscribers) {
    notify();
  }
}

export function subscribePmError(fn: () => void): () => void {
  pmErrorSubscribers.add(fn);
  return () => {
    pmErrorSubscribers.delete(fn);
  };
}

export function findBestSkill(action: string, char: Character): Skill | null {
  const skills = char.skills;
  let best: Skill | null = null;
  let bestScore = 0;
  for (const s of skills) {
    let score = 0;
    for (const ch of s.name) { if (action.includes(ch)) score++; }
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

export function estimateAbsurdity(action: string, char: Character): number {
  const text = action.trim();
  if (!text) return 1;
  if (/神|秒杀|毁灭世界|复活所有人|凭空造物|瞬移到任何地方/.test(text)) return 9;
  if (/杀|砍|攻击|刺|夺|偷|潜入|翻墙|威胁/.test(text)) return 5;
  if (/观察|交谈|搜索|休息|前往|旅行|询问|查看/.test(text)) return 3;
  const bestSkill = findBestSkill(text, char);
  if (bestSkill?.level && bestSkill.level >= 3) return 2;
  return 4;
}

export function isCombatAction(action: string): boolean {
  return /战斗|攻击|砍|刺|射|劈|挥拳|斩杀|击倒|应战|迎战|拔剑|冲锋/.test(action);
}

export function formatMultiplayerDiceSummary(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '未公开判定';
  const dice = raw as Record<string, unknown>;
  if (dice.auto) return '无需检定';
  const outcome = String(dice.outcome ?? 'unknown');
  const outcomeLabel: Record<string, string> = {
    critical_success: '大成功',
    success: '成功',
    partial_success: '部分成功',
    failure: '失败',
    critical_failure: '大失败',
  };
  const diceValues = Array.isArray(dice.diceValues) ? dice.diceValues.join(', ') : '';
  const finalResult = dice.finalResult ?? '-';
  const difficulty = dice.difficultyLC ?? '-';
  return `2d6[${diceValues}] → ${outcomeLabel[outcome] || outcome} (${finalResult}/${difficulty})`;
}

export const INITIALIZATION_ACK_PATTERNS = [
  /^(好的|明白了|收到|当然|已了解|了解了|我将|我会|让我们开始)/,
  /作为\s*(game master|gm|主持人)/i,
  /我将作为/,
  /我会作为/,
  /请告诉我/,
  /准备好开始/,
];

export const DEFAULT_SCENE_CHOICE_TEXTS = ['仔细观察周围环境', '向前探索', '先做好准备'];

export function hasDefaultSceneChoices(response: SceneResponse): boolean {
  if (!response.choices || response.choices.length !== DEFAULT_SCENE_CHOICE_TEXTS.length) return false;
  return response.choices.every((choice, index) => choice.text === DEFAULT_SCENE_CHOICE_TEXTS[index]);
}

export function looksLikeInitializationAck(response: SceneResponse): boolean {
  const content = response.sceneDescription.trim().replace(/\s+/g, ' ');
  if (!content || response.currentLocation) return false;
  if (!hasDefaultSceneChoices(response)) return false;
  return INITIALIZATION_ACK_PATTERNS.some((pattern) => pattern.test(content));
}

export function resolveLocationParts(rawLocation: string, fallbackSubRegion: string) {
  const normalized = rawLocation.trim();
  const parts = normalized.split('·').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return { fullPath: normalized, subRegion: parts[1], specificPlace: parts.slice(2).join('·') };
  }
  if (parts.length === 2) {
    return { fullPath: normalized, subRegion: parts[0], specificPlace: parts[1] };
  }
  return { fullPath: normalized, subRegion: fallbackSubRegion, specificPlace: normalized };
}
