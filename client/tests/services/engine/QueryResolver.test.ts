import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveQueries } from '../../../src/services/engine/QueryResolver';
import { useCharacterStore } from '../../../src/stores/characterStore';
import { useGameStore } from '../../../src/stores/gameStore';
import { useNPCStore } from '../../../src/stores/npcStore';
import { useWorldStore } from '../../../src/stores/worldStore';
import { resetClientStores } from '../../utils/resetStores';

describe('QueryResolver', () => {
  beforeEach(() => {
    resetClientStores();
    useCharacterStore.setState({
      character: {
        hp: 18,
        maxHp: 20,
        vital: { hunger: 10, thirst: 5, fatigue: 3, hygiene: 8, morale: 12 },
        conditions: [],
        attributes: { STR: 3, DEX: 4, CON: 3, INT: 2, WIS: 2, CHA: 1 },
        inventory: {
          equipped: {
            weapon: {
              name: '月钢剑',
              description: '一把发着冷光的长剑',
              quality: '稀有',
              effects: [{ description: '对幽影额外伤害' }],
              durability: 88,
              maxDurability: 100,
            },
            armor: null,
            accessory: null,
          },
          backpack: [{
            name: '治疗药水',
            description: '恢复伤势',
            quantity: 2,
            quality: '普通',
            effects: [],
          }],
        },
        skills: [{ name: '潜行', description: '在阴影中移动', level: 2, relatedAttribute: 'DEX' }],
        recentHistory: [{ worldDay: 3, summary: '击退了狼群' }],
      } as never,
    });
    useNPCStore.setState({
      npcs: {
        'npc-1': {
          npcId: 'npc-1',
          name: '莉亚',
          title: '游侠',
          region: '北境',
          appearance: '银发，披着旅行斗篷',
          personality: '谨慎而可靠',
          relationship: {
            level: 'ally',
            attitude: 72,
            playerKnowsAbout: ['擅长追踪', '熟悉北境山路'],
          },
        },
      } as never,
    });
    useGameStore.setState({
      knownLocations: [{ name: '晨雾林' }],
      currentLocation: '晨雾林',
      currentSubRegion: '林间小路',
      currentStructuredLocation: {
        regionName: '北境',
        subRegion: '晨雾林',
        specificPlace: '林间小路',
        isKnown: true,
        visitCount: 2,
        description: '潮湿泥土间有一条细长兽径。',
      } as never,
    });
    useWorldStore.setState({
      worldLore: '北境终年寒冷，晨雾林是通往旧边塔的必经之路。游侠们常在这里巡视，旅队通常会在雾最浓的时候停步，等巡林人的信号之后再继续前进。',
    });
  });

  afterEach(() => {
    resetClientStores();
  });

  it('resolves inventory, npc, location, and lore queries from the client stores', () => {
    const results = resolveQueries([
      { query_id: 'q1', intent: 'inventory_search', keyword: '剑' },
      { query_id: 'q2', intent: 'npc_lookup', name: '莉亚', region: '北境' },
      { query_id: 'q3', intent: 'location_info', location: '晨雾林' },
      { query_id: 'q4', intent: 'world_lore', topic: '北境' },
    ]);

    expect(results[0]).toMatchObject({ status: 'found' });
    expect(results[0]?.data).toContain('月钢剑');

    expect(results[1]).toMatchObject({ status: 'found' });
    expect(results[1]?.data).toContain('擅长追踪');

    expect(results[2]).toMatchObject({ status: 'found' });
    expect(results[2]?.data).toContain('晨雾林');

    expect(results[3]).toMatchObject({ status: 'found' });
    expect(results[3]?.data).toContain('北境');
  });
});