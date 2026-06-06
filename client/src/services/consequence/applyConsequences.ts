import type { ConsequenceData, ItemGainedData } from '../../types/game';
import type { Item, ItemEffect, ItemHistoryEntry, WorldItem } from '../../types/item';
import type { ItemCategory, ItemQuality } from '../../types/item';
import { useCharacterStore } from '../../stores/characterStore';
import { useCodexStore } from '../../stores/codexStore';
import { useItemRegistryStore } from '../../stores/itemRegistryStore';
import { generateLootAffixes } from './lootAffixes';
import type { RNG } from '../../data/affixPool';

/**
 * PR-2 契约: 物品的世界真相是 itemRegistry, char.inventory.backpack 是派生视图.
 * 本文件所有物品 mutation 都走 itemRegistry.register/transfer/destroy/patch,
 * 然后调 syncBackpackFromRegistry 刷新 legacy 视图, 保持向后兼容.
 */

function buildItemFromGained(gained: ItemGainedData, oldItem: Item | null, now: string): Item {
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

  // 升级时保留原 itemId 以维持库存去重/装备引用的稳定性；
  // 新物品才生成新 id。replacesItemId 仅作为调用方查找旧物品的索引键。
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
 * 旧版 UI (CharacterPanel/BackpackModal) 仍消费 char.inventory.backpack,
 * 这里作为派生层保持兼容, 真正的物品真相在 itemRegistry.
 */
function syncBackpackFromRegistry(characterId: string): void {
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
 * 旧 UI 不需要 holder/spawnInfo/updatedAt 等字段, 但 itemId/effects/history 必须保留.
 */
function worldItemToLegacyView(w: WorldItem): Item {
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

/** 在 itemRegistry 中按 itemId/name 查找角色当前持有的物品 */
function findInRegistryByCharacter(characterId: string, itemId?: string, name?: string): WorldItem | undefined {
  const registry = useItemRegistryStore.getState();
  const items = registry.byHolder({ kind: 'character', refId: characterId });
  if (itemId) {
    return items.find((it) => it.itemId === itemId);
  }
  if (name) {
    return items.find((it) => it.name === name);
  }
  return undefined;
}

export function applyConsequences(cons: ConsequenceData, opts?: { rng?: RNG }): { newDiscoveries: WorldItem[] } | undefined {
  const charStore = useCharacterStore.getState();
  const char = charStore.character;
  if (!char || !cons) return;
  const charId = char.characterId;
  const newDiscoveries: WorldItem[] = [];

  if (cons.attributeChanges) {
    const attrs = { ...char.attributes };
    for (const [key, value] of Object.entries(cons.attributeChanges)) {
      if (key in attrs && typeof value === 'number') {
        (attrs as Record<string, number>)[key] = Math.max(3, Math.min(18, (attrs as Record<string, number>)[key] + value));
      }
    }
    charStore.updateAttributes(attrs);
  }

  if (cons.identityChanges) {
    charStore.updateIdentity(cons.identityChanges);
  }

  if (cons.conditionsAdded?.length) {
    for (const condition of cons.conditionsAdded) {
      charStore.addCondition(condition);
    }
  }
  if (cons.conditionsRemoved?.length) {
    for (const condition of cons.conditionsRemoved) {
      charStore.removeCondition(condition);
    }
  }

  if (cons.skillsModified?.length) {
    for (const sm of cons.skillsModified) {
      charStore.modifySkill(sm.skillId, {
        newName: sm.newName,
        newDescription: sm.newDescription,
        levelChange: sm.levelChange,
      });
    }
  }

  if (cons.reputationChange && Object.keys(cons.reputationChange).length > 0) {
    // 审计 P5 修复: charisma 是属性 (CHA) 增量, 不是声誉字段. 移到 attributeChanges 处理.
    const globalKeys = ['goodness', 'violence', 'lawfulness'];
    const regional: Record<string, number> = {};
    const global: Record<string, number> = {};
    const attrDelta: Record<string, number> = {};
    for (const [k, v] of Object.entries(cons.reputationChange)) {
      if (k === 'charisma') attrDelta.CHA = (attrDelta.CHA || 0) + v;
      else if (globalKeys.includes(k)) global[k] = v;
      else regional[k] = v;
    }
    if (Object.keys(attrDelta).length > 0) {
      if (!charStore.character) return;
      const cur = charStore.character.attributes;
      charStore.updateAttributes({
        CHA: Math.max(3, Math.min(18, (cur.CHA || 0) + (attrDelta.CHA || 0))),
      });
    }
    if (Object.keys(global).length > 0) charStore.updateReputation(global);
    if (Object.keys(regional).length > 0) {
      charStore.updateReputation({ regional });
    }
  }

  if (cons.currencyChange) {
    const c = { ...char.inventory.currency };
    c.gold += cons.currencyChange.gold || 0;
    c.silver += cons.currencyChange.silver || 0;
    c.copper += cons.currencyChange.copper || 0;
    charStore.updateInventory({ ...char.inventory, currency: c });
  }

  if (cons.itemsGained?.length > 0) {
    const now = new Date().toISOString();
    const registry = useItemRegistryStore.getState();
    for (const gained of cons.itemsGained) {
      if (gained.replacesItemId) {
        // 升级: 找到旧 WorldItem, 保留 itemId 在新物品中, 通过 patch 改属性
        const old = findInRegistryByCharacter(charId, gained.replacesItemId);
        if (old) {
          const predefinedEffects: ItemEffect[] = (gained.effects || []).map((e, i) => ({
            id: `eff_${now}_${i}`,
            type: (e.type as ItemEffect['type']) || 'special',
            value: e.value || 0,
            description: e.description || '',
          }));
          const poolAffixes = generateLootAffixes(gained, now, opts?.rng);
          registry.patch(old.itemId, {
            name: gained.name,
            description: gained.description,
            quality: (gained.quality as ItemQuality) || old.quality,
            effects: [...predefinedEffects, ...poolAffixes],
          });
          registry.addHistory(old.itemId, {
            event: 'upgraded',
            description: gained.description || `升级为${gained.name}`,
            oldName: old.name,
            oldDescription: old.description,
          });
        } else {
          // 找不到旧物品, 退化为新注册
          const newItem = buildItemFromGained(gained, null, now);
          const poolAffixes = generateLootAffixes(gained, now, opts?.rng);
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
        const existing = findInRegistryByCharacter(charId, undefined, gained.name);
        if (existing && (gained.quantity ?? 1) > 0) {
          registry.patch(existing.itemId, {
            quantity: existing.quantity + (gained.quantity || 1),
          });
        } else {
          const newItem = buildItemFromGained(gained, null, now);
          const poolAffixes = generateLootAffixes(gained, now, opts?.rng);
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
      const tracked = findInRegistryByCharacter(charId, gained.replacesItemId, gained.name);
      if (tracked) {
        const { isNew } = useCodexStore.getState().recordDiscovery(tracked);
        if (isNew) newDiscoveries.push(tracked);
      }
    }
    syncBackpackFromRegistry(charId);
  }

  if (cons.itemsLost?.length > 0) {
    const registry = useItemRegistryStore.getState();
    for (const lost of cons.itemsLost) {
      const target = findInRegistryByCharacter(charId, lost.itemId, lost.name);
      if (!target) continue;
      const remainingQty = target.quantity;
      const dropQty = lost.quantity || remainingQty;
      if (dropQty < remainingQty) {
        // 部分丢失, 仅减数量
        registry.patch(target.itemId, { quantity: remainingQty - dropQty });
      } else {
        // 全部丢失, 销毁 (物品彻底从世界消失)
        registry.destroy(target.itemId, lost.name ? `${lost.name} 已被丢弃/使用` : '物品被消耗');
      }
    }
    syncBackpackFromRegistry(charId);
  }

  if (cons.itemsModified?.length > 0) {
    const registry = useItemRegistryStore.getState();
    for (const mod of cons.itemsModified) {
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
            value: e.value || 0,
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

  return { newDiscoveries };
}
