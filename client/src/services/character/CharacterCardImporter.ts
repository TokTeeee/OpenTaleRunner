import type { CharacterCard, ImportResult } from '../../types/characterCard';
import { useCharacterStore } from '../../stores/characterStore';
import { useNPCStore } from '../../stores/npcStore';
import { useWorldStore } from '../../stores/worldStore';
import { normalizeItem } from '../../types/item';
import type { ItemEffect } from '../../types/item';

function normalizeEffectValue(value: unknown): string | number | Record<string, unknown> {
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  return 0;
}

export function importCharacterCard(card: CharacterCard): ImportResult {
  const warnings: string[] = [];

  // Version check
  if (card.formatVersion > 1) {
    return { success: false, error: '不支持的卡片格式版本' };
  }

  // Storybook compatibility
  const currentSB = useWorldStore.getState().storybook;
  if (currentSB && card.metadata.storybookHash && card.metadata.storybookHash !== '') {
    if (card.metadata.storybookVersion !== currentSB.version) {
      warnings.push(`角色来自 "${card.metadata.storybookName} v${card.metadata.storybookVersion}"，当前故事书为 "${currentSB.worldName} v${currentSB.version}"。部分 NPC/物品可能不兼容。`);
    }
  }

  // Validate snapshot
  const snap = card.character;
  const errors: string[] = [];

  if (!snap.name) errors.push('角色名为空');
  if (!snap.race) errors.push('种族为空');

  const attrs = snap.attributes;
  if (attrs) {
    for (const [key, val] of Object.entries(attrs)) {
      if (typeof val === 'number' && (val < 3 || val > 18)) {
        errors.push(`属性 ${key}=${val} 超出范围 [3,18]`);
      }
    }
  }

  if (snap.hp !== undefined && snap.maxHp !== undefined && (snap.hp < 0 || snap.hp > snap.maxHp)) {
    errors.push('HP 值非法');
  }

  if (errors.length > 0) {
    return { success: false, error: errors.join('; ') };
  }

  const buildItem = (item: typeof snap.inventory.equipped.weapon) => item
    ? normalizeItem({
        ...item,
        effects: (item.effects || []).map((effect) => ({
          id: `import_eff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: effect.type as ItemEffect['type'],
          value: normalizeEffectValue(effect.value),
          description: effect.description,
        })),
        history: (item.history || []).map((entry) => ({ ...entry })),
      })
    : null;

  // Load character
  const charStore = useCharacterStore.getState();
  charStore.setCharacter({
    characterId: snap.characterId || `import_${Date.now()}`,
    playerId: '',
    name: snap.name,
    race: snap.race,
    background: snap.background,
    appearance: snap.appearance,
    attributes: {
      STR: snap.attributes.STR ?? 10,
      DEX: snap.attributes.DEX ?? 10,
      CON: snap.attributes.CON ?? 10,
      INT: snap.attributes.INT ?? 10,
      WIS: snap.attributes.WIS ?? 10,
      CHA: snap.attributes.CHA ?? 10,
    },
    skills: (snap.skills || []).map(s => ({
      id: `skill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: s.name,
      level: s.level,
      maxLevel: s.maxLevel || 10,
      type: (s.type as 'background' | 'acquired') || 'acquired',
      relatedAttribute: (s.relatedAttribute as 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA') || 'INT',
      description: s.description,
      acquiredAt: '',
      experience: s.experience || 0,
      expToNext: s.expToNext || 3,
    })),
    inventory: snap.inventory ? {
      equipped: {
        weapon: buildItem(snap.inventory.equipped.weapon),
        armor: buildItem(snap.inventory.equipped.armor),
        accessory: buildItem(snap.inventory.equipped.accessory),
      },
      backpack: (snap.inventory.backpack || []).map((item) => buildItem(item)).filter((item): item is NonNullable<ReturnType<typeof buildItem>> => item !== null),
      currency: { ...snap.inventory.currency },
    } : { equipped: { weapon: null, armor: null, accessory: null }, backpack: [], currency: { gold: 0, silver: 0, copper: 0 } },
    hp: snap.hp ?? snap.maxHp ?? 20,
    maxHp: snap.maxHp ?? 20,
    vital: snap.vital ? {
      hunger: snap.vital.hunger ?? 50,
      thirst: snap.vital.thirst ?? 50,
      fatigue: snap.vital.fatigue ?? 50,
      hygiene: snap.vital.hygiene ?? 50,
      morale: snap.vital.morale ?? 50,
      wound: snap.vital.wound ?? 0,
      temperature: snap.vital.temperature ?? 37,
      encumbrance: snap.vital.encumbrance ?? 0,
    } : { hunger: 50, thirst: 50, fatigue: 50, hygiene: 50, morale: 50, wound: 0, temperature: 37, encumbrance: 0 },
    reputation: snap.reputation ? {
      goodness: snap.reputation.goodness ?? 0,
      violence: snap.reputation.violence ?? 0,
      lawfulness: snap.reputation.lawfulness ?? 0,
      regional: snap.reputation.regional ?? {},
    } : { goodness: 0, violence: 0, lawfulness: 0, regional: {} },
    conditions: snap.conditions || [],
    joinedRegion: snap.joinedRegion || '',
    joinedWorldDay: snap.joinedWorldDay || 1,
    currentLocalDay: snap.currentLocalDay || 1,
    lastActionTime: new Date().toISOString(),
    recentHistory: (snap.recentHistory || []).map(h => ({
      worldDay: h.worldDay,
      region: h.region,
      summary: h.summary,
    })),
  });

  // Restore NPC relationships
  if (snap.npcRelationships && snap.npcRelationships.length > 0) {
    const npcStore = useNPCStore.getState();
    for (const rel of snap.npcRelationships) {
      const existing = npcStore.npcs[rel.npcId];
      if (existing) {
        existing.relationship.attitude = rel.attitude;
        existing.relationship.level = rel.level as 'stranger' | 'acquaintance' | 'friend' | 'close' | 'ally';
        existing.relationship.playerKnowsAbout = rel.playerKnowsAbout;
        existing.isMet = rel.isMet;
      }
    }
  }

  return { success: true, warnings: warnings.length > 0 ? warnings : undefined };
}
