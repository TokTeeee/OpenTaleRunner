import { systemHooks } from '../SystemHooks';

// 战斗 → 士气+5（胜利）
systemHooks.add('combat.onEnd', (data) => {
  const d = data as Record<string, unknown>;
  const outcome = d.outcome as string;
  if (outcome !== 'victory') return data;

  const dc = (d.derivedChanges as Record<string, number>) || {};
  dc.morale = (dc.morale || 0) + 5;
  return { ...d, derivedChanges: dc };
}, { id: 'rule:combat:morale_victory', priority: 5, description: '战斗胜利 → 士气+5' });

// 战斗 → 士气-10（失败）
systemHooks.add('combat.onEnd', (data) => {
  const d = data as Record<string, unknown>;
  const outcome = d.outcome as string;
  if (outcome !== 'defeat') return data;

  const dc = (d.derivedChanges as Record<string, number>) || {};
  dc.morale = (dc.morale || 0) - 10;
  return { ...d, derivedChanges: dc };
}, { id: 'rule:combat:morale_defeat', priority: 5, description: '战斗失败 → 士气-10' });

// 战斗 → 时间消耗级联触发体力变化
systemHooks.add('combat.onEnd', (data) => {
  const d = data as Record<string, unknown>;
  const rounds = (d.rounds as number) || 1;

  // Don't cascade within this handler; just accumulate extra fatigue directly
  const dc = (d.derivedChanges as Record<string, number>) || {};
  dc.fatigue = (dc.fatigue || 0) + Math.round(rounds * 0.5);
  dc.hygiene = (dc.hygiene || 0) + Math.round(rounds * 0.1);

  return { ...d, derivedChanges: dc };
}, { id: 'rule:combat:fatigue', priority: 8, description: '战斗消耗 → 疲劳累积(每回合+0.5)' });

// 审计 P3 修复: 补全 combat.beforeRoll 规则
// 战斗前 → 虚弱状态命中率下调
systemHooks.add('combat.beforeRoll', (data, ctx) => {
  const d = data as Record<string, unknown>;
  const conditions = ctx.snapshot.character.conditions;
  if (!conditions.some(c => /虚弱|疲劳/.test(c))) return data;
  // 虚弱/疲劳 → 命中下调 (在 diceParams 上加 -1)
  const diceParams = (d.diceParams as Record<string, unknown>) || {};
  return { ...d, diceParams: { ...diceParams, penalty: ((diceParams.penalty as number) || 0) - 1 } };
}, { id: 'rule:combat:beforeRoll:weakness', priority: 5, description: '虚弱/疲劳 → 战斗前命中 -1' });

// 战斗前 → 士气鼓舞
systemHooks.add('combat.beforeRoll', (data, ctx) => {
  const d = data as Record<string, unknown>;
  const morale = ctx.snapshot.character.vital.morale;
  if (morale >= 70) {
    const diceParams = (d.diceParams as Record<string, unknown>) || {};
    return { ...d, diceParams: { ...diceParams, bonus: ((diceParams.bonus as number) || 0) + 1 } };
  }
  return data;
}, { id: 'rule:combat:beforeRoll:highMorale', priority: 4, description: '高士气 → 战斗前命中 +1' });
