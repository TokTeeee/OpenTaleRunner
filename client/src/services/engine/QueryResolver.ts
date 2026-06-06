import { useGameStore } from '../../stores/gameStore';
import { useCharacterStore } from '../../stores/characterStore';
import { useNPCStore } from '../../stores/npcStore';
import { useWorldStore } from '../../stores/worldStore';

export interface GMQuery {
  query_id: string;
  intent: string;
  keyword?: string;
  name?: string;
  region?: string;
  location?: string;
  aspects?: string[];
  count?: number;
  topic?: string;
}

export interface QueryResult {
  query_id: string;
  status: 'found' | 'not_found' | 'partial';
  data: string;
}

export function resolveQueries(queries: GMQuery[]): QueryResult[] {
  return queries.map(q => resolveQuery(q));
}

function resolveQuery(q: GMQuery): QueryResult {
  switch (q.intent) {
    case 'inventory_search': return searchInventory(q.keyword || '');
    case 'npc_lookup': return lookupNPC(q.name || '', q.region);
    case 'location_info': return lookupLocation(q.location || '');
    case 'character_state': return getCharacterState(q.aspects);
    case 'skill_check': return searchSkills(q.keyword || '');
    case 'recent_events': return getRecentEvents(q.count || 3);
    case 'world_lore': return searchWorldLore(q.topic || '');
    default:
      return { query_id: q.query_id, status: 'not_found', data: `未知查询类型: ${q.intent}` };
  }
}

function searchInventory(keyword: string): QueryResult {
  const char = useCharacterStore.getState().character;
  if (!char) return { query_id: '', status: 'not_found', data: '无角色数据' };

  const items: string[] = [];

  for (const slot of ['weapon', 'armor', 'accessory'] as const) {
    const item = char.inventory.equipped[slot];
    if (item && (!keyword || item.name.includes(keyword) || (item.description || '').includes(keyword))) {
      const effs = (item.effects || []).map(e => e.description).join(', ');
      const extra = [effs, item.durability != null ? `耐久${item.durability}/${item.maxDurability || 100}` : ''].filter(Boolean).join('; ');
      items.push(`[${slot === 'weapon' ? '已装备武器' : slot === 'armor' ? '已装备防具' : '已装备饰品'}] ${item.name}(品质:${item.quality || '普通'}): ${item.description || ''}${extra ? ` (${extra})` : ''}`);
    }
  }

  for (const item of char.inventory.backpack) {
    if (!keyword || item.name.includes(keyword) || (item.description || '').includes(keyword)) {
      const effs = (item.effects || []).map(e => e.description).join(', ');
      items.push(`${item.name}×${item.quantity || 1}(品质:${item.quality || '普通'}): ${item.description || ''}${effs ? ` [${effs}]` : ''}`);
    }
  }

  if (items.length === 0) {
    return { query_id: '', status: 'not_found', data: keyword ? `背包中没有与"${keyword}"相关的物品` : '背包为空' };
  }
  return { query_id: '', status: 'found', data: items.join('\n') };
}

function lookupNPC(name: string, region?: string): QueryResult {
  const npcs = Object.values(useNPCStore.getState().npcs);
  const matches = npcs.filter(n => {
    const nameMatch = n.name.includes(name) || (n.title || '').includes(name);
    const regionMatch = !region || n.region === region;
    return nameMatch && regionMatch;
  });

  if (matches.length === 0) {
    return { query_id: '', status: 'not_found', data: `未找到与"${name}"匹配的已知NPC` };
  }

  const data = matches.map(n => {
    const rel = n.relationship;
    return `${n.name}(${n.title || ''}, ${rel?.level || 'stranger'}${rel?.attitude != null ? `, 好感${rel.attitude}` : ''}): 外貌: ${n.appearance || '未知'}。性格: ${n.personality || '未知'}。${rel?.playerKnowsAbout?.length ? `你已知: ${rel.playerKnowsAbout.join('；')}` : ''}`;
  }).join('\n---\n');

  return { query_id: '', status: 'found', data };
}

