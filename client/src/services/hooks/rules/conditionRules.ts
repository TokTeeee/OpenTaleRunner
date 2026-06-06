import { systemHooks } from '../SystemHooks';

/**
 * 审计 P3 修复: 补全 condition 三个 namespace 规则订阅
 *   - condition.onAdded: 异常状态新增时
 *   - condition.onRemoved: 异常状态被移除时
 *   - condition.onTick: 异常状态定期 tick
 */

// 中毒 → HP 持续下降
systemHooks.add('condition.onAdded', (data) => {
  const d = data as Record<string, unknown>;
  const condition = d.condition as string;
  if (!/中毒/.test(condition)) return data;
  return { ...d, _notifications: [...((d._notifications as string[]) || []), '中毒状态激活: 每 8 小时 HP -1'] };
}, { id: 'rule:cond:onAdded:poison', priority: 5, description: '中毒状态激活 → 持续 HP 流失' });

// 冻伤 → 移动减慢
systemHooks.add('condition.onAdded', (data) => {
  const d = data as Record<string, unknown>;
  const condition = d.condition as string;
  if (!/冻伤/.test(condition)) return data;
  return { ...d, _notifications: [...((d._notifications as string[]) || []), '冻伤状态: 移动和战斗效率下降'] };
}, { id: 'rule:cond:onAdded:frostbite', priority: 5, description: '冻伤状态激活 → 行动效率下降' });

// 虚弱 → 疲劳累积加速
systemHooks.add('condition.onAdded', (data) => {
  const d = data as Record<string, unknown>;
  const condition = d.condition as string;
  if (!/虚弱/.test(condition)) return data;
  return { ...d, _notifications: [...((d._notifications as string[]) || []), '虚弱状态: 疲劳累积速度 × 2'] };
}, { id: 'rule:cond:onAdded:weakness', priority: 5, description: '虚弱状态激活 → 疲劳累积 × 2' });

// 移除中毒 → 状态清除
systemHooks.add('condition.onRemoved', (data) => {
  const d = data as Record<string, unknown>;
  const condition = d.condition as string;
  if (!/中毒/.test(condition)) return data;
  return { ...d, _notifications: [...((d._notifications as string[]) || []), '中毒状态已解除'] };
}, { id: 'rule:cond:onRemoved:poison', priority: 5, description: '中毒解除 → 状态清除' });

// 移除虚弱 → 体力恢复提示
systemHooks.add('condition.onRemoved', (data) => {
  const d = data as Record<string, unknown>;
  const condition = d.condition as string;
  if (!/虚弱/.test(condition)) return data;
  return { ...d, _notifications: [...((d._notifications as string[]) || []), '虚弱状态已解除, 体力恢复正常'] };
}, { id: 'rule:cond:onRemoved:weakness', priority: 5, description: '虚弱解除 → 体力恢复' });

// 中毒 tick → 每 8 小时 HP -1
systemHooks.add('condition.onTick', (data) => {
  const d = data as Record<string, unknown>;
  const hours = d.hours as number;
  const conditions = d.conditions as string[] || [];
  if (!conditions.some(c => /中毒/.test(c))) return data;

  const hpLoss = Math.ceil(hours / 8);
  if (hpLoss > 0) {
    const dc = (d.derivedChanges as Record<string, number>) || {};
    dc.hp_change = (dc.hp_change || 0) + hpLoss;
    return { ...d, derivedChanges: dc };
  }
  return data;
}, { id: 'rule:cond:onTick:poison', priority: 8, description: '中毒 tick → 每 8 小时 HP-1' });

// 冻伤 tick → 旅行时疲劳加倍
systemHooks.add('condition.onTick', (data) => {
  const d = data as Record<string, unknown>;
  const hours = d.hours as number;
  const conditions = d.conditions as string[] || [];
  if (!conditions.some(c => /冻伤/.test(c))) return data;

  const dc = (d.derivedChanges as Record<string, number>) || {};
  dc.fatigue = (dc.fatigue || 0) + Math.round(hours * 3);
  return { ...d, derivedChanges: dc };
}, { id: 'rule:cond:onTick:frostbiteFatigue', priority: 8, description: '冻伤 tick → 旅行时疲劳加倍' });

// 虚弱 tick → 疲劳累积加速
systemHooks.add('condition.onTick', (data) => {
  const d = data as Record<string, unknown>;
  const hours = d.hours as number;
  const conditions = d.conditions as string[] || [];
  if (!conditions.some(c => /虚弱/.test(c))) return data;

  const dc = (d.derivedChanges as Record<string, number>) || {};
  dc.fatigue = (dc.fatigue || 0) + Math.round(hours * 2);
  return { ...d, derivedChanges: dc };
}, { id: 'rule:cond:onTick:weaknessFatigue', priority: 7, description: '虚弱 tick → 疲劳累积加速' });

// 时间流逝 → 体力相关派生 (原 conditionRules 中规则迁移自 timeVitalRules)
systemHooks.add('vital.onTimeElapsed', (data, ctx) => {
  const d = data as Record<string, unknown>;
  const hours = d.hours as number;
  const conditions = ctx.snapshot.character.conditions;
  if (!conditions.some(c => c.includes('中毒'))) return data;

  const hpLoss = Math.ceil(hours / 8);
  if (hpLoss > 0) {
    const dc = (d.derivedChanges as Record<string, number>) || {};
    dc.hp_change = (dc.hp_change || 0) + hpLoss;
    return { ...d, derivedChanges: dc };
  }
  return data;
}, { id: 'rule:cond:poisonTick', priority: 8, description: '中毒 → 每8小时 HP-1' });
