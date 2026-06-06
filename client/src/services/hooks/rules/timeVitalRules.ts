import { systemHooks } from '../SystemHooks';

// 时间流逝 → 饥饿
systemHooks.add('vital.onTimeElapsed', (data) => {
  const d = data as Record<string, unknown>;
  const hours = d.hours as number;
  const activity = d.activity as string || 'idle';
  let rate = 3;
  if (activity === 'combat') rate = 5;
  else if (activity === 'travel') rate = 4;
  else if (activity === 'rest') rate = 1;

  const dc = (d.derivedChanges as Record<string, number>) || {};
  dc.hunger = (dc.hunger || 0) + Math.round(hours * rate);
  return { ...d, derivedChanges: dc };
}, { id: 'rule:time:hunger', priority: 10, description: '时间流逝 → 饥饿值增加（战斗5/h,旅行4/h,休息1/h）' });

// 时间流逝 → 口渴
systemHooks.add('vital.onTimeElapsed', (data, ctx) => {
  const d = data as Record<string, unknown>;
  const hours = d.hours as number;
  const activity = d.activity as string || 'idle';
  const terrain = ctx.snapshot.terrain;
  const weather = ctx.snapshot.weather;

  let rate = 4;
  if (activity === 'combat') rate = 6;
  else if (activity === 'rest') rate = 2;
  if (/沙漠/.test(terrain)) rate *= 2;
  if (/炎热|酷暑/.test(weather)) rate *= 1.5;

  const dc = (d.derivedChanges as Record<string, number>) || {};
  dc.thirst = (dc.thirst || 0) + Math.round(hours * rate);
  return { ...d, derivedChanges: dc };
}, { id: 'rule:time:thirst', priority: 10, description: '时间流逝 → 口渴值增加（沙漠×2,炎热×1.5）' });

// 时间流逝 → 疲劳
systemHooks.add('vital.onTimeElapsed', (data, ctx) => {
  const d = data as Record<string, unknown>;
  const hours = d.hours as number;
  const activity = d.activity as string || 'idle';
  const terrain = ctx.snapshot.terrain;
  const enc = ctx.snapshot.character.vital.encumbrance;

  let rate = 5;
  if (activity === 'combat') rate = 10;
  else if (activity === 'rest') rate = -10;
  if (/山地|沼泽/.test(terrain)) rate *= 1.5;
  if (enc > 70) rate *= 1.5;
  else if (enc > 50) rate *= 1.2;

  const dc = (d.derivedChanges as Record<string, number>) || {};
  dc.fatigue = (dc.fatigue || 0) + Math.round(hours * rate);
  return { ...d, derivedChanges: dc };
}, { id: 'rule:time:fatigue', priority: 10, description: '时间流逝 → 疲劳值变化（山地沼泽×1.5, 高负重加速）' });

// 时间流逝 → 卫生
systemHooks.add('vital.onTimeElapsed', (data, ctx) => {
  const d = data as Record<string, unknown>;
  const hours = d.hours as number;
  const activity = d.activity as string || 'idle';
  const terrain = ctx.snapshot.terrain;

  let rate = 1;
  if (/沼泽|下水道|地下/.test(terrain)) rate = 4;
  if (activity === 'combat') rate = 2;

  const dc = (d.derivedChanges as Record<string, number>) || {};
  dc.hygiene = (dc.hygiene || 0) + Math.round(hours * rate);
  return { ...d, derivedChanges: dc };
}, { id: 'rule:time:hygiene', priority: 10, description: '时间流逝 → 卫生值下降（沼泽×4, 战斗×2）' });

// 时间流逝 → 体温（极端环境）
systemHooks.add('vital.onTimeElapsed', (data, ctx) => {
  const d = data as Record<string, unknown>;
  const hours = d.hours as number;
  const terrain = ctx.snapshot.terrain;
  const weather = ctx.snapshot.weather;

  let tempChange = 0;
  if (/冰|雪|冻/.test(terrain)) tempChange = -2 * hours;
  if (/沙漠/.test(terrain)) tempChange = 3 * hours;
  if (/暴风雪|暴风雨|冻/.test(weather)) tempChange = -3 * hours;
  if (/炎热|酷暑/.test(weather)) tempChange = 2 * hours;

  if (tempChange !== 0) {
    const dc = (d.derivedChanges as Record<string, number>) || {};
    dc.temperature = (dc.temperature || 0) + Math.round(tempChange);
    return { ...d, derivedChanges: dc };
  }
  return data;
}, { id: 'rule:time:temperature', priority: 5, description: '时间流逝 → 极端环境影响体温' });

// 审计 P3 修复: 补全 vital.beforeApply 规则
// 准备写入前 → HP 锁定在 [0, maxHp]
systemHooks.add('vital.beforeApply', (data, ctx) => {
  const d = data as Record<string, unknown>;
  const sc = (d.stateChanges as Record<string, number>) || {};
  const char = ctx.snapshot.character;
  // 防御性: HP 写入不能超过 maxHp
  if (sc.hp_change !== undefined) {
    const targetHp = char.hp + sc.hp_change;
    if (targetHp > char.maxHp) {
      sc.hp_change = char.maxHp - char.hp;
    } else if (targetHp < 0) {
      sc.hp_change = -char.hp;
    }
  }
  return { ...d, stateChanges: sc };
}, { id: 'rule:vital:beforeApply:hpClamp', priority: 50, description: '写入前 → HP 锁定在 [0, maxHp]' });

// 准备写入前 → 温度安全限制
systemHooks.add('vital.beforeApply', (data) => {
  const d = data as Record<string, unknown>;
  const sc = (d.stateChanges as Record<string, number>) || {};
  if (sc.temperature !== undefined) {
    // 体温范围: 30-42℃ (过低/过高致命, 但不立即结算)
    sc.temperature = Math.max(30, Math.min(42, (sc.temperature || 0) + 37) ) - 37;
  }
  return { ...d, stateChanges: sc };
}, { id: 'rule:vital:beforeApply:tempClamp', priority: 45, description: '写入前 → 体温限制在 30-42℃' });