function lookupLocation(location: string): QueryResult {
  const game = useGameStore.getState();
  const known = game.knownLocations;
  const structured = game.currentStructuredLocation;
  const matched = known.filter(l => l.name.includes(location));

  if (matched.length > 0) {
    return {
      query_id: '', status: 'found',
      data: `已探索地点匹配: ${matched.map(l => l.name).join(', ')}。当前位置: ${game.currentLocation || game.currentSubRegion}`,
    };
  }

  // Use structured location for precise current position
  if (structured) {
    return {
      query_id: '', status: 'partial',
      data: `未在已探索地点中找到"${location}"。当前位置是: ${structured.regionName} · ${structured.subRegion} · ${structured.specificPlace}。${structured.isKnown ? '此位置之前已访问过' + structured.visitCount + '次。' : '这是一个新发现的地点。'}${structured.description ? ' 地点描述: ' + structured.description : ''}`,
    };
  }

  const loc = game.currentLocation || game.currentSubRegion;
  return {
    query_id: '', status: 'partial',
    data: `未在已探索地点中找到"${location}"。当前位置是: ${loc}。你可以将此视为新地点。`,
  };
}

function getCharacterState(aspects?: string[]): QueryResult {
  const char = useCharacterStore.getState().character;
  if (!char) return { query_id: '', status: 'not_found', data: '无角色数据' };

  const all = aspects && aspects.length > 0 ? aspects : ['hp', 'fatigue', 'conditions'];

  const parts: string[] = [];
  if (all.includes('hp')) parts.push(`HP: ${char.hp}/${char.maxHp}`);
  if (all.includes('fatigue') || all.includes('vital')) {
    const v = char.vital;
    parts.push(`状态: 饱食${v.hunger} 口渴${v.thirst} 疲劳${v.fatigue} 卫生${v.hygiene} 士气${v.morale}`);
  }
  if (all.includes('conditions') && char.conditions?.length) {
    parts.push(`异常: ${char.conditions.join(', ')}`);
  }
  if (all.includes('attributes')) {
    parts.push(`属性: STR${char.attributes.STR} DEX${char.attributes.DEX} CON${char.attributes.CON} INT${char.attributes.INT} WIS${char.attributes.WIS} CHA${char.attributes.CHA}`);
  }

  return { query_id: '', status: 'found', data: parts.join('\n') };
}

function searchSkills(keyword: string): QueryResult {
  const char = useCharacterStore.getState().character;
  if (!char) return { query_id: '', status: 'not_found', data: '无角色数据' };

  const matches = char.skills.filter(s => s.name.includes(keyword) || s.description.includes(keyword));
  if (matches.length === 0) {
    return { query_id: '', status: 'not_found', data: `技能中没有与"${keyword}"匹配的项。技能列表: ${char.skills.map(s => s.name).join('、')}` };
  }
  const data = matches.map(s => `${s.name}(Lv.${s.level}, ${s.relatedAttribute}): ${s.description}`).join('\n');
  return { query_id: '', status: 'found', data };
}

function getRecentEvents(count: number): QueryResult {
  const char = useCharacterStore.getState().character;
  if (!char?.recentHistory?.length) {
    return { query_id: '', status: 'not_found', data: '没有近期事件记录' };
  }
  const events = char.recentHistory.slice(-count).map(h => `世界日${h.worldDay}: ${h.summary}`).join('\n');
  return { query_id: '', status: 'found', data: events };
}

function searchWorldLore(topic: string): QueryResult {
  const world = useWorldStore.getState();
  const lore = world.worldLore;

  if (!lore || lore.length < 50) {
    return { query_id: '', status: 'not_found', data: '世界观数据未加载' };
  }

  // Simple keyword-based paragraph matching
  const paragraphs = lore.split('\n').filter(p => p.trim());
  const matches = paragraphs.filter(p => p.includes(topic));
  if (matches.length === 0) {
    return { query_id: '', status: 'partial', data: `世界观中未找到与"${topic}"直接相关的内容。世界观概要: ${lore.slice(0, 300)}` };
  }
  return { query_id: '', status: 'found', data: matches.slice(0, 3).join('\n') };
}

export function buildQueryResultText(results: QueryResult[]): string {
  return results.map((r, i) => {
    const id = r.query_id || `q${i}`;
    return `[${id}] ${r.status === 'found' ? '✓' : '✗'} ${r.data}`;
  }).join('\n\n');
}