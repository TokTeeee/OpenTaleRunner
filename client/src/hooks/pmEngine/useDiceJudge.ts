import { useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import type { Character, AttributeName } from '../../types/character';
import type { JudgeParams } from '../../types/game';
import { absurdityToLC } from '../../utils/dice';
import { _judgeSystem, estimateAbsurdity, findBestSkill } from './shared';

export interface DiceJudgeResult {
  auto: boolean;
  outcome: 'success' | 'failure' | 'critical';
  reason: string;
  difficultyLC: number;
}

/**
 * Dice/judgment abstraction. Used by both single & multiplayer submit paths.
 * - absurdity <= 2: auto-success (no real check)
 * - absurdity > 2:  evaluate via _judgeSystem
 *
 * v0.5.11: extracted from useActionSubmit.ts buildMultiplayerDiceResult (line 51-84).
 */
export function useDiceJudge() {
  const judgeAction = useCallback(
    (action: string, char: Character | null): DiceJudgeResult | null => {
      if (!char) return null;
      const game = useGameStore.getState();
      const absurdity = estimateAbsurdity(action, char);
      if (absurdity <= 2) {
        return {
          auto: true,
          outcome: 'success',
          reason: '无需检定',
          difficultyLC: absurdityToLC(absurdity),
        };
      }

      const bestSkill = findBestSkill(action, char);
      const judgeParams: JudgeParams = {
        absurdityLevel: absurdity,
        difficultyLC: absurdityToLC(absurdity),
        reason: '多人模式本地判定',
        relevantSkill: bestSkill?.name || null,
        relevantAttribute: (bestSkill?.relatedAttribute as AttributeName) || 'WIS',
      };

      return _judgeSystem.evaluate(judgeParams, char, {
        worldDay: game.currentDay,
        region: game.currentRegion,
        subRegion: game.currentSubRegion,
        coordinates: game.coordinates,
        terrain: game.terrain,
        weather: game.weather,
        factions: [],
        recentEvents: [],
        remainingActionPoints: 0,
      }) as unknown as DiceJudgeResult;
    },
    [],
  );

  return { judgeAction };
}
