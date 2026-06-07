import type { ItemGainedData } from '../../types/game';
import type { Item, ItemEffect, ItemHistoryEntry, WorldItem } from '../../types/item';
import type { ItemCategory, ItemQuality } from '../../types/item';
import { useCharacterStore } from '../../stores/characterStore';
import { useItemRegistryStore } from '../../stores/itemRegistryStore';

/**
 * v0.5.13: 跨业务域的工具函数。从 applyConsequences.ts 抽出。
 * 业务域内不直接调,只通过 5 个 apply* 域函数间接使用。
 */

/**
 * 从 ItemGainedData 构造 Item,处理升级/新建两种情况.
 * 升级时保留原 itemId (库存去重/装备引用稳定).
 */
export function buildItemFromGained(gained: ItemGainedData, oldItem: Item | null, now: string): Item {
  const history: ItemHistoryEntry[] = oldItem ? [
    ...(oldItem.history || []),
    {
      timestamp: now,
      event: 'upgraded',
      description: gained.description || `升级为${gained.name}`,
      oldName: oldItem.name,
      oldDescription: oldItem.description,
    },
  ] : [{
    timestamp: now,
    event: 'acquired',
    description: gained.description || `获得了${gained.name}`,
  }];

  const itemId = oldItem?.itemId
    || (!gained.replacesItemId ? `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` : gained.replacesItemId);

  return {
    itemId,
    name: gained.name,
    category: (gained.category as ItemCategory) || 'consumable',
    subCategory: gained.subCategory || '',
    quality: (gained.quality as ItemQuality) || '普通',
    quantity: gained.quantity || 1,
    description: gained.description || '',
    effects: (gained.effects || []).map((e, i) => ({
      id: `eff_${Date.now()}_${i}`,
      type: (e.type as ItemEffect['type']) || 'special',
      value: e.value || 0,
      description: e.description || '',
    })),
    value: 0,
    durability: oldItem?.durability,
    maxDurability: oldItem?.maxDurability,
    history,
    createdAt: oldItem?.createdAt || now,
    source: oldItem?.source || '',
    equipped: oldItem?.equipped,
    equipSlot: oldItem?.equipSlot,
    canBeEquipped: gained.category === 'weapon' || gained.category === 'armor' || gained.category === 'accessory',
    canBeUsed: gained.category === 'consumable',
  };
}

/**
 * 从 itemRegistry 重新拼装 character 的背包视图.
 * 旧版 UI 消费 char.inventory.backpack,这里作为派生层保持兼容.
 */
export function syncBackpackFromRegistry(characterId: string): void {
  const charStore = useCharacterStore.getState();
  const char = charStore.character;
  if (!char) return;
  const registry = useItemRegistryStore.getState();
  const items = registry.byHolder({ kind: 'character', refId: characterId })
    .filter((it) => it.holder !== null)
    .map((it) => worldItemToLegacyView(it));
  charStore.updateInventory({ ...char.inventory, backpack: items });
}

/**
 * WorldItem → 旧版 Item 视图裁剪.
 */
export function worldItemToLegacyView(w: WorldItem): Item {
  return {
    itemId: w.itemId,
    name: w.name,
    category: w.category,
    subCategory: w.subCategory || '',
    quality: w.quality,
    quantity: w.quantity,
    description: w.description,
    effects: w.effects,
    value: w.value,
    durability: w.durability?.current,
    maxDurability: w.durability?.max ?? w.maxDurability,
    history: w.history,
    createdAt: w.createdAt,
    source: w.source,
    equipped: w.equipped,
    equipSlot: w.equipSlot,
    canBeEquipped: w.canBeEquipped,
    canBeUsed: w.canBeUsed,
    usePrompt: w.usePrompt,
  };
}

/**
 * 在 itemRegistry 中按 characterId + (itemId | name) 查找 WorldItem.
 */
export function findInRegistryByCharacter(
  characterId: string,
  itemId?: string,
  name?: string,
): WorldItem | undefined {
  const registry = useItemRegistryStore.getState();
  const items = registry.byHolder({ kind: 'character', refId: characterId });
  if (itemId) return items.find((it) => it.itemId === itemId);
  if (name) return items.find((it) => it.name === name);
  return undefined;
}
