import { systemHooks } from '../SystemHooks';

/**
 * 审计 P3 修复: 新增 itemRules.ts 文件
 * 文档承诺 7 个规则文件, 原仅 5 个. 补全 item / party 两个 namespace 文件.
 *
 * 订阅 namespace:
 *   - item.onUse   : 物品使用
 *   - item.onEquip : 物品装备
 */

// 食物消耗 → 恢复饥饿值
systemHooks.add('item.onUse', (data) => {
  const d = data as Record<string, unknown>;
  const item = d.item as Record<string, unknown> | undefined;
  const name = (item?.name as string) || '';
  if (!/食物|肉|面包|干粮|果实|水果|饭菜|汤|糕/.test(name)) return data;

  const dc = (d.derivedChanges as Record<string, number>) || {};
  // 食物效果: hunger -25
  dc.hunger = (dc.hunger || 0) - 25;
  return { ...d, derivedChanges: dc };
}, { id: 'rule:item:use:food', priority: 10, description: '使用食物 → 饥饿值 -25' });

// 饮水 → 恢复口渴值
systemHooks.add('item.onUse', (data) => {
  const d = data as Record<string, unknown>;
  const item = d.item as Record<string, unknown> | undefined;
  const name = (item?.name as string) || '';
  if (!/水|酒|茶|饮|汁|泉|奶/.test(name)) return data;

  const dc = (d.derivedChanges as Record<string, number>) || {};
  dc.thirst = (dc.thirst || 0) - 30;
  return { ...d, derivedChanges: dc };
}, { id: 'rule:item:use:drink', priority: 10, description: '使用饮品 → 口渴值 -30' });

// 治疗药水 → 恢复 HP
systemHooks.add('item.onUse', (data) => {
  const d = data as Record<string, unknown>;
  const item = d.item as Record<string, unknown> | undefined;
  const name = (item?.name as string) || '';
  if (!/药|治疗|回复|恢复|疗伤|治愈|草药|丹/.test(name)) return data;

  const dc = (d.derivedChanges as Record<string, number>) || {};
  dc.hp_change = (dc.hp_change || 0) + 15;
  return { ...d, derivedChanges: dc };
}, { id: 'rule:item:use:potion', priority: 12, description: '使用治疗物品 → HP +15' });

// 装备武器 → 攻击力 +5
systemHooks.add('item.onEquip', (data) => {
  const d = data as Record<string, unknown>;
  const slot = d.slot as string;
  if (slot !== 'weapon') return data;

  const dc = (d.derivedChanges as Record<string, number>) || {};
  dc.attack_bonus = (dc.attack_bonus || 0) + 5;
  return { ...d, derivedChanges: dc };
}, { id: 'rule:item:equip:weapon', priority: 8, description: '装备武器 → 攻击 +5' });

// 装备护甲 → 防御 +3
systemHooks.add('item.onEquip', (data) => {
  const d = data as Record<string, unknown>;
  const slot = d.slot as string;
  if (slot !== 'armor') return data;

  const dc = (d.derivedChanges as Record<string, number>) || {};
  dc.defense_bonus = (dc.defense_bonus || 0) + 3;
  return { ...d, derivedChanges: dc };
}, { id: 'rule:item:equip:armor', priority: 8, description: '装备护甲 → 防御 +3' });

// 装备饰品 → 士气 +2
systemHooks.add('item.onEquip', (data) => {
  const d = data as Record<string, unknown>;
  const slot = d.slot as string;
  if (slot !== 'accessory') return data;

  const dc = (d.derivedChanges as Record<string, number>) || {};
  dc.morale = (dc.morale || 0) + 2;
  return { ...d, derivedChanges: dc };
}, { id: 'rule:item:equip:accessory', priority: 6, description: '装备饰品 → 士气 +2' });

// 装备物品 → 通知
systemHooks.add('item.onEquip', (data) => {
  const d = data as Record<string, unknown>;
  const item = d.item as Record<string, unknown> | undefined;
  const name = (item?.name as string) || '装备';
  return { ...d, _notifications: [...((d._notifications as string[]) || []), `装备了${name}`] };
}, { id: 'rule:item:equip:notify', priority: 3, description: '装备 → 通知' });
