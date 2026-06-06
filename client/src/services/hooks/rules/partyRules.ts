import { systemHooks } from '../SystemHooks';

/**
 * 审计 P3 修复: 新增 partyRules.ts 文件
 * 文档承诺 7 个规则文件, 原仅 5 个. 补全 item / party 两个 namespace 文件.
 *
 * 订阅 namespace:
 *   - party.onMemberJoin        : 队员加入
 *   - party.onMemberLeave       : 队员离开
 *   - party.beforeCombatBonus   : 战斗加成计算前
 */

// 队员加入 → 士气 +3
systemHooks.add('party.onMemberJoin', (data) => {
  const d = data as Record<string, unknown>;
  const dc = (d.derivedChanges as Record<string, number>) || {};
  dc.morale = (dc.morale || 0) + 3;
  return { ...d, derivedChanges: dc };
}, { id: 'rule:party:join:morale', priority: 5, description: '新队员加入 → 士气 +3' });

// 队员加入 → 通知
systemHooks.add('party.onMemberJoin', (data) => {
  const d = data as Record<string, unknown>;
  const member = d.member as Record<string, unknown> | undefined;
  const name = (member?.name as string) || '新成员';
  return { ...d, _notifications: [...((d._notifications as string[]) || []), `${name} 加入了队伍`] };
}, { id: 'rule:party:join:notify', priority: 3, description: '队员加入 → 通知' });

// 队员离开 → 士气 -5
systemHooks.add('party.onMemberLeave', (data) => {
  const d = data as Record<string, unknown>;
  const dc = (d.derivedChanges as Record<string, number>) || {};
  dc.morale = (dc.morale || 0) - 5;
  return { ...d, derivedChanges: dc };
}, { id: 'rule:party:leave:morale', priority: 5, description: '队员离开 → 士气 -5' });

// 队员离开 → 通知
systemHooks.add('party.onMemberLeave', (data) => {
  const d = data as Record<string, unknown>;
  const member = d.member as Record<string, unknown> | undefined;
  const name = (member?.name as string) || '成员';
  return { ...d, _notifications: [...((d._notifications as string[]) || []), `${name} 离开了队伍`] };
}, { id: 'rule:party:leave:notify', priority: 3, description: '队员离开 → 通知' });

// 战斗加成 → 基础加成 (队员数 × 0.5)
systemHooks.add('party.beforeCombatBonus', (data) => {
  const d = data as Record<string, unknown>;
  const partySize = (d.partySize as number) || 0;
  const baseBonus = (d.bonus as number) || 0;
  const memberBonus = partySize * 0.5;
  return { ...d, bonus: baseBonus + memberBonus };
}, { id: 'rule:party:combat:sizeBonus', priority: 8, description: '队伍规模 → 战斗加成 (每队员 +0.5)' });

// 战斗加成 → CHA 修正
systemHooks.add('party.beforeCombatBonus', (data, ctx) => {
  const d = data as Record<string, unknown>;
  const cha = ctx.snapshot.character.attributes.CHA;
  const chaMod = Math.floor((cha - 10) / 2);
  const baseBonus = (d.bonus as number) || 0;
  return { ...d, bonus: baseBonus + chaMod };
}, { id: 'rule:party:combat:chaBonus', priority: 5, description: '主角魅力 → 战斗加成' });

// 战斗加成 → 通知 (审计通过)
systemHooks.add('party.beforeCombatBonus', (data) => {
  const d = data as Record<string, unknown>;
  const bonus = d.bonus as number;
  if (bonus && bonus > 2) {
    return { ...d, _notifications: [...((d._notifications as string[]) || []), `队伍配合加成: +${bonus}`] };
  }
  return data;
}, { id: 'rule:party:combat:bonusNotify', priority: 3, description: '战斗加成 → 通知' });
