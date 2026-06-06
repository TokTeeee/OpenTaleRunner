export interface ContextSource {
  id: string;
  type: string;
  freshness: string;
  priorityWeight: number;
  situationalRelevance: number;
  data: unknown;
  estimatedTokens: number;
}

export const DEFAULT_PRIORITY_WEIGHTS: Record<string, number> = {
  'character_hp_status':    100,
  'current_location':        95,
  'player_action':           90,
  'dice_result':             90,
  'character_equipped':      85,
  'character_skills':        80,
  'character_attributes':    75,
  'known_npc_high':          70,
  'scene_weather_light':     65,
  'known_npc_medium':        55,
  'ghost_npc_same_subregion': 50,
  'character_vital':         45,
  'character_backpack':      40,
  'ghost_npc_same_region':   35,
  'region_factions':         30,
  'region_events':           25,
  'world_milestones':        20,
  'world_chronicle':         15,
  'character_recent_history': 12,
  'character_conditions':    10,
  'world_lore':               5,
};

const SITUATIONAL_MATRIX: Record<string, Record<string, number>> = {
  'known_npc':        { base: 50, combat: 30, social: 90, explore: 60, idle: 50 },
  'ghost_npc':        { base: 30, combat: 20, social: 50, explore: 60, idle: 30 },
  'character_equipped': { base: 70, combat: 95, social: 20, explore: 40, idle: 50 },
  'character_skills': { base: 50, combat: 80, social: 60, explore: 50, idle: 40 },
  'character_backpack': { base: 40, combat: 50, social: 30, explore: 60, idle: 35 },
  'region_factions':  { base: 30, combat: 20, social: 70, explore: 40, idle: 30 },
  'region_events':    { base: 25, combat: 40, social: 35, explore: 50, idle: 20 },
  'world_lore':       { base: 5,  combat: 5,  social: 10, explore: 15, idle: 5 },
};

export type PlayerActionType = 'combat' | 'social' | 'explore' | 'idle' | 'unknown';

export function calculateSituationalRelevance(
  sourceType: string,
  actionType: PlayerActionType,
): number {
  const matrix = SITUATIONAL_MATRIX[sourceType];
  if (!matrix) return 30;
  return matrix[actionType] ?? matrix.base;
}

export function inferActionType(action: string): PlayerActionType {
  if (/[攻击打砍刺射杀战斗劈挥拳]/ .test(action)) return 'combat';
  if (/[说谈话问问交涉交易讨聊讲]/ .test(action)) return 'social';
  if (/[探索索前往进入开门爬跳跃行走移动到]/ .test(action)) return 'explore';
  return 'idle';
}

export class ContextMerger {
  merge(
    sources: ContextSource[],
    maxTokens: number,
    actionType: PlayerActionType,
  ): ContextSource[] {
    const deduped = this.deduplicate(sources);

    const scored = deduped.map(s => ({
      source: s,
      score: s.priorityWeight + calculateSituationalRelevance(s.type, actionType),
    }));

    scored.sort((a, b) => b.score - a.score);

    const result: ContextSource[] = [];
    let usedTokens = 0;

    for (const { source } of scored) {
      if (usedTokens + source.estimatedTokens <= maxTokens) {
        result.push(source);
        usedTokens += source.estimatedTokens;
      } else if (source.priorityWeight > 70) {
        const slimSource = this.slimify(source, maxTokens - usedTokens);
        if (slimSource) {
          result.push(slimSource);
          usedTokens += slimSource.estimatedTokens;
        }
      } else {
        break;
      }
    }

    return result;
  }

  private deduplicate(sources: ContextSource[]): ContextSource[] {
    const seen = new Set<string>();
    const result: ContextSource[] = [];

    const sorted = [...sources].sort((a, b) => b.freshness.localeCompare(a.freshness));

    for (const s of sorted) {
      const key = this.getDedupeKey(s);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(s);
      }
    }

    return result;
  }

  private getDedupeKey(source: ContextSource): string {
    switch (source.type) {
      case 'known_npc':
      case 'ghost_npc': {
        const npc = source.data as Record<string, unknown>;
        return `npc:${npc.npcId || npc.characterName || 'unknown'}`;
      }
      case 'region_state':
      case 'region_events':
        return `region:${(source.data as Record<string, unknown>)?.id || 'unknown'}`;
      default:
        return `${source.type}:${JSON.stringify(source.data).slice(0, 50)}`;
    }
  }

  private slimify(source: ContextSource, maxTokens: number): ContextSource | null {
    switch (source.type) {
      case 'known_npc': {
        const npc = source.data as Record<string, unknown>;
        return {
          ...source,
          estimatedTokens: Math.min(15, maxTokens),
          data: { name: npc.name, relationship: npc.relationship },
        };
      }
      case 'character_skills': {
        const data = source.data as unknown[];
        const names = Array.isArray(data) ? data.map((s: unknown) => (s as Record<string, unknown>)?.name).join('、') : '';
        return {
          ...source,
          estimatedTokens: Math.min(20, maxTokens),
          data: `技能: ${names}`,
        };
      }
      default:
        return null;
    }
  }
}
