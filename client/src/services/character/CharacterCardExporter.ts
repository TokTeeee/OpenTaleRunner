import type { CharacterCard, CharacterSnapshot, ItemSnapshot } from '../../types/characterCard';
import type { Item } from '../../types/item';
import { useCharacterStore } from '../../stores/characterStore';
import { useNPCStore } from '../../stores/npcStore';
import { useWorldStore } from '../../stores/worldStore';

export function exportCharacterCard(
  clientVersion: string = '0.3.0',
  avatarBase64?: { mimeType: string; data: string },
): CharacterCard | null {
  const char = useCharacterStore.getState().character;
  if (!char) return null;

  const world = useWorldStore.getState();
  const npcStore = useNPCStore.getState();

  const snapshot: CharacterSnapshot = {
    characterId: char.characterId,
    name: char.name,
    race: char.race,
    background: char.background,
    appearance: char.appearance,
    attributes: { ...char.attributes },
    skills: char.skills.map(s => ({
      name: s.name,
      level: s.level,
      maxLevel: s.maxLevel,
      type: s.type,
      relatedAttribute: s.relatedAttribute,
      description: s.description,
      experience: s.experience,
      expToNext: s.expToNext,
    })),
    inventory: {
      equipped: {
        weapon: char.inventory.equipped.weapon ? itemToSnapshot(char.inventory.equipped.weapon) : null,
        armor: char.inventory.equipped.armor ? itemToSnapshot(char.inventory.equipped.armor) : null,
        accessory: char.inventory.equipped.accessory ? itemToSnapshot(char.inventory.equipped.accessory) : null,
      },
      backpack: char.inventory.backpack.map(itemToSnapshot),
      currency: { ...char.inventory.currency },
    },
    hp: char.hp,
    maxHp: char.maxHp,
    vital: { ...char.vital },
    reputation: { ...char.reputation },
    conditions: [...char.conditions],
    joinedRegion: char.joinedRegion,
    joinedWorldDay: char.joinedWorldDay,
    currentLocalDay: char.currentLocalDay,
    recentHistory: char.recentHistory.map(h => ({ ...h })),
    npcRelationships: Object.values(npcStore.npcs).filter(n => n.isMet).map(n => ({
      npcId: n.npcId,
      name: n.name,
      region: n.region,
      attitude: n.relationship.attitude,
      level: n.relationship.level,
      playerKnowsAbout: [...n.relationship.playerKnowsAbout],
      isMet: n.isMet,
      firstMet: n.relationship.firstMet || '',
      lastInteraction: n.relationship.firstMet || '',
    })),
    // v0.5.1 Level-EXP
    level: char.level,
    exp: char.exp,
    expToNext: char.expToNext,
    unspentAttributePoints: char.unspentAttributePoints,
    // v0.5.2 Class
    classId: char.classId,
    classSkills: char.classSkills.map(n => ({ classId: n.classId, nodeId: n.nodeId, unlockedAt: n.unlockedAt })),
  };

  return {
    formatVersion: 2,  // v0.5.6: bumped from 1 for the v0.5 level/class fields
    metadata: {
      exportedAt: new Date().toISOString(),
      exportedFrom: 'opentale-runner-client',
      clientVersion,
      storybookName: world.storybook?.worldName ?? 'unknown',
      storybookVersion: world.storybook?.version ?? 0,
      storybookHash: '',
    },
    character: snapshot,
    avatar: avatarBase64,
  };
}

function itemToSnapshot(item: Item): ItemSnapshot {
  return {
    itemId: item.itemId ?? '',
    name: item.name,
    category: item.category ?? 'material',
    quality: item.quality ?? '普通',
    quantity: item.quantity ?? 1,
    description: item.description ?? '',
    effects: (item.effects ?? []).map(e => ({
      type: e.type ?? 'special',
      value: e.value ?? 0,
      description: e.description ?? '',
    })),
    durability: item.durability,
    maxDurability: item.maxDurability,
    history: (item.history ?? []).map(h => ({ ...h })),
    source: item.source ?? '',
  };
}
