export interface ConditionEffect {
  dicePenalty: number;
  travelSpeedMultiplier: number;
  regenMultiplier: number;
  socialPenalty: number;
  visionMultiplier: number;
  description: string;
}

// v0.4 战斗系统: 每个 condition 的元数据 (回合制时长、6 维修饰符、tick 回调).
// 这是 v0.3 永久 condition 向 v0.4 战斗 BuffInstance 过渡的旁路表 — 不破 v0.3 schema,
// BuffManager 调 getConditionMeta(key) 拿到 modifiers / defaultDuration, 然后构造 BuffInstance.
// 所有 meta 字段都 optional, 缺省走 v0.3 行为 (永久 condition, 无属性修饰).
import type { Attributes } from '../../types/character';

export interface ConditionMeta {
  /** 该 condition 给 6 维属性的加减 (e.g. { DEX: -2 }) */
  modifiers?: Partial<Attributes>;
  /** 默认 buff 持续回合数; undefined = 永久 (v0.3 行为) */
  defaultDuration?: number;
  /** 复杂效果 (DOT/HOT) 回调签名 — buff 在每回合 turnEnd 触发 */
  onTick?: { hpDelta: number; description: string };
}

const CONDITION_META: Record<string, ConditionMeta> = {
  '中毒':   { modifiers: { CON: -1 }, defaultDuration: 5, onTick: { hpDelta: -1, description: '毒素持续侵蚀' } },
  '受伤':   { modifiers: { STR: -1, DEX: -1 }, defaultDuration: 3 },
  '骨折':   { modifiers: { STR: -3, DEX: -3 }, defaultDuration: 8, onTick: { hpDelta: -1, description: '骨折处剧痛' } },
  '烧伤':   { modifiers: { CON: -1 }, defaultDuration: 4, onTick: { hpDelta: -1, description: '烧伤处疼痛' } },
  '冻伤':   { modifiers: { DEX: -2 }, defaultDuration: 4 },
  '失明':   { modifiers: { DEX: -4 }, defaultDuration: 6 },
  '听力受损': { defaultDuration: 8 },
  '虚弱':   { modifiers: { STR: -2, DEX: -1, CON: -1 }, defaultDuration: 5 },
  '恐惧':   { modifiers: { WIS: -1, CHA: -1 }, defaultDuration: 3 },
  '困惑':   { modifiers: { INT: -1, WIS: -1 }, defaultDuration: 2 },
  '诅咒':   { modifiers: { CON: -2 }, defaultDuration: 99 },
  '疾病':   { modifiers: { CON: -1 }, defaultDuration: 6, onTick: { hpDelta: -1, description: '疾病持续消耗体力' } },
  '昏迷':   { modifiers: { STR: -10, DEX: -10, INT: -10 }, defaultDuration: 3 },
  '醉酒':   { modifiers: { DEX: -2, INT: -1, WIS: -1 }, defaultDuration: 3 },
  '麻痹':   { modifiers: { STR: -3, DEX: -3 }, defaultDuration: 4 },
  // v0.4 战斗引入的 condition (战斗系统生成的临时标记)
  'wounded_1': { modifiers: { STR: -1 }, defaultDuration: 3 },
  'wounded_2': { modifiers: { STR: -2, DEX: -1 }, defaultDuration: 5 },
  'wounded_3': { modifiers: { STR: -3, DEX: -2, CON: -1 }, defaultDuration: 8 },
  'humiliated': { modifiers: { CHA: -2 }, defaultDuration: 3 },
  'perma-wound': { modifiers: { STR: -1, DEX: -1 } }, // 永久
  '流血':   { modifiers: { CON: -1 }, defaultDuration: 4, onTick: { hpDelta: -1, description: '伤口持续流血' } },
  '闪避+2': { modifiers: { DEX: 2 }, defaultDuration: 3 },
  '致盲':   { modifiers: { DEX: -3 }, defaultDuration: 2 },
  '中毒_剧毒': { modifiers: { CON: -3 }, defaultDuration: 8, onTick: { hpDelta: -2, description: '剧毒持续侵蚀' } },
};

/** 查询 condition 的元数据. 找不到时返回 null (不抛错, 让调用方走 default). */
export function getConditionMeta(condition: string): ConditionMeta | null {
  if (CONDITION_META[condition]) return CONDITION_META[condition];
  for (const [key, meta] of Object.entries(CONDITION_META)) {
    if (condition.includes(key)) return meta;
  }
  return null;
}

/** 列出所有已注册 condition 的 key (UI 显示 / 调试用) */
export function listConditionKeys(): string[] {
  return Object.keys(CONDITION_META);
}

