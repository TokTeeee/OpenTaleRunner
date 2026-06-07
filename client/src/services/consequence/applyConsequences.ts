import type { ConsequenceData, ItemGainedData } from '../../types/game';
import type { Item, ItemEffect, ItemHistoryEntry, WorldItem } from '../../types/item';
import type { ItemCategory, ItemQuality } from '../../types/item';
import { useCharacterStore } from '../../stores/characterStore';
import { useCodexStore } from '../../stores/codexStore';
import { useItemRegistryStore } from '../../stores/itemRegistryStore';
import { generateLootAffixes } from './lootAffixes';
import { buildItemFromGained, syncBackpackFromRegistry, findInRegistryByCharacter } from './helpers';
import { applyAttributes } from './applyAttributes';
import { applyConditions } from './applyConditions';
import type { RNG } from '../../data/affixPool';

/**
 * PR-2 契约: 物品的世界真相是 itemRegistry, char.inventory.backpack 是派生视图.
 * 本文件所有物品 mutation 都走 itemRegistry.register/transfer/destroy/patch,
 * 然后调 syncBackpackFromRegistry 刷新 legacy 视图, 保持向后兼容.
 *
 * v0.5.13: 主入口委派 5 业务域 (attributes/conditions/skills/reputation/items).
 */

export function applyConsequences(cons: ConsequenceData, opts?: { rng?: RNG }): { newDiscoveries: WorldItem[] } | undefined {
  const charStore = useCharacterStore.getState();
  const char = charStore.character;
  if (!char || !cons) return;
  const charId = char.characterId;
  const newDiscoveries: WorldItem[] = [];

  if (cons.attributeChanges || cons.identityChanges) {
    applyAttributes(cons);
  }

  if (cons.conditionsAdded?.length || cons.conditionsRemoved?.length) {
    applyConditions(cons);
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
