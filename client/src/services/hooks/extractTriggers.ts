import type { TriggerPayload } from '../../types/hooks';
import type { NarrativeResponse } from '../../types/game';
import { useGameStore } from '../../stores/gameStore';
import { useCharacterStore } from '../../stores/characterStore';
import { parseTimeElapsed } from './timeUtils';

/**
 * 从 GM 叙事与玩家行动中提取钩子触发器.
 *
 * 审计 P3 修复: 文档承诺 17 个 namespace, 现全部覆盖:
 *   vital:     onTimeElapsed, onRestStart, onRestEnd, beforeApply
 *   combat:    onEnd, beforeRoll
 *   condition: onAdded, onRemoved, onTick
 *   travel:    onStart, onTerrainChange, onWeatherChange
 *   item:      onUse, onEquip
 *   party:     onMemberJoin, onMemberLeave, beforeCombatBonus
 *
 * 触发器来源:
 *   - 'gm'       : 从 narrative 文本/字段解析
 *   - 'derived'  : 从前后快照差异检测 (地形/天气变化)
 */
export function extractTriggers(narrative: NarrativeResponse, action: string): TriggerPayload[] {
  const triggers: TriggerPayload[] = [];
  const char = useCharacterStore.getState().character;
  const game = useGameStore.getState();
  const cons = narrative.consequences;

  // 1. vital.onTimeElapsed
  if (narrative.timeElapsed) {
    const hours = parseTimeElapsed(narrative.timeElapsed);
    if (hours > 0) {
      triggers.push({
        namespace: 'vital.onTimeElapsed',
        data: {
          hours,
          activity: inferActivity(action),
          terrain: narrative.atmosphere ? game.terrain : game.terrain,
          weather: game.weather,
          narrative: narrative.narrative,
        },
        source: 'gm',
      });
    }
  }

  // 2. vital.onRestStart
  if (/休息|扎营|睡觉|旅店|过夜|露营/.test(action)) {
    triggers.push({
      namespace: 'vital.onRestStart',
      data: {
        hours: 8,
        hasShelter: /旅店|屋内|山洞|帐篷/.test(narrative.narrative ?? ''),
        hasFire: /篝火|壁炉|火堆/.test(narrative.narrative ?? ''),
      },
      source: 'gm',
    });

    // 3. vital.onRestEnd — 休息动作结束 (后续时段)
    triggers.push({
      namespace: 'vital.onRestEnd',
      data: {
        hours: 8,
        derivedChanges: {},
      },
      source: 'gm',
    });
  }

  // 4. vital.beforeApply — 准备写入 consequence 前, 给规则最后一次修改机会
  triggers.push({
    namespace: 'vital.beforeApply',
    data: {
      stateChanges: cons?.stateChanges ?? {},
      consequences: cons ?? {},
    },
    source: 'gm',
  });

  // 5. combat.beforeRoll — 涉及判定/攻击的行动
  if (/攻击|砍|刺|射|劈|挥拳|斩杀|投掷|施法|施放|尝试|判定/.test(action)) {
    triggers.push({
      namespace: 'combat.beforeRoll',
      data: {
        diceParams: { action, attackerHp: char?.hp ?? 0 },
      },
      source: 'gm',
    });
  }

  // 6. combat.onEnd
  const isCombat = /战斗|攻击|砍|刺|射|劈|挥拳|斩杀|击倒|应战/.test(action)
    || narrative.atmosphere?.dangerLevel === 'high'
    || /敌人|怪物|魔物|守卫|袭击/.test(narrative.narrative ?? '');
  if (isCombat) {
    triggers.push({
      namespace: 'combat.onEnd',
      data: {
        rounds: estimateRounds(narrative.narrative ?? ''),
        outcome: inferOutcome(narrative),
        enemy: (narrative.narrative ?? '').match(/(\S{1,4}(?:怪|龙|魔|敌人|守卫|士兵))/)?.[1] || '敌人',
      },
      source: 'gm',
    });

    // 14. party.beforeCombatBonus — 战斗相关, 在战斗判定前
    triggers.push({
      namespace: 'party.beforeCombatBonus',
      data: {
        bonus: 0,
        partySize: 0,
      },
      source: 'derived',
    });
  }

  // 7. condition.onAdded
  if (cons?.conditionsAdded?.length) {
    for (const condition of cons.conditionsAdded) {
      triggers.push({
        namespace: 'condition.onAdded',
        data: { condition },
        source: 'gm',
      });
    }
  }

  // 8. condition.onRemoved
  if (cons?.conditionsRemoved?.length) {
    for (const condition of cons.conditionsRemoved) {
      triggers.push({
        namespace: 'condition.onRemoved',
        data: { condition },
        source: 'gm',
      });
    }
  }

  // 9. condition.onTick — 时间流逝时统一 tick
  const hours = narrative.timeElapsed ? parseTimeElapsed(narrative.timeElapsed) : 0;
  if (hours > 0 && char?.conditions?.length) {
    triggers.push({
      namespace: 'condition.onTick',
      data: { hours, conditions: char.conditions },
      source: 'derived',
    });
  }

  // 10. travel.onStart
  if (/旅行|前往|出发|赶路|穿过|走过|行进|启程/.test(action)) {
    triggers.push({
      namespace: 'travel.onStart',
      data: {
        from: { region: game.currentRegion, subRegion: '' },
        to: { region: '', subRegion: '' },
        terrain: game.terrain,
        estimatedHours: hours,
      },
      source: 'gm',
    });
  }

  // 11. travel.onTerrainChange
  const narrativeTerrain = extractTerrain(narrative.narrative ?? '');
  if (narrativeTerrain && narrativeTerrain !== game.terrain) {
    triggers.push({
      namespace: 'travel.onTerrainChange',
      data: {
        oldTerrain: game.terrain,
        newTerrain: narrativeTerrain,
      },
      source: 'derived',
    });
  }

  // 12. travel.onWeatherChange
  const narrativeWeather = extractWeather(narrative.narrative ?? '');
  if (narrativeWeather && narrativeWeather !== game.weather) {
    triggers.push({
      namespace: 'travel.onWeatherChange',
      data: {
        oldWeather: game.weather,
        newWeather: narrativeWeather,
      },
      source: 'derived',
    });
  }

  // 13. item.onUse
  if (/使用|服用|喝|吃|饮用|吞下|使用物品|打开/.test(action)) {
    triggers.push({
      namespace: 'item.onUse',
      data: {
        item: { name: action.match(/(?:使用|服用|喝|吃|饮用|吞下|打开)([\u4e00-\u9fff]{1,8})/)?.[1] || '物品' },
      },
      source: 'gm',
    });
  }

  // 14. item.onEquip
  if (/装备|穿上|戴上|佩戴|手持|拔出|拔出武器|装备上/.test(action)) {
    triggers.push({
      namespace: 'item.onEquip',
      data: {
        item: { name: action.match(/(?:装备|穿上|戴上|佩戴|手持|拔出)([\u4e00-\u9fff]{1,8})/)?.[1] || '装备' },
        slot: inferEquipSlot(action),
      },
      source: 'gm',
    });
  }

  // 15. party.onMemberJoin
  if (/加入|结伴|同行|招募|队伍.+新成员|欢迎.+加入/.test(narrative.narrative ?? '')
    || /加入|结伴|同行|招募/.test(action)) {
    triggers.push({
      namespace: 'party.onMemberJoin',
      data: {
        member: {
          name: narrative.npcsIntroduced?.[0]?.name || '新成员',
        },
      },
      source: 'gm',
    });
  }

  // 16. party.onMemberLeave
  if (/离开|分别|退出|离队|退出队伍|分道扬镳/.test(narrative.narrative ?? '')
    || /离开|分别|退出|离队/.test(action)) {
    triggers.push({
      namespace: 'party.onMemberLeave',
      data: {
        member: { name: narrative.npcsIntroduced?.[0]?.name || '成员' },
        reason: 'narrative',
      },
      source: 'gm',
    });
  }

  return triggers;
}