const CONDITION_REGISTRY: Record<string, ConditionEffect> = {
  '中毒':   { dicePenalty: 2, travelSpeedMultiplier: 0.8, regenMultiplier: 0.5, socialPenalty: 0, visionMultiplier: 1.0, description: '持续受到毒素侵蚀，HP不会自然恢复' },
  '受伤':   { dicePenalty: 1, travelSpeedMultiplier: 0.7, regenMultiplier: 0.8, socialPenalty: 0, visionMultiplier: 1.0, description: '伤口影响行动和战斗' },
  '骨折':   { dicePenalty: 3, travelSpeedMultiplier: 0.4, regenMultiplier: 0.3, socialPenalty: 5, visionMultiplier: 1.0, description: '严重骨折，行动极度受限' },
  '烧伤':   { dicePenalty: 1, travelSpeedMultiplier: 0.9, regenMultiplier: 0.7, socialPenalty: 0, visionMultiplier: 1.0, description: '烧伤处疼痛敏感' },
  '冻伤':   { dicePenalty: 2, travelSpeedMultiplier: 0.6, regenMultiplier: 0.5, socialPenalty: 0, visionMultiplier: 1.0, description: '冻伤使身体僵硬' },
  '失明':   { dicePenalty: 4, travelSpeedMultiplier: 0.3, regenMultiplier: 1.0, socialPenalty: 5, visionMultiplier: 0.0, description: '完全无法视物' },
  '听力受损': { dicePenalty: 1, travelSpeedMultiplier: 1.0, regenMultiplier: 1.0, socialPenalty: 10, visionMultiplier: 1.0, description: '听力严重下降' },
  '虚弱':   { dicePenalty: 2, travelSpeedMultiplier: 0.5, regenMultiplier: 0.5, socialPenalty: 0, visionMultiplier: 1.0, description: '全身虚弱无力' },
  '恐惧':   { dicePenalty: 1, travelSpeedMultiplier: 1.2, regenMultiplier: 1.0, socialPenalty: 3, visionMultiplier: 1.0, description: '恐惧使行为判断力下降，但跑得更快' },
  '困惑':   { dicePenalty: 2, travelSpeedMultiplier: 0.8, regenMultiplier: 1.0, socialPenalty: 0, visionMultiplier: 1.0, description: '思维混乱，难以集中注意力' },
  '诅咒':   { dicePenalty: 2, travelSpeedMultiplier: 0.9, regenMultiplier: 0.0, socialPenalty: 10, visionMultiplier: 1.0, description: '被诅咒标记，无法自然恢复' },
  '疾病':   { dicePenalty: 1, travelSpeedMultiplier: 0.7, regenMultiplier: 0.3, socialPenalty: 0, visionMultiplier: 1.0, description: '疾病持续消耗体力' },
  '昏迷':   { dicePenalty: 99, travelSpeedMultiplier: 0.0, regenMultiplier: 0.0, socialPenalty: 99, visionMultiplier: 0.0, description: '彻底失去意识' },
  '醉酒':   { dicePenalty: 2, travelSpeedMultiplier: 0.7, regenMultiplier: 1.0, socialPenalty: 5, visionMultiplier: 0.8, description: '酒精影响判断和平衡' },
  '麻痹':   { dicePenalty: 3, travelSpeedMultiplier: 0.3, regenMultiplier: 1.0, socialPenalty: 3, visionMultiplier: 1.0, description: '身体麻痹，几乎无法行动' },
};

export function resolveConditionEffects(conditions: string[]): ConditionEffect {
  const result: ConditionEffect = {
    dicePenalty: 0, travelSpeedMultiplier: 1.0, regenMultiplier: 1.0,
    socialPenalty: 0, visionMultiplier: 1.0, description: '',
  };

  for (const condition of conditions) {
    if (CONDITION_REGISTRY[condition]) {
      const eff = CONDITION_REGISTRY[condition];
      result.dicePenalty = Math.max(result.dicePenalty, eff.dicePenalty);
      result.travelSpeedMultiplier = Math.min(result.travelSpeedMultiplier, eff.travelSpeedMultiplier);
      result.regenMultiplier = Math.min(result.regenMultiplier, eff.regenMultiplier);
      result.socialPenalty = Math.max(result.socialPenalty, eff.socialPenalty);
      result.visionMultiplier = Math.min(result.visionMultiplier, eff.visionMultiplier);
      result.description = result.description ? result.description + '; ' + eff.description : eff.description;
      continue;
    }

    for (const [key, eff] of Object.entries(CONDITION_REGISTRY)) {
      if (condition.includes(key)) {
        result.dicePenalty = Math.max(result.dicePenalty, eff.dicePenalty);
        result.travelSpeedMultiplier = Math.min(result.travelSpeedMultiplier, eff.travelSpeedMultiplier);
        result.regenMultiplier = Math.min(result.regenMultiplier, eff.regenMultiplier);
        result.socialPenalty = Math.max(result.socialPenalty, eff.socialPenalty);
        result.visionMultiplier = Math.min(result.visionMultiplier, eff.visionMultiplier);
        break;
      }
    }
  }

  if (conditions.length > 0 && result.dicePenalty === 0
    && result.travelSpeedMultiplier === 1.0 && result.regenMultiplier === 1.0) {
    result.dicePenalty = 1;
  }

  return result;
}

export function getConditionDescription(condition: string): string {
  if (CONDITION_REGISTRY[condition]) return CONDITION_REGISTRY[condition].description;
  for (const [key, eff] of Object.entries(CONDITION_REGISTRY)) {
    if (condition.includes(key)) return eff.description;
  }
  return '未识别的异常状态';
}

export { CONDITION_REGISTRY };
