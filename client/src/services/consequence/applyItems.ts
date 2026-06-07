import { useCharacterStore } from '../../stores/characterStore';
import { useCodexStore } from '../../stores/codexStore';
import { useItemRegistryStore } from '../../stores/itemRegistryStore';
import { generateLootAffixes } from './lootAffixes';
import { buildItemFromGained, syncBackpackFromRegistry, findInRegistryByCharacter } from './helpers';
import type { ConsequenceData, ItemGainedData } from '../../types/game';
import type { ItemEffect, WorldItem } from '../../types/item';
import type { ItemQuality } from '../../types/item';
import type { RNG } from '../../data/affixPool';

export interface ItemDiscovery {
  itemId: string;
  itemName: string;
  discoveredAt: string;
}

/**
 * v0.5.13: 业务域 5 — items
 * 改"我拥有什么"
 *
 * 唯一产生 newDiscoveries 的业务域.
 */
export function applyItems(
  cons: Pick<ConsequenceData, 'itemsGained' | 'itemsLost' | 'itemsModified'>,
  opts?: { rng?: RNG },
): ItemDiscovery[] {
  const charStore = useCharacterStore.getState();
  const char = charStore.character;
  if (!char) return [];
  const charId = char.characterId;
  const discoveries: ItemDiscovery[] = [];
  try {
    if (cons.itemsGained?.length) {
      const gained = applyItemsGained(cons.itemsGained, charId, opts?.rng);
      discoveries.push(...gained);
    }
    if (cons.itemsLost?.length) applyItemsLost(cons.itemsLost, charId);
    if (cons.itemsModified?.length) applyItemsModified(cons.itemsModified, charId);
  } catch (err) {
    console.warn(`[applyItems] failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return discoveries;
}

function applyItemsGained(gained: ItemGainedData[], charId: string, rng: RNG | undefined): ItemDiscovery[] {
  const discoveries: ItemDiscovery[] = [];
  const now = new Date().toISOString();
  const registry = useItemRegistryStore.getState();
  const char = useCharacterStore.getState().character;
  if (!char) return discoveries;

  for (const g of gained) {
    if (g.replacesItemId) {
      // 升级: 找到旧 WorldItem, 保留 itemId 在新物品中, 通过 patch 改属性
      const old = findInRegistryByCharacter(charId, g.replacesItemId);
      if (old) {
        const predefinedEffects: ItemEffect[] = (g.effects || []).map((e, i) => ({
          id: `eff_${now}_${i}`,
          type: (e.type as ItemEffect['type']) || 'special',
          value: e.value || 0,
          description: e.description || '',
        }));
        const poolAffixes = generateLootAffixes(g, now, rng);
        registry.patch(old.itemId, {
          name: g.name,
          description: g.description,
          quality: (g.quality as ItemQuality) || old.quality,
          effects: [...predefinedEffects, ...poolAffixes],
        });
        registry.addHistory(old.itemId, {
          event: 'upgraded',
          description: g.description || `升级为${g.name}`,
          oldName: old.name,
          oldDescription: old.description,
        });
      } else {
        // 找不到旧物品, 退化为新注册
        const newItem = buildItemFromGained(g, null, now);
        const poolAffixes = generateLootAffixes(g, now, rng);
        registry.register({
          name: newItem.name,
          category: newItem.category || 'consumable',
          quality: newItem.quality || '普通',
          description: newItem.description,
          effects: [...(newItem.effects ?? []), ...poolAffixes],
          value: newItem.value,
          quantity: newItem.quantity,
          durability: newItem.durability ? { current: newItem.durability, max: newItem.maxDurability || 100 } : undefined,
          spawnInfo: { worldDay: char.currentLocalDay, region: char.currentRegion || char.joinedRegion, source: 'consequence' },
          holder: { kind: 'character', refId: charId },
          subCategory: newItem.subCategory,
          source: 'consequence',
          canBeEquipped: newItem.canBeEquipped,
          canBeUsed: newItem.canBeUsed,
        });
      }
    } else {
      // 新物品: 查找是否已存在同 name 堆叠
      const existing = findInRegistryByCharacter(charId, undefined, g.name);
      if (existing && (g.quantity ?? 1) > 0) {
        registry.patch(existing.itemId, {
          quantity: existing.quantity + (g.quantity || 1),
        });
      } else {
        const newItem = buildItemFromGained(g, null, now);
        const poolAffixes = generateLootAffixes(g, now, rng);
        registry.register({
          name: newItem.name,
          category: newItem.category || 'consumable',
          quality: newItem.quality || '普通',
          description: newItem.description,
          effects: [...(newItem.effects ?? []), ...poolAffixes],
          value: newItem.value,
          quantity: newItem.quantity,
          durability: newItem.durability ? { current: newItem.durability, max: newItem.maxDurability || 100 } : undefined,
          spawnInfo: { worldDay: char.currentLocalDay, region: char.currentRegion || char.joinedRegion, source: 'consequence' },
          holder: { kind: 'character', refId: charId },
          subCategory: newItem.subCategory,
          source: 'consequence',
          canBeEquipped: newItem.canBeEquipped,
          canBeUsed: newItem.canBeUsed,
        });
      }
    }

    // 物品图鉴: 每次拾取都调 recordDiscovery (新注册/升级/堆叠), 用首次/最新 itemId 拉一次 WorldItem
    const tracked = findInRegistryByCharacter(charId, g.replacesItemId, g.name);
    if (tracked) {
      const { isNew } = useCodexStore.getState().recordDiscovery(tracked);
      if (isNew) {
        discoveries.push({ itemId: tracked.itemId, itemName: tracked.name, discoveredAt: now });
      }
    }
  }
  syncBackpackFromRegistry(charId);
  return discoveries;
}

function applyItemsLost(lost: ConsequenceData['itemsLost'], charId: string): void {
  const registry = useItemRegistryStore.getState();
  for (const l of lost) {
    if (!l) continue;
    if (!l.itemId && !l.name) continue;
    const target = findInRegistryByCharacter(charId, l.itemId, l.name);
    if (!target) continue;
    const remainingQty = target.quantity;
    const dropQty = l.quantity || remainingQty;
    if (dropQty < remainingQty) {
      registry.patch(target.itemId, { quantity: remainingQty - dropQty });
    } else {
      registry.destroy(target.itemId, l.name ? `${l.name} 已被丢弃/使用` : '物品被消耗');
    }
  }
  syncBackpackFromRegistry(charId);
}

function applyItemsModified(
  modified: ConsequenceData['itemsModified'],
  charId: string,
): void {
  const registry = useItemRegistryStore.getState();
  for (const mod of modified) {
    if (!mod || !mod.itemId) continue;
    const target = findInRegistryByCharacter(charId, mod.itemId);
    if (!target) continue;
    const patch: Partial<WorldItem> = {};
    if (mod.newName) patch.name = mod.newName;
    if (mod.newQuality) patch.quality = mod.newQuality as ItemQuality;
    if (mod.description) patch.description = mod.description;
    if (mod.durabilityChange && target.durability) {
      patch.durability = {
        current: target.durability.current + mod.durabilityChange,
        max: target.durability.max,
      };
    }
    if (mod.addedEffects?.length) {
      const newEffects: ItemEffect[] = (target.effects || []).concat(
        mod.addedEffects.map((e, i) => ({
          id: `eff_mod_${Date.now()}_${i}`,
          type: (e.type as ItemEffect['type']) || 'special',
          value: typeof e.value === 'number' ? e.value : 0,
          description: e.description || '',
        })),
      );
      patch.effects = newEffects;
    }
    if (Object.keys(patch).length > 0) {
      registry.patch(target.itemId, patch);
    }
  }
  syncBackpackFromRegistry(charId);
}