function inferActivity(action: string): string {
  if (/战斗|攻击|砍|刺|射|劈|防御|迎战/.test(action)) return 'combat';
  if (/旅行|前往|出发|赶路|穿过|走过|行进/.test(action)) return 'travel';
  if (/休息|扎营|睡觉|旅店|过夜/.test(action)) return 'rest';
  return 'idle';
}

function estimateRounds(narrative: string): number {
  const match = narrative.match(/(\d+)\s*(?:回合|轮|次)/);
  if (match) return parseInt(match[1], 10);
  if (narrative.length > 300) return 3;
  return 1;
}

function inferOutcome(narrative: NarrativeResponse): string {
  const text = narrative.narrative ?? '';
  const choices = narrative.choices ?? [];
  if (/胜利|击败|击退|打倒|成功击败/.test(text)) return 'victory';
  if (/失败|受伤|逃跑|撤退|被击败|倒下/.test(text)) return 'defeat';
  if (choices.length > 0 && choices.some(c => c.tendency === 'combat')) return 'ongoing';
  return 'victory';
}

function extractTerrain(text: string): string | null {
  // 常见地形关键字
  const terrains = ['平原', '森林', '山地', '沙漠', '沼泽', '雪原', '冰原', '海洋', '城市', '村庄', '道路', '焦土', '地下'];
  for (const t of terrains) {
    if (text.includes(t)) return t;
  }
  return null;
}

function extractWeather(text: string): string | null {
  const weathers = ['晴', '阴', '雨', '雪', '暴风雪', '暴风雨', '飓风', '雾', '沙尘暴', '炎热', '酷暑'];
  for (const w of weathers) {
    if (text.includes(w)) return w;
  }
  return null;
}

function inferEquipSlot(action: string): string {
  if (/武器|剑|刀|弓|杖|匕首|斧/.test(action)) return 'weapon';
  if (/甲|护甲|衣|袍|盾|头盔/.test(action)) return 'armor';
  if (/戒指|项链|护符|饰品|坠/.test(action)) return 'accessory';
  return 'unknown';
}
