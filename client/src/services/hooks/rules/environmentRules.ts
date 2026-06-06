import { systemHooks } from '../SystemHooks';

/**
 * 审计 P3 修复: 文档承诺使用 travel.onTerrainChange / travel.onWeatherChange
 *   原代码使用 travel.beforeSpeedCalc (仍保留作为 speed calc 入口)
 *   现补全 onTerrainChange / onWeatherChange 命名空间规则
 */

// 地形变化 → 体力消耗变化
systemHooks.add('travel.onTerrainChange', (data) => {
  const d = data as Record<string, unknown>;
  const oldTerrain = d.oldTerrain as string;
  const newTerrain = d.newTerrain as string;

  // 简单提示: 进入恶劣地形给出风险警告
  if (/山地|沼泽|沙漠|冰原|焦土/.test(newTerrain)) {
    const note = `进入${newTerrain}: 旅行速度下降, 体力消耗增加`;
    return { ...d, _notifications: [...((d._notifications as string[]) || []), note] };
  }
  if (/平原|城市|村庄|道路/.test(newTerrain) && /山地|沼泽|沙漠/.test(oldTerrain)) {
    return { ...d, _notifications: [...((d._notifications as string[]) || []), `从${oldTerrain}进入${newTerrain}: 旅行变得轻松`] };
  }
  return data;
}, { id: 'rule:env:terrainChangeNotify', priority: 5, description: '地形变化 → 风险提示' });

// 地形变化 → 速度修正
systemHooks.add('travel.onTerrainChange', (data) => {
  const d = data as Record<string, unknown>;
  const newTerrain = d.newTerrain as string;
  const mod: Record<string, number> = {
    '平原': 1.0, '城市': 1.0, '村庄': 1.0, '道路': 1.2,
    '森林': 0.7, '山地': 0.4, '沼泽': 0.5, '沙漠': 0.6,
    '冰原': 0.5, '焦土': 0.6, '海洋': 0.0,
  };

  for (const [key, factor] of Object.entries(mod)) {
    if (newTerrain.includes(key)) {
      return { ...d, speed: (d.speed as number || 5000) * factor };
    }
  }
  return data;
}, { id: 'rule:env:terrainSpeedOnChange', priority: 8, description: '地形变化 → 速度修正' });

// 天气变化 → 暴风雨警告
systemHooks.add('travel.onWeatherChange', (data) => {
  const d = data as Record<string, unknown>;
  const newWeather = d.newWeather as string;

  if (/暴风|飓风|暴雪|沙尘暴/.test(newWeather)) {
    return { ...d, _notifications: [...((d._notifications as string[]) || []), `天气转为${newWeather}: 旅行危险, 建议寻找遮蔽`] };
  }
  if (/晴|阴/.test(newWeather)) {
    return { ...d, _notifications: [...((d._notifications as string[]) || []), `天气转好: 适合继续旅行`] };
  }
  return data;
}, { id: 'rule:env:weatherChangeNotify', priority: 5, description: '天气变化 → 风险提示' });

// 天气变化 → 速度修正
systemHooks.add('travel.onWeatherChange', (data) => {
  const d = data as Record<string, unknown>;
  const newWeather = d.newWeather as string;

  if (/暴风|飓风/.test(newWeather)) {
    return { ...d, speed: (d.speed as number || 5000) * 0.6 };
  }
  if (/雨|雪/.test(newWeather)) {
    return { ...d, speed: (d.speed as number || 5000) * 0.85 };
  }
  if (/雾/.test(newWeather)) {
    return { ...d, speed: (d.speed as number || 5000) * 0.7 };
  }
  return data;
}, { id: 'rule:env:weatherSpeedOnChange', priority: 8, description: '天气变化 → 速度修正' });

// 旅行开始 → 初始化状态
systemHooks.add('travel.onStart', (data) => {
  const d = data as Record<string, unknown>;
  return { ...d, _notifications: [...((d._notifications as string[]) || []), '开始新一段旅行'] };
}, { id: 'rule:env:travelStartNotify', priority: 3, description: '旅行开始 → 通知' });

// 以下保留原 travel.beforeSpeedCalc 规则, 作为速度计算的早期入口
// (仍用于不通过 onTerrainChange / onWeatherChange 触发的直接速度计算)

// 地形 → 修改旅行速度
systemHooks.add('travel.beforeSpeedCalc', (data, ctx) => {
  const d = data as Record<string, unknown>;
  const terrain = (d.terrain as string) || ctx.snapshot.terrain;
  const mod: Record<string, number> = {
    '平原': 1.0, '城市': 1.0, '村庄': 1.0, '道路': 1.2,
    '森林': 0.7, '山地': 0.4, '沼泽': 0.5, '沙漠': 0.6,
    '冰原': 0.5, '焦土': 0.6, '海洋': 0.0,
  };

  const currentSpeed = (d.speed as number) || 5000;
  let factor = 1.0;
  for (const [key, val] of Object.entries(mod)) {
    if (terrain.includes(key)) { factor = val; break; }
  }

  return { ...d, speed: currentSpeed * factor };
}, { id: 'rule:env:terrainSpeed', priority: 10, description: '地形 → 旅行速度修正' });

// 暴风雨 → 减速
systemHooks.add('travel.beforeSpeedCalc', (data, ctx) => {
  const d = data as Record<string, unknown>;
  const weather = (d.weather as string) || ctx.snapshot.weather;
  if (/暴风|飓风/.test(weather)) {
    const currentSpeed = (d.speed as number) || 5000;
    return { ...d, speed: currentSpeed * 0.6 };
  }
  return data;
}, { id: 'rule:env:stormSlow', priority: 5, description: '暴风雨 → 旅行速度×0.6' });

// 寒冷冰原 → 冻伤风险提示
systemHooks.add('travel.beforeSpeedCalc', (data, ctx) => {
  const d = data as Record<string, unknown>;
  const terrain = (d.terrain as string) || ctx.snapshot.terrain;

  if (/冰|雪|冻/.test(terrain) && !ctx.snapshot.character.conditions.some(c => /冻|保暖/.test(c))) {
    d._notifications = [...((d._notifications as string[]) || []), '极寒环境, 如果没有保暖装备可能冻伤'];
  }
  return d;
}, { id: 'rule:env:frostbiteWarning', priority: 3, description: '冰原旅行 → 冻伤风险提示' });
