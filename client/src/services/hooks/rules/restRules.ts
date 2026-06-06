import { systemHooks } from '../SystemHooks';

// 休息 → HP 恢复
systemHooks.add('vital.onRestStart', (data, ctx) => {
  const d = data as Record<string, unknown>;
  const hours = d.hours as number || 8;
  const char = ctx.snapshot.character;
  if (char.hp >= char.maxHp) return data;

  const con = char.attributes.CON;
  const baseRecovery = Math.floor(con / 2);
  const condEff = { regenMultiplier: 1.0 };
  for (const cond of char.conditions) {
    if (/中毒/.test(cond)) condEff.regenMultiplier = Math.min(condEff.regenMultiplier, 0.5);
    if (/诅咒/.test(cond)) condEff.regenMultiplier = Math.min(condEff.regenMultiplier, 0);
    if (/疾病/.test(cond)) condEff.regenMultiplier = Math.min(condEff.regenMultiplier, 0.3);
  }

  const recovery = -Math.round(baseRecovery * (hours / 8) * condEff.regenMultiplier); // negative = restore
  const dc = (d.derivedChanges as Record<string, number>) || {};
  dc.hp_change = (dc.hp_change || 0) + recovery;
  return { ...d, derivedChanges: dc };
}, { id: 'rule:rest:hp', priority: 20, description: '休息 → HP恢复 (CON/2)×小时×恢复倍率' });

// 休息 → 疲劳恢复
systemHooks.add('vital.onRestStart', (data) => {
  const d = data as Record<string, unknown>;
  const hours = d.hours as number || 8;

  const dc = (d.derivedChanges as Record<string, number>) || {};
  dc.fatigue = (dc.fatigue || 0) - Math.round(hours * 2.5);
  return { ...d, derivedChanges: dc };
}, { id: 'rule:rest:fatigue', priority: 15, description: '休息 → 疲劳大幅恢复' });

// 休息 → conditions 自然康复
systemHooks.add('vital.onRestStart', (data, ctx) => {
  const d = data as Record<string, unknown>;
  const hours = d.hours as number || 8;
  const char = ctx.snapshot.character;
  if (char.conditions.length === 0) return data;

  const removed: string[] = [];
  const NEVER_HEAL = ['诅咒', '昏迷'];

  for (const cond of char.conditions) {
    if (NEVER_HEAL.some(k => cond.includes(k))) continue;
    const chance = Math.min(0.8, hours / 24);
    if (Math.random() < chance) removed.push(cond);
  }

  if (removed.length > 0) {
    const dc = (d.derivedChanges as Record<string, number>) || {};
    dc._conditionsRemoved = removed as unknown as number;
    d._notifications = [...((d._notifications as string[]) || []), `休息后, 以下状态缓解: ${removed.join('、')}`];
  }

  return d;
}, { id: 'rule:rest:conditions', priority: 12, description: '休息 → 异常状态有概率自然康复' });

// 审计 P3 修复: 补全 vital.onRestEnd 规则
// 休息结束 → 状态结算 (饥饿/口渴小幅上升, 卫生小幅下降)
systemHooks.add('vital.onRestEnd', (data) => {
  const d = data as Record<string, unknown>;
  const hours = d.hours as number || 8;
  const dc = (d.derivedChanges as Record<string, number>) || {};
  // 长时间休息: 饥饿 +5/h, 口渴 +6/h, 卫生 -2/h
  dc.hunger = (dc.hunger || 0) + Math.round(hours * 5);
  dc.thirst = (dc.thirst || 0) + Math.round(hours * 6);
  dc.hygiene = (dc.hygiene || 0) + Math.round(hours * 2);
  return { ...d, derivedChanges: dc };
}, { id: 'rule:rest:end:summary', priority: 5, description: '休息结束 → 基础代谢结算' });

// 休息结束 → 通知
systemHooks.add('vital.onRestEnd', (data) => {
  const d = data as Record<string, unknown>;
  return { ...d, _notifications: [...((d._notifications as string[]) || []), '休息结束, 恢复精神'] };
}, { id: 'rule:rest:end:notify', priority: 3, description: '休息结束 → 通知' });
