export type ItemQuality = '粗糙' | '普通' | '精良' | '稀有' | '史诗' | '传说';
export type ItemCategory = 'weapon' | 'armor' | 'accessory' | 'consumable' | 'material' | 'key_item' | 'container';
export type EffectType =
  | 'damage_bonus' | 'defense_bonus' | 'attribute_mod'
  | 'hp_restore' | 'hp_max_bonus' | 'vital_restore'
  | 'elemental_damage' | 'elemental_resist' | 'mp_bonus'
  | 'skill_bonus' | 'light_source' | 'special'
  // v0.4-item 词条池扩展 (武器/防具/饰品/消耗品 affix)
  | 'critical' | 'attack_speed' | 'hp_steal'
  | 'damage_reflect' | 'temp_attack' | 'cleanse'
  | 'poison' | 'drowsy' | 'cursed'
  | 'brittle' | 'heavy' | 'fragile' | 'greedy';

export const QUALITY_COLORS: Record<ItemQuality, string> = {
  '粗糙': 'text-gray-400', '普通': 'text-gray-200',
  '精良': 'text-emerald-400', '稀有': 'text-blue-400',
  '史诗': 'text-purple-400', '传说': 'text-amber-400',
};

export const CATEGORY_ICONS: Record<ItemCategory, string> = {
  weapon: '⚔️', armor: '🛡️', accessory: '💍',
  consumable: '🧪', material: '🪨',
  key_item: '🔑', container: '🎒',
};

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  weapon: '武器', armor: '护甲', accessory: '饰品',
  consumable: '消耗品', material: '材料',
  key_item: '关键物品', container: '容器',
};

export interface ItemEffect {
  id: string;
  type: EffectType;
  value: number | string | Record<string, unknown>;
  description: string;
}

export interface ItemHistoryEntry {
  timestamp: string;
  event: string;
  description: string;
  oldName?: string;
  oldDescription?: string;
  addedEffects?: ItemEffect[];
  removedEffects?: string[];
  location?: string;
  relatedNPC?: string;
}

export interface Item {
  itemId?: string;
  name: string;
  category?: ItemCategory;
  subCategory?: string;
  quality?: ItemQuality;
  quantity?: number;
  description?: string;
  effects?: ItemEffect[];
  value?: number;
  durability?: number;
  maxDurability?: number;
  history?: ItemHistoryEntry[];
  createdAt?: string;
  source?: string;
  equipped?: boolean;
  equipSlot?: 'weapon' | 'armor' | 'accessory';
  canBeEquipped?: boolean;
  canBeUsed?: boolean;
  usePrompt?: string;
}

export function normalizeItem(partial: Partial<Item>): Item {
  return {
    itemId: partial.itemId || `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: partial.name || '未知物品',
    category: partial.category || 'consumable',
    subCategory: partial.subCategory || '',
    quality: partial.quality || '普通',
    quantity: partial.quantity ?? 1,
    description: partial.description || '',
    effects: partial.effects || [],
    value: partial.value || 0,
    durability: partial.durability,
    maxDurability: partial.maxDurability,
    history: partial.history || [],
    createdAt: partial.createdAt || new Date().toISOString(),
    source: partial.source || '',
    equipped: partial.equipped,
    equipSlot: partial.equipSlot,
    canBeEquipped: partial.canBeEquipped,
    canBeUsed: partial.canBeUsed,
    usePrompt: partial.usePrompt,
  };
}

// ============================================================
// PR-1: WorldItem — 物品的世界身份
// ============================================================
//
// `Item` 是"角色背包/装备槽"的视图（轻量副本）。
// `WorldItem` 是物品在"世界级注册表"中的实体（一等公民），
// 脱手/转手/放入世界容器都不丢，完整世系可追溯。
//
// 关系：
//   Character.inventory.backpack: WorldItem[]   ← 由 itemRegistry 拼装
//   Character.inventory.equipped: WorldItem[]   ← 装备时 holder 转 equipped
//   itemRegistry.items: Record<itemId, WorldItem>

/** 物品持有者引用 — 谁/哪里 持有该物品 */
export type ItemHolder =
  | { kind: 'character'; refId: string }
  | { kind: 'npc'; refId: string }
  | { kind: 'party'; refId: string }
  | { kind: 'container'; refId: string }
  | { kind: 'world'; refId: null };  // 游离于世界, 等待拾取

/** 物品耐久度 */
export interface ItemDurability {
  current: number;
  max: number;
}

/** 物品诞生信息 */
export interface ItemSpawnInfo {
  worldDay: number;
  region: string;
  source: string;  // 'loot' | 'craft' | 'quest' | 'shop' | 'npc_gift' | 'world_drop' | ...
}

/** 世界物品实体 — 物品在世界上的一等公民身份 */
export interface WorldItem {
  itemId: string;            // 实体主键 (item_<uuid>)
  name: string;
  category: ItemCategory;
  quality: ItemQuality;
  effects: ItemEffect[];     // 完整词条
  description: string;
  value: number;
  durability?: ItemDurability;
  history: ItemHistoryEntry[]; // 完整世系 (铸造/强化/转手/损坏/销毁)
  // ⭐ 关键: 谁/哪里 持有
  holder: ItemHolder | null; // null = 物品已销毁
  quantity: number;          // 同一 itemId 可堆叠
  spawnInfo: ItemSpawnInfo;
  createdAt: string;
  updatedAt: string;
  // 可选派生字段
  subCategory?: string;
  maxDurability?: number;
  source?: string;
  equipped?: boolean;
  equipSlot?: 'weapon' | 'armor' | 'accessory';
  canBeEquipped?: boolean;
  canBeUsed?: boolean;
  usePrompt?: string;
}

/** 生成新 itemId — 与 Item.itemId 命名空间一致 */
export function generateItemId(): string {
  return `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}